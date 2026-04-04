// Seed script — inserts the 15 canonical TCC contacts from TCC_Seed_Data JSON.
// Idempotent: skips each contact if a row with the same name already exists.
// Run from workspace root: node lib/db/seed-contacts.mjs

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[seed-contacts] DATABASE_URL not set — skipping");
  process.exit(0);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const CONTACTS = [
  { name: "Mike Oyoque", company: "MR EXCELLENCE", status: "Warm", phone: "(555) 123-4567", email: "", type: "Broker-Investor", next_step: "Follow up on demo request", last_contact_date: "2026-03-25", source: "Priority Outreach", notes: null },
  { name: "Xander Clemens", company: "Family Office Club", status: "Hot", phone: "(555) 234-5678", email: "", type: "Broker-Investor", next_step: "Schedule intro call — 10K investors", last_contact_date: "2026-03-30", source: "Priority Outreach", notes: null },
  { name: "Fernando Perez", company: "Park Ave Capital", status: "New", phone: "(555) 345-6789", email: "", type: "Broker-Investor", next_step: "Call about Chino off-market deal", last_contact_date: "2026-04-03", source: "Priority Outreach", notes: null },
  { name: "Tony Fletcher", company: "LPT/FairClose", status: "Warm", phone: "(555) 456-7890", email: "", type: "Broker-Investor", next_step: "Broker Playbook follow-up", last_contact_date: "2026-04-01", source: "Priority Outreach", notes: null },
  { name: "Kyle Draper", company: "", status: "New", phone: "(555) 567-8901", email: "", type: "Wholesaler", next_step: "Demo scheduled?", last_contact_date: "2026-03-28", source: "Priority Outreach", notes: null },
  { name: "Chris Craddock", company: "EXP Realty", status: "New", phone: "(555) 678-9012", email: "", type: "Broker-Investor", next_step: "#1 EXP recruiter — potential partner", last_contact_date: null, source: "Strategic Leads", notes: null },
  { name: "Rod Wilson", company: "Anchor Loans", status: "Warm", phone: "", email: "", type: "Affiliate", next_step: "Institutional validation — follow up $15K deal", last_contact_date: "2026-03-15", source: "Priority Outreach", notes: null },
  { name: "Chris Wesser", company: "", status: "Hot", phone: "", email: "chris.wesser@gmail.com", type: "Affiliate", next_step: "Capital raise advisor — docs in progress", last_contact_date: "2026-04-03", source: "Strategic Leads", notes: null },
  { name: "Drew Wolfe", company: "Pinpoint Offers USA", status: "New", phone: "(909) 244-3237", email: "drew@pinpointoffersusa.com", type: "Wholesaler", next_step: "Initial outreach", last_contact_date: null, source: "InvestorLift SoCal", notes: null },
  { name: "Gary Frausto", company: "Central Valley RE Investments", status: "New", phone: "(661) 900-4104", email: "", type: "Wholesaler", next_step: "Initial outreach", last_contact_date: null, source: "InvestorLift SoCal", notes: null },
  { name: "Mike Proctor", company: "Mike Buys Houses", status: "New", phone: "(951) 547-5751", email: "mikeproctorre@gmail.com", type: "Wholesaler", next_step: "Initial outreach", last_contact_date: null, source: "InvestorLift SoCal", notes: null },
  { name: "Omar Beltran", company: "Best Deal Home Offer", status: "New", phone: "(626) 550-5028", email: "omar@bestdealhomeoffer.com", type: "Wholesaler", next_step: "Initial outreach", last_contact_date: null, source: "InvestorLift SoCal", notes: null },
  { name: "Aaron Chapman", company: "CHAPMAN", status: "New", phone: "(602) 291-3357", email: "chapmanaaron8@gmail.com", type: "Independent", next_step: "Initial outreach", last_contact_date: null, source: "REIBlackBook", notes: null },
  { name: "Jan Sieberts", company: "Washington Capital Management", status: "New", phone: "907-272-5022", email: "jan.sieberts@wcmadvisors.com", type: "Affiliate", next_step: "Research before outreach", last_contact_date: null, source: "Hedge Funds", notes: "AUM: US$985M. Director. Anchorage, AK" },
  { name: "Alan Rosenfield", company: "Harmony Asset Management", status: "New", phone: "480-314-5967", email: "arosenfield@harmonyam.com", type: "Affiliate", next_step: "Research before outreach", last_contact_date: null, source: "Hedge Funds", notes: "Founder. Scottsdale, AZ" },
];

async function run() {
  const client = await pool.connect();
  try {
    let inserted = 0;
    let skipped = 0;
    for (const c of CONTACTS) {
      const existing = await client.query(
        "SELECT id FROM contacts WHERE name = $1 LIMIT 1",
        [c.name]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }
      await client.query(
        `INSERT INTO contacts (name, company, status, phone, email, type, next_step, last_contact_date, source, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [c.name, c.company, c.status, c.phone, c.email, c.type, c.next_step, c.last_contact_date, c.source, c.notes]
      );
      inserted++;
    }
    console.log(`[seed-contacts] Done — inserted: ${inserted}, skipped (already exist): ${skipped}`);
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("[seed-contacts] Error:", err.message);
  process.exit(1);
});
