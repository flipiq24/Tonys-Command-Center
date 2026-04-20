// One-off: reads Contact Master sheet headers + sample row, and dumps contacts table to ai-outputs/backup-contacts.sql
// Safe / read-only. Run from repo root with both env files loaded:
//   node --env-file=.env ./lib/db/scripts/inspect-contacts-and-backup.mjs

import pg from "pg";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../../..");

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_ID = process.env.BUSINESS_MASTER_SHEET_ID || "1WGuJwCoWbwyFamXXP79yxnPmYhdFPgOGhOR8_V-EQyw";

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  const d = await res.json();
  return d.access_token;
}

async function getSheetValues(token, range) {
  const res = await fetch(
    `${SHEETS_BASE}/${SHEET_ID}/values/${encodeURIComponent(range)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) throw new Error(`Sheets read failed: ${await res.text()}`);
  const d = await res.json();
  return d.values || [];
}

function sqlQuote(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

(async () => {
  console.log("=== PHASE 1: READING GOOGLE SHEET ===\n");
  const token = await getAccessToken();
  const rows = await getSheetValues(token, "Contact Master!A1:AZ200");
  if (!rows.length) {
    console.log("⚠️  Contact Master tab is EMPTY or not found.");
  } else {
    const headers = rows[0];
    console.log(`Headers (${headers.length} columns):`);
    headers.forEach((h, i) => {
      const colLetter = String.fromCharCode(65 + (i < 26 ? i : i % 26));
      console.log(`  ${String(i + 1).padStart(2, "0")} [${i < 26 ? colLetter : "A" + colLetter}] → "${h}"`);
    });
    console.log(`\nData rows: ${rows.length - 1}`);
    if (rows.length > 1) {
      console.log("\nSample row 1:");
      headers.forEach((h, i) => {
        const v = rows[1][i];
        if (v !== undefined && v !== "") console.log(`  ${h} = ${JSON.stringify(v)}`);
      });
    }
    if (rows.length > 2) {
      console.log("\nSample row 2:");
      headers.forEach((h, i) => {
        const v = rows[2][i];
        if (v !== undefined && v !== "") console.log(`  ${h} = ${JSON.stringify(v)}`);
      });
    }
  }

  console.log("\n\n=== PHASE 2: BACKING UP CONTACTS TABLE ===\n");
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const dbRows = await client.query("SELECT * FROM contacts ORDER BY created_at");
  const notes = await client.query("SELECT * FROM contact_notes ORDER BY created_at");
  await client.end();
  console.log(`contacts: ${dbRows.rows.length} rows`);
  console.log(`contact_notes: ${notes.rows.length} rows`);

  const contactCols = dbRows.fields.filter(f => f.name !== "phone_normalized").map(f => f.name);
  const noteCols = notes.fields.map(f => f.name);

  const sql = [
    "-- TCC contacts backup — created " + new Date().toISOString(),
    "-- Restore: psql $DATABASE_URL -f backup-contacts.sql",
    "-- WARNING: this DELETEs existing rows before re-inserting.",
    "",
    "BEGIN;",
    "",
    "DELETE FROM contact_notes;",
    "DELETE FROM contacts;",
    "",
    "-- contacts (" + dbRows.rows.length + " rows)",
    ...dbRows.rows.map(r =>
      `INSERT INTO contacts (${contactCols.join(", ")}) VALUES (${contactCols.map(c => sqlQuote(r[c])).join(", ")});`
    ),
    "",
    "-- contact_notes (" + notes.rows.length + " rows)",
    ...notes.rows.map(r =>
      `INSERT INTO contact_notes (${noteCols.join(", ")}) VALUES (${noteCols.map(c => sqlQuote(r[c])).join(", ")});`
    ),
    "",
    "COMMIT;",
    "",
  ].join("\n");

  const outPath = resolve(REPO_ROOT, "ai-outputs/backup-contacts.sql");
  writeFileSync(outPath, sql);
  console.log(`\n✓ wrote backup → ${outPath}`);
  console.log(`  size: ${(sql.length / 1024).toFixed(1)} KB`);
})().catch(err => { console.error(err); process.exit(1); });
