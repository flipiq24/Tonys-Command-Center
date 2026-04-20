import pg from "pg";

(async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(`
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pain_points text;
    ALTER TABLE contacts ADD COLUMN IF NOT EXISTS sheet_id text;
    CREATE INDEX IF NOT EXISTS contacts_sheet_id_idx ON contacts (sheet_id);
  `);
  const r = await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'contacts' AND column_name IN ('pain_points', 'sheet_id')
    ORDER BY column_name;
  `);
  console.log("Added columns:", r.rows);
  await client.end();
})().catch(err => { console.error(err); process.exit(1); });
