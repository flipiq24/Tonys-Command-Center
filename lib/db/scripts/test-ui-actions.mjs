// Test EVERY UI button that triggers a specialist skill (no orchestrator hop).
// Maps each Tony-clickable action to the (agent, skill) it calls and runs the
// skill end-to-end against the runtime — same code path the route handler
// would use when AGENT_RUNTIME_<X>=true.
//
// SAFETY: same pre-flight as replay-skill-fixtures.mjs — refuses to test any
// skill whose tools list contains side-effect tools (send_email,
// create_calendar_event, send_slack_message, etc.). Today's specialist skills
// all have tools=[] so this passes trivially. The check exists so future tool
// wiring cannot accidentally trigger real Slack/Gmail/Calendar writes during
// this test.
//
// What the user actually sees in the UI:
//   • Each row's "ui_action" field describes the button label / page location
//   • If a fixture FAILS, a UI user clicking that button would see one of:
//       - blank / partial output (skill returned empty)
//       - wrong format (skill returned text where JSON was expected)
//       - an error toast (the runtime threw)
//   • The "ui_consequence" line on each failure tells you what would break.
//
// Run: pnpm dev (in another terminal)
//      node --env-file=.env lib/db/scripts/test-ui-actions.mjs

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

const FIXTURES_PATH = "ai-outputs/audit/skill-fixtures.json";
const OUT_PATH = "ai-outputs/audit/ui-action-results.json";
const API_BASE = process.env.API_BASE || "http://localhost:8080";
const AUTH_TOKEN = process.env.TCC_AUTH_TOKEN || "";

function authHeaders() { return AUTH_TOKEN ? { "x-tcc-token": AUTH_TOKEN } : {}; }

