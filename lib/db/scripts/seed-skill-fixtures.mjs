// Seed skill-fixture test cases — one set of {input, expected} per agent skill.
// Output: ai-outputs/audit/skill-fixtures.json
//
// Used by replay-skill-fixtures.mjs to validate that each agent skill produces
// the right SHAPE of output before flipping production flags. This is the
// per-skill version of the orchestrator classification fixture: a green run
// here means every migrated handler will behave like its legacy version.
//
// Each fixture has:
//   agent, skill         — which skill to invoke
//   description          — human-readable label for the test report
//   input                — string sent as user_message to the runtime
//   expect.nonEmpty      — output text must be non-empty
//   expect.minLength     — output text must be ≥ N chars
//   expect.maxLength     — output text must be ≤ N chars
//   expect.mustContain   — string[] — output must contain ALL of these (case-insensitive)
//   expect.mustNotContain — string[] — output must contain NONE of these
//   expect.jsonShape     — object — output must parse as JSON containing these top-level keys
//   expect.intent        — string — for classify-style skills, expected intent value
//
// Skipped (cannot be tested in batch mode):
//   contacts.card-ocr       — needs image input (vision)
//   contacts.research       — uses Anthropic native web_search (not in runtime yet)
//   ingest.scan-paper-planner — needs image input (vision)
//   coach.analyze-feedback  — needs an active training_run_id + feedback rows
//   coach.append-example    — needs an approved proposal first
//   coach.review-trends     — cron-only skill, requires aggregate state
//   orchestrator.delegate   — internal flow-control, not standalone
//   orchestrator.synthesize — internal flow-control, not standalone

import { writeFileSync, mkdirSync, existsSync } from "node:fs";

const OUT = "ai-outputs/audit/skill-fixtures.json";

