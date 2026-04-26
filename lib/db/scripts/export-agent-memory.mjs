// Export agent_memory_entries rows back to ai-outputs/ai-architecture/**/*.md.
// Run periodically (manual or cron) to keep filesystem seed source in sync
// with DB edits made via the Settings dashboard or Coach proposals.
//
// IMPORTANT — read direction: the runtime always reads from DB. This script
// is for code-review / git history of memory edits. Editing .md files alone
// won't change runtime behavior — re-run seed-agent-architecture.mjs for that.
//
// Run: node --env-file=.env lib/db/scripts/export-agent-memory.mjs

import pg from "pg";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const { Pool } = pg;

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
  console.error("[export-agent-memory] DATABASE_URL not set");
  process.exit(1);
}

const ARCHITECTURE_ROOT = "ai-outputs/ai-architecture";

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

// kind → file-path-template (relative to ARCHITECTURE_ROOT/<agent>/)
function pathFor(agent, kind, sectionName) {
  const stemUpper = sectionName.toUpperCase();
  if (agent === "_shared") return `_shared/${stemUpper}.md`;
  switch (kind) {
    case "skill":  return `${agent}/SKILLS/${sectionName}.md`;
    case "memory": return `${agent}/MEMORY/${sectionName}.md`;
    // identity-tier stems map to top-level files at <agent>/STEM.md
    case "soul":     return `${agent}/SOUL.md`;
    case "user":     return `${agent}/USER.md`;
    case "agents":   return `${agent}/AGENTS.md`;
    case "identity": return `${agent}/IDENTITY.md`;
    case "tools":    return `${agent}/TOOLS.md`;
    default: return null;
  }
}

async function main() {
  const { rows } = await pool.query(
    `SELECT agent, kind, section_name, content, version, updated_at, updated_by
     FROM agent_memory_entries
     ORDER BY agent, kind, section_name`
  );

  let written = 0, skipped = 0;
  for (const r of rows) {
    const rel = pathFor(r.agent, r.kind, r.section_name);
    if (!rel) { skipped++; continue; }
    const fullPath = join(ARCHITECTURE_ROOT, rel);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(fullPath, r.content);
    written++;
  }

  console.log(`[export-agent-memory] wrote ${written} files, skipped ${skipped}`);
  await pool.end();
}

main().catch(err => {
  console.error("[export-agent-memory] failed:", err);
  pool.end();
  process.exit(1);
});
