// Seed agent architecture from ai-outputs/ai-architecture/**/*.md
// Idempotent: upserts by (agent, kind, section_name).
// Run: node --env-file=.env lib/db/scripts/seed-agent-architecture.mjs

import pg from "pg";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename, extname } from "node:path";

const { Pool } = pg;

const ARCHITECTURE_ROOT = "ai-outputs/ai-architecture";

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
  console.error("[seed-agents] DATABASE_URL not set");
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

// ── YAML frontmatter parser (minimal, hand-rolled) ────────────────────────────
// Supports:
//   key: value
//   key:
//     - item
//     - item
//   nested.key: value (kept flat)
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: null, body: raw };

  const yaml = m[1];
  const body = m[2];
  const out = {};
  const lines = yaml.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) { i++; continue; }

    const kv = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!kv) { i++; continue; }

    const key = kv[1];
    const val = kv[2].trim();

    if (val === "" || val === null) {
      // Could be a list or nested object on subsequent indented lines.
      const items = [];
      i++;
      while (i < lines.length && /^\s+/.test(lines[i])) {
        const ln = lines[i];
        const itemMatch = ln.match(/^\s*-\s*(.+)$/);
        if (itemMatch) items.push(stripQuotes(itemMatch[1].trim()));
        i++;
      }
      if (items.length > 0) out[key] = items;
      else out[key] = null;
    } else {
      out[key] = coerce(stripQuotes(val));
      i++;
    }
  }
  return { frontmatter: out, body };
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d*\.\d+$/.test(v)) return Number(v);
  return v;
}

// ── Walk architecture folder ──────────────────────────────────────────────────
function walk(dir, agent = null, parts = []) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      // _shared / _TEMPLATES / _COST_MODEL → top-level "agent" folders
      // (skip _TEMPLATES — boilerplate, not seed material)
      if (entry === "_TEMPLATES") continue;
      if (parts.length === 0) {
        // entering an agent folder
        out.push(...walk(full, entry, [entry]));
      } else {
        // SKILLS/ or MEMORY/ subfolder
        out.push(...walk(full, agent, [...parts, entry]));
      }
    } else if (entry.endsWith(".md")) {
      out.push({ path: full, agent, parts: [...parts, entry] });
    }
  }
  return out;
}

// ── Classify a file → { agent, kind, sectionName } ────────────────────────────
// Layout:
//   _shared/USER.md                 → agent='_shared', kind='user',     section='user'
//   _shared/COMPANY.md              → agent='_shared', kind='company',  section='company'
//   email/SOUL.md                   → agent='email',   kind='soul',     section='soul'
//   email/USER.md                   → agent='email',   kind='user',     section='user'
//   email/AGENTS.md                 → agent='email',   kind='agents',   section='agents'
//   email/IDENTITY.md               → agent='email',   kind='identity', section='identity'
//   email/TOOLS.md                  → agent='email',   kind='tools',    section='tools'
//   email/SKILLS/reply-draft.md     → agent='email',   kind='skill',    section='reply-draft'
//   email/MEMORY/tone-preferences.md→ agent='email',   kind='memory',   section='tone-preferences'
function classify({ agent, parts }) {
  if (parts.length === 2) {
    // <agent>/FILE.md
    const file = parts[1];
    const stem = basename(file, extname(file)).toLowerCase();
    return { agent, kind: stem, sectionName: stem };
  }
  if (parts.length === 3) {
    const folder = parts[1];
    const file = parts[2];
    const stem = basename(file, extname(file)).toLowerCase();
    if (folder === "SKILLS") return { agent, kind: "skill", sectionName: stem };
    if (folder === "MEMORY") return { agent, kind: "memory", sectionName: stem };
  }
  return null; // skip — not a recognized location
}

