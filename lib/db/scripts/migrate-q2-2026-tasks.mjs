// Replace plan_items with the Q2 2026 master task list from CSV.
// One-shot migration — wipe + reload all three levels (category, subcategory, task).
//
// Default mode is dry-run: parses both CSVs, validates Linear IDs, writes a
// JSON report, prints a summary, and exits without touching the DB.
//
// Pass --yes to actually wipe + reload. Inside a single transaction the script
// drops dependent rows (task_work_notes, task_completions, agent_feedback for
// agent='tasks'), wipes plan_items (cascade-deletes brain_training_log via
// FK), then inserts new categories + subcategories + tasks built from the CSV.
//
// Run:
//   node --env-file=.env lib/db/scripts/migrate-q2-2026-tasks.mjs           # dry-run
//   node --env-file=.env lib/db/scripts/migrate-q2-2026-tasks.mjs --yes     # commit

import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { parseCsvAsObjects } from "./lib/csv-parser.mjs";

const { Pool } = pg;

const MASTER_CSV = "ai-inputs/FlipIQ_Q2_2026_Master_Tasks_v3 - Master Tasks.csv";
const PRIORITIES_CSV = "ai-inputs/FlipIQ_Q2_2026_Master_Tasks_v3 - Linear Priorities.csv";
const REPORT_PATH = "ai-outputs/q2-2026-task-migration-report.json";

const COMMIT = process.argv.includes("--yes");
const VERBOSE = process.argv.includes("--verbose");

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DATABASE_URL) {
  console.error("[migrate] DATABASE_URL not set");
  process.exit(1);
}

