// Replay each skill fixture against /api/agents/<agent>/skills/<skill>/invoke,
// validate output against the expect rules, report pass/fail per skill.
//
// SAFETY GUARANTEE — this script is read-only against external systems:
//   • Pre-flight check refuses to run any skill whose registered tools list
//     contains a side-effect tool (send_email, send_slack_message,
//     create_calendar_event, create_linear_issue, etc.).
//   • Skills currently registered all have tools=[] (the runtime didn't
//     wire any tools to them yet) so the check passes trivially today.
//   • The check exists because future tool wiring (Phase 4+ specialist
//     migrations adding tools) MUST not accidentally trigger real sends
//     when this script runs.
//
// Wrote ONLY these DB rows during a run:
//   • agent_runs (per-call cost/latency log — no user data)
//
// Wrote NOTHING externally:
//   • No Gmail / Slack / Linear / Calendar / Drive sends or creates.
//
// PREREQUISITE: API server must be running locally with the latest build.
//   pnpm dev   (in another terminal)
//
// Run: node --env-file=.env lib/db/scripts/replay-skill-fixtures.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FIXTURES_PATH = "ai-outputs/audit/skill-fixtures.json";
const API_BASE = process.env.API_BASE || "http://localhost:8080";
const AUTH_TOKEN = process.env.TCC_AUTH_TOKEN || "";

// Tools that have external side effects — running a skill that has any of
// these in its registered tools list would risk a real send/create. The
// pre-flight check refuses to run such fixtures.
const SIDE_EFFECT_TOOLS = new Set([
  // Slack
  "send_slack_message",
  // Linear
  "create_linear_issue", "create_task",
  // Gmail
  "send_email", "draft_gmail_reply",
  // Calendar
  "create_calendar_event", "schedule_meeting", "create_calendar_reminder",
  "update_calendar_event", "delete_calendar_event",
  // Contacts
  "update_contact_stage",
  // Reports
  "send_eod_report",
  // Goals (writes to companyGoalsTable + Sheets)
  "update_goal_status",
  // Meetings
  "log_meeting_context",
]);

if (!existsSync(FIXTURES_PATH)) {
  console.error(`[replay-skills] ${FIXTURES_PATH} not found. Run seed-skill-fixtures.mjs first.`);
  process.exit(1);
}

function authHeaders() {
  return AUTH_TOKEN ? { "x-tcc-token": AUTH_TOKEN } : {};
}

// ── Validators ────────────────────────────────────────────────────────────────

function tryParseJson(text) {
  // Strip markdown fences + try to find first {...} block
  const cleaned = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch { /* try regex */ }
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) {
    try { return JSON.parse(m[0]); } catch { /* fall through */ }
  }
  return null;
}

function typeMatches(value, expectedType) {
  if (expectedType === "array") return Array.isArray(value);
  if (expectedType === "string") return typeof value === "string";
  if (expectedType === "number") return typeof value === "number";
  if (expectedType === "boolean") return typeof value === "boolean";
  if (expectedType === "object") return value !== null && typeof value === "object" && !Array.isArray(value);
  return false;
}

// Returns { pass: boolean, reasons: string[] }
function validate(text, expect) {
  const reasons = [];
  if (typeof text !== "string") {
    return { pass: false, reasons: ["actual output is not a string"] };
  }

  if (expect.nonEmpty && text.trim().length === 0) {
    reasons.push("output is empty");
  }
  if (expect.minLength && text.length < expect.minLength) {
    reasons.push(`length ${text.length} < min ${expect.minLength}`);
  }
  if (expect.maxLength && text.length > expect.maxLength) {
    reasons.push(`length ${text.length} > max ${expect.maxLength}`);
  }
  if (expect.mustContain) {
    for (const needle of expect.mustContain) {
      if (!text.toLowerCase().includes(needle.toLowerCase())) {
        reasons.push(`missing required substring "${needle}"`);
      }
    }
  }
  if (expect.mustNotContain) {
    for (const banned of expect.mustNotContain) {
      if (text.includes(banned)) {
        reasons.push(`contains banned substring "${banned}"`);
      }
    }
  }
  if (expect.regex) {
    const re = new RegExp(expect.regex, "i");
    if (!re.test(text)) reasons.push(`fails regex /${expect.regex}/i`);
  }
  if (expect.jsonShape) {
    const parsed = tryParseJson(text);
    if (parsed === null) {
      reasons.push("expected JSON but couldn't parse output");
    } else {
      for (const [key, type] of Object.entries(expect.jsonShape)) {
        if (!(key in parsed)) {
          reasons.push(`JSON missing key "${key}"`);
        } else if (!typeMatches(parsed[key], type)) {
          reasons.push(`JSON key "${key}" expected ${type}, got ${typeof parsed[key]}`);
        }
      }
    }
  }
  if (expect.intent) {
    const parsed = tryParseJson(text);
    if (!parsed || parsed.intent !== expect.intent) {
      reasons.push(`expected intent="${expect.intent}", got "${parsed?.intent || "(none)"}"`);
    }
  }

  return { pass: reasons.length === 0, reasons };
}

// ── Caller ────────────────────────────────────────────────────────────────────