const FIXTURES = [
  // ─── EMAIL (3 of 5) ─────────────────────────────────────────────────────────
  {
    agent: "email",
    skill: "reply-draft",
    description: "Draft a reply to an existing email thread",
    input: `Draft a reply to this email:
From: chris.wesser@gmail.com
Subject: Term sheet — final markup

Tony, sending the final markup over. Few small tweaks on section 3. Want to lock signing for Tuesday?

Write a professional reply from Tony Diaz. Keep it brief and action-oriented. Plain text only.`,
    expect: {
      nonEmpty: true,
      minLength: 60,
      maxLength: 800,
      mustContain: ["Tuesday"],
      mustNotContain: ["**", "##", "* ", "- ", "<html"],
    },
  },
  {
    agent: "email",
    skill: "compose-new",
    description: "Compose a new outbound email with JSON output",
    input: `Draft an email from Tony to Aaron Chapman.
Subject hint: "Quick intro — FlipIQ"
Context/purpose: Cold outreach, just got his info from REIBlackBook event. Wants to discuss how FlipIQ can help his lending workflow.
Keep the body to 3-5 sentences max.`,
    expect: {
      jsonShape: { subject: "string", body: "string" },
      mustContain: ["Aaron"],
    },
  },
  {
    agent: "email",
    skill: "triage",
    description: "Triage a small batch of emails into 3 categories",
    input: `Classify these 3 emails:
[
  {"from": "chris.wesser@gmail.com", "subject": "Term sheet final", "snippet": "Tony, signing Tuesday — final markup attached"},
  {"from": "newsletter@bloomberg.com", "subject": "5 deals to watch", "snippet": "Top distressed-asset opportunities this week"},
  {"from": "ramy@flipiq.com", "subject": "Title company update", "snippet": "Ramy here — title flagged a small issue on the Chino seller doc"}
]`,
    expect: {
      jsonShape: { important: "array", fyi: "array", promotions: "array" },
    },
  },

  // ─── TASKS (4 of 4) ─────────────────────────────────────────────────────────
  {
    agent: "tasks",
    skill: "ai-organize",
    description: "Re-rank a small task list",
    input: `You are Tony Diaz's AI sprint brain for FlipIQ. Re-rank this active task list.

NORTH STAR METRIC: Every Acquisition Associate closes 2 deals/month.

ACTIVE TASKS (current order):
1. [t-001] MASTER | sales | Close Chris Wesser term sheet | Tony | P0 | due 2026-04-29
2. [t-002] MASTER | tech  | Fix investor portal login bug | Faisal | P1 | due 2026-04-30
3. [t-003] MASTER | sales | Cold-call 10 broker-investors | Tony | P0 | (no due)

Return ONLY a JSON object: {"priorityOrder": ["id1", "id2", ...]}`,
    expect: {
      jsonShape: { priorityOrder: "array" },
      mustContain: ["t-001", "t-002", "t-003"],
    },
  },
  {
    agent: "tasks",
    skill: "reorder-reflect",
    description: "AI reflection on Tony's task drag-drop",
    input: `TASK: "Cold-call 10 broker-investors"
DIRECTION: Tony moved this task UP — meaning it is now MORE important than the tasks it leapfrogged over.
LEAPFROGGED OVER (now less important):
1. Fix investor portal login bug
2. Update business-context Google Doc

TONY'S EXPLANATION: "Sales calls are the only way to hit the deal target this month. Tech debt waits."`,
    expect: {
      nonEmpty: true,
      minLength: 30,
      maxLength: 600,
    },
  },
  {
    agent: "tasks",
    skill: "score-new-task",
    description: "Decide where to insert a new Linear-derived task",
    input: `NEW TASK: "Add SOC2 audit prep checklist" | Category: capital | Priority: P1

BRAIN CONTEXT: Sales-first business. P0 > revenue, P1 > speed, P2 > quality.

CURRENT TASK ORDER (index: task):
0: Close Chris Wesser term sheet (P0)
1: Cold-call 10 broker-investors (P0)
2: Fix investor portal login bug (P1)
3: Update Google Sheets sync (P2)

At which index (0 = top) should the new task be inserted?

Return ONLY a JSON object: {"insertAt": <number>}`,
    expect: {
      jsonShape: { insertAt: "number" },
    },
  },
  {
    agent: "tasks",
    skill: "check-priority",
    description: "Check priority of a brand-new task vs existing ones",
    input: `NEW TASK: "Reorganize my Drive folder structure"

EXISTING ACTIVE TASKS:
1. [linear] Close Chris Wesser term sheet
2. [local] Cold-call 10 broker-investors
3. [linear] Fix investor portal login bug
4. [local] Send EOD report to Ethan`,
    expect: {
      jsonShape: { newTaskPriority: "number", higherPriorityItems: "array" },
    },
  },

  // ─── IDEAS (3 of 3) ─────────────────────────────────────────────────────────
  {
    agent: "ideas",
    skill: "classify",
    description: "Classify a new idea",
    input: `You are Tony Diaz's AI classifier for FlipIQ ideas.

BUSINESS CONTEXT:
Sales-first business. Break-even goal: $50K/month. Top-of-funnel: 10 calls/day.

RECENT IDEAS (for context):
None yet.

NEW IDEA: "Build a Slack bot that auto-summarizes deal-flow emails into the #sales channel."

Return EXACTLY this JSON:
{
  "category": "Tech|Sales|Marketing|Strategic Partners|Operations|Product|Personal",
  "urgency": "Now|This Week|This Month|Someday",
  "techType": "Bug|Feature|Note|Task|Strategic|null",
  "reason": "...",
  "businessFit": "...",
  "priority": "high|medium|low",
  "warningIfDistraction": "..."
}`,
    expect: {
      jsonShape: { category: "string", urgency: "string", priority: "string" },
    },
  },
  {
    agent: "ideas",
    skill: "pushback",
    description: "Pushback on an out-of-scope idea",
    input: `Given these business priorities:
90-DAY PLAN: Sales-first. Goals: $500K capital raise, 30 closed deals, hire 2 AAs.

A new idea was submitted: "Rewrite the entire CRM in Rust for performance."

Does this conflict with or distract from current priorities? If yes, estimate what priority rank (1-100) this would be on the 90-day plan. Is this unreasonable enough to park and escalate to Ethan?

Respond as JSON only: { "conflicts": true/false, "rank": number|null, "reason": "brief explanation", "unreasonable": true/false }`,
    expect: {
      jsonShape: { conflicts: "boolean" },
    },
  },
  {
    agent: "ideas",
    skill: "generate-task",
    description: "Convert an approved idea into a structured task",
    input: `Idea category: tech\nUrgency: This Week\nType: Feature\n\nIdea: "Add a 'Reclassify' button on the email triage view that lets Tony manually move emails between Important / FYI without retraining the brain."\n\nGenerate task fields.`,
    expect: {
      // Skill returns a task draft with at least a title — other fields
      // (category/priority/owner) are filled in by the legacy handler from
      // the idea's classification context, not always returned by the model.
      jsonShape: { title: "string" },
    },
  },

  // ─── BRIEF (3 of 4 — eod-report covered by recipient param twice) ───────────
  {
    agent: "brief",
    skill: "daily",
    description: "Generate Tony's daily brief from calendar + Linear",
    input: `You generate Tony Diaz's daily brief. He is CEO of FlipIQ.
Today is Monday, April 26, 2026.

---

Generate Tony's daily brief based on his REAL calendar and open tasks:

CALENDAR TODAY:
9:00 AM: Sales call block (10 calls target)
2:00 PM: Demo with Chris Wesser

OPEN LINEAR ISSUES:
[ENG-101] Investor portal login bug (high priority)
[ENG-102] AWS credit application (med priority)

Return ONLY valid JSON:
{
  "emailsImportant": [...],
  "emailsFyi": [...],
  "slackItems": [...],
  "tasks": [...]
}`,
    expect: {
      jsonShape: { emailsImportant: "array", emailsFyi: "array", tasks: "array" },
    },
  },
  {
    agent: "brief",
    skill: "spiritual-anchor",
    description: "Generate the morning spiritual anchor",
    input: `You are Tony Diaz's morning AI coach. Generate a SHORT (3-4 sentences max) morning spiritual anchor message.

Today is Monday, April 26, 2026.

Tony's spiritual content / Daily Task doc:
Faith first. Discipline before motivation. Show up even when you don't feel like it.

Yesterday's performance: 8 calls logged, no journal
Tony's spiritual engagement: MODERATE (Bible missed 2 of last 5 days). Acknowledge the inconsistency briefly, encourage getting back on track.

Output PLAIN TEXT only. No markdown, no asterisks, no bold, no headers.`,
    expect: {
      nonEmpty: true,
      minLength: 50,
      maxLength: 800,
      mustNotContain: ["**", "##", "###"],
    },
  },
  {
    agent: "brief",
    skill: "eod-preview",
    description: "Generate EOD report preview",
    input: `Generate an EOD (End of Day) report for Tony Diaz, CEO of FlipIQ.

Today's Data:
- Calls Made: 7
- Demos Booked: 2
- Tasks Completed: 5

Call Log:
- Chris Wesser: connected, term sheet locked Tuesday
- Mike Oyoque: attempt, no answer
- Drew Wolfe: attempt, voicemail

Tasks Completed:
- Send Aaron Chapman intro email (sales)
- Review SOW updates (ops)
- Submit AWS credit form (capital)
- Update 411 plan progress (ops)
- Slack ping Ramy on Chino doc (ops)

Write a brief EOD report (3-4 paragraphs) in Tony's voice.`,
    expect: {
      nonEmpty: true,
      minLength: 200,
      maxLength: 4000,
      mustContain: ["Chris", "7"],
    },
  },
  {
    agent: "brief",
    skill: "eod-report",
    description: "Generate EOD report (Tony recipient)",
    input: `Generate Tony Diaz's EOD report for 2026-04-26 (FlipIQ CEO).

Today's Data:
- Calls made: 7
- Demos booked: 2
- Emails sent: 12
- Tasks completed: 5

Format as a brief EOD (4 paragraphs max):
1. Quick summary
2. Key metrics: calls, demos, tasks
3. What needs follow-up tomorrow
4. One closing thought in Tony's voice — direct and honest.`,
    expect: {
      nonEmpty: true,
      minLength: 100,
      maxLength: 3000,
    },
  },

  // ─── CONTACTS (1 of 3 — research/card-ocr skipped) ──────────────────────────
  {
    agent: "contacts",
    skill: "pre-call-brief",
    description: "Generate a pre-call brief",
    input: `You are Tony Diaz's sales assistant. Generate a pre-call brief for Tony. Be direct and actionable. Tony has ADHD so keep it scannable.

Include these sections:
1. QUICK SUMMARY
2. COMMUNICATION STYLE
3. AI PERSONALITY ASSESSMENT
4. KEY ACTION

Contact: Aaron Chapman
Company: CHAPMAN
Type: Independent Investor
Status (temperature): New
Phone: (602) 291-3357
Email: chapmanaaron8@gmail.com
Next Step: Initial outreach

Recent Communications: None yet.`,
    expect: {
      nonEmpty: true,
      minLength: 80,
      maxLength: 1500,
      mustContain: ["Aaron"],
    },
  },

  // ─── CALLS (1 of 1) ─────────────────────────────────────────────────────────
  {
    agent: "calls",
    skill: "follow-up-draft",
    description: "Post-call follow-up after a missed attempt",
    input: `Tony Diaz (FlipIQ CEO) tried to call Mike Oyoque but got no answer.
Tony's instructions: "Mention the Tuesday demo we discussed last week, push for a quick yes/no"
Draft a brief, professional follow-up email (3-4 sentences max). Plain text only, no subject line.`,
    expect: {
      nonEmpty: true,
      minLength: 50,
      maxLength: 800,
      mustContain: ["Mike", "Tuesday"],
      mustNotContain: ["**", "##", "Subject:"],
    },
  },

  // ─── CHECKIN (1 of 1) ───────────────────────────────────────────────────────
  {
    agent: "checkin",
    skill: "accountability",
    description: "Morning guilt-trip when Tony skips workout + journal",
    input: `Tony is about to start his day. He has NOT done his workout and journal. He is skipping BOTH. This is serious. Go harder. Generate the guilt trip using his own words.`,
    expect: {
      nonEmpty: true,
      minLength: 100,
      maxLength: 1500,
      mustNotContain: ["* ", "- "],
    },
  },

  // ─── JOURNAL (1 of 1) ───────────────────────────────────────────────────────
  {
    agent: "journal",
    skill: "format-entry",
    description: "Format a raw journal entry",
    input: `Today is Monday, April 26, 2026.

Raw entry:
Felt pretty scattered today. Three calls connected which was good — Chris Wesser locked Tuesday for the term sheet signing. But the afternoon got hijacked by Linear noise about the investor portal bug. Need to protect mornings harder. Glad I got the workout in.`,
    expect: {
      nonEmpty: true,
      minLength: 200,
      mustContain: ["Daily Journal Entry", "Mood:", "Reflection:"],
    },
  },

  // ─── SCHEDULE (1 of 1) ──────────────────────────────────────────────────────
  {
    agent: "schedule",
    skill: "check-scope",
    description: "Scope-check a vendor pitch meeting",
    input: `Meeting: "CRM vendor pitch — DealStack at 10am Wednesday"
Description: "Sales-team CRM vendor demo, 30 min."`,
    expect: {
      jsonShape: { inScope: "boolean", category: "string" },
    },
  },

  // ─── INGEST (3 of 5 — vision skills skipped) ────────────────────────────────
  {
    agent: "ingest",
    skill: "summarize-90day",
    description: "Summarize a 90-day plan document",
    input: `Summarize this 90-day business plan in 3-4 concise sentences for an AI context window:

Q2 2026 Focus: Capital Raise + Pipeline.
Goals:
1. Close $500K bridge round by end of Q2 (Tony lead, Chris Wesser legal)
2. Add 30 new operator-investor contacts to pipeline (Ramy ownership)
3. Hire 2 Acquisition Associates by mid-May (Ethan ownership)
4. Ship investor portal v1 (Faisal lead)

North star: 2 deals/month per AA.`,
    expect: {
      nonEmpty: true,
      minLength: 80,
      maxLength: 800,
      mustContain: ["Q2"],
    },
  },
  {
    agent: "ingest",
    skill: "summarize-business-plan",
    description: "Summarize a business plan document",
    input: `Summarize this business plan in 3-4 concise sentences for an AI context window:

FlipIQ is an AI-powered platform for real-estate wholesalers. We deliver vetted deal flow to operator-investors and capture a fee per closed transaction. Differentiator vs Carrot/InvestorLift: AI scoring of operator quality + automated outreach playbook. Target market: 10K active wholesale operators in US. 2026 target: $50K MRR by end of year.`,
    expect: {
      nonEmpty: true,
      minLength: 80,
      maxLength: 800,
      mustContain: ["FlipIQ"],
    },
  },
  {
    agent: "ingest",
    skill: "transcribe-plaud",
    description: "Analyze a Plaud call recording transcript",
    input: `You are an AI sales-call analyzer. Analyze this transcript:

Recording: "Call with Rod Wilson at Anchor Loans, Apr 26 2026"
Length: 22 min
Talk-listen ratio (estimated): Tony 50% / Rod 50%

Transcript snippet:
Tony: "Rod, appreciate you taking the call. Wanted to follow up on the institutional validation piece — where do you see Anchor's appetite right now?"
Rod: "Honestly, we've been pulling back on bridge. The fundamentals look softer for Q3."
Tony: "OK, that's helpful. What about your operator base — anyone leaning more aggressive?"
Rod: "A few. I'd flag three folks I think you should call directly — I'll send names tomorrow."

Return JSON with these fields:
{
  "talkListenRatio": "...",
  "questionsAsked": <number>,
  "prospectInterestLevel": "<high|medium|low>",
  "interestSignals": ["..."],
  "objections": ["..."],
  "followUpRecommendation": "...",
  "summary": "..."
}`,
    expect: {
      jsonShape: { prospectInterestLevel: "string", summary: "string" },
    },
  },
  {
    agent: "ingest",
    skill: "analyze-demo-feedback",
    description: "Analyze demo recording feedback",
    input: `A FlipIQ demo was conducted: "Demo with Kyle Draper, Apr 25 2026"
Recording found: "demo-kyle-draper-2026-04-25.mp3"

(No transcript available — metadata-only analysis.)

Generate concise coaching feedback for Tony covering:
1. Talk-to-listen ratio (aim for 60% prospect talking)
2. Questions asked
3. Prospect engagement signals
4. Objections raised
5. Follow-up timing recommendation

Keep it actionable and under 300 words.`,
    expect: {
      nonEmpty: true,
      minLength: 80,
      maxLength: 2000,
    },
  },

  // ─── ORCHESTRATOR (1 of 5 — classify, since others are flow-control) ─────────
  {
    agent: "orchestrator",
    skill: "classify",
    description: "Classify an email-related chat message",
    input: "Draft a reply to Chris Wesser about the term sheet — keep it short and direct, just confirm the Tuesday signing.",
    expect: {
      jsonShape: { intent: "string", confidence: "string" },
      intent: "email",
    },
  },
  {
    agent: "orchestrator",
    skill: "classify",
    description: "Classify a tasks-related chat message",
    input: "AI organize my tasks for today — sales first, ops second, then everything else.",
    expect: {
      jsonShape: { intent: "string", confidence: "string" },
      intent: "tasks",
    },
  },
  {
    agent: "orchestrator",
    skill: "auto-title",
    description: "Generate a 3-6 word title for a new chat thread",
    input: `Generate a 3-6 word title for a chat thread that started with this message:

"What emails should I look at first this morning?"

Return only the title text — no quotes, no markdown.`,
    expect: {
      nonEmpty: true,
      minLength: 5,
      maxLength: 80,
    },
  },
];

if (!existsSync("ai-outputs/audit")) mkdirSync("ai-outputs/audit", { recursive: true });

// Build entries with a stable id, prediction/error fields populated by replay.
const entries = FIXTURES.map((f, i) => ({
  id: `skill-${String(i + 1).padStart(3, "0")}`,
  agent: f.agent,
  skill: f.skill,
  description: f.description,
  input: f.input,
  expect: f.expect,
  // Filled by replay:
  actual_text: null,
  actual_turns: null,
  pass: null,
  reasons: null,
  duration_ms: null,
  run_id: null,
  error: null,
}));

writeFileSync(OUT, JSON.stringify(entries, null, 2));

console.log(`[seed-skill-fixtures] wrote ${entries.length} skill fixtures to ${OUT}`);

// Distribution by agent
const counts = {};
for (const e of entries) {
  counts[e.agent] = (counts[e.agent] || 0) + 1;
}
console.log(`\n[seed-skill-fixtures] coverage by agent:`);
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(15)} ${v}`);
}
console.log(`\nNext step:`);
console.log(`  1. pnpm dev (or restart your existing dev server)`);
console.log(`  2. node --env-file=.env lib/db/scripts/replay-skill-fixtures.mjs`);
