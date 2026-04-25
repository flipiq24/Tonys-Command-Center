// analyze_transcript — orchestrator wrapper. Summarises a meeting/call transcript
// via Claude Sonnet 4.6. Prompt body and slice cutoff preserved verbatim.

import type { ToolHandler } from "../index.js";
import { createTrackedMessage } from "@workspace/integrations-anthropic-ai";

const handler: ToolHandler = async (input) => {
  const transcript = String(input.transcript);
  const context = input.context ? String(input.context) : "";
  const prompt = `You are analyzing a business meeting/call transcript for Tony Diaz (FlipIQ CEO).

${context ? `Context: ${context}\n\n` : ""}TRANSCRIPT:
${transcript.slice(0, 8000)}

Extract and organize the following in a clear, bulleted format:
1. **Key Decisions Made** - What was agreed/decided
2. **Action Items** - Specific tasks with owners (Tony vs. others)
3. **Contact/Company Mentions** - People or companies discussed with context
4. **Follow-up Required** - What needs to happen next and when
5. **Deal/Opportunity Notes** - Any sales/deal-relevant information
6. **Meeting Summary** - 2-3 sentence overview

Be concise and action-oriented. Tony has ADHD — make it scannable.`;

  const analysisResponse = await createTrackedMessage("chat_response", {
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const analysisText = analysisResponse.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");
  return `📋 TRANSCRIPT ANALYSIS\n\n${analysisText}`;
};

export default handler;
