// Seed 50 synthetic, pre-labeled chat-fixture messages — used in place of
// capture-chat-fixtures.mjs when there's no real chat history yet (the app
// is still in development and Tony hasn't accumulated 50 real messages).
//
// Each fixture is hand-written to mirror something Tony would plausibly say
// to the chat, drawn from his actual workday: 10 sales calls, FlipIQ deals,
// team work with Ethan/Ramy/Faisal/Haris, Linear issues, contacts, calendar,
// emails, ideas, EOD reports, etc.
//
// Output: ai-outputs/audit/chat-fixtures.json — same shape as the live capture,
// drop-in compatible with replay-classification-fixture.mjs.
//
// Run: node lib/db/scripts/seed-synthetic-fixtures.mjs

import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT_DIR = "ai-outputs/audit";
const OUT_PATH = `${OUT_DIR}/chat-fixtures.json`;

// 50 pre-labeled fixtures. Distribution skews toward email/tasks/direct/contacts
// because that's where Tony spends most chat time.
const FIXTURES = [
  // ─── Email (10) ──────────────────────────────────────────────────────────
  { content: "Draft a reply to Chris Wesser about the term sheet — keep it short and direct, just confirm the Tuesday signing.", label: "email" },
  { content: "What emails should I look at first this morning?", label: "email" },
  { content: "Send Mike Oyoque a follow-up about the broker playbook demo we talked about last week.", label: "email" },
  { content: "Reply to Fernando — tell him I want to talk through the Chino off-market deal Friday morning.", label: "email" },
  { content: "Draft an outreach email to Xander Clemens — focus on the Family Office Club intro and 10K investors hook.", label: "email" },
  { content: "Pull up the email thread with Ethan about the AWS credits — what was the latest?", label: "email" },
  { content: "Find emails from chris.wesser this week and tell me what's pending.", label: "email" },
  { content: "Triage my inbox right now and tell me which are important vs FYI.", label: "email" },
  { content: "Reply to Drew Wolfe at Pinpoint Offers — short, ask if he can do a quick demo Thursday or Friday.", label: "email" },
  { content: "Why did you mark that email from Kyle Draper as unimportant? It looked like a real demo request.", label: "email" },

  // ─── Tasks (6) ────────────────────────────────────────────────────────────
  { content: "AI organize my tasks for today — sales first, ops second, then everything else.", label: "tasks" },
  { content: "What's on my task list and which are P0?", label: "tasks" },
  { content: "Re-rank my active tasks based on what's actually due this week.", label: "tasks" },
  { content: "Why is the AAA Build task ranked above the investor follow-ups? Move it down.", label: "tasks" },
  { content: "Add a task: review the SOW updates Faisal sent over, due Thursday.", label: "tasks" },
  { content: "What tasks are overdue and who's the owner?", label: "tasks" },

  // ─── Ideas (3) ────────────────────────────────────────────────────────────
  { content: "I have an idea — let's auto-generate a weekly investor update from the deal-flow data. Park it.", label: "ideas" },
  { content: "I want to convert that 'auto-flag stale conversations' idea into a real Linear task and assign Faisal.", label: "ideas" },
  { content: "Override on that pushback — yes, the SOC2 cert IS the priority right now, do not park it.", label: "ideas" },

  // ─── Brief (3) ────────────────────────────────────────────────────────────
  { content: "What should I focus on today? Give me the brief.", label: "brief" },
  { content: "Generate today's EOD report — keep Ethan's copy honest about the calls I missed.", label: "brief" },
  { content: "Give me the spiritual anchor for this morning — yesterday I missed the workout, don't soft-pedal it.", label: "brief" },

  // ─── Contacts (5) ─────────────────────────────────────────────────────────
  { content: "Pre-call brief on Aaron Chapman before I dial him.", label: "contacts" },
  { content: "Move Mike Oyoque from Warm to Hot — we just locked in the Tuesday demo.", label: "contacts" },
  { content: "Research Jan Sieberts at Washington Capital — dig into recent deals and personality.", label: "contacts" },
  { content: "Search contacts for anyone at Kiavi or anyone connected to Kiavi broker channel.", label: "contacts" },
  { content: "What's the last thing Ramy and Marisol talked about with the Chino seller?", label: "contacts" },

  // ─── Calls (3) ────────────────────────────────────────────────────────────
  { content: "Just hung up with Chris Craddock — connected, he's interested but wants pricing in writing. Draft the follow-up.", label: "calls" },
  { content: "Tried Drew, no answer — draft a quick SMS-style follow-up referencing the Thursday demo slot.", label: "calls" },
  { content: "What did I discuss with Tony Fletcher on the last call?", label: "calls" },

  // ─── Checkin (2) ──────────────────────────────────────────────────────────
  { content: "I'm trying to start the day and I haven't done my workout or journal — give it to me straight.", label: "checkin" },
  { content: "Check me on my habits this week — bible? workout? journal? Be honest.", label: "checkin" },

  // ─── Journal (2) ──────────────────────────────────────────────────────────
  { content: "Log a journal entry: today felt scattered, three calls connected but I let the afternoon get hijacked by Linear noise. Need to protect mornings harder.", label: "journal" },
  { content: "Reflection on this week — felt like I was reactive not proactive. What's the pattern?", label: "journal" },

  // ─── Schedule (4) ─────────────────────────────────────────────────────────
  { content: "I want to add a 1pm Tuesday meeting with Ethan — investor doc review, 30 min.", label: "schedule" },
  { content: "Should I take this meeting? It's a vendor pitching us their CRM at 10am Wednesday.", label: "schedule" },
  { content: "Block 9-11am every weekday for sales calls — protected time, no overrides.", label: "schedule" },
  { content: "Move tomorrow's 2pm slot — Faisal can't make it, find the next open spot for both of us.", label: "schedule" },

  // ─── Ingest (3) ───────────────────────────────────────────────────────────
  { content: "Process the Plaud recording from this morning's call with Rod Wilson — pull out the action items.", label: "ingest" },
  { content: "I just sent a photo of my paper planner to the inbox — scan it and update the call log.", label: "ingest" },
  { content: "Analyze the demo recording from Tuesday's pitch with Kyle — talk-listen ratio, where did I lose him?", label: "ingest" },

  // ─── Direct (orchestrator handles itself with a single tool) (10) ─────────
  { content: "Post to #tech-team-command: deploy starting in 10 min, hold off on merges.", label: "direct" },
  { content: "Create a Linear issue: investor portal sign-in is broken on mobile, P1, assign Faisal.", label: "direct" },
  { content: "What's on my calendar today?", label: "direct" },
  { content: "Search Drive for the term sheet draft from last month.", label: "direct" },
  { content: "How many calls did I make yesterday?", label: "direct" },
  { content: "DM Ramy on Slack: the title company emailed, they need the seller addendum signed by EOD.", label: "direct" },
  { content: "What time is it in PT?", label: "direct" },
  { content: "What does P0 mean on a task?", label: "direct" },
  { content: "Read the latest in the #sales channel — any deal alerts I missed?", label: "direct" },
  { content: "Pull up the 411 plan and tell me where I am on the 90-day capital raise goal.", label: "direct" },

  // ─── Clarify (genuinely ambiguous) (2) ────────────────────────────────────
  { content: "Follow up with Chris.", label: "clarify" }, // Wesser or Craddock?
  { content: "Got it.", label: "clarify" },               // empty / no actionable intent
];

