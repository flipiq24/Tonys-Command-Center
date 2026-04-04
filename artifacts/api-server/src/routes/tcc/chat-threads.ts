import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, systemInstructionsTable, contactsTable } from "@workspace/db";
import { chatThreadsTable, chatMessagesTable, communicationLogTable, contactIntelligenceTable } from "../../lib/schema-v2";
import { createLinearIssue } from "../../lib/linear";
import { postSlackMessage, getSlackChannelHistory, listSlackChannels, searchSlack } from "../../lib/slack";
import { sendViaAgentMail } from "../../lib/agentmail";
import { listRecentEmails, draftReply } from "../../lib/gmail";
import { getTodayEvents, createEvent } from "../../lib/gcal";
import { getDrive } from "../../lib/google-auth";
import { sendAutoEod } from "./eod";

const router: IRouter = Router();

const TOOLS: Parameters<typeof anthropic.messages.create>[0]["tools"] = [
  {
    name: "send_slack_message",
    description: "Post a message to a FlipIQ Slack channel.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string", description: "Slack channel name, e.g. #tech-ideas, #sales" },
        message: { type: "string", description: "The message text to post" },
      },
      required: ["channel", "message"],
    },
  },
  {
    name: "create_linear_issue",
    description: "Create a Linear issue for a tech task or bug.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short, clear issue title" },
        description: { type: "string", description: "Full description" },
        priority: { type: "number", description: "1=urgent, 2=high, 3=medium, 4=low" },
      },
      required: ["title", "description"],
    },
  },
  {
    name: "send_email",
    description: "Send an email on Tony's behalf via AgentMail relay.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "compose_email",
    description: "Open the EmailCompose view pre-filled for Tony to review before sending. Does NOT auto-send.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        cc: { type: "string" },
        threadId: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "schedule_meeting",
    description: "Create a calendar event. SCOPE GATEKEEPER: Only for sales calls, prospect meetings, or Ramy support.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
        description: { type: "string" },
        location: { type: "string" },
        purpose: { type: "string", description: "'sales', 'ramy_support', or 'other'" },
      },
      required: ["summary", "start", "end", "purpose"],
    },
  },
  {
    name: "research_contact",
    description: "Look up a contact's details, communication history, and intelligence from the database.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
        contactId: { type: "string" },
        webSearch: { type: "boolean" },
      },
      required: [],
    },
  },
  {
    name: "update_contact_stage",
    description: "Update a contact's sales pipeline stage: new, outreach, engaged, meeting_scheduled, negotiating, closed, dormant.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        stage: { type: "string" },
      },
      required: ["contactId", "stage"],
    },
  },
  {
    name: "create_task",
    description: "Create a Linear issue as a task.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string" },
        description: { type: "string" },
        priority: { type: "number" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_email_brain",
    description: "Retrieve Tony's learned email priority rules.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_recent_emails",
    description: "Fetch Tony's recent unread Gmail messages.",
    input_schema: {
      type: "object" as const,
      properties: { max_results: { type: "number" } },
      required: [],
    },
  },
  {
    name: "draft_gmail_reply",
    description: "Create a Gmail draft reply for Tony to review. Does NOT auto-send.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
        thread_id: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "read_slack_channel",
    description: "Read recent messages from a Slack channel.",
    input_schema: {
      type: "object" as const,
      properties: { channel: { type: "string" }, limit: { type: "number" } },
      required: ["channel"],
    },
  },
  {
    name: "list_slack_channels",
    description: "List all Slack channels.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "search_slack",
    description: "Search Slack messages.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "get_today_calendar",
    description: "Fetch today's calendar events.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "create_calendar_event",
    description: "Create a Google Calendar event.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string" },
        description: { type: "string" },
        start: { type: "string" },
        end: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "search_drive",
    description: "Search Google Drive for files by name or content.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" },
        max_results: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "send_eod_report",
    description: "Generate and send today's End of Day (EOD) report. Sends Tony's performance summary to tony@flipiq.com and Ethan's accountability brief to ethan@flipiq.com. Guards against double-sending.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
];

