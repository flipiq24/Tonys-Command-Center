// Capture the last N user chat messages from chat_messages → ai-outputs/audit/chat-fixtures.json
// Used as the input set for the orchestrator classification fixture (R4 mitigation
// from plan.md). Run once to seed; can be re-run to refresh.
//
// Run: node --env-file=.env lib/db/scripts/capture-chat-fixtures.mjs [--limit 50]

import pg from "pg";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const { Pool } = pg;

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
  console.error("[capture-chat-fixtures] DATABASE_URL not set");
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

const limit = parseInt(process.argv.find(a => a.startsWith("--limit"))?.split("=")[1]
  || (process.argv[process.argv.indexOf("--limit") + 1])
  || "50", 10);

const OUT_DIR = "ai-outputs/audit";
const OUT_PATH = `${OUT_DIR}/chat-fixtures.json`;

async function main() {
  // Pull last `limit` user messages — exclude assistant turns since we're
  // testing classification of inbound user intent.
  const { rows } = await pool.query(
    `SELECT cm.id, cm.thread_id, cm.content, cm.created_at,
            ct.title AS thread_title, ct.context_type, ct.context_id
     FROM chat_messages cm
     LEFT JOIN chat_threads ct ON ct.id = cm.thread_id
     WHERE cm.role = 'user'
       AND cm.content IS NOT NULL
       AND length(trim(cm.content)) > 0
     ORDER BY cm.created_at DESC
     LIMIT $1`,
    [limit]
  );

  if (rows.length === 0) {
    console.log("[capture-chat-fixtures] no user messages found in chat_messages — nothing to capture");
    await pool.end();
    return;
  }

  // Build the fixtures array. Each entry has:
  //   id, content, captured_at — used for replay
  //   label — initially null; user fills via label-chat-fixtures.mjs
  //   prediction — initially null; replay script fills it
  const fixtures = rows.map(r => ({
    id: r.id,
    thread_id: r.thread_id,
    thread_title: r.thread_title,
    context_type: r.context_type,
    context_id: r.context_id,
    content: r.content,
    captured_at: r.created_at,
    label: null,         // ← user fills via label-chat-fixtures.mjs
    prediction: null,    // ← replay script fills via runAgent('orchestrator','classify')
    confidence: null,
    rationale: null,
  }));

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(fixtures, null, 2));

  console.log(`[capture-chat-fixtures] wrote ${fixtures.length} fixtures to ${OUT_PATH}`);
  console.log(`[capture-chat-fixtures] next step: node --env-file=.env lib/db/scripts/label-chat-fixtures.mjs`);

  await pool.end();
}

main().catch(err => {
  console.error("[capture-chat-fixtures] failed:", err);
  pool.end();
  process.exit(1);
});
