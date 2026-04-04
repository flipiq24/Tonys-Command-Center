# Prompt 03: Full Threaded Claude Chat with Streaming + Tools

## CONTEXT

v1 has a single-prompt ClaudeModal — one textarea, no history, no streaming. v2 replaces this with a full-screen chat VIEW (not a modal): threaded conversations listed on the left, SSE streaming in the main panel, an agentic tool-execution loop, and contextual opening (from contact, email, calendar, task, or general). "chat" is added to the View type in App.tsx so it behaves like every other top-level view. A "Back" button returns to the previous view.

Contextual openings (e.g., opening chat from a contact card) pre-load context and show a "Start fresh instead" button so Tony can override the context and begin a blank thread.

Ethan (Tony's exec assistant) accesses the AI through Cowork, not through Claude Projects. The Cowork brain matches TCC app instructions.

## PREREQUISITES

- Prompt 00 completed (chatThreadsTable and chatMessagesTable exist in schema + database)
- Prompt 01 completed (email/send route exists)
- Prompt 02 completed (communicationLogTable wired up)
- Existing claude.ts with TOOLS array and executeTool function working
- business_context table exists (North Star, business plan, 90-day plan references)

## WHAT TO BUILD

### Step 1: Backend — Chat threads CRUD + streaming route

**Create NEW file: `artifacts/api-server/src/routes/tcc/chat-threads.ts`**

```typescript
import { Router, type IRouter } from "express";
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, systemInstructionsTable, contactsTable } from "@workspace/db";
import { chatThreadsTable, chatMessagesTable, communicationLogTable, contactIntelligenceTable, contactBriefsTable } from "../../lib/schema-v2";
import { createLinearIssue } from "../../lib/linear";
import { postSlackMessage, getSlackChannelHistory, listSlackChannels, searchSlack } from "../../lib/slack";
import { sendViaAgentMail } from "../../lib/agentmail";
import { listRecentEmails, draftReply } from "../../lib/gmail";
import { getTodayEvents, createEvent } from "../../lib/gcal";
import { getGmail, getDrive } from "../../lib/google-auth";

const router: IRouter = Router();

// ─── Tool definitions (all 17 tools) ──────────────────────────────────────
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
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Email body" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "compose_email",
    description: "Open the EmailCompose view pre-filled with recipient, subject, and body for Tony to review before sending via Gmail. Does NOT auto-send. Returns a compose payload the frontend uses to open EmailCompose.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Email body draft for Tony to review" },
        cc: { type: "string", description: "CC recipients (optional)" },
        threadId: { type: "string", description: "Gmail thread ID for replies (optional)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "schedule_meeting",
    description: "Create a calendar event and optionally invite attendees. SCOPE GATEKEEPER: Only create meetings related to sales calls, prospect meetings, or Ramy support. For all other meeting types, push back and tell Tony to schedule it later.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Event title" },
        start: { type: "string", description: "ISO 8601 start datetime" },
        end: { type: "string", description: "ISO 8601 end datetime" },
        attendees: { type: "array", items: { type: "string" }, description: "Email addresses to invite" },
        description: { type: "string", description: "Event notes" },
        location: { type: "string", description: "Event location" },
        purpose: { type: "string", description: "Why this meeting exists: 'sales', 'ramy_support', or 'other'" },
      },
      required: ["summary", "start", "end", "purpose"],
    },
  },
  {
    name: "research_contact",
    description: "Look up a contact's details, communication history, and intelligence data from the database. Can also trigger a web search for fresh enrichment data.",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Contact name to search for" },
        contactId: { type: "string", description: "Contact UUID if known" },
        webSearch: { type: "boolean", description: "If true, also run web search for enrichment" },
      },
      required: [],
    },
  },
  {
    name: "update_contact_stage",
    description: "Update a contact's sales pipeline stage. Valid stages: new, outreach, engaged, meeting_scheduled, negotiating, closed, dormant.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string", description: "Contact UUID" },
        stage: { type: "string", description: "New stage value" },
      },
      required: ["contactId", "stage"],
    },
  },
  {
    name: "create_task",
    description: "Create a Linear issue as a task for Tony or the team.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task details" },
        priority: { type: "number", description: "1=urgent, 2=high, 3=medium, 4=low" },
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
      properties: { max_results: { type: "number", description: "How many (default 5, max 10)" } },
      required: [],
    },
  },
  {
    name: "draft_gmail_reply",
    description: "Create a Gmail draft reply for Tony to review. Does NOT auto-send.",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" }, subject: { type: "string" }, body: { type: "string" },
        thread_id: { type: "string", description: "Gmail thread ID (optional)" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "read_slack_channel",
    description: "Read recent messages from a Slack channel.",
    input_schema: {
      type: "object" as const,
      properties: {
        channel: { type: "string" }, limit: { type: "number" },
      },
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
        summary: { type: "string" }, description: { type: "string" },
        start: { type: "string" }, end: { type: "string" },
        attendees: { type: "array", items: { type: "string" } },
      },
      required: ["summary", "start", "end"],
    },
  },
  {
    name: "search_drive",
    description: "Search Google Drive for documents, spreadsheets, or folders by name or content.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (file name or content keywords)" },
        max_results: { type: "number", description: "Max results to return (default 5)" },
      },
      required: ["query"],
    },
  },
];

// ─── Tool executor ────────────────────────────────────────────────────────
async function executeTool(name: string, input: Record<string, unknown>): Promise<string> {
  switch (name) {
    case "send_slack_message": {
      const result = await postSlackMessage({ channel: String(input.channel), text: String(input.message) });
      if (result.ok) return `Message posted to ${input.channel}`;
      return `Slack error: ${result.error}`;
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
      return result.messages.map((m, i) => `${i + 1}. [#${m.channel?.name || "?"}] ${m.text}`).join("\n");
    }
    case "create_linear_issue":
    case "create_task": {
      const result = await createLinearIssue({
        title: String(input.title),
        description: String(input.description || ""),
        priority: typeof input.priority === "number" ? input.priority : 3,
      });
      if (result.ok) return `Linear issue created: ${result.identifier ?? result.id}`;
      return `Linear issue creation failed`;
    }
    case "send_email": {
      const result = await sendViaAgentMail({ to: String(input.to), subject: String(input.subject), body: String(input.body) });
      if (result.ok) return `Email sent to ${input.to}`;
      return `Email send failed`;
    }
    case "compose_email": {
      // Return a structured payload the frontend can intercept to open EmailCompose
      // The email is NOT auto-sent — Tony reviews first
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
      // SCOPE GATEKEEPER: Tony's scope = Sales > Ramy support > push everything else back
      const purpose = String(input.purpose || "other").toLowerCase();
      if (purpose !== "sales" && purpose !== "ramy_support") {
        return `SCOPE GATEKEEPER: This meeting doesn't appear to be sales-related or Ramy support. Tony's priority order is: (1) Sales calls, (2) Ramy support, (3) everything else gets pushed back. Suggest Tony schedules this later — focus stays on sales.`;
      }
      const result = await createEvent({
        summary: String(input.summary),
        start: String(input.start),
        end: String(input.end),
        attendees: Array.isArray(input.attendees) ? input.attendees.map(String) : undefined,
        description: input.description ? String(input.description) : undefined,
        location: input.location ? String(input.location) : undefined,
      });
      if (result.ok) return `Meeting "${input.summary}" created (id: ${result.eventId})`;
      return `Calendar event creation failed`;
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
          result += `\n\nINTELLIGENCE:\nAI Score: ${intel.aiScore || "Not scored"}\nStage: ${intel.stage}\nLinkedIn: ${intel.linkedinUrl || "N/A"}\nPersonality: ${intel.personalityNotes || "N/A"}\nTotal Calls: ${intel.totalCalls}\nTotal Emails Sent: ${intel.totalEmailsSent}\nTotal Emails Received: ${intel.totalEmailsReceived}\nLast Comm: ${intel.lastCommunicationDate || "Never"} (${intel.lastCommunicationType || "N/A"})`;
        }

        if (recentComms.length > 0) {
          result += `\n\nRECENT COMMUNICATIONS:`;
          for (const c of recentComms) {
            result += `\n- [${c.channel}] ${c.loggedAt ? new Date(c.loggedAt).toLocaleDateString() : "?"}: ${c.summary || c.subject || "No summary"}`;
          }
        }

        // If webSearch flag set, note it for frontend enrichment trigger
        if (input.webSearch) {
          result += `\n\n[WEB_SEARCH_REQUESTED: Frontend should trigger research endpoint for contactId ${contact.id}]`;
        }

        return result;
      } catch (err) {
        return `Contact lookup failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    case "update_contact_stage": {
      const VALID_STAGES = ["new", "outreach", "engaged", "meeting_scheduled", "negotiating", "closed", "dormant"];
      const stage = String(input.stage);
      if (!VALID_STAGES.includes(stage)) {
        return `Invalid stage "${stage}". Valid stages: ${VALID_STAGES.join(", ")}`;
      }
      try {
        await db.update(contactIntelligenceTable)
          .set({ stage, updatedAt: new Date() })
          .where(eq(contactIntelligenceTable.contactId, String(input.contactId)));
        return `Contact stage updated to "${stage}"`;
      } catch {
        return `Stage update failed — contact_intelligence row may not exist yet.`;
      }
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
      if (result.ok) return `Gmail draft created (id: ${result.draftId}). Tony can review and send from Gmail.`;
      return `Draft creation failed: ${result.error}`;
    }
    case "get_today_calendar": {
      const events = await getTodayEvents();
      if (!events.length) return "No events on calendar today.";
      return events.map((e, i) => {
        const start = new Date(e.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        const end = new Date(e.end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        return `${i + 1}. ${e.summary} (${start} - ${end})${e.location ? ` @ ${e.location}` : ""}`;
      }).join("\n");
    }
    case "create_calendar_event": {
      const result = await createEvent({
        summary: String(input.summary), start: String(input.start), end: String(input.end),
        attendees: Array.isArray(input.attendees) ? input.attendees.map(String) : undefined,
        description: input.description ? String(input.description) : undefined,
      });
      if (result.ok) return `Event created: ${input.summary}`;
      return `Event creation failed`;
    }
    case "search_drive": {
      try {
        const drive = getDrive();
        const res = await drive.files.list({
          q: `fullText contains '${String(input.query).replace(/'/g, "\\'")}'`,
          pageSize: Math.min(Number(input.max_results) || 5, 10),
          fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
        });
        const files = res.data.files || [];
        if (!files.length) return `No Drive files found for "${input.query}".`;
        return files.map((f, i) => `${i + 1}. ${f.name} (${f.mimeType})\n   Modified: ${f.modifiedTime}\n   Link: ${f.webViewLink}`).join("\n\n");
      } catch (err) {
        return `Drive search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── System prompt builder ────────────────────────────────────────────────
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
    contextSection = `\n\nCURRENT CONTEXT -- Email conversation. Tony opened chat from an email. Help him reply, follow up, or take action. Use compose_email to draft a reply (Tony reviews before sending via Gmail).`;
  } else if (contextType === "schedule" || contextType === "calendar") {
    contextSection = `\n\nCURRENT CONTEXT -- Schedule. Tony opened chat from the schedule view. Help with meetings, time blocks, and calendar management.`;
  } else if (contextType === "task") {
    contextSection = `\n\nCURRENT CONTEXT -- Task. Tony opened chat from a task. Help him work through it, break it down, or mark progress.`;
  }

  return `You are Tony Diaz's Command Center AI -- his personal operating system assistant for running FlipIQ.

ABOUT TONY:
- Runs FlipIQ, a real estate wholesale platform
- Has ADHD -- needs clear, direct, action-oriented responses
- North Star: Every Acquisition Associate closes 2 deals/month
- Revenue target: $50K break-even, $100K Phase 1, $250K Scale
- 90-day plan: https://docs.google.com/document/d/1b1Ejf6Tim1gevq0BoMeV7XZ2KuXrgP2E/edit

TONY'S RULES:
- "Today, I will follow the plan I wrote when I was clear."
- Sales calls FIRST. Everything else is secondary.
- Morning block for calls only. No meetings in the morning.

SCOPE GATEKEEPER:
- Tony's priority order: (1) Sales, (2) Ramy support, (3) everything else pushed back
- If Tony drifts into non-sales activities during sales hours, redirect him
- Ideas should be captured but evaluated against North Star + business plan + 90-day plan

YOUR JOB:
- Keep Tony focused on SALES and EXECUTION
- Draft emails for review (Tony sends via Gmail himself)
- Manage calendar, research contacts
- Provide accountability -- redirect if drifting
- Use tools to take real actions when asked
- Be brief and direct -- Tony does NOT like to read

NOTE ON ETHAN:
- Ethan is Tony's exec assistant who accesses AI through Cowork (not Claude Projects)
- Cowork brain matches these TCC app instructions

TOOLS: compose_email, schedule_meeting, research_contact, update_contact_stage, create_task, search_drive, list_recent_emails, draft_gmail_reply, get_today_calendar, create_calendar_event, send_slack_message, read_slack_channel, list_slack_channels, search_slack, create_linear_issue, send_email, get_email_brain${brainSection}${contextSection}`;
}

// ─── Auto-title a thread from the first message ──────────────────────────
async function autoTitle(threadId: string, firstMessage: string): Promise<void> {
  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      messages: [{ role: "user", content: `Generate a 3-6 word title for this conversation. Just the title, nothing else.\n\nUser message: "${firstMessage.substring(0, 200)}"` }],
    });
    const title = response.content.find(b => b.type === "text");
    if (title?.type === "text" && title.text) {
      await db.update(chatThreadsTable).set({ title: title.text.replace(/"/g, "").trim() }).where(eq(chatThreadsTable.id, threadId));
    }
  } catch { /* title is optional */ }
}

// ═══ ROUTES ═══════════════════════════════════════════════════════════════

// List threads (newest first)
router.get("/chat/threads", async (_req, res): Promise<void> => {
  const threads = await db.select().from(chatThreadsTable).orderBy(desc(chatThreadsTable.updatedAt)).limit(50);
  res.json(threads);
});

// Create a new thread
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

// Delete a thread
router.delete("/chat/threads/:threadId", async (req, res): Promise<void> => {
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.threadId, req.params.threadId));
  await db.delete(chatThreadsTable).where(eq(chatThreadsTable.id, req.params.threadId));
  res.json({ ok: true });
});

// Get messages for a thread
router.get("/chat/threads/:threadId/messages", async (req, res): Promise<void> => {
  const messages = await db.select().from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, req.params.threadId))
    .orderBy(chatMessagesTable.createdAt);
  res.json(messages);
});

// POST message with SSE streaming
const SendMessageBody = z.object({
  content: z.string().min(1),
});

router.post("/chat/threads/:threadId/messages", async (req, res): Promise<void> => {
  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { threadId } = req.params;
  const { content } = parsed.data;

  // Get thread for context
  const [thread] = await db.select().from(chatThreadsTable).where(eq(chatThreadsTable.id, threadId)).limit(1);
  if (!thread) { res.status(404).json({ error: "Thread not found" }); return; }

  // Save user message
  await db.insert(chatMessagesTable).values({ threadId, role: "user", content });

  // Auto-title on first message
  const existingMessages = await db.select({ id: chatMessagesTable.id }).from(chatMessagesTable)
    .where(and(eq(chatMessagesTable.threadId, threadId), eq(chatMessagesTable.role, "user")));
  if (existingMessages.length <= 1 && !thread.title) {
    autoTitle(threadId, content);
  }

  // Build conversation history from DB
  const history = await db.select().from(chatMessagesTable)
    .where(eq(chatMessagesTable.threadId, threadId))
    .orderBy(chatMessagesTable.createdAt);

  const messages: Parameters<typeof anthropic.messages.create>[0]["messages"] = history.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Set up SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const systemPrompt = await buildSystemPrompt(thread.contextType || undefined, thread.contextId || undefined);
  let fullResponse = "";
  const toolResults: { name: string; result: string }[] = [];

  try {
    // Agentic loop -- up to 5 tool turns
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
          if (event.content_block.type === "text") {
            // text block starting
          } else if (event.content_block.type === "tool_use") {
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
              const parsedInput = JSON.parse(currentToolInput || "{}");
              toolUseBlocks.push({ id: currentToolId, name: currentToolName, input: parsedInput });
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

      // If no tool calls, we're done
      if (toolUseBlocks.length === 0) break;

      // Execute tools and continue
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
        res.write(`data: ${JSON.stringify({ type: "tool_result", tool: tb.name, result })}\n\n`);
      }
      messages.push({ role: "user", content: toolResultContent });
    }

    // Save assistant message
    await db.insert(chatMessagesTable).values({
      threadId,
      role: "assistant",
      content: fullResponse,
      toolCalls: toolResults.length > 0 ? toolResults : undefined,
    });

    // Update thread timestamp
    await db.update(chatThreadsTable).set({ updatedAt: new Date() }).where(eq(chatThreadsTable.id, threadId));

    res.write(`data: ${JSON.stringify({ type: "done", toolResults })}\n\n`);
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: "Claude API error" })}\n\n`);
    res.end();
  }
});

