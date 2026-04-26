// Replay each labeled chat fixture through the orchestrator's classify skill,
// then compare predicted intent against Tony's labels. Reports accuracy +
// confusion matrix. The R4 mitigation gate from plan.md says ≥90% accuracy
// before flipping AGENT_RUNTIME_ORCHESTRATOR=true.
//
// PREREQUISITE: API server must be running locally (or wherever API_BASE points).
// The script POSTs to /api/agents/orchestrator/skills/classify/invoke which
// calls runAgent server-side. No Anthropic SDK needed in this script.
//
// Run: pnpm dev   (in another terminal — keep it running)
//      node --env-file=.env lib/db/scripts/replay-classification-fixture.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const FIXTURES_PATH = "ai-outputs/audit/chat-fixtures.json";
const API_BASE = process.env.API_BASE || "http://localhost:8080";

if (!existsSync(FIXTURES_PATH)) {
  console.error(`[replay] ${FIXTURES_PATH} not found. Run capture-chat-fixtures.mjs + label-chat-fixtures.mjs first.`);
  process.exit(1);
}

function parseClassification(text) {
  const m = text.match(/\{[\s\S]*?\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]);
    return {
      intent: typeof parsed.intent === "string" ? parsed.intent : null,
      confidence: typeof parsed.confidence === "string" ? parsed.confidence : null,
      rationale: typeof parsed.rationale === "string" ? parsed.rationale : null,
    };
  } catch { return null; }
}

async function classifyViaApi(content) {
  const url = `${API_BASE}/api/agents/orchestrator/skills/classify/invoke`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_message: content, caller: "orchestrator" }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = await res.json();
  return { raw: json.text || "", parsed: parseClassification(json.text || "") };
}

async function main() {
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, "utf8"));
  const labeled = fixtures.filter(f => f.label);

  if (labeled.length === 0) {
    console.error("[replay] no labeled fixtures yet. Run label-chat-fixtures.mjs first.");
    process.exit(1);
  }

  // Health-check the API server before we hit it 50 times
  try {
    const health = await fetch(`${API_BASE}/api/feedback/health`);
    if (!health.ok) throw new Error(`API server health check failed: ${health.status}`);
  } catch (err) {
    console.error(`[replay] API server not reachable at ${API_BASE}. Start it with 'pnpm dev' (or set API_BASE=...).`);
    console.error(`         underlying error: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }

  console.log(`[replay] ${labeled.length} labeled fixtures to replay against ${API_BASE}\n`);

  let i = 0;
  for (const f of labeled) {
    i++;
    process.stdout.write(`[${i}/${labeled.length}] ${f.content.slice(0, 60).replace(/\n/g, " ")}…  `);
    try {
      const { raw, parsed } = await classifyViaApi(f.content);
      f.prediction = parsed?.intent || null;
      f.confidence = parsed?.confidence || null;
      f.rationale = parsed?.rationale || null;
      f.raw_output = raw;
      delete f.error;
      const ok = f.prediction === f.label;
      console.log(ok ? `✓ ${f.prediction}` : `✗ predicted=${f.prediction || "(parse-fail)"} expected=${f.label}`);
    } catch (err) {
      f.prediction = null;
      f.error = err instanceof Error ? err.message : String(err);
      console.log(`✗ error: ${f.error}`);
    }
    // Save progress every iteration so a crash doesn't lose work
    writeFileSync(FIXTURES_PATH, JSON.stringify(fixtures, null, 2));
  }

  // ── Report ──────────────────────────────────────────────────────────────────
  const correct = labeled.filter(f => f.prediction === f.label).length;
  const wrong = labeled.filter(f => f.prediction && f.prediction !== f.label).length;
  const failed = labeled.filter(f => !f.prediction).length;
  const accuracy = (correct / labeled.length) * 100;

  console.log("\n=== Classification accuracy ===");
  console.log(`Total:   ${labeled.length}`);
  console.log(`Correct: ${correct} (${accuracy.toFixed(1)}%)`);
  console.log(`Wrong:   ${wrong}`);
  console.log(`Failed:  ${failed} (parse errors / API errors)`);

  // Confusion matrix
  console.log("\n=== Confusion matrix (rows = expected, cols = predicted) ===");
  const labels = [...new Set(labeled.map(f => f.label))].sort();
  const predictions = [...new Set(labeled.map(f => f.prediction).filter(Boolean))].sort();
  const colHeaders = predictions.length ? predictions : labels;

  const colWidth = Math.max(8, ...colHeaders.map(c => c.length + 1));
  console.log(" ".repeat(10) + colHeaders.map(c => c.padStart(colWidth)).join(""));
  for (const row of labels) {
    const line = row.padStart(10);
    const counts = colHeaders.map(col => {
      const n = labeled.filter(f => f.label === row && f.prediction === col).length;
      return (n === 0 ? "·" : String(n)).padStart(colWidth);
    });
    console.log(line + counts.join(""));
  }

  // Mismatches detail
  const mismatches = labeled.filter(f => f.prediction && f.prediction !== f.label);
  if (mismatches.length > 0) {
    console.log(`\n=== Mismatches (${mismatches.length}) ===`);
    for (const m of mismatches) {
      console.log(`  expected=${m.label} got=${m.prediction} conf=${m.confidence || "?"}`);
      console.log(`    msg: ${m.content.slice(0, 120).replace(/\n/g, " ")}${m.content.length > 120 ? "…" : ""}`);
      if (m.rationale) console.log(`    why: ${m.rationale}`);
    }
  }

  console.log(`\n[replay] details saved to ${FIXTURES_PATH}`);
  if (accuracy >= 90) {
    console.log(`[replay] ✓ accuracy ≥90% — gate passes. Safe to flip AGENT_RUNTIME_ORCHESTRATOR=true after manual smoke test.`);
  } else {
    console.log(`[replay] ✗ accuracy <90% (need ≥90% per plan.md R4). Review mismatches above; tune classify.md skill body OR known-entities memory; re-seed; re-run.`);
  }
}

main().catch(err => {
  console.error("[replay] failed:", err);
  process.exit(1);
});