// ── Map every UI button → (agent, skill, fixture-id, what it triggers) ───────
// The fixture-id maps into ai-outputs/audit/skill-fixtures.json (the same
// skill-fixtures already cover the input shape; we reuse them).
const UI_ACTIONS = [
  // Email view
  { ui_action: "📧 EmailsView → 💬 Draft reply (per email card)",
    location: "Inbox > email card > Draft reply button",
    agent: "email", skill: "reply-draft", fixture_id: "skill-001",
    ui_consequence: "Reply modal would open empty or with broken text instead of a Tony-voiced draft." },
  { ui_action: "✉ Compose new email (Sales Mode contact card)",
    location: "Sales Mode > contact > ✉ Email button",
    agent: "email", skill: "compose-new", fixture_id: "skill-002",
    ui_consequence: "Compose modal would show empty subject/body or unparseable JSON instead of a draft." },
  { ui_action: "🔄 Reclassify modal (4 modes)",
    location: "Inbox > top banner > Reclassify",
    agent: "email", skill: "triage", fixture_id: "skill-003",
    ui_consequence: "Inbox would not re-bucket emails — Important/FYI lists would stay stale." },

  // Tasks view
  { ui_action: "🧠 AI Organize button",
    location: "Tasks page > top right > AI Organize",
    agent: "tasks", skill: "ai-organize", fixture_id: "skill-004",
    ui_consequence: "Task list would not re-rank — order stays unchanged or returns broken IDs." },
  { ui_action: "Drag-drop reflection toast",
    location: "Tasks page > drag a task > explanation modal > Save",
    agent: "tasks", skill: "reorder-reflect", fixture_id: "skill-005",
    ui_consequence: "Save would succeed but the reflection toast would show '(no reflection)' instead of insight." },
  { ui_action: "Linear webhook auto-position new issue",
    location: "Background — when a Linear issue arrives, it auto-positions in Tony's task list",
    agent: "tasks", skill: "score-new-task", fixture_id: "skill-006",
    ui_consequence: "New Linear issues would land at the bottom of the list instead of correct priority slot." },
  { ui_action: "Create Task pre-create priority warning",
    location: "Tasks page > Add task > submit",
    agent: "tasks", skill: "check-priority", fixture_id: "skill-007",
    ui_consequence: "Pre-create warning ('this is lower priority than X tasks above it') would not appear." },

  // Ideas view
  { ui_action: "💡 Submit idea (auto-classify)",
    location: "Header > 💡 Idea > Submit",
    agent: "ideas", skill: "classify", fixture_id: "skill-008",
    ui_consequence: "Idea would be saved without a category/urgency — appears under 'Uncategorized'." },
  { ui_action: "Idea pushback message",
    location: "Header > 💡 Idea > Submit (when 90-day plan exists)",
    agent: "ideas", skill: "pushback", fixture_id: "skill-009",
    ui_consequence: "Out-of-scope ideas would NOT be flagged — Tony loses the gatekeeper warning." },
  { ui_action: "Convert idea to task",
    location: "Ideas modal > 'Generate task draft' button",
    agent: "ideas", skill: "generate-task", fixture_id: "skill-010",
    ui_consequence: "Task draft modal would show empty fields — Tony has to type everything by hand." },

  // Brief / EOD
  { ui_action: "Daily brief generation",
    location: "Dashboard > daily brief card (auto-loads)",
    agent: "brief", skill: "daily", fixture_id: "skill-011",
    ui_consequence: "Daily brief card would be empty or show partial sections." },
  { ui_action: "Spiritual anchor",
    location: "Dashboard > top banner (morning)",
    agent: "brief", skill: "spiritual-anchor", fixture_id: "skill-012",
    ui_consequence: "Morning anchor message would fall back to 'Today is a new day. Start with 10 calls.' (static)." },
  { ui_action: "EOD preview modal",
    location: "Header > Send EOD > preview",
    agent: "brief", skill: "eod-preview", fixture_id: "skill-013",
    ui_consequence: "EOD preview would show raw stats instead of a Tony-voice narrative." },
  { ui_action: "EOD send (Tony copy)",
    location: "Header > Send EOD > confirm send",
    agent: "brief", skill: "eod-report", fixture_id: "skill-014",
    ui_consequence: "EOD email would be sent with a fallback template missing the narrative." },

  // Contacts / Calls
  { ui_action: "📋 Pre-Call Brief button",
    location: "Sales Mode > contact card > 📋 Brief",
    agent: "contacts", skill: "pre-call-brief", fixture_id: "skill-015",
    ui_consequence: "Brief modal would show 'Unable to generate brief.' instead of personalized prep." },
  { ui_action: "Log call attempt + draft follow-up",
    location: "Sales Mode > 📞 Call attempt > submit (with instructions)",
    agent: "calls", skill: "follow-up-draft", fixture_id: "skill-016",
    ui_consequence: "Follow-up email field on the call row would be empty — Tony has to draft manually." },

  // Checkin / Journal
  { ui_action: "Morning check-in guilt-trip (when missed habits)",
    location: "Dashboard > morning > check-in card",
    agent: "checkin", skill: "accountability", fixture_id: "skill-017",
    ui_consequence: "Guilt-trip card would show 'Failed to generate accountability check.' instead of message." },
  { ui_action: "Save journal entry",
    location: "Header > 📔 Journal > Save",
    agent: "journal", skill: "format-entry", fixture_id: "skill-018",
    ui_consequence: "Journal entry would save raw text without the Mood / Key Events / Reflection structure." },

  // Schedule
  { ui_action: "Add schedule item (scope check)",
    location: "Schedule page > Add Item > submit",
    agent: "schedule", skill: "check-scope", fixture_id: "skill-019",
    ui_consequence: "Scope-block warning ('this is not Sales/CSM/COO') would not appear — meeting auto-saves." },

  // Ingest
  { ui_action: "90-day plan ingest",
    location: "Background — sheets-sync runs sync90DayPlan() periodically",
    agent: "ingest", skill: "summarize-90day", fixture_id: "skill-020",
    ui_consequence: "Business context table would store the raw doc instead of a 3-4 sentence summary." },
  { ui_action: "Business plan ingest",
    location: "Background — sheets-sync runs syncBusinessPlan() periodically",
    agent: "ingest", skill: "summarize-business-plan", fixture_id: "skill-021",
    ui_consequence: "Same as above — business plan summary missing for downstream skills." },
  { ui_action: "Plaud transcript analysis",
    location: "Background — Plaud watcher processes new recordings",
    agent: "ingest", skill: "transcribe-plaud", fixture_id: "skill-022",
    ui_consequence: "Plaud calls would log to communication_log without the talk-listen / objection / next-step JSON." },
  { ui_action: "Demo feedback analysis",
    location: "Background — demo feedback scanner runs hourly 9 AM–6 PM PT",
    agent: "ingest", skill: "analyze-demo-feedback", fixture_id: "skill-023",
    ui_consequence: "Demo recordings would not produce coaching feedback — just metadata." },

  // Orchestrator (chat) — explicitly EXCLUDED per user request, but listed for completeness
];