export default router;
```

### Step 2: Register the new route

**File: `artifacts/api-server/src/routes/index.ts`** -- Add:

```typescript
import chatThreadsRouter from "./tcc/chat-threads";
// ... existing imports ...

// In the router.use section, add:
router.use(chatThreadsRouter);
```

### Step 3: Frontend -- ClaudeChatView component (full-screen view)

**Create NEW file: `artifacts/tcc/src/components/tcc/ClaudeChatView.tsx`**

```typescript
import { useState, useEffect, useRef, useCallback } from "react";
import { get, post } from "@/lib/api";
import { C, F, FS, card, btn1, btn2, inp } from "./constants";

interface Thread {
  id: string;
  title: string | null;
  contextType: string;
  contextId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  toolCalls?: { name: string; result: string }[];
  createdAt: string;
}

// Group labels for thread list
type ThreadGroup = "Today" | "Yesterday" | "This Week" | "Older";

interface Props {
  contextType?: "general" | "contact" | "email" | "schedule" | "calendar" | "task";
  contextId?: string;
  contextLabel?: string;
  onBack: () => void;
}

// Context type icons
const CONTEXT_ICONS: Record<string, string> = {
  contact: "👤",
  email: "✉️",
  calendar: "📅",
  schedule: "📅",
  task: "✅",
  general: "💬",
};

