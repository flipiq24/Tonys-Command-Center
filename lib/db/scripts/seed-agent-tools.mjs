// Seed agent_tools registry. Tool input_schema + handler_path live here
// (architecture .md files describe intent; this file describes wire format).
// Idempotent: upsert by tool_name.
//
// Run: node --env-file=.env lib/db/scripts/seed-agent-tools.mjs

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
  console.error("[seed-agent-tools] DATABASE_URL not set");
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

// ── Tool registry ────────────────────────────────────────────────────────────
// handler_path is relative to artifacts/api-server/src/agents/tools/
// (no leading ./, no .ts/.js extension — runtime appends .js for ESM resolution).

const TOOLS = [
  // ── Coach tools ──
  {
    tool_name: "read_agent_files",
    agent: "coach",
    description: "Load every memory entry (SOUL/USER/AGENTS/IDENTITY/TOOLS/SKILLS/MEMORY) for one specialist. Wide read — used by Coach to see the full agent state before proposing changes.",
    handler_path: "coach/read_agent_files",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Agent name (e.g. 'email', 'tasks')" },
      },
      required: ["agent"],
    },
  },
  {
    tool_name: "read_feedback",
    agent: "coach",
    description: "Load specific feedback rows by ID. Used to fetch the batch Tony selected when clicking Train.",
    handler_path: "coach/read_feedback",
    input_schema: {
      type: "object",
      properties: {
        feedback_ids: {
          type: "array",
          items: { type: "string" },
          description: "Feedback row UUIDs",
        },
      },
      required: ["feedback_ids"],
    },
  },
  {
    tool_name: "read_recent_feedback",
    agent: "coach",
    description: "Load recent feedback rows for an agent — broader context beyond the selected batch.",
    handler_path: "coach/read_recent_feedback",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        limit: { type: "number", description: "Max rows (default 50, max 200)" },
      },
      required: ["agent"],
    },
  },
  {
    tool_name: "read_run_history",
    agent: "coach",
    description: "Load recent runs of a specialist's skill (cost, latency, errors). Used when reasoning about whether a feedback issue is a memory gap vs a brittle skill body.",
    handler_path: "coach/read_run_history",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        skill: { type: "string" },
        limit: { type: "number", description: "Max rows (default 20, max 100)" },
      },
      required: ["agent", "skill"],
    },
  },
  {
    tool_name: "submit_proposal",
    agent: "coach",
    description: "Submit ONE proposal bundling N memory-section diffs. Tony approves/rejects atomically. Coach may call this AT MOST ONCE per training run.",
    handler_path: "coach/submit_proposal",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "Target specialist (e.g. 'email')" },
        reason: { type: "string", description: "One-line summary of the change. Reference evidence count + pattern." },
        diffs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              section_name: { type: "string", description: "Memory section slug (e.g. 'tone-preferences')" },
              kind: { type: "string", enum: ["memory"], description: "Must be 'memory' — Coach cannot edit other kinds" },
              before: { type: "string", description: "Existing content verbatim (or '' if section is new)" },
              after: { type: "string", description: "Proposed new content in full" },
            },
            required: ["section_name", "kind", "before", "after"],
          },
        },
        feedback_ids: {
          type: "array",
          items: { type: "string" },
          description: "Subset of input feedback rows that drove this proposal",
        },
      },
      required: ["agent", "reason", "diffs", "feedback_ids"],
    },
  },
  {
    tool_name: "append_to_evaluation_log",
    agent: "coach",
    description: "Append a one-paragraph note to coach/evaluation-log. Used when Coach decides a run produces no proposal, or to record lessons from rejected proposals.",
    handler_path: "coach/append_to_evaluation_log",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string", description: "The TARGET agent the note is about (the log lives at agent='coach')" },
        note: { type: "string", description: "One paragraph max" },
      },
      required: ["agent", "note"],
    },
  },
  {
    tool_name: "append_to_examples",
    agent: "coach",
    description: "Append a few-shot example to a specialist's examples-<skill>.md memory section. Only fires when the target skill has auto_examples=true.",
    handler_path: "coach/append_to_examples",
    input_schema: {
      type: "object",
      properties: {
        agent: { type: "string" },
        skill: { type: "string" },
        example: {
          type: "object",
          properties: {
            input: { type: "string" },
            output: { type: "string" },
            why_good: { type: "string" },
          },
          required: ["input", "output"],
        },
      },
      required: ["agent", "skill", "example"],
    },
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  let inserted = 0, updated = 0;

  for (const t of TOOLS) {
    const r = await pool.query(
      `INSERT INTO agent_tools (tool_name, agent, description, input_schema, handler_path, is_native, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
       ON CONFLICT (tool_name)
       DO UPDATE SET
         agent        = EXCLUDED.agent,
         description  = EXCLUDED.description,
         input_schema = EXCLUDED.input_schema,
         handler_path = EXCLUDED.handler_path,
         is_native    = EXCLUDED.is_native,
         updated_at   = now()
       RETURNING (xmax = 0) AS inserted`,
      [
        t.tool_name,
        t.agent ?? null,
        t.description ?? null,
        JSON.stringify(t.input_schema),
        t.handler_path,
        t.is_native ?? 0,
      ]
    );
    if (r.rows[0].inserted) inserted++; else updated++;
  }

  console.log(`[seed-agent-tools] ${TOOLS.length} tools: +${inserted} new, ~${updated} updated`);

  const { rows } = await pool.query(
    `SELECT agent, count(*)::int AS n
       FROM agent_tools
       GROUP BY agent
       ORDER BY agent NULLS FIRST`
  );
  console.log("\n[seed-agent-tools] tools by agent:");
  for (const r of rows) console.log(`  ${(r.agent ?? "(shared)").padEnd(15)} ${r.n}`);

  await pool.end();
}

main().catch(err => {
  console.error("[seed-agent-tools] failed:", err);
  pool.end();
  process.exit(1);
});