// ── Side-effect tools → safety pre-flight ────────────────────────────────────
const SIDE_EFFECT_TOOLS = new Set([
  "send_slack_message", "create_linear_issue", "create_task",
  "send_email", "draft_gmail_reply", "create_calendar_event",
  "schedule_meeting", "create_calendar_reminder", "update_calendar_event",
  "delete_calendar_event", "update_contact_stage", "send_eod_report",
  "update_goal_status", "log_meeting_context",
]);

async function safetyPreflight(actions) {
  const pairs = [...new Set(actions.map(a => `${a.agent}::${a.skill}`))];
  const blocked = [];
  for (const pair of pairs) {
    const [agent, skill] = pair.split("::");
    const res = await fetch(`${API_BASE}/api/agents/${agent}/skills`, { headers: authHeaders() });
    if (!res.ok) continue;
    const json = await res.json().catch(() => null);
    const skillRow = json?.skills?.find(s => s.skillName === skill);
    if (!skillRow) continue;
    const tools = Array.isArray(skillRow.tools) ? skillRow.tools : [];
    const dangerous = tools.filter(t => SIDE_EFFECT_TOOLS.has(t));
    if (dangerous.length > 0) blocked.push({ agent, skill, dangerous });
  }
  if (blocked.length > 0) {
    console.error("\n[ui-actions] SAFETY ABORT — these UI-button skills now have side-effect tools:");
    for (const b of blocked) console.error(`  ${b.agent}.${b.skill} → ${b.dangerous.join(", ")}`);
    console.error("\nRunning would risk real sends/creates. Aborting.");
    process.exit(2);
  }
}

