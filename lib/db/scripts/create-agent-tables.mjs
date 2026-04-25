// Idempotent raw SQL migration for the agent runtime tables.
// Used in place of `drizzle-kit push` to avoid pre-existing schema drift on
// unrelated tables (e.g. team_roles.responsibilities text → jsonb).
// Run: node --env-file=.env lib/db/scripts/create-agent-tables.mjs

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
  console.error("[create-agent-tables] DATABASE_URL not set");
  process.exit(1);
}

const pool = process.env.SUPABASE_DATABASE_URL
  ? (() => {
      const parsed = new URL(process.env.SUPABASE_DATABASE_URL);
      return new Pool({
        host: parsed.hostname,
        port: Number(parsed.port) || 5432,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ""),
        ssl: { rejectUnauthorized: false },
      });
    })()
  : new Pool({ connectionString: process.env.DATABASE_URL });

const STATEMENTS = [
  // ── 5.1 Knowledge store ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_memory_entries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent         text NOT NULL,
    kind          text NOT NULL,
    section_name  text NOT NULL,
    content       text NOT NULL,
    version       integer NOT NULL DEFAULT 1,
    updated_at    timestamptz NOT NULL DEFAULT now(),
    updated_by    text
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS agent_memory_entries_unique_idx
     ON agent_memory_entries (agent, kind, section_name)`,
  `CREATE INDEX IF NOT EXISTS agent_memory_entries_agent_idx
     ON agent_memory_entries (agent)`,

  // ── 5.1b Skill registry ────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_skills (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent            text NOT NULL,
    skill_name       text NOT NULL,
    model            text NOT NULL,
    max_tokens       integer NOT NULL DEFAULT 1024,
    tools            jsonb NOT NULL DEFAULT '[]'::jsonb,
    memory_sections  jsonb NOT NULL DEFAULT '[]'::jsonb,
    auto_examples    jsonb NOT NULL DEFAULT 'false'::jsonb,
    model_override   text,
    updated_at       timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS agent_skills_unique_idx
     ON agent_skills (agent, skill_name)`,
  `CREATE INDEX IF NOT EXISTS agent_skills_agent_idx
     ON agent_skills (agent)`,

  // ── 5.1c Tool registry ─────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_tools (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_name     text NOT NULL UNIQUE,
    agent         text,
    description   text,
    input_schema  jsonb NOT NULL,
    handler_path  text NOT NULL,
    is_native     integer NOT NULL DEFAULT 0,
    updated_at    timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agent_tools_agent_idx
     ON agent_tools (agent)`,

  // ── 5.2 Captured feedback queue ────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_feedback (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent              text NOT NULL,
    skill              text NOT NULL,
    source_type        text NOT NULL,
    source_id          text NOT NULL,
    rating             integer,
    review_text        text,
    context_snapshot   jsonb NOT NULL,
    consumed_at        timestamptz,
    training_run_id    uuid,
    consumed_outcome   text,
    created_at         timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agent_feedback_agent_idx
     ON agent_feedback (agent)`,
  `CREATE INDEX IF NOT EXISTS agent_feedback_skill_idx
     ON agent_feedback (skill)`,
  `CREATE INDEX IF NOT EXISTS agent_feedback_unconsumed_idx
     ON agent_feedback (agent, created_at) WHERE consumed_at IS NULL`,

  // ── 5.3 Training runs ──────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_training_runs (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent           text NOT NULL,
    started_by      text NOT NULL,
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    status          text NOT NULL,
    feedback_ids    uuid[] NOT NULL,
    proposal_id     uuid,
    failure_reason  text
  )`,
  `CREATE INDEX IF NOT EXISTS agent_training_runs_agent_idx
     ON agent_training_runs (agent)`,
  `CREATE INDEX IF NOT EXISTS agent_training_runs_running_idx
     ON agent_training_runs (agent) WHERE status = 'running'`,

  // ── 5.4 Proposals ──────────────────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_memory_proposals (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent              text NOT NULL,
    training_run_id    uuid NOT NULL,
    reason             text NOT NULL,
    diffs              jsonb NOT NULL,
    feedback_ids       uuid[] NOT NULL,
    status             text NOT NULL,
    rejection_reason   text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    decided_at         timestamptz,
    decided_by         text
  )`,
  `CREATE INDEX IF NOT EXISTS agent_memory_proposals_agent_idx
     ON agent_memory_proposals (agent)`,
  `CREATE INDEX IF NOT EXISTS agent_memory_proposals_pending_idx
     ON agent_memory_proposals (agent) WHERE status = 'pending'`,

  // ── 5.5 Per-run cost/latency ───────────────────────────────────────────────
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent                  text NOT NULL,
    skill                  text NOT NULL,
    caller                 text,
    caller_thread_id       uuid,
    input_tokens           integer DEFAULT 0,
    output_tokens          integer DEFAULT 0,
    cache_read_tokens      integer DEFAULT 0,
    cache_creation_tokens  integer DEFAULT 0,
    cost_usd               text,
    duration_ms            integer,
    status                 text NOT NULL DEFAULT 'success',
    error_message          text,
    created_at             timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS agent_runs_agent_idx
     ON agent_runs (agent)`,
  `CREATE INDEX IF NOT EXISTS agent_runs_skill_idx
     ON agent_runs (skill)`,
  `CREATE INDEX IF NOT EXISTS agent_runs_created_idx
     ON agent_runs (created_at)`,
];

async function main() {
  for (const sql of STATEMENTS) {
    const m = sql.match(/CREATE (TABLE|INDEX|UNIQUE INDEX) (IF NOT EXISTS )?(\S+)/i);
    const obj = m ? `${m[1]} ${m[3]}` : sql.slice(0, 60);
    try {
      await pool.query(sql);
      console.log(`  ✓ ${obj}`);
    } catch (err) {
      console.error(`  ✗ ${obj}: ${err.message}`);
      throw err;
    }
  }

  // Verification
  const { rows: tables } = await pool.query(
    `SELECT table_name FROM information_schema.tables
       WHERE table_schema='public' AND table_name LIKE 'agent_%'
     ORDER BY table_name`
  );
  console.log("\n[create-agent-tables] tables present:");
  for (const t of tables) console.log(`  ${t.table_name}`);

  await pool.end();
}

main().catch(err => {
  console.error("[create-agent-tables] failed:", err.message);
  pool.end();
  process.exit(1);
});