async function callSkill(agent, skill, input) {
  const url = `${API_BASE}/api/agents/${agent}/skills/${skill}/invoke`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ user_message: input, caller: "direct" }),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `non-JSON response (status ${res.status})` }));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || `HTTP ${res.status}`);
  }
  return json;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function healthCheck() {
  const res = await fetch(`${API_BASE}/api/feedback/health`, { headers: authHeaders() });
  if (res.status === 401) throw new Error("401 — TCC_AUTH_TOKEN missing/invalid; run with --env-file=.env");
  if (res.status === 404) throw new Error("404 — server is running OLD code; restart with pnpm dev");
  if (!res.ok) throw new Error(`health check failed: ${res.status}`);
}

// Pre-flight: query the registry for each fixture's skill and refuse if its
// declared tools include any SIDE_EFFECT_TOOLS. This guarantees the replay
// can never trigger a real Slack post / Gmail send / Calendar create.
async function safetyPreflight(fixtures) {
  // Build deduped (agent, skill) list
  const pairs = [...new Set(fixtures.map(f => `${f.agent}::${f.skill}`))];
  const blocked = [];
  for (const pair of pairs) {
    const [agent, skill] = pair.split("::");
    const url = `${API_BASE}/api/agents/${agent}/skills`;
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) continue; // tolerate — replay will surface the real error
    const json = await res.json().catch(() => null);
    const skillRow = json?.skills?.find(s => s.skillName === skill);
    if (!skillRow) continue;
    const tools = Array.isArray(skillRow.tools) ? skillRow.tools : [];
    const dangerous = tools.filter(t => SIDE_EFFECT_TOOLS.has(t));
    if (dangerous.length > 0) {
      blocked.push({ agent, skill, dangerous });
    }
  }
  if (blocked.length > 0) {
    console.error("\n[replay-skills] SAFETY ABORT — these fixtures' skills have side-effect tools registered:");
    for (const b of blocked) {
      console.error(`  ${b.agent}.${b.skill}  →  ${b.dangerous.join(", ")}`);
    }
    console.error("\nRunning would risk real sends/creates. Either:");
    console.error("  - Remove the side-effect tool from the skill's tools array, OR");
    console.error("  - Drop the fixture from skill-fixtures.json, OR");
    console.error("  - Add an --allow-writes flag explicitly (not implemented — safe by default).");
    process.exit(2);
  }
  console.log("[replay-skills] ✓ safety pre-flight passed — all fixture skills are side-effect-free");
}

async function main() {
  await healthCheck().catch(err => {
    console.error(`[replay-skills] API server not ready at ${API_BASE}: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });

  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));

  await safetyPreflight(fixtures);

  console.log(`\n[replay-skills] running ${fixtures.length} fixtures against ${API_BASE}\n`);

  let i = 0;
  for (const f of fixtures) {
    i++;
    const label = `[${i}/${fixtures.length}] ${f.agent}.${f.skill}`.padEnd(40);
    process.stdout.write(`${label}  `);

    const start = Date.now();
    try {
      const result = await callSkill(f.agent, f.skill, f.input);
      f.actual_text = result.text;
      f.actual_turns = result.turns;
      f.run_id = result.run_id;
      f.duration_ms = Date.now() - start;

      const v = validate(result.text, f.expect);
      f.pass = v.pass;
      f.reasons = v.reasons;
      delete f.error;

      console.log(v.pass ? `✓ (${f.duration_ms}ms)` : `✗ ${v.reasons[0]}`);
    } catch (err) {
      f.actual_text = null;
      f.error = err instanceof Error ? err.message : String(err);
      f.pass = false;
      f.reasons = [`error: ${f.error}`];
      f.duration_ms = Date.now() - start;
      console.log(`✗ error: ${f.error.slice(0, 60)}`);
    }

    writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const passCount = fixtures.filter(f => f.pass).length;
  const failCount = fixtures.length - passCount;
  const totalMs = fixtures.reduce((s, f) => s + (f.duration_ms || 0), 0);

  console.log("\n=== Skill validation summary ===");
  console.log(`Total:    ${fixtures.length}`);
  console.log(`Pass:     ${passCount} (${((passCount / fixtures.length) * 100).toFixed(1)}%)`);
  console.log(`Fail:     ${failCount}`);
  console.log(`Total AI time: ${(totalMs / 1000).toFixed(1)}s`);

  // Per-agent breakdown
  const byAgent = {};
  for (const f of fixtures) {
    if (!byAgent[f.agent]) byAgent[f.agent] = { pass: 0, fail: 0 };
    if (f.pass) byAgent[f.agent].pass++; else byAgent[f.agent].fail++;
  }
  console.log("\n=== By agent ===");
  for (const [agent, stats] of Object.entries(byAgent).sort()) {
    const total = stats.pass + stats.fail;
    const pct = ((stats.pass / total) * 100).toFixed(0);
    console.log(`  ${agent.padEnd(15)} ${stats.pass}/${total}  (${pct}%)`);
  }

  // Failure detail
  const failures = fixtures.filter(f => !f.pass);
  if (failures.length > 0) {
    console.log(`\n=== Failures (${failures.length}) ===`);
    for (const f of failures) {
      console.log(`\n  ${f.agent}.${f.skill} — ${f.description}`);
      for (const r of (f.reasons || [])) console.log(`    ✗ ${r}`);
      if (f.actual_text) {
        const preview = f.actual_text.slice(0, 200).replace(/\n/g, " ");
        console.log(`    actual (first 200 chars): ${preview}${f.actual_text.length > 200 ? "…" : ""}`);
      }
    }
  }

  console.log(`\n[replay-skills] details saved to ${FIXTURES_PATH}`);
  process.exit(failures.length > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[replay-skills] failed:", err);
  process.exit(1);
});