async function callSkill(agent, skill, input) {
  const res = await fetch(`${API_BASE}/api/agents/${agent}/skills/${skill}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ user_message: input, caller: "direct" }),
  });
  const json = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

// Reuse the validators from skill-fixtures
function tryParseJson(text) {
  const cleaned = text.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
  try { return JSON.parse(cleaned); } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  return null;
}
function typeMatches(v, t) {
  if (t === "array") return Array.isArray(v);
  if (t === "string") return typeof v === "string";
  if (t === "number") return typeof v === "number";
  if (t === "boolean") return typeof v === "boolean";
  return false;
}
function validate(text, expect) {
  const reasons = [];
  if (typeof text !== "string") return { pass: false, reasons: ["actual not a string"] };
  if (expect.nonEmpty && !text.trim()) reasons.push("output empty");
  if (expect.minLength && text.length < expect.minLength) reasons.push(`length ${text.length} < ${expect.minLength}`);
  if (expect.maxLength && text.length > expect.maxLength) reasons.push(`length ${text.length} > ${expect.maxLength}`);
  for (const n of (expect.mustContain || [])) if (!text.toLowerCase().includes(n.toLowerCase())) reasons.push(`missing "${n}"`);
  for (const n of (expect.mustNotContain || [])) if (text.includes(n)) reasons.push(`contains banned "${n}"`);
  if (expect.jsonShape) {
    const p = tryParseJson(text);
    if (!p) reasons.push("expected JSON, couldn't parse");
    else for (const [k, t] of Object.entries(expect.jsonShape)) {
      if (!(k in p)) reasons.push(`JSON missing "${k}"`);
      else if (!typeMatches(p[k], t)) reasons.push(`JSON "${k}" type ${typeof p[k]} ≠ ${t}`);
    }
  }
  if (expect.intent) {
    const p = tryParseJson(text);
    if (!p || p.intent !== expect.intent) reasons.push(`intent="${p?.intent || "?"}" ≠ "${expect.intent}"`);
  }
  return { pass: reasons.length === 0, reasons };
}

async function main() {
  // Health check
  try {
    const r = await fetch(`${API_BASE}/api/feedback/health`, { headers: authHeaders() });
    if (r.status === 401) throw new Error("401 — TCC_AUTH_TOKEN missing");
    if (r.status === 404) throw new Error("404 — server is running OLD code; restart with pnpm dev");
    if (!r.ok) throw new Error(`health ${r.status}`);
  } catch (err) {
    console.error(`[ui-actions] server not ready at ${API_BASE}: ${err}`);
    process.exit(1);
  }

  if (!existsSync(FIXTURES_PATH)) {
    console.error(`[ui-actions] ${FIXTURES_PATH} not found — run seed-skill-fixtures.mjs first`);
    process.exit(1);
  }
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));
  const fixtureById = Object.fromEntries(fixtures.map(f => [f.id, f]));

  await safetyPreflight(UI_ACTIONS);
  console.log("[ui-actions] ✓ safety pre-flight passed (no side-effect tools on any UI-button skill)\n");

  const results = [];
  let i = 0;
  for (const a of UI_ACTIONS) {
    i++;
    const fixture = fixtureById[a.fixture_id];
    if (!fixture) {
      console.log(`[${i}/${UI_ACTIONS.length}] ${a.ui_action}  ⚠ skipped (fixture ${a.fixture_id} missing)`);
      results.push({ ...a, status: "skipped" });
      continue;
    }

    process.stdout.write(`[${i}/${UI_ACTIONS.length}] ${a.ui_action}\n`);
    process.stdout.write(`     skill: ${a.agent}.${a.skill}  …  `);

    try {
      const r = await callSkill(a.agent, a.skill, fixture.input);
      const v = validate(r.text, fixture.expect);
      if (v.pass) {
        console.log(`✓ ${r.turns} turn${r.turns === 1 ? "" : "s"}, ${r.text?.length || 0} chars`);
        results.push({ ...a, status: "pass", actual_text_preview: r.text.slice(0, 200), turns: r.turns });
      } else {
        console.log(`✗ ${v.reasons.join("; ")}`);
        console.log(`     UI consequence: ${a.ui_consequence}`);
        results.push({ ...a, status: "fail", reasons: v.reasons, actual_text: r.text });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ runtime error: ${msg}`);
      console.log(`     UI consequence: ${a.ui_consequence}`);
      results.push({ ...a, status: "error", error: msg });
    }
  }

  if (!existsSync("ai-outputs/audit")) mkdirSync("ai-outputs/audit", { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

  // Summary
  const pass = results.filter(r => r.status === "pass").length;
  const fail = results.filter(r => r.status === "fail").length;
  const error = results.filter(r => r.status === "error").length;
  const skipped = results.filter(r => r.status === "skipped").length;

  console.log("\n=== UI-action verdict ===");
  console.log(`Total UI buttons tested: ${results.length}`);
  console.log(`  ✓ Working:  ${pass}  (button click → expected output)`);
  console.log(`  ✗ Broken:   ${fail}  (button click → wrong-shape output)`);
  console.log(`  ⚠ Errored:  ${error}  (button click → server error)`);
  console.log(`  ─ Skipped:  ${skipped}`);

  if (fail + error > 0) {
    console.log(`\n=== UI buttons that WOULD BREAK if you flipped the flag today ===`);
    for (const r of results.filter(x => x.status === "fail" || x.status === "error")) {
      console.log(`\n  ${r.ui_action}`);
      console.log(`     location:    ${r.location}`);
      console.log(`     skill:       ${r.agent}.${r.skill}`);
      console.log(`     why:         ${r.reasons?.join("; ") || r.error}`);
      console.log(`     user sees:   ${r.ui_consequence}`);
    }
  }

  console.log(`\n[ui-actions] details saved to ${OUT_PATH}`);
  process.exit((fail + error) > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("[ui-actions] failed:", err);
  process.exit(1);
});