const pool = process.env.SUPABASE_DATABASE_URL
  ? (() => {
      const u = new URL(process.env.SUPABASE_DATABASE_URL);
      return new Pool({
        host: u.hostname,
        port: Number(u.port) || 5432,
        user: decodeURIComponent(u.username),
        password: decodeURIComponent(u.password),
        database: u.pathname.replace(/^\//, ""),
        ssl: { rejectUnauthorized: false },
      });
    })()
  : new Pool({ connectionString: process.env.DATABASE_URL });

// ── Category normalization ─────────────────────────────────────────────────
// CSV uses display names "00 Goals", "01 Adaptation"; DB stores clean lowercase
// keys. Frontend's CAT_LABELS / CAT_COLORS / CAT_KEYS expect these bare keys.
const CATEGORY_KEY_MAP = {
  "00 Goals": "goals",
  "01 Adaptation": "adaptation",
  "02 Sales": "sales",
  "03 Tech": "tech",
  "04 Capital": "capital",
  "05 Team": "team",
};
function normalizeCategoryKey(raw) {
  const t = (raw || "").trim();
  if (CATEGORY_KEY_MAP[t]) return CATEGORY_KEY_MAP[t];
  // Fallback: lowercase + strip numeric prefix
  const stripped = t.replace(/^\d+\s+/, "").toLowerCase();
  return stripped || t;
}

const ALLOWED_ACTIONS = new Set(["DO NOW", "KEEP", "PROMOTE", "PAUSE", "DEFER", "KILL"]);

// ── Status / Tier normalization ────────────────────────────────────────────
function normalizeStatus(raw) {
  const s = (raw || "").trim();
  if (!s) return { status: "active", noteSuffix: null };
  const lower = s.toLowerCase();
  if (lower === "active") return { status: "active", noteSuffix: null };
  if (lower === "in progress") return { status: "in_progress", noteSuffix: null };
  if (lower === "in qa") return { status: "in_qa", noteSuffix: null };
  if (lower === "not started") return { status: "not_started", noteSuffix: null };
  if (lower === "in progress (overdue)") return { status: "in_progress_overdue", noteSuffix: null };
  if (lower === "completed" || lower === "done") return { status: "done", noteSuffix: null };
  // Free-text status (e.g. "Haned off to Eric 4.27") — store as active and append the original to description.
  return { status: "active", noteSuffix: `[CSV status: ${s}]` };
}

function normalizeTier(raw) {
  const t = (raw || "").trim();
  if (!t) return null;
  // CSV uses Build / Critical Path / Horizon / North Star — store verbatim.
  return t;
}

function normalizePriority(raw) {
  const p = (raw || "").trim().toUpperCase();
  if (p === "P0" || p === "P1" || p === "P2" || p === "P3") return p;
  if (p.startsWith("P")) return p;
  return p || "P2";
}

// ── Linear ID extraction ───────────────────────────────────────────────────
function extractLinearIds(rawCol) {
  const raw = (rawCol || "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[A-Z]+-\d+$/.test(s));
}

// ── Hierarchy detection ────────────────────────────────────────────────────
function buildHierarchy(masterRows) {
  // Walk rows top to bottom. "Master" rows set the current parent; "Sub" rows
  // attach to the most recent Master. Idea Board section after row ~50 is
  // skipped (no Sprint ID, no Type).
  const masters = [];
  const subs = [];
  const warnings = [];
  let currentMaster = null;

  for (const row of masterRows) {
    const sprintId = row["Sprint ID"];
    const type = (row["Type"] || "").toLowerCase();
    const title = row["Q2 2026 Task"];
    if (!sprintId && !type) continue; // empty / banner row
    if (!sprintId || !title) continue; // partial row
    if (type === "master") {
      const m = { ...row, _kind: "master", _children: [] };
      masters.push(m);
      currentMaster = m;
    } else if (type === "sub") {
      if (!currentMaster) {
        warnings.push({ sprintId, msg: "Sub row appears before any Master — skipped" });
        continue;
      }
      const sub = { ...row, _kind: "sub", _master: currentMaster };
      subs.push(sub);
      currentMaster._children.push(sub);
      // Sprint ID prefix sanity check (warning only — row position is canonical)
      const masterPrefix = currentMaster["Sprint ID"].replace(/\.[\d.]+$/, "");
      if (!sprintId.startsWith(masterPrefix)) {
        warnings.push({
          sprintId,
          msg: `Sprint ID '${sprintId}' doesn't start with master '${currentMaster["Sprint ID"]}' prefix '${masterPrefix}' — kept by row position`,
        });
      }
    } else {
      warnings.push({ sprintId, msg: `Unknown Type '${row["Type"]}' — skipped` });
    }
  }
  return { masters, subs, warnings };
}

// ── Distinct categories + subcategories ────────────────────────────────────
function extractCategoryHierarchy(taskRows) {
  // Preserve insertion order so the UI categories sort matches CSV order.
  const catSet = new Map(); // categoryName → Set<subcategoryName>
  const catOrder = [];
  const subOrder = new Map(); // categoryName → array of subcategories in order

  for (const row of taskRows) {
    const cat = (row["Category"] || "").trim();
    const sub = (row["Subcategory"] || "").trim();
    if (!cat) continue;
    if (!catSet.has(cat)) {
      catSet.set(cat, new Set());
      catOrder.push(cat);
      subOrder.set(cat, []);
    }
    if (sub && !catSet.get(cat).has(sub)) {
      catSet.get(cat).add(sub);
      subOrder.get(cat).push(sub);
    }
  }

  return { categories: catOrder, subcategoriesByCategory: subOrder };
}

// ── Linear validation ──────────────────────────────────────────────────────
async function validateLinearIds({ masters, subs }, prioritiesRows) {
  const linearKey = process.env.LINEAR_API_KEY;
  if (!linearKey) {
    return { issuesByIdentifier: new Map(), projectsByName: new Map(), apiSkipped: true };
  }

  // Include canceled + triage too — the CSV references issues that may have been
  // canceled (e.g. COM-338 is currently status="Duplicate"/canceled but still
  // referenced in 3 master tasks). Validation should find them.
  // Linear caps at 250 per page; paginate via after-cursor until hasNextPage=false.
  const issuesByIdentifier = new Map();
  let after = null;
  for (let page = 0; page < 10; page++) {
    const query = `
      query Validate($after: String) {
        issues(
          first: 250,
          after: $after,
          filter: { state: { type: { in: ["triage", "backlog", "unstarted", "started", "completed", "canceled"] } } }
        ) {
          pageInfo { hasNextPage endCursor }
          nodes { identifier title state { name type } assignee { name } }
        }
      }
    `;
    const res = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: linearKey },
      body: JSON.stringify({ query, variables: { after } }),
    });
    const json = await res.json();
    if (json.errors) {
      console.error("[migrate] Linear API error:", json.errors);
      return { issuesByIdentifier: new Map(), projectsByName: new Map(), apiError: json.errors };
    }
    for (const n of json.data.issues.nodes) {
      issuesByIdentifier.set(n.identifier, n);
    }
    if (!json.data.issues.pageInfo.hasNextPage) break;
    after = json.data.issues.pageInfo.endCursor;
  }
  // Projects in one shot (smaller list)
  const projRes = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: linearKey },
    body: JSON.stringify({ query: `query { projects(first: 100) { nodes { id name state } } }` }),
  });
  const projJson = await projRes.json();
  const projectsByName = new Map();
  for (const p of projJson.data?.projects?.nodes ?? []) {
    projectsByName.set(p.name, p);
  }

  const findings = [];
  // Master tasks CSV — every Linear ID referenced
  for (const row of [...masters, ...subs]) {
    const ids = extractLinearIds(row["Linear"]);
    for (const id of ids) {
      const issue = issuesByIdentifier.get(id);
      if (issue) {
        findings.push({ kind: "ok", source: "master", sprintId: row["Sprint ID"], linearId: id, title: issue.title, state: issue.state?.name });
      } else {
        findings.push({ kind: "missing", source: "master", sprintId: row["Sprint ID"], linearId: id });
      }
    }
    if (!ids.length && (row["Linear"] || "").trim()) {
      findings.push({ kind: "unparsed", source: "master", sprintId: row["Sprint ID"], raw: row["Linear"] });
    }
  }
  // Linear Priorities CSV — distinguish issue vs project rows
  for (const row of prioritiesRows) {
    const ref = (row["Linear"] || "").trim();
    if (!ref) continue;
    if (/^[A-Z]+-\d+$/.test(ref)) {
      const issue = issuesByIdentifier.get(ref);
      if (issue) {
        findings.push({ kind: "ok", source: "priorities", order: row["Order"], linearId: ref, title: issue.title, state: issue.state?.name });
      } else {
        findings.push({ kind: "missing", source: "priorities", order: row["Order"], linearId: ref });
      }
    } else if (ref.startsWith("Project:")) {
      const projectName = ref.replace(/^Project:\s*/, "").trim();
      const project = projectsByName.get(projectName);
      if (project) {
        findings.push({ kind: "ok", source: "priorities-project", order: row["Order"], project: projectName, state: project.state });
      } else {
        findings.push({ kind: "missing", source: "priorities-project", order: row["Order"], project: projectName });
      }
    } else {
      findings.push({ kind: "unparsed", source: "priorities", order: row["Order"], raw: ref });
    }
  }

  return { issuesByIdentifier, projectsByName, findings };
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[migrate] mode: ${COMMIT ? "COMMIT" : "DRY-RUN"}`);

  // 1. Parse Master Tasks CSV (header is row 1, banner is row 0)
  const masterRows = parseCsvAsObjects(MASTER_CSV, { headerRowIndex: 1 });
  const prioritiesRows = parseCsvAsObjects(PRIORITIES_CSV, { headerRowIndex: 0 });
  console.log(`[migrate] parsed ${masterRows.length} master rows, ${prioritiesRows.length} priorities rows`);

  // 2. Build hierarchy
  const { masters, subs, warnings } = buildHierarchy(masterRows);
  console.log(`[migrate] hierarchy: ${masters.length} masters, ${subs.length} subs, ${warnings.length} warnings`);
  if (VERBOSE && warnings.length) {
    for (const w of warnings) console.warn(`  ⚠ ${w.sprintId}: ${w.msg}`);
  }

  // 3. Extract distinct categories + subcategories from the actual data
  const allTaskRows = [...masters, ...subs];
  const { categories, subcategoriesByCategory } = extractCategoryHierarchy(allTaskRows);
  const totalSubcats = [...subcategoriesByCategory.values()].reduce((a, b) => a + b.length, 0);
  console.log(`[migrate] categories: ${categories.length}, subcategories: ${totalSubcats}`);

  // 4. Validate Linear IDs (uses LINEAR_API_KEY from env)
  console.log("[migrate] validating Linear IDs against live API…");
  const validation = await validateLinearIds({ masters, subs }, prioritiesRows);
  const findings = validation.findings || [];
  const okCount = findings.filter((f) => f.kind === "ok").length;
  const missingCount = findings.filter((f) => f.kind === "missing").length;
  const unparsedCount = findings.filter((f) => f.kind === "unparsed").length;
  console.log(`[migrate] linear: ${okCount} ok, ${missingCount} missing, ${unparsedCount} unparsed`);
  if (VERBOSE && missingCount) {
    for (const f of findings.filter((x) => x.kind === "missing")) {
      console.warn(`  ✗ ${f.linearId || f.project} (${f.source}: ${f.sprintId || f.order})`);
    }
  }

  // 5. Write report
  const report = {
    generatedAt: new Date().toISOString(),
    mode: COMMIT ? "COMMIT" : "DRY-RUN",
    summary: {
      categories: categories.length,
      subcategories: totalSubcats,
      masters: masters.length,
      subs: subs.length,
      total: masters.length + subs.length,
      linearOk: okCount,
      linearMissing: missingCount,
      linearUnparsed: unparsedCount,
      hierarchyWarnings: warnings.length,
    },
    categoryList: categories,
    subcategoriesByCategory: Object.fromEntries(subcategoriesByCategory),
    hierarchyWarnings: warnings,
    linearFindings: findings,
  };
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`[migrate] wrote report → ${REPORT_PATH}`);

  if (!COMMIT) {
    console.log("\n[migrate] DRY-RUN complete. Re-run with --yes to wipe + reload.");
    await pool.end();
    return;
  }

  // 6. Safety check before destructive action
  const { rows: existingCount } = await pool.query("SELECT COUNT(*)::int AS n FROM plan_items");
  console.log(`[migrate] existing plan_items count: ${existingCount[0].n}`);
  if (existingCount[0].n > 0 && existingCount[0].n < 5) {
    console.error(`[migrate] aborting — plan_items has only ${existingCount[0].n} rows, this looks unsafe`);
    process.exit(1);
  }

  // 7. Single transaction: wipe + reload
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 7a. Drop dependent rows (no FK CASCADE on these — manual cleanup)
    const { rows: oldIds } = await client.query("SELECT id::text FROM plan_items");
    const oldIdList = oldIds.map((r) => r.id);
    if (oldIdList.length > 0) {
      await client.query("DELETE FROM task_work_notes WHERE task_id = ANY($1)", [oldIdList]);
      await client.query("DELETE FROM task_completions WHERE task_id = ANY($1)", [oldIdList]);
      await client.query("DELETE FROM agent_feedback WHERE agent = 'tasks' AND source_id = ANY($1)", [oldIdList]);
    }

    // 7b. Wipe plan_items (cascades brain_training_log via FK)
    await client.query("DELETE FROM plan_items");

    // 7c. Insert categories (DB key is the normalized lowercase form; title keeps "00 Goals" prefix for display)
    const categoryUuids = new Map(); // displayName → uuid
    let priorityOrder = 0;
    for (const catDisplay of categories) {
      const id = randomUUID();
      const catKey = normalizeCategoryKey(catDisplay);
      categoryUuids.set(catDisplay, id);
      await client.query(
        `INSERT INTO plan_items (id, level, category, title, status, priority_order, created_at, updated_at)
         VALUES ($1, 'category', $2, $3, 'active', $4, NOW(), NOW())`,
        [id, catKey, catDisplay, priorityOrder++],
      );
    }

    // 7d. Insert subcategories (parent category stored as normalized key)
    const subcategoryUuids = new Map(); // key: "catDisplay::sub"
    for (const catDisplay of categories) {
      const catKey = normalizeCategoryKey(catDisplay);
      for (const sub of subcategoriesByCategory.get(catDisplay)) {
        const id = randomUUID();
        subcategoryUuids.set(`${catDisplay}::${sub}`, id);
        await client.query(
          `INSERT INTO plan_items (id, level, category, subcategory, title, status, parent_id, priority_order, created_at, updated_at)
           VALUES ($1, 'subcategory', $2, $3, $3, 'active', $4, $5, NOW(), NOW())`,
          [id, catKey, sub, categoryUuids.get(catDisplay), priorityOrder++],
        );
      }
    }

    // 7e. Insert master tasks (taskType='master', parentId → subcategory)
    const masterUuids = new Map(); // sprintId → uuid
    for (const m of masters) {
      const id = randomUUID();
      masterUuids.set(m["Sprint ID"], id);
      const catDisplay = m["Category"];
      const catKey = normalizeCategoryKey(catDisplay);
      const sub = m["Subcategory"];
      const subUuid = subcategoryUuids.get(`${catDisplay}::${sub}`) || categoryUuids.get(catDisplay) || null;
      const { status, noteSuffix } = normalizeStatus(m["Status"]);
      const linearIds = extractLinearIds(m["Linear"]);
      const linearId = linearIds[0] || null;
      const additionalLinear = linearIds.slice(1);
      const baseDescription = (m["Notes"] || "").trim();
      const description = [baseDescription, noteSuffix].filter(Boolean).join("\n\n") || null;
      const workNotes = additionalLinear.length ? `Additional Linear: ${additionalLinear.join(", ")}` : null;
      const dueDate = (m["Due Date"] || "").trim() || null;
      const completedAt = (m["Completed Date"] || "").trim() || null;
      await client.query(
        `INSERT INTO plan_items
          (id, level, category, subcategory, title, description, owner, co_owner, priority, status,
           priority_order, parent_id, due_date, completed_at, linear_id, source, atomic_kpi, work_notes,
           execution_tier, task_type, created_at, updated_at)
         VALUES
          ($1, 'task', $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $17, $18, 'master', NOW(), NOW())`,
        [
          id, catKey, sub, m["Q2 2026 Task"], description,
          (m["Owner"] || "").trim() || null,
          (m["Co-Owner"] || "").trim() || null,
          normalizePriority(m["Priority"]),
          status, priorityOrder++,
          subUuid, dueDate, completedAt, linearId,
          (m["Source"] || "").trim() || null,
          (m["Atomic KPI Tie"] || "").trim() || null,
          workNotes, normalizeTier(m["Execution Tier"]),
        ],
      );
    }

    // 7f. Insert sub tasks (taskType='subtask', parentTaskId → master)
    for (const s of subs) {
      const id = randomUUID();
      const catDisplay = s["Category"];
      const catKey = normalizeCategoryKey(catDisplay);
      const sub = s["Subcategory"];
      const subUuid = subcategoryUuids.get(`${catDisplay}::${sub}`) || categoryUuids.get(catDisplay) || null;
      const masterUuid = s._master ? masterUuids.get(s._master["Sprint ID"]) : null;
      const { status, noteSuffix } = normalizeStatus(s["Status"]);
      const linearIds = extractLinearIds(s["Linear"]);
      const linearId = linearIds[0] || null;
      const additionalLinear = linearIds.slice(1);
      const baseDescription = (s["Notes"] || "").trim();
      const description = [baseDescription, noteSuffix].filter(Boolean).join("\n\n") || null;
      const workNotes = additionalLinear.length ? `Additional Linear: ${additionalLinear.join(", ")}` : null;
      const dueDate = (s["Due Date"] || "").trim() || null;
      const completedAt = (s["Completed Date"] || "").trim() || null;
      await client.query(
        `INSERT INTO plan_items
          (id, level, category, subcategory, title, description, owner, co_owner, priority, status,
           priority_order, parent_id, parent_task_id, due_date, completed_at, linear_id, source, atomic_kpi, work_notes,
           execution_tier, task_type, created_at, updated_at)
         VALUES
          ($1, 'task', $2, $3, $4, $5, $6, $7, $8, $9,
           $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, 'subtask', NOW(), NOW())`,
        [
          id, catKey, sub, s["Q2 2026 Task"], description,
          (s["Owner"] || "").trim() || null,
          (s["Co-Owner"] || "").trim() || null,
          normalizePriority(s["Priority"]),
          status, priorityOrder++,
          subUuid, masterUuid, dueDate, completedAt, linearId,
          (s["Source"] || "").trim() || null,
          (s["Atomic KPI Tie"] || "").trim() || null,
          workNotes, normalizeTier(s["Execution Tier"]),
        ],
      );
    }

    // 7g. Insert linear_priorities (full reset every run; CSV is the source of truth)
    await client.query("DELETE FROM linear_priorities");
    let lpOrder = 0;
    let lpInserted = 0;
    const unknownActions = new Set();
    for (const row of prioritiesRows) {
      const ref = (row["Linear"] || "").trim();
      const title = (row["Linear Task"] || row["Title"] || "").trim();
      const action = (row["Action"] || "").trim().toUpperCase().replace(/\*/g, "");
      if (!ref || !title || !action) continue; // skip blank / partial rows
      if (!ALLOWED_ACTIONS.has(action)) unknownActions.add(action);
      const isProject = ref.startsWith("Project:");
      const nextStep = (row["Notes / Next Step"] || "").trim();
      const why = (row["Why (Alignment)"] || row["Why"] || "").trim();
      await client.query(
        `INSERT INTO linear_priorities
          (priority_order, linear_ref, is_project, title, status, priority, owner, team, q2_plan_ref, action, why, next_step)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          lpOrder++,
          ref,
          isProject,
          title,
          (row["Status"] || "").trim(),
          (row["Priority"] || "").trim(),
          (row["Owner"] || "").trim() || null,
          (row["Team"] || "").trim() || null,
          (row["Q2 Plan Ref"] || "").trim() || null,
          action,
          why,
          nextStep || null,
        ],
      );
      lpInserted++;
    }
    console.log(`[migrate] inserted ${lpInserted} linear_priorities rows`);
    if (unknownActions.size) {
      console.warn(`[migrate] ⚠ unknown actions: ${[...unknownActions].join(", ")}`);
    }

    // 7h. Cleanup: drop orphan business_context row from previous (wrong) placement
    const { rowCount: orphanLp } = await client.query(
      "DELETE FROM business_context WHERE document_type = 'linear_priorities'",
    );
    if (orphanLp > 0) console.log(`[migrate] removed ${orphanLp} orphan business_context.linear_priorities row(s)`);

    await client.query("COMMIT");
    console.log("[migrate] commit successful");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[migrate] rollback —", err);
    throw err;
  } finally {
    client.release();
  }

  // 8. Verify counts
  const { rows: levels } = await pool.query("SELECT level, COUNT(*)::int AS n FROM plan_items GROUP BY level ORDER BY level");
  const { rows: types } = await pool.query("SELECT task_type, COUNT(*)::int AS n FROM plan_items WHERE level='task' GROUP BY task_type ORDER BY task_type");
  console.log("[migrate] verification:");
  console.log("  by level:", levels.map((r) => `${r.level}=${r.n}`).join(", "));
  console.log("  by task_type:", types.map((r) => `${r.task_type}=${r.n}`).join(", "));

  await pool.end();
}

main().catch((err) => {
  console.error("[migrate] fatal:", err);
  process.exit(1);
});
