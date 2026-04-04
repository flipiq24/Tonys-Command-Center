import { Router, type IRouter } from "express";
import { eq, desc, ilike } from "drizzle-orm";
import { ClaudePromptBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, systemInstructionsTable, meetingHistoryTable } from "@workspace/db";
import { createLinearIssue } from "../../lib/linear";
import { postSlackMessage, getSlackChannelHistory, listSlackChannels, searchSlack } from "../../lib/slack";
import { sendViaAgentMail } from "../../lib/agentmail";
import { listRecentEmails, draftReply } from "../../lib/gmail";
import { getTodayEvents, createEvent } from "../../lib/gcal";

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
  {
    name: "list_recent_emails",
    description: "Fetch Tony's most recent unread Gmail messages. Use to check inbox, triage emails, or get context before drafting a reply.",
    input_schema: {
      type: "object" as const,
      properties: {
        max_results: { type: "number", description: "How many emails to fetch (default 5, max 10)" },
      },
      required: [],
    },
  },
  {
    name: "draft_gmail_reply",
    description: "Create a Gmail draft reply to an email. Tony will review and send manually. Use when asked to draft or prepare a reply.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email address" },
        subject: { type: "string", description: "Email subject (add 'Re: ' prefix for replies)" },
        body: { type: "string", description: "Full email body text" },
        thread_id: { type: "string", description: "Gmail thread ID to reply to (optional)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "read_slack_channel",
    description: "Read recent messages from a FlipIQ Slack channel. Use to check what the team has been discussing, get deal updates, or see sales activity.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "Slack channel name or ID, e.g. #general, #sales, #tech-ideas" },
        limit: { type: "number", description: "Number of messages to fetch (default 10, max 50)" },
      },
      required: ["channel"],
    },
  },
  {
    name: "list_slack_channels",
    description: "List all Slack channels Tony's workspace has. Use to discover which channels exist before reading or posting.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "search_slack",
    description: "Search Slack messages across all channels. Use to find specific conversations, deal mentions, or team updates.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query, e.g. 'deal closed', 'Fernando Perez', 'demo scheduled'" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_today_calendar",
    description: "Fetch Tony's Google Calendar events for today. Use to check his schedule, find meeting times, or give him a schedule overview.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_calendar_event",
    description: "Create a new event on Tony's Google Calendar. Use when Tony asks to schedule a meeting or block time.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event notes or agenda" },
        start: { type: "string", description: "ISO 8601 datetime string, e.g. 2026-04-04T10:00:00-07:00" },
        end: { type: "string", description: "ISO 8601 datetime string, e.g. 2026-04-04T11:00:00-07:00" },
        attendees: { type: "array", items: { type: "string" }, description: "List of attendee email addresses" },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "get_meeting_history",
    description: "Retrieve past meeting notes and context for a specific contact. Use before a follow-up call or meeting to recall what was discussed previously.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string", description: "Name of the contact to look up meeting history for" },
        limit: { type: "number", description: "Max number of meetings to return (default 5)" },
      },
      required: ["contact_name"],
    },
  },
  {
    name: "log_meeting_context",
    description: "Save the context and outcomes of a meeting or call. Use after a meeting to record what was discussed, next steps, and deal outcome.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string", description: "Name of the contact you met with" },
        date: { type: "string", description: "Date of the meeting in YYYY-MM-DD format" },
        summary: { type: "string", description: "What was discussed in the meeting" },
        next_steps: { type: "string", description: "Agreed next actions and follow-up items" },
        outcome: { type: "string", description: "Result of the meeting (e.g. 'demo scheduled', 'not interested', 'send proposal')" },
      },
      required: ["contact_name", "date", "summary"],
    },
  },
  {
    name: "analyze_transcript",
    description: "Analyze a meeting or call transcript to extract key decisions, action items, contact mentions, and follow-up tasks. Use when Tony pastes in a Plaud or other recording transcript.",
    input_schema: {
      type: "object" as const,
      properties: {
        transcript: { type: "string", description: "The full text transcript to analyze" },
        context: { type: "string", description: "Optional: who was on the call, what the call was about" },
      },
      required: ["transcript"],
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

    case "read_slack_channel": {
      const result = await getSlackChannelHistory({
        channel: String(input.channel),
        limit: typeof input.limit === "number" ? Math.min(input.limit, 50) : 10,
      });
      if (!result.ok) {
        if (result.error === "slack_not_connected") return "⚠️ SLACK_TOKEN not set — Slack not connected.";
        return `✗ Slack error: ${result.error}`;
      }
      if (!result.messages?.length) return `No recent messages found in ${input.channel}.`;
      return result.messages.map((m, i) => {
        const time = new Date(parseFloat(m.ts) * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `${i + 1}. [${time}] ${m.username || m.user || "user"}: ${m.text}`;
      }).join("\n");
    }

    case "list_slack_channels": {
      const result = await listSlackChannels();
      if (!result.ok) {
        if (result.error === "slack_not_connected") return "⚠️ SLACK_TOKEN not set — Slack not connected.";
        return `✗ Slack error: ${result.error}`;
      }
      if (!result.channels?.length) return "No channels found.";
      return result.channels
        .map(c => `#${c.name}${c.is_member ? " ✓" : ""}`)
        .join(", ");
    }

    case "search_slack": {
      const result = await searchSlack(String(input.query));
      if (!result.ok) {
        if (result.error === "slack_not_connected") return "⚠️ SLACK_TOKEN not set — Slack not connected.";
        if (result.error === "not_allowed_token_type") return "⚠️ Search requires a user token (xoxp-), not a bot token. Use read_slack_channel for channel messages.";
        return `✗ Slack search error: ${result.error}`;
      }
      if (!result.messages?.length) return `No Slack messages found for "${input.query}".`;
      return result.messages.map((m, i) =>
        `${i + 1}. [#${m.channel?.name || "unknown"}] ${m.text}`
      ).join("\n");
    }

    case "create_linear_issue": {
      const result = await createLinearIssue({
        title: String(input.title),
        description: String(input.description),
        priority: typeof input.priority === "number" ? input.priority : 3,
      });
      if (result.ok) return `✓ Linear issue created: ${result.identifier ?? result.id}`;
      return `✗ Linear issue creation failed (team connection may not be set up yet)`;
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

    case "list_recent_emails": {
      const maxResults = typeof input.max_results === "number" ? input.max_results : 5;
      const emails = await listRecentEmails(Math.min(maxResults, 10));
      if (emails.length === 0) return "No recent unread emails (or Gmail not yet authorized).";
      return emails.map((e, i) =>
        `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}\n   Snippet: ${e.snippet}\n   Date: ${e.date}`
      ).join("\n\n");
    }

    case "draft_gmail_reply": {
      const result = await draftReply({
        to: String(input.to),
        subject: String(input.subject),
        body: String(input.body),
        threadId: input.thread_id ? String(input.thread_id) : undefined,
      });
      if (result.ok) return `✓ Gmail draft created (id: ${result.draftId}) — Tony will see it in his Drafts folder`;
      if (result.error?.includes("not connected")) return `⚠️ Gmail not yet authorized — Tony needs to connect his Google account`;
      return `✗ Draft creation failed: ${result.error}`;
    }

    case "get_today_calendar": {
      const events = await getTodayEvents();
      if (events.length === 0) return "No events on Tony's calendar today (or Google Calendar not yet authorized).";
      return events.map((e, i) => {
        const start = new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const end = new Date(e.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `${i + 1}. ${e.summary}\n   ${start} – ${end}${e.location ? `\n   📍 ${e.location}` : ""}${e.description ? `\n   ${e.description.slice(0, 100)}` : ""}`;
      }).join("\n\n");
    }

    case "create_calendar_event": {
      // F8 — Morning Protection: block external meetings before noon
      const startStr = String(input.start);
      const startDate = new Date(startStr);
      const pacificStart = new Date(startDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const startHour = pacificStart.getHours();
      const hasAttendees = Array.isArray(input.attendees) && input.attendees.length > 0;
      if (startHour < 12 && hasAttendees) {
        return `⛔ Morning Protection: Tony's morning (before noon PT) is reserved for outbound sales calls only. No external meetings allowed before noon. Please schedule this for 12 PM or later, or use the afternoon block (2–5 PM). If this is truly urgent, Tony can override manually on his calendar.`;
      }
      const result = await createEvent({
        summary: String(input.summary),
        description: input.description ? String(input.description) : undefined,
        start: startStr,
        end: String(input.end),
        attendees: hasAttendees ? (input.attendees as string[]).map(String) : undefined,
      });
      if (result.ok) return `✓ Calendar event created: "${input.summary}" (id: ${result.eventId})`;
      if (result.error?.includes("not connected")) return `⚠️ Google Calendar not yet authorized`;
      return `✗ Event creation failed: ${result.error}`;
    }

    case "get_meeting_history": {
      const name = String(input.contact_name);
      const lim = typeof input.limit === "number" ? Math.min(input.limit, 20) : 5;
      const rows = await db
        .select()
        .from(meetingHistoryTable)
        .where(ilike(meetingHistoryTable.contactName, `%${name}%`))
        .orderBy(desc(meetingHistoryTable.date))
        .limit(lim);
      if (rows.length === 0) return `No meeting history found for "${name}".`;
      return rows.map((r, i) => {
        const parts = [`${i + 1}. [${r.date}] ${r.contactName ?? name}`];
        if (r.summary) parts.push(`   Summary: ${r.summary}`);
        if (r.nextSteps) parts.push(`   Next Steps: ${r.nextSteps}`);
        if (r.outcome) parts.push(`   Outcome: ${r.outcome}`);
        return parts.join("\n");
      }).join("\n\n");
    }

    case "log_meeting_context": {
      const [row] = await db
        .insert(meetingHistoryTable)
        .values({
          date: String(input.date),
          contactName: String(input.contact_name),
          summary: input.summary ? String(input.summary) : null,
          nextSteps: input.next_steps ? String(input.next_steps) : null,
          outcome: input.outcome ? String(input.outcome) : null,
        })
        .returning();
      return `✓ Meeting context logged for ${input.contact_name} on ${input.date} (id: ${row.id})`;
    }

    case "analyze_transcript": {
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

      const analysisResponse = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      const analysisText = analysisResponse.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");
      return `📋 TRANSCRIPT ANALYSIS\n\n${analysisText}`;
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
    ? `\n\nEMAIL BRAIN (Tony's learned email priorities):\n${brainRow.content}`
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
- Draft emails, suggest replies, check and summarize calendar
- Provide accountability — redirect Tony if he's drifting
- Use your tools to take real actions when asked
- Be brief and direct — Tony does NOT like to read

TOOLS AVAILABLE:
- list_recent_emails: Read Tony's unread Gmail inbox
- draft_gmail_reply: Create a Gmail draft Tony can review and send
- get_today_calendar: See what's on Tony's Google Calendar today
- create_calendar_event: Schedule a meeting on Tony's calendar
- send_slack_message: Post to any Slack channel
- read_slack_channel: Read recent messages from a Slack channel
- list_slack_channels: List all channels in Tony's Slack workspace
- search_slack: Search across all Slack messages
- create_linear_issue: Create tech tasks in Linear
- send_email: Send emails via AgentMail (automated inbox)
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

      if (response.stop_reason === "end_turn") break;

      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(b => b.type === "tool_use");
        if (toolUseBlocks.length === 0) break;

        messages.push({ role: "assistant" as const, content: response.content });

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