async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "send_slack_message": {
      const result = await postSlackMessage({ channel: String(input.channel), text: String(input.message) });
      return result.ok ? `Message posted to ${input.channel}` : `Slack error: ${result.error}`;
    }
    case "read_slack_channel": {
      const result = await getSlackChannelHistory({ channel: String(input.channel), limit: Math.min(Number(input.limit) || 10, 50) });
      if (!result.ok) return `Slack error: ${result.error}`;
      if (!result.messages?.length) return `No recent messages in ${input.channel}.`;
      return result.messages.map((m, i) => {
        const time = new Date(parseFloat(m.ts) * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `${i + 1}. [${time}] ${m.username || m.user || "user"}: ${m.text}`;
      }).join("\n");
    }
    case "list_slack_channels": {
      const result = await listSlackChannels();
      if (!result.ok) return `Slack error: ${result.error}`;
      return (result.channels || []).map(c => `#${c.name}${c.is_member ? " (joined)" : ""}`).join(", ");
    }
    case "search_slack": {
      const result = await searchSlack(String(input.query));
      if (!result.ok) return `Slack search error: ${result.error}`;
      if (!result.messages?.length) return `No results for "${input.query}".`;
      return result.messages.map((m, i) => `${i + 1}. [#${(m.channel as any)?.name || "?"}] ${m.text}`).join("\n");
    }
    case "create_linear_issue":
    case "create_task": {
      const result = await createLinearIssue({
        title: String(input.title),
        description: String(input.description || ""),
        priority: typeof input.priority === "number" ? input.priority : 3,
      });
      return result.ok ? `Linear issue created: ${result.identifier ?? result.id}` : `Linear issue creation failed`;
    }
    case "send_email": {
      const result = await sendViaAgentMail({ to: String(input.to), subject: String(input.subject), body: String(input.body) });
      return result.ok ? `Email sent to ${input.to}` : `Email send failed`;
    }
    case "compose_email": {
      return JSON.stringify({
        action: "open_compose",
        to: String(input.to),
        subject: String(input.subject),
        body: String(input.body),
        cc: input.cc ? String(input.cc) : undefined,
        threadId: input.threadId ? String(input.threadId) : undefined,
      });
    }
    case "schedule_meeting": {
      const purpose = String(input.purpose || "other").toLowerCase();
      if (purpose !== "sales" && purpose !== "ramy_support") {
        return `SCOPE GATEKEEPER: This meeting doesn't appear to be sales-related or Ramy support. Tony's priority: (1) Sales, (2) Ramy support, (3) everything else pushed back. Suggest scheduling this after sales hours.`;
      }
      const result = await createEvent({
        summary: String(input.summary), start: String(input.start), end: String(input.end),
        attendees: Array.isArray(input.attendees) ? input.attendees.map(String) : undefined,
        description: input.description ? String(input.description) : undefined,
        location: input.location ? String(input.location) : undefined,
      });
      return result.ok ? `Meeting "${input.summary}" created` : `Calendar event creation failed`;
    }
    case "research_contact": {
      try {
        let contact;
        if (input.contactId) {
          [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, String(input.contactId))).limit(1);
        } else if (input.name) {
          [contact] = await db.select().from(contactsTable)
            .where(sql`LOWER(name) LIKE LOWER(${"%" + String(input.name) + "%"})`)
            .limit(1);
        }
        if (!contact) return `No contact found for "${input.name || input.contactId}".`;

        const [intel] = await db.select().from(contactIntelligenceTable)
          .where(eq(contactIntelligenceTable.contactId, contact.id)).limit(1);

        const recentComms = await db.select().from(communicationLogTable)
          .where(eq(communicationLogTable.contactId, contact.id))
          .orderBy(desc(communicationLogTable.loggedAt)).limit(5);

        let result = `CONTACT: ${contact.name}\nCompany: ${contact.company || "N/A"}\nStatus: ${contact.status}\nPhone: ${contact.phone || "N/A"}\nEmail: ${contact.email || "N/A"}\nType: ${contact.type || "N/A"}\nNext Step: ${contact.nextStep || "None"}`;

        if (intel) {
          result += `\n\nINTELLIGENCE:\nAI Score: ${intel.aiScore || "Not scored"}\nStage: ${intel.stage}\nLinkedIn: ${intel.linkedinUrl || "N/A"}\nPersonality: ${intel.personalityNotes || "N/A"}\nTotal Calls: ${intel.totalCalls}\nTotal Emails: ${intel.totalEmailsSent} sent / ${intel.totalEmailsReceived} received\nLast Comm: ${intel.lastCommunicationDate || "Never"} via ${intel.lastCommunicationType || "N/A"}`;
        }

        if (recentComms.length > 0) {
          result += `\n\nRECENT COMMUNICATIONS:`;
          for (const c of recentComms) {
            result += `\n- [${c.channel}] ${c.loggedAt ? new Date(c.loggedAt).toLocaleDateString() : "?"}: ${c.summary || c.subject || "No summary"}`;
          }
        }

        if (input.webSearch) {
          result += `\n\n[WEB_SEARCH_REQUESTED for contactId: ${contact.id}]`;
        }

        return result;
      } catch (err) {
        return `Contact lookup failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    case "update_contact_stage": {
      const VALID_STAGES = ["new", "outreach", "engaged", "meeting_scheduled", "negotiating", "closed", "dormant"];
      const stage = String(input.stage);
      if (!VALID_STAGES.includes(stage)) return `Invalid stage "${stage}". Valid: ${VALID_STAGES.join(", ")}`;
      try {
        await db.update(contactIntelligenceTable)
          .set({ stage, updatedAt: new Date() })
          .where(eq(contactIntelligenceTable.contactId, String(input.contactId)));
        return `Contact stage updated to "${stage}"`;
      } catch { return `Stage update failed — contact_intelligence row may not exist yet.`; }
    }
    case "get_email_brain": {
      const [row] = await db.select().from(systemInstructionsTable).where(eq(systemInstructionsTable.section, "email_brain"));
      return row?.content ? `Email Brain:\n${row.content}` : "No email brain yet.";
    }
    case "list_recent_emails": {
      const emails = await listRecentEmails(Math.min(Number(input.max_results) || 5, 10));
      if (!emails.length) return "No recent unread emails.";
      return emails.map((e, i) => `${i + 1}. From: ${e.from}\n   Subject: ${e.subject}\n   Snippet: ${e.snippet}\n   Date: ${e.date}`).join("\n\n");
    }
    case "draft_gmail_reply": {
      const result = await draftReply({ to: String(input.to), subject: String(input.subject), body: String(input.body), threadId: input.thread_id ? String(input.thread_id) : undefined });
      return result.ok ? `Gmail draft created (id: ${result.draftId}). Tony reviews in Gmail.` : `Draft creation failed: ${result.error}`;
    }
    case "get_today_calendar": {
      const events = await getTodayEvents();
      if (!events.length) return "No events today.";
      return events.map((e, i) => {
        const start = new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const end = new Date(e.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `${i + 1}. ${e.summary} (${start}–${end})${e.location ? ` @ ${e.location}` : ""}`;
      }).join("\n");
    }
    case "create_calendar_event": {
      const result = await createEvent({
        summary: String(input.summary), start: String(input.start), end: String(input.end),
        attendees: Array.isArray(input.attendees) ? input.attendees.map(String) : undefined,
        description: input.description ? String(input.description) : undefined,
      });
      return result.ok ? `Event created: ${input.summary}` : `Event creation failed`;
    }
    case "search_drive": {
      try {
        const drive = getDrive();
        const r = await drive.files.list({
          q: `fullText contains '${String(input.query).replace(/'/g, "\\'")}'`,
          pageSize: Math.min(Number(input.max_results) || 5, 10),
          fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
        });
        const files = r.data.files || [];
        if (!files.length) return `No Drive files found for "${input.query}".`;
        return files.map((f, i) => `${i + 1}. ${f.name} (${f.mimeType})\n   Modified: ${f.modifiedTime}\n   Link: ${f.webViewLink}`).join("\n\n");
      } catch (err) {
        return `Drive search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    case "send_eod_report": {
      const result = await sendAutoEod();
      if (result.alreadySent) return `✓ EOD report already sent today — no duplicate sent.`;
      if (!result.ok) return `✗ EOD report failed to generate.`;
      return `✓ EOD report sent!\n- Calls: ${result.callsMade ?? 0}\n- Demos: ${result.demosBooked ?? 0}\n- Tasks: ${result.tasksCompleted ?? 0}\n\nTony → tony@flipiq.com\nEthan → ethan@flipiq.com`;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

async function buildSystemPrompt(contextType?: string, contextId?: string): Promise<string> {
  const [brainRow] = await db.select().from(systemInstructionsTable).where(eq(systemInstructionsTable.section, "email_brain"));
  const brainSection = brainRow?.content ? `\n\nEMAIL BRAIN:\n${brainRow.content}` : "";

  let contextSection = "";
  if (contextType === "contact" && contextId) {
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contextId)).limit(1);
    if (contact) {
      contextSection = `\n\nCURRENT CONTEXT -- Contact: ${contact.name}\nCompany: ${contact.company || "N/A"}\nStatus: ${contact.status}\nPhone: ${contact.phone || "N/A"}\nEmail: ${contact.email || "N/A"}\nNext Step: ${contact.nextStep || "None"}\n\nYou are helping Tony with this contact. Use research_contact for more details.`;
    }
  } else if (contextType === "email") {
    contextSection = `\n\nCURRENT CONTEXT -- Email. Tony opened chat from an email. Help him reply or take action. Use compose_email to draft (Tony sends via Gmail).`;
  } else if (contextType === "schedule" || contextType === "calendar") {
    contextSection = `\n\nCURRENT CONTEXT -- Schedule. Help with meetings, time blocks, calendar.`;
  } else if (contextType === "task") {
    contextSection = `\n\nCURRENT CONTEXT -- Task. Help Tony work through it or break it down.`;
  }

  return `You are Tony Diaz's Command Center AI -- his personal operating system for FlipIQ.

ABOUT TONY:
- CEO of FlipIQ, real estate wholesale platform
- Has ADHD -- be clear, direct, action-oriented. Keep responses scannable.
- North Star: Every Acquisition Associate closes 2 deals/month
- Revenue: $50K break-even → $100K Phase 1 → $250K Scale
- Priority: (1) Sales calls, (2) Ramy support, (3) everything else

TONY'S RULES:
- "Today, I will follow the plan I wrote when I was clear."
- Morning block = Sales calls ONLY. No distractions.
- Ideas get parked and evaluated against North Star + 90-day plan.

SCOPE GATEKEEPER:
- If Tony drifts into non-sales activities during prime hours, redirect him.
- For compose_email: draft for review, Tony sends via Gmail himself.
- For schedule_meeting: only sales or Ramy support meetings allowed.

BE BRIEF. Tony doesn't like to read. Bullet points, not paragraphs.${brainSection}${contextSection}`;
}

