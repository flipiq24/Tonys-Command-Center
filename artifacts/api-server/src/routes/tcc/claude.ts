import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { ClaudePromptBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, systemInstructionsTable } from "@workspace/db";
import { createLinearIssue } from "../../lib/linear";
import { postSlackMessage } from "../../lib/slack";
import { sendViaAgentMail } from "../../lib/agentmail";

// ─── Tool definitions for Claude ─────────────────────────────────────────────
const TOOLS: Parameters<typeof anthropic.messages.create>[0]["tools"] = [
  {
    name: "send_slack_message",
    description: "Post a message to a FlipIQ Slack channel. Use for team notifications, tech ideas, and deal alerts.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "Slack channel name, e.g. #tech-ideas, #sales, #general" },
        message: { type: "string", description: "The message text to post" },
      },
      required: ["channel", "message"],
    },
  },
  {
    name: "create_linear_issue",
    description: "Create a Linear issue for a tech task or bug. Use for actionable tech ideas and engineering tasks.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short, clear issue title" },
        description: { type: "string", description: "Full description of the task or bug" },
        priority: { type: "number", description: "Priority: 1=urgent, 2=high, 3=medium, 4=low" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "send_email",
    description: "Send an email on Tony's behalf via AgentMail. Use for follow-ups, EOD reports, or outreach.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject line" },
        body: { type: "string", description: "Full email body text" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "get_email_brain",
    description: "Retrieve Tony's learned email priority rules (the brain compiled from his thumbs up/down training).",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────────
async function executeTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  switch (name) {
    case "send_slack_message": {
      const result = await postSlackMessage({
        channel: String(input.channel),
        text: String(input.message),
      });
      if (result.ok) return `✓ Message posted to ${input.channel}`;
      if (result.error === "slack_not_connected") return `⚠️ Slack not connected yet — message queued for when Slack is set up.`;
      return `✗ Slack error: ${result.error}`;
    }

    case "create_linear_issue": {
      const result = await createLinearIssue({
        title: String(input.title),
        description: String(input.description),
        priority: typeof input.priority === "number" ? input.priority : 3,
      });
      if (result.ok) return `✓ Linear issue created: ${result.identifier ?? result.id}`;
      return `✗ Linear issue creation failed`;
    }

    case "send_email": {
      const result = await sendViaAgentMail({
        to: String(input.to),
        subject: String(input.subject),
        body: String(input.body),
      });
      if (result.ok) return `✓ Email sent to ${input.to} (messageId: ${result.messageId})`;
      return `✗ Email send failed`;
    }

    case "get_email_brain": {
      const [row] = await db
        .select()
        .from(systemInstructionsTable)
        .where(eq(systemInstructionsTable.section, "email_brain"));
      if (row?.content) return `Email Brain:\n${row.content}`;
      return "No email brain yet — no training data available.";
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Build system prompt ──────────────────────────────────────────────────────
async function buildSystemPrompt(): Promise<string> {
  const [brainRow] = await db
    .select()
    .from(systemInstructionsTable)
    .where(eq(systemInstructionsTable.section, "email_brain"));

  const brainSection = brainRow?.content
    ? `\n\nEMAIL BRAIN (Tony's learned priorities):\n${brainRow.content}`
    : "";

  return `You are Tony Diaz's Command Center AI — his personal daily operating system assistant for running FlipIQ.

ABOUT TONY:
- Tony runs FlipIQ, a real estate wholesale platform
- Tony has ADHD — he needs clear, direct, action-oriented responses
- Tony's North Star: Every Acquisition Associate closes 2 deals/month
- Revenue target: $50K break-even → $100K Phase 1 → $250K Scale

TONY'S RULES:
- "Today, I will follow the plan I wrote when I was clear."
- "I do not substitute clarity for action. I execute. I stabilize. I serve."
- Sales calls FIRST. Everything else is secondary.
- Morning block is for calls only. No meetings in the morning.

YOUR JOB:
- Keep Tony focused on SALES and EXECUTION
- Draft emails, suggest replies, format journal entries
- Provide accountability — redirect Tony if he's drifting
- Use your tools to take real actions: post to Slack, create Linear issues, send emails
- Be brief and direct — Tony does NOT like to read

TOOLS AVAILABLE:
- send_slack_message: Post to #tech-ideas, #sales, #general, etc.
- create_linear_issue: Create tech tasks in Linear
- send_email: Send emails via AgentMail
- get_email_brain: Check Tony's learned email priority rules

SCRIPTURE ANCHORS:
- "Seek first the kingdom of God" — Matthew 6:33
- "Commit your work to the Lord" — Proverbs 16:3${brainSection}`;
}

const router: IRouter = Router();

router.post("/claude", async (req, res): Promise<void> => {
  const parsed = ClaudePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, context } = parsed.data;
  const systemPrompt = await buildSystemPrompt();

  const messages: Parameters<typeof anthropic.messages.create>[0]["messages"] = [
    ...(context ? [
      { role: "user" as const, content: `Context: ${context}` },
      { role: "assistant" as const, content: "Understood." },
    ] : []),
    { role: "user" as const, content: prompt },
  ];

  const toolResults: { name: string; result: string }[] = [];
  let finalText = "";

  try {
    // Agentic loop — Claude may call tools multiple times before finishing
    for (let turn = 0; turn < 5; turn++) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      // Collect text from this turn
      const textBlocks = response.content.filter(b => b.type === "text");
      if (textBlocks.length > 0) {
        finalText = textBlocks.map(b => b.type === "text" ? b.text : "").join("\n");
      }

      // If Claude is done, stop
      if (response.stop_reason === "end_turn") break;

      // If Claude wants to use tools
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
        if (toolUseBlocks.length === 0) break;

        // Add Claude's response to messages
        messages.push({ role: "assistant" as const, content: response.content });

        // Execute each tool and collect results
        const toolResultContent: {
          type: "tool_result";
          tool_use_id: string;
          content: string;
        }[] = [];

        for (const block of toolUseBlocks) {
          if (block.type !== "tool_use") continue;
          const result = await executeTool(block.name, block.input as Record<string, unknown>);
          toolResults.push({ name: block.name, result });
          toolResultContent.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result,
          });
        }

        // Feed results back to Claude
        messages.push({ role: "user" as const, content: toolResultContent });
        continue;
      }

      break;
    }

    res.json({ text: finalText, ok: true, toolResults });
  } catch (err) {
    req.log.error({ err }, "Claude API error");
    res.status(500).json({ error: "Claude API error", ok: false, text: "" });
  }
});

export default router;
