import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const xlsx = require("/tmp/node_modules/xlsx");
const pg = require("/tmp/node_modules/pg");
const { Client } = pg;

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) { console.error("Missing DATABASE_URL"); process.exit(1); }

const client = new Client({ connectionString: DATABASE_URL });
await client.connect();

// ── Parse Excel ──────────────────────────────────────────────
const buf = readFileSync("./attached_assets/FlipIQ_Sales_Pipeline_1775293451760.xlsx");
const wb = xlsx.read(buf, { type: "buffer" });
const ws = wb.Sheets["Sales Pipeline"];
const rows = xlsx.utils.sheet_to_json(ws, { defval: "" });
console.log(`Parsed ${rows.length} rows from Excel`);

// ── Field mappers ─────────────────────────────────────────────
const mapStatus = (s) => {
  if (s === "Research Needed") return "Warm";
  return "New";
};

const mapStage = (s) => {
  if (s === "Marketing Qualified Lead") return "Qualified";
  if (s === "Sales Qualified Lead") return "Demo Scheduled";
  return "Lead";
};

const parseDeal = (v) => {
  if (!v || v === "Unknown" || v === "") return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
  return isNaN(n) ? null : n;
};

const parseDate = (v) => {
  if (!v) return null;
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  } catch { return null; }
};

const parseTags = (v) => {
  if (!v) return null;
  const arr = String(v).split(",").map(t => t.trim()).filter(Boolean);
  return arr.length ? JSON.stringify(arr) : null;
};

// ── Clear existing contacts (notes cascade, calls set null) ──
console.log("Deleting existing contact notes and contacts...");
await client.query("DELETE FROM contact_notes");
await client.query("DELETE FROM contacts");
console.log("Cleared.");

// ── Insert in batches ─────────────────────────────────────────
let inserted = 0;
const BATCH = 100;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  for (const r of batch) {
    const name = `${r["First Name"] || ""} ${r["Last Name"] || ""}`.trim();
    if (!name) continue;

    await client.query(
      `INSERT INTO contacts (
        name, company, title, phone, email,
        status, pipeline_stage, type, category,
        deal_value, notes, next_step, lead_source, tags,
        last_contact_date, created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,
        $6,$7,$8,$9,
        $10,$11,$12,$13,$14,
        $15, NOW(), NOW()
      )`,
      [
        name,
        r["Company"] || null,
        r["Title/Role"] || null,
        r["Phone"] || null,
        r["Email"] || null,
        mapStatus(r["Pipeline Status"]),
        mapStage(r["Lifecycle Stage"]),
        r["Contact Type"] || null,
        r["Category"] || null,
        parseDeal(r["Deal Value"]),
        r["Notes"] || null,
        r["Next Step"] || null,
        r["Source"] || null,
        parseTags(r["Tags"]),
        parseDate(r["Last Contact"]),
      ]
    );
    inserted++;
  }
  process.stdout.write(`\rInserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
}

console.log(`\n\nDone. ${inserted} contacts imported.`);

// ── Verify ────────────────────────────────────────────────────
const { rows: stats } = await client.query(`
  SELECT
    COUNT(*) as total,
    COUNT(type) as has_type,
    COUNT(category) as has_category,
    COUNT(CASE WHEN type = 'OPERATOR-INVESTOR' THEN 1 END) as operator_investors,
    COUNT(CASE WHEN category = 'A — Priority Pipeline' THEN 1 END) as priority_pipeline,
    COUNT(CASE WHEN category = 'C — Institutional Investor' THEN 1 END) as institutional
  FROM contacts
`);
console.log("Stats:", stats[0]);

await client.end();