async function autoTitle(threadId: string, firstMessage: string): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      messages: [{ role: "user", content: `Generate a 3-6 word title for this conversation. Title only, no quotes.\n\n"${firstMessage.substring(0, 200)}"` }],
    });
    const titleBlock = response.content.find(b => b.type === "text");
    if (titleBlock?.type === "text" && titleBlock.text) {
      await db.update(chatThreadsTable).set({ title: titleBlock.text.replace(/"/g, "").trim() }).where(eq(chatThreadsTable.id, threadId));
    }
  } catch { /* title is optional */ }
}

router.get("/chat/threads", async (_req, res): Promise<void> => {
  const threads = await db.select().from(chatThreadsTable).orderBy(desc(chatThreadsTable.updatedAt)).limit(50);
  res.json(threads);
});

const CreateThreadBody = z.object({
  contextType: z.enum(["general", "contact", "email", "schedule", "calendar", "task"]).optional().default("general"),
  contextId: z.string().optional(),
  contextLabel: z.string().optional(),
  title: z.string().optional(),
});

router.post("/chat/threads", async (req, res): Promise<void> => {
  const parsed = CreateThreadBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [thread] = await db.insert(chatThreadsTable).values({
    contextType: parsed.data.contextType,
    contextId: parsed.data.contextId || undefined,
    title: parsed.data.title || (parsed.data.contextLabel ? `Re: ${parsed.data.contextLabel}` : undefined),
  }).returning();

  res.json(thread);
});

router.delete("/chat/threads/:threadId", async (req, res): Promise<void> => {
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.threadId, req.params.threadId));
  await db.delete(chatThreadsTable).where(eq(chatThreadsTable.id, req.params.threadId));
  res.json({ ok: true });
});