// Validation: make sure no labels slipped past valid set
const VALID = new Set([
  "email", "tasks", "ideas", "brief", "contacts", "calls",
  "checkin", "journal", "schedule", "ingest",
  "direct", "clarify",
]);
for (const f of FIXTURES) {
  if (!VALID.has(f.label)) {
    console.error(`[seed-synthetic-fixtures] invalid label '${f.label}' on: ${f.content.slice(0, 60)}`);
    process.exit(1);
  }
}

// Build the fixture array in the same shape replay/label scripts expect
const now = new Date().toISOString();
const fixtures = FIXTURES.map((f, i) => ({
  id: `synthetic-${String(i + 1).padStart(3, "0")}`,
  thread_id: null,
  thread_title: null,
  context_type: null,
  context_id: null,
  content: f.content,
  captured_at: now,
  label: f.label,           // pre-labeled — skip the labeling step entirely
  prediction: null,         // ← replay script fills this
  confidence: null,
  rationale: null,
  source: "synthetic",      // marker so we know it's not real chat history
}));

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(fixtures, null, 2));

console.log(`[seed-synthetic-fixtures] wrote ${fixtures.length} pre-labeled synthetic fixtures to ${OUT_PATH}`);

// Distribution sanity check
const counts = {};
for (const f of fixtures) counts[f.label] = (counts[f.label] || 0) + 1;
console.log(`[seed-synthetic-fixtures] distribution:`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}`);
}

console.log(`\nNext step:`);
console.log(`  1. pnpm dev   (in another terminal — keep running)`);
console.log(`  2. node --env-file=.env lib/db/scripts/replay-classification-fixture.mjs`);