// ── Skill registry helpers ────────────────────────────────────────────────────
function extractSkillRegistry(agent, sectionName, frontmatter) {
  if (!frontmatter) return null;
  return {
    agent,
    skillName: frontmatter.skill || sectionName,
    model: frontmatter.model || "claude-haiku-4-5",
    maxTokens: frontmatter.max_tokens ?? 1024,
    tools: Array.isArray(frontmatter.tools) ? frontmatter.tools : [],
    memorySections: Array.isArray(frontmatter.memory_sections) ? frontmatter.memory_sections : [],
    autoExamples: frontmatter.auto_examples === true,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const files = walk(ARCHITECTURE_ROOT);

  const memoryRows = [];
  const skillRows = [];

  for (const f of files) {
    // Skip top-level loose docs (FEEDBACK_SYSTEM.md, README.md, _COST_MODEL.md, *.html etc)
    if (f.parts.length === 1) continue;

    const cls = classify(f);
    if (!cls) continue;

    const raw = readFileSync(f.path, "utf8");
    const { frontmatter, body } = parseFrontmatter(raw);
    // Store body (without frontmatter) for skill files — frontmatter goes to agent_skills.
    const content = cls.kind === "skill" ? (body || raw) : raw;

    memoryRows.push({
      agent: cls.agent,
      kind: cls.kind,
      sectionName: cls.sectionName,
      content,
    });

    if (cls.kind === "skill") {
      const skill = extractSkillRegistry(cls.agent, cls.sectionName, frontmatter);
      if (skill) skillRows.push(skill);
    }
  }

  console.log(`[seed-agents] discovered ${memoryRows.length} memory rows, ${skillRows.length} skills`);

  let inserted = 0, updated = 0;

  for (const row of memoryRows) {
    const r = await pool.query(
      `INSERT INTO agent_memory_entries (agent, kind, section_name, content, version, updated_by)
       VALUES ($1, $2, $3, $4, 1, 'seed')
       ON CONFLICT (agent, kind, section_name)
       DO UPDATE SET
         content     = EXCLUDED.content,
         version     = agent_memory_entries.version + 1,
         updated_at  = now(),
         updated_by  = 'seed'
       WHERE agent_memory_entries.content IS DISTINCT FROM EXCLUDED.content
       RETURNING (xmax = 0) AS inserted`,
      [row.agent, row.kind, row.sectionName, row.content]
    );
    if (r.rowCount === 0) continue; // unchanged
    if (r.rows[0].inserted) inserted++; else updated++;
  }

  let skillsInserted = 0, skillsUpdated = 0;
  for (const s of skillRows) {
    const r = await pool.query(
      `INSERT INTO agent_skills (agent, skill_name, model, max_tokens, tools, memory_sections, auto_examples)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb)
       ON CONFLICT (agent, skill_name)
       DO UPDATE SET
         model           = EXCLUDED.model,
         max_tokens      = EXCLUDED.max_tokens,
         tools           = EXCLUDED.tools,
         memory_sections = EXCLUDED.memory_sections,
         auto_examples   = EXCLUDED.auto_examples,
         updated_at      = now()
       RETURNING (xmax = 0) AS inserted`,
      [
        s.agent,
        s.skillName,
        s.model,
        s.maxTokens,
        JSON.stringify(s.tools),
        JSON.stringify(s.memorySections),
        JSON.stringify(s.autoExamples),
      ]
    );
    if (r.rows[0].inserted) skillsInserted++; else skillsUpdated++;
  }

  console.log(`[seed-agents] memory: +${inserted} new, ~${updated} updated, ${memoryRows.length - inserted - updated} unchanged`);
  console.log(`[seed-agents] skills: +${skillsInserted} new, ~${skillsUpdated} updated`);

  // Quick verification
  const counts = await pool.query(
    `SELECT agent, kind, COUNT(*)::int AS n
     FROM agent_memory_entries
     GROUP BY agent, kind
     ORDER BY agent, kind`
  );
  console.log("\n[seed-agents] memory entries by (agent, kind):");
  for (const row of counts.rows) {
    console.log(`  ${row.agent.padEnd(15)} ${row.kind.padEnd(10)} ${row.n}`);
  }

  await pool.end();
}

main().catch(err => {
  console.error("[seed-agents] failed:", err);
  pool.end();
  process.exit(1);
});