router.get("/chat/threads/:threadId/messages", async (req, res): Promise<void> => {
  const messages = await db.select().from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, req.params.threadId))
    .orderBy(chatMessagesTable.createdAt);
  res.json(messages);
});

const SendMessageBody = z.object({ content: z.string().min(1) });

router.post("/chat/threads/:threadId/messages", async (req, res): Promise<void> => {
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { threadId } = req.params;
  const { content } = parsed.data;

  const [thread] = await db.select().from(chatThreadsTable).where(eq(chatThreadsTable.id, threadId)).limit(1);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  await db.insert(chatMessagesTable).values({ threadId, role: "user", content });

  const userMessages = await db.select({ id: chatMessagesTable.id }).from(chatMessagesTable)
    .where(and(eq(chatMessagesTable.threadId, threadId), eq(chatMessagesTable.role, "user")));
  if (userMessages.length <= 1 && !thread.title) {
    autoTitle(threadId, content);
  }

  const history = await db.select().from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, threadId))
    .orderBy(chatMessagesTable.createdAt);

  const messages: Parameters<typeof anthropic.messages.create>[0]["messages"] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const systemPrompt = await buildSystemPrompt(thread.contextType || undefined, thread.contextId || undefined);
  let fullResponse = "";
  const toolResults: { name: string; result: string }[] = [];

  try {
    for (let turn = 0; turn < 5; turn++) {
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        tools: TOOLS,
        messages,
      });

      let turnText = "";
      const toolUseBlocks: { id: string; name: string; input: Record<string, unknown> }[] = [];
      let currentToolName = "";
      let currentToolId = "";
      let currentToolInput = "";

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "tool_use") {
            currentToolName = event.content_block.name;
            currentToolId = event.content_block.id;
            currentToolInput = "";
            res.write(`data: ${JSON.stringify({ type: "tool_start", tool: currentToolName })}\n\n`);
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") {
            turnText += event.delta.text;
            res.write(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`);
          } else if (event.delta.type === "input_json_delta") {
            currentToolInput += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop") {
          if (currentToolName && currentToolId) {
            try {
              toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: JSON.parse(currentToolInput || "{}") });
            } catch {
              toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: {} });
            }
            currentToolName = "";
            currentToolId = "";
            currentToolInput = "";
          }
        }
      }

      if (turnText) fullResponse += turnText;
      if (toolUseBlocks.length === 0) break;

      const assistantContent: any[] = [];
      if (turnText) assistantContent.push({ type: "text", text: turnText });
      for (const tb of toolUseBlocks) {
        assistantContent.push({ type: "tool_use", id: tb.id, name: tb.name, input: tb.input });
      }
      messages.push({ role: "assistant", content: assistantContent });

      const toolResultContent: any[] = [];
      for (const tb of toolUseBlocks) {
        const result = await executeTool(tb.name, tb.input);
        toolResults.push({ name: tb.name, result });
        toolResultContent.push({ type: "tool_result", tool_use_id: tb.id, content: result });
        res.write(`data: ${JSON.stringify({ type: "tool_result", tool: tb.name, result: result.substring(0, 200) })}\n\n`);
      }
      messages.push({ role: "user", content: toolResultContent });
    }

    await db.insert(chatMessagesTable).values({
      threadId,
      role: "assistant",
      content: fullResponse,
      toolCalls: toolResults.length > 0 ? toolResults : undefined,
    });

    await db.update(chatThreadsTable).set({ updatedAt: new Date() }).where(eq(chatThreadsTable.id, threadId));

    res.write(`data: ${JSON.stringify({ type: "done", toolResults })}\n\n`);
    res.end();
  } catch (err) {
    console.error("[chat-threads] Error:", err);
    res.write(`data: ${JSON.stringify({ type: "error", error: "Claude API error" })}\n\n`);
    res.end();
  }
});

export default router;