function groupThreads(threads: Thread[]): Record<ThreadGroup, Thread[]> {
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<ThreadGroup, Thread[]> = { Today: [], Yesterday: [], "This Week": [], Older: [] };

  for (const t of threads) {
    const d = new Date(t.updatedAt);
    const dStr = d.toISOString().split("T")[0];
    if (dStr === todayStr) groups.Today.push(t);
    else if (dStr === yesterdayStr) groups.Yesterday.push(t);
    else if (d >= weekAgo) groups["This Week"].push(t);
    else groups.Older.push(t);
  }

  return groups;
}

export function ClaudeChatView({ contextType, contextId, contextLabel, onBack }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [showContextBanner, setShowContextBanner] = useState(!!contextType && contextType !== "general");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load threads
  useEffect(() => {
    get<Thread[]>("/chat/threads").then(setThreads).catch(() => {});
  }, []);

  // Auto-create contextual thread if context is provided
  useEffect(() => {
    if (contextType && contextType !== "general" && contextId && showContextBanner) {
      // Don't auto-create — wait for user to send first message or click "Start fresh"
    }
  }, [contextType, contextId, showContextBanner]);

  // Load messages when thread changes
  useEffect(() => {
    if (!activeThread) { setMessages([]); return; }
    get<Message[]>(`/chat/threads/${activeThread}/messages`).then(setMessages).catch(() => {});
  }, [activeThread]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamText]);

  const startFresh = () => {
    setShowContextBanner(false);
    setActiveThread(null);
    setMessages([]);
  };

  const createThread = useCallback(async (overrideContextType?: string) => {
    const ctxType = overrideContextType || (showContextBanner ? contextType : "general");
    const thread = await post<Thread>("/chat/threads", {
      contextType: ctxType || "general",
      contextId: showContextBanner ? contextId : undefined,
      contextLabel: showContextBanner ? contextLabel : undefined,
      title: showContextBanner && contextLabel ? `Re: ${contextLabel}` : undefined,
    });
    setThreads(prev => [thread, ...prev]);
    setActiveThread(thread.id);
    setMessages([]);
    return thread;
  }, [contextType, contextId, contextLabel, showContextBanner]);

  const deleteThread = useCallback(async (threadId: string) => {
    await fetch(`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/chat/threads/${threadId}`, { method: "DELETE" });
    setThreads(prev => prev.filter(t => t.id !== threadId));
    if (activeThread === threadId) { setActiveThread(null); setMessages([]); }
  }, [activeThread]);

  const sendMessage = useCallback(async () => {
    if (!input.trim() || streaming) return;

    let threadId = activeThread;
    if (!threadId) {
      const thread = await createThread();
      threadId = thread.id;
    }

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input, createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamText("");
    setActiveTools([]);

    try {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const response = await fetch(`${BASE}/api/chat/threads/${threadId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userMsg.content }),
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text") {
                accumulated += data.text;
                setStreamText(accumulated);
              } else if (data.type === "tool_start") {
                setActiveTools(prev => [...prev, data.tool]);
              } else if (data.type === "tool_result") {
                setActiveTools(prev => prev.filter(t => t !== data.tool));
              } else if (data.type === "done") {
                const assistantMsg: Message = {
                  id: (Date.now() + 1).toString(),
                  role: "assistant",
                  content: accumulated,
                  toolCalls: data.toolResults?.length ? data.toolResults : undefined,
                  createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, assistantMsg]);
                setStreamText("");
                get<Thread[]>("/chat/threads").then(setThreads).catch(() => {});
              }
            } catch { /* skip malformed SSE lines */ }
          }
        }
      }
    } catch {
      setStreamText("Connection error -- please try again.");
    }

    setStreaming(false);
  }, [input, streaming, activeThread, createThread]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const grouped = groupThreads(threads);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", display: "flex", gap: 16, height: "calc(100vh - 80px)" }}>

      {/* Left panel -- Thread list grouped by date */}
      <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ fontFamily: FS, fontSize: 17, margin: 0 }}>Conversations</h3>
          <button onClick={() => createThread("general")} style={{ ...btn2, padding: "5px 12px", fontSize: 11 }}>+ New</button>
        </div>

        <div style={{ flex: 1, overflow: "auto" }}>
          {(["Today", "Yesterday", "This Week", "Older"] as ThreadGroup[]).map(group => {
            const items = grouped[group];
            if (items.length === 0) return null;
            return (
              <div key={group}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.mut, padding: "8px 4px 4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{group}</div>
                {items.map(t => (
                  <div
                    key={t.id}
                    onClick={() => { setActiveThread(t.id); setShowContextBanner(false); }}
                    style={{
                      padding: "10px 12px", borderRadius: 10, marginBottom: 4, cursor: "pointer",
                      background: activeThread === t.id ? C.bluBg : "transparent",
                      border: activeThread === t.id ? `1px solid ${C.blu}` : "1px solid transparent",
                      display: "flex", gap: 8, alignItems: "flex-start",
                    }}
                  >
                    <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{CONTEXT_ICONS[t.contextType] || CONTEXT_ICONS.general}</span>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.title || "New conversation"}
                      </div>
                      <div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>
                        {new Date(t.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteThread(t.id); }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.mut, opacity: 0.5, padding: "2px 4px" }}
                    >x</button>
                  </div>
                ))}
              </div>
            );
          })}

          {threads.length === 0 && (
            <div style={{ fontSize: 12, color: C.mut, textAlign: "center", padding: 20 }}>
              No conversations yet. Click "+ New" to start.
            </div>
          )}
        </div>

        <button onClick={onBack} style={{ ...btn2, width: "100%", fontSize: 11, color: C.mut }}>
          &larr; Back
        </button>
      </div>

      {/* Right panel -- Conversation */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", ...card }}>

        {/* Context banner with "Start fresh instead" */}
        {showContextBanner && contextType && contextType !== "general" && !activeThread && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: C.bluBg, borderRadius: 10, marginBottom: 12, fontSize: 13 }}>
            <span>
              <span style={{ fontWeight: 700 }}>{CONTEXT_ICONS[contextType] || ""} Context:</span>{" "}
              {contextLabel || contextType}
            </span>
            <button onClick={startFresh} style={{ ...btn2, padding: "4px 12px", fontSize: 11 }}>
              Start fresh instead
            </button>
          </div>
        )}

        {/* Messages area */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 4px", marginBottom: 12 }}>
          {!activeThread && !showContextBanner && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: C.mut, fontSize: 14 }}>
              Select a conversation or start a new one
            </div>
          )}

          {messages.map(m => (
            <div key={m.id} style={{ marginBottom: 16, display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "80%", padding: "10px 14px", borderRadius: 14,
                background: m.role === "user" ? C.tx : "#F5F5F3",
                color: m.role === "user" ? "#fff" : C.tx,
                fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap",
              }}>
                {m.content}
              </div>
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div style={{ fontSize: 10, color: C.mut, marginTop: 4, maxWidth: "80%" }}>
                  Tools used: {m.toolCalls.map(tc => tc.name).join(", ")}
                </div>
              )}
              <div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>
                {new Date(m.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </div>
            </div>
          ))}

          {/* Streaming response */}
          {streaming && (
            <div style={{ marginBottom: 16 }}>
              {activeTools.length > 0 && (
                <div style={{ fontSize: 11, color: C.blu, marginBottom: 6, padding: "6px 12px", background: C.bluBg, borderRadius: 8, display: "inline-block" }}>
                  Running: {activeTools.join(", ")}...
                </div>
              )}
              {streamText && (
                <div style={{ maxWidth: "80%", padding: "10px 14px", borderRadius: 14, background: "#F5F5F3", fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                  {streamText}
                  <span style={{ animation: "blink 1s infinite", opacity: 0.5 }}>|</span>
                </div>
              )}
              {!streamText && activeTools.length === 0 && (
                <div style={{ padding: "10px 14px", fontSize: 13, color: C.mut }}>Thinking...</div>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeThread ? "Message Tony's AI..." : "Start typing to create a new conversation..."}
            style={{ ...inp, flex: 1, minHeight: 44, maxHeight: 120, resize: "none", fontSize: 14 }}
          />

          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            style={{ ...btn1, padding: "10px 18px", opacity: streaming || !input.trim() ? 0.4 : 1 }}
          >
            {streaming ? "..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Update App.tsx -- Add "chat" as a full-screen view

**File: `artifacts/tcc/src/App.tsx`**

**4a.** Add the import at the top:
```typescript
import { ClaudeChatView } from "@/components/tcc/ClaudeChatView";
```

**4b.** Update the View type to include "chat":
```typescript
type View = "checkin" | "journal" | "emails" | "schedule" | "sales" | "tasks" | "chat";
```

**4c.** Add "chat" to the VALID_VIEWS array inside the mount `useEffect` (around line 121):
```typescript
const VALID_VIEWS: View[] = ["emails", "schedule", "sales", "tasks", "chat"];
```

**4d.** Add state for contextual chat opening:
```typescript
const [chatContext, setChatContext] = useState<{ type: string; id: string; label: string } | null>(null);
```

**4e.** Add a handler for opening chat with context:
```typescript
const openChatWithContext = (contextType: string, contextId: string, contextLabel: string) => {
  setChatContext({ type: contextType, id: contextId, label: contextLabel });
  persistView("chat");
};
```

**4f.** Add the chat view rendering block. Find the `// SALES VIEW` section. BEFORE the `// TASKS VIEW` block, add:

```typescript
  // ═══ CHAT VIEW (full-screen, NOT a modal) ═══
  if (view === "chat") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {sharedModals}
      <ClaudeChatView
        contextType={chatContext?.type as any}
        contextId={chatContext?.id}
        contextLabel={chatContext?.label}
        onBack={() => {
          setChatContext(null);
          persistView("schedule");
        }}
      />
    </div>
  );
```

**4g.** Update the Header `onShowChat` to navigate to the chat view:
```typescript
onShowChat={() => {
  setChatContext(null); // no context = general chat
  persistView("chat");
}}
```

**4h.** Pass `openChatWithContext` as `onOpenChat` to SalesMorning, TaskView, and any other component that needs contextual chat:
```typescript
onOpenChat={openChatWithContext}
```

### Step 5: Update Header to highlight active chat view

**File: `artifacts/tcc/src/components/tcc/Header.tsx`**

Add a new prop `activeView` to the Props interface:
```typescript
interface Props {
  // ... existing props ...
  activeView?: string;
}
```

Accept it in the function signature. Then update the chat button style to show active state when `activeView === "chat"`:

```typescript
<button onClick={onShowChat} style={{
  ...btn2, padding: "5px 10px", fontSize: 11,
  background: activeView === "chat" ? C.bluBg : "transparent",
  color: activeView === "chat" ? C.blu : C.tx,
  borderColor: activeView === "chat" ? C.blu : C.brd,
}}>
  Chat
</button>
```

In App.tsx, pass activeView to the Header:
```typescript
<Header activeView={view} ... />
```

### Step 6: Keep the original ClaudeModal file

**DO NOT DELETE** `artifacts/tcc/src/components/tcc/ClaudeModal.tsx`. The new `ClaudeChatView.tsx` replaces it as the primary interface, but ClaudeModal can remain as a legacy fallback.

## VERIFY BEFORE MOVING ON

1. `GET /api/chat/threads` returns JSON array of threads
2. Navigate to Chat view from the header -- full-screen view renders (NOT a modal)
3. Thread list on the left shows groupings: Today, Yesterday, This Week, Older
4. Each thread shows a context-type icon (contact, email, calendar, task, general)
5. Click "+ New" -- creates a new thread, becomes active
6. Type a message and hit Enter -- SSE streaming shows tokens appearing in real time
7. Tool calls display "Running: tool_name..." badge during execution
8. After response completes, message appears in thread with "Tools used:" footer
9. Open chat from a contact card -- context banner shows "Context: Contact Name" with "Start fresh instead" button
10. Click "Start fresh instead" -- context clears, blank thread starts
11. schedule_meeting tool with `purpose: "other"` -- returns scope gatekeeper message pushing back
12. compose_email tool -- returns structured payload (does NOT auto-send email)
13. update_contact_stage with valid stages (new/outreach/engaged/meeting_scheduled/negotiating/closed/dormant) -- succeeds
14. "Back" button returns to previous view
15. Thread auto-titles after first message
16. All existing views (emails, schedule, sales, tasks) still work
