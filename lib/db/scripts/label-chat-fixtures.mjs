// Interactive labeler for chat-fixtures.json. Walks each unlabeled fixture and
// prompts: "which specialist should handle this?" then writes the answer back.
// Skip ('s'), quit ('q'), back-up ('b') supported. Saves on every label so a
// crash never loses progress.
//
// Run: node --env-file=.env lib/db/scripts/label-chat-fixtures.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createInterface } from "node:readline";

const FIXTURES_PATH = "ai-outputs/audit/chat-fixtures.json";

const VALID_LABELS = [
  "email", "tasks", "ideas", "brief", "contacts", "calls",
  "checkin", "journal", "schedule", "ingest",
  "direct", "clarify",
];

const KEY_TO_LABEL = {
  e: "email", t: "tasks", i: "ideas", b: "brief", c: "contacts", l: "calls",
  k: "checkin", j: "journal", s: "schedule", n: "ingest",
  d: "direct", "?": "clarify",
};

if (!existsSync(FIXTURES_PATH)) {
  console.error(`[label] ${FIXTURES_PATH} not found. Run capture-chat-fixtures.mjs first.`);
  process.exit(1);
}

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise(r => rl.question(q, r));

function save() {
  writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
}

function progress() {
  const labeled = fixtures.filter(f => f.label).length;
  return `[${labeled} / ${fixtures.length} labeled]`;
}

function helpText() {
  return [
    "",
    "Pick the specialist that should handle this message:",
    "  e=email    t=tasks    i=ideas    b=brief    c=contacts  l=calls",
    "  k=checkin  j=journal  s=schedule n=ingest   d=direct    ?=clarify",
    "  (skip / back / quit:  SPACE | BACK | Q)",
    "",
  ].join("\n");
}

async function main() {
  console.log("\n=== Chat fixture labeler ===");
  console.log(helpText());

  let i = 0;
  // Start at the first unlabeled fixture
  while (i < fixtures.length && fixtures[i].label) i++;

  while (i < fixtures.length) {
    const f = fixtures[i];
    console.log(`\n${progress()} #${i + 1}/${fixtures.length}`);
    if (f.thread_title) console.log(`  thread: "${f.thread_title}"`);
    if (f.context_type) console.log(`  context: ${f.context_type}${f.context_id ? `:${f.context_id}` : ""}`);
    console.log(`  message: ${f.content.length > 240 ? f.content.slice(0, 240) + "…" : f.content}`);

    const ans = (await ask("> ")).trim().toLowerCase();

    if (ans === "q") break;
    if (ans === "" || ans === " ") { i++; continue; } // skip
    if (ans === "back" || ans === "b ") { i = Math.max(0, i - 1); continue; }

    if (KEY_TO_LABEL[ans]) {
      f.label = KEY_TO_LABEL[ans];
      save();
      console.log(`  → labeled: ${f.label}`);
      i++;
    } else if (VALID_LABELS.includes(ans)) {
      f.label = ans;
      save();
      console.log(`  → labeled: ${f.label}`);
      i++;
    } else if (ans === "h" || ans === "help") {
      console.log(helpText());
    } else {
      console.log(`  invalid input '${ans}'. Try again or type 'h' for help.`);
    }
  }

  const labeled = fixtures.filter(f => f.label).length;
  console.log(`\n[label] ${labeled}/${fixtures.length} fixtures labeled. Saved to ${FIXTURES_PATH}.`);
  console.log(`[label] next step: node --env-file=.env lib/db/scripts/replay-classification-fixture.mjs`);
  rl.close();
}

main().catch(err => {
  console.error("[label] failed:", err);
  rl.close();
  process.exit(1);
});
