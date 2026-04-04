// Import 5,344 contacts from JSON dump into TCC contacts table.
// Idempotent: skips duplicates by phone digits (primary) or name match.
// Run: node lib/db/import-contacts.mjs

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[import-contacts] DATABASE_URL not set — exiting");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const RAW_FILE = join(__dirname, "../../attached_assets/Pasted--id-1-name-http-www-greenletco-com-company-phone-email-_1775288632340.txt");

function cleanPhone(p) {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 7) return null;
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === "1") return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return p.trim() || null;
}

function cleanEmail(e) {
  if (!e) return null;
  const clean = e.trim().toLowerCase();
  return clean.includes("@") ? clean : null;
}

function buildNotes(r) {
  const parts = [];
  if (r.notes) parts.push(r.notes);
  if (r.linkedin) parts.push(`LinkedIn: ${r.linkedin}`);
  if (r.address) parts.push(`Address: ${r.address}`);
  if (r.website && r.website !== r.name) parts.push(`Website: ${r.website}`);
  if (r.original_type && r.original_type !== r.type) parts.push(`Original type: ${r.original_type}`);
  return parts.join(" | ") || null;
}

async function main() {
  console.log("[import-contacts] Reading source file...");
  const raw = readFileSync(RAW_FILE, "utf8");
  const records = JSON.parse(raw);
  console.log(`[import-contacts] ${records.length} total records`);

  // Filter: skip URL-named records
  const valid = records.filter(r => r.name && !r.name.startsWith("http"));
  console.log(`[import-contacts] ${valid.length} with real names (${records.length - valid.length} URL-only skipped)`);

  // Load existing for dedup
  const client = await pool.connect();
  try {
    const existing = await client.query("SELECT name, phone FROM contacts");
    const existingPhones = new Set(existing.rows.map(r => r.phone).filter(Boolean).map(p => p.replace(/\D/g,"")));
    const existingNames = new Set(existing.rows.map(r => r.name?.toLowerCase().trim()).filter(Boolean));
    console.log(`[import-contacts] ${existing.rows.length} contacts already in DB`);

    let inserted = 0;
    let skipped = 0;

    for (const r of valid) {
      const name = r.name.trim();
      const phone = cleanPhone(r.phone);
      const email = cleanEmail(r.email);
      const phoneDigits = phone ? phone.replace(/\D/g,"") : null;

      // Dedup checks
      if (phoneDigits && existingPhones.has(phoneDigits)) { skipped++; continue; }
      if (existingNames.has(name.toLowerCase())) { skipped++; continue; }

      await client.query(
        `INSERT INTO contacts (name, company, status, phone, email, type, next_step, last_contact_date, notes, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT DO NOTHING`,
        [
          name,
          r.company?.trim() || null,
          r.status || "New",
          phone,
          email,
          r.type || null,
          r.next_step || "Initial outreach",
          r.last_contact_date || null,
          buildNotes(r),
          r.source || "Master List",
        ]
      );

      // Track to avoid intra-batch dupes
      if (phoneDigits) existingPhones.add(phoneDigits);
      existingNames.add(name.toLowerCase());
      inserted++;

      if (inserted % 500 === 0) console.log(`  ...${inserted} inserted so far`);
    }

    const finalCount = await client.query("SELECT COUNT(*) FROM contacts");
    console.log(`[import-contacts] Done — inserted: ${inserted}, skipped (dupes): ${skipped}`);
    console.log(`[import-contacts] Total contacts in DB: ${finalCount.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error("[import-contacts] Error:", err.message);
  process.exit(1);
});
