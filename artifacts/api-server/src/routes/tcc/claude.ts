import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { ClaudePromptBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, systemInstructionsTable, meetingHistoryTable, contactsTable } from "@workspace/db";
import { businessContextTable, chatThreadsTable, chatMessagesTable, contactIntelligenceTable, contactBriefsTable } from "../../lib/schema-v2";
import { createLinearIssue } from "../../lib/linear";
import { sendAutoEod } from "./eod";
import { postSlackMessage, getSlackChannelHistory, listSlackChannels, searchSlack } from "../../lib/slack";
import { sendEmail, listRecentEmails, draftReply } from "../../lib/gmail";
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
    description: "Send an email on Tony's behalf via Gmail from tony@flipiq.com. Use for follow-ups, EOD reports, or outreach.",
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
    description: "Create a new event on Tony's Google Calendar. SCOPE GATEKEEPER: Only create events for sales calls, prospect meetings, or Ramy support. Warn if purpose is unclear.",
    input_schema: {
      type: "object" as const,
      properties: {
        summary: { type: "string", description: "Event title" },
        description: { type: "string", description: "Event notes or agenda" },
        start: { type: "string", description: "ISO 8601 datetime string, e.g. 2026-04-04T10:00:00-07:00" },
        end: { type: "string", description: "ISO 8601 datetime string, e.g. 2026-04-04T11:00:00-07:00" },
        attendees: { type: "array", items: { type: "string" }, description: "List of attendee email addresses" },
        purpose: { type: "string", description: "Purpose: 'sales', 'ramy_support', or 'other'" },
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
  {
    name: "send_eod_report",
    description: "Generate and send today's End of Day (EOD) report. Sends Tony's performance summary to tony@flipiq.com and Ethan's accountability brief to ethan@flipiq.com. Will not double-send if already sent today.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "create_task",
    description: "Create a new task (Linear issue) for Tony's team. Use for actionable items that need tracking.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Short, clear task title" },
        description: { type: "string", description: "Full description of the task" },
        priority: { type: "number", description: "Priority: 1=urgent, 2=high, 3=medium, 4=low" },
      },
      required: ["title"],
    },
  },
  {
    name: "get_contact_brief",
    description: "Get a quick AI-generated brief on a contact: history, pipeline stage, AI score, last communication. Use before a sales call.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string", description: "Name of the contact to look up" },
        contact_id: { type: "string", description: "UUID of the contact (optional, more precise)" },
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
        contact_id: { type: "string", description: "UUID of the contact" },
        stage: { type: "string", description: "New stage: new, outreach, engaged, meeting_scheduled, negotiating, closed, dormant" },
      },
      required: ["contact_id", "stage"],
    },
  },
  {
    name: "search_contacts",
    description: "Search Tony's contact database by name, company, or type. Use to find prospects or look up contact details.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query (name, company, or type)" },
        limit: { type: "number", description: "Max results to return (default 5, max 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "schedule_meeting",
    description: "Schedule a sales meeting or call on Tony's Google Calendar. SCOPE GATEKEEPER: Only for sales calls, prospect meetings, or Ramy support. Morning Protection: no external meetings before noon PT.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactName: { type: "string", description: "Name of the contact to meet with" },
        contactEmail: { type: "string", description: "Email address of the contact (for calendar invite)" },
        purpose: { type: "string", description: "Purpose: 'sales', 'ramy_support', or 'other'" },
        duration: { type: "number", description: "Duration in minutes (default 30)" },
        preferredDate: { type: "string", description: "ISO 8601 datetime string, e.g. 2026-04-04T14:00:00-07:00" },
      },
      required: ["contactName", "preferredDate"],
    },
  },
  {
    name: "research_contact",
    description: "Deep-research a contact: AI score, stage, personality notes, last 5 interactions from communication log. Use before a sales call to prepare.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactName: { type: "string", description: "Name of the contact to research" },
        contactId: { type: "string", description: "UUID of the contact (optional, more precise)" },
      },
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

    case "create_linear_issue":
    case "create_task": {
      const result = await createLinearIssue({
        title: String(input.title),
        description: String(input.description || ""),
        priority: typeof input.priority === "number" ? input.priority : 3,
      });
      if (result.ok) return `✓ Task created: ${result.identifier ?? result.id}`;
      return `✗ Task creation failed (Linear connection may not be set up yet)`;
    }

    case "send_email": {
      const result = await sendEmail({
        to: String(input.to),
        subject: String(input.subject),
        body: String(input.body),
      });
      if (result.ok) return `✓ Email sent to ${input.to} via Gmail (messageId: ${result.messageId})`;
      return `✗ Email send failed: ${result.error || "unknown error"}`;
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
      // Scope gatekeeper: warn when a non-sales/non-Ramy event is being created
      const purpose = input.purpose ? String(input.purpose).toLowerCase() : "";
      const summaryLower = String(input.summary || "").toLowerCase();
      const isSalesRelated = purpose === "sales" || purpose === "ramy_support"
        || summaryLower.includes("sales") || summaryLower.includes("prospect")
        || summaryLower.includes("call") || summaryLower.includes("demo")
        || summaryLower.includes("ramy") || summaryLower.includes("follow up");

      if (!isSalesRelated && purpose !== "sales" && purpose !== "ramy_support") {
        return `⚠️ SCOPE GATEKEEPER: This event ("${input.summary}") doesn't appear to be sales-related or Ramy support. Tony's priority: (1) Sales calls, (2) Ramy support, (3) everything else pushed to off-hours. Confirm this is necessary or reschedule outside prime selling hours (9AM–5PM PT).`;
      }

      // Morning Protection: block external meetings before noon
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
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{ role: "user", content: prompt }],
      });
      const analysisText = analysisResponse.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("");
      return `📋 TRANSCRIPT ANALYSIS\n\n${analysisText}`;
    }

    case "send_eod_report": {
      const result = await sendAutoEod();
      if (result.alreadySent) return `✓ EOD report already sent today — no duplicate sent.`;
      if (!result.ok) return `✗ EOD report failed to generate.`;
      return `✓ EOD report sent!\n- Calls: ${result.callsMade ?? 0}\n- Demos: ${result.demosBooked ?? 0}\n- Tasks completed: ${result.tasksCompleted ?? 0}\n\nTony's summary → tony@flipiq.com\nEthan's accountability brief → ethan@flipiq.com`;
    }

    case "get_contact_brief": {
      try {
        let contact;
        if (input.contact_id) {
          [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, String(input.contact_id))).limit(1);
        } else if (input.contact_name) {
          [contact] = await db.select().from(contactsTable)
            .where(ilike(contactsTable.name, `%${String(input.contact_name)}%`))
            .limit(1);
        }
        if (!contact) return `No contact found for "${input.contact_name || input.contact_id}".`;

        const [intel] = await db.select().from(contactIntelligenceTable)
          .where(eq(contactIntelligenceTable.contactId, contact.id)).limit(1);

        const [brief] = await db.select().from(contactBriefsTable)
          .where(eq(contactBriefsTable.contactId, contact.id))
          .orderBy(desc(contactBriefsTable.generatedAt))
          .limit(1);

        let result = `CONTACT: ${contact.name}\nCompany: ${contact.company || "N/A"}\nStatus: ${contact.status}\nPhone: ${contact.phone || "N/A"}\nEmail: ${contact.email || "N/A"}\nType: ${contact.type || "N/A"}\nNext Step: ${contact.nextStep || "None"}`;

        if (intel) {
          result += `\n\nINTELLIGENCE:\nAI Score: ${intel.aiScore || "Not scored"}\nStage: ${intel.stage}\nTotal Calls: ${intel.totalCalls}\nTotal Emails: ${intel.totalEmailsSent} sent / ${intel.totalEmailsReceived} received\nLast Comm: ${intel.lastCommunicationDate || "Never"} via ${intel.lastCommunicationType || "N/A"}`;
          if (intel.personalityNotes) result += `\nPersonality: ${intel.personalityNotes}`;
          if (intel.nextAction) result += `\nNext Action: ${intel.nextAction} (${intel.nextActionDate || "no date"})`;
        }

        if (brief?.briefText) {
          result += `\n\nAI BRIEF:\n${brief.briefText.slice(0, 500)}`;
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
        const [existing] = await db.select().from(contactIntelligenceTable)
          .where(eq(contactIntelligenceTable.contactId, String(input.contact_id))).limit(1);
        if (existing) {
          await db.update(contactIntelligenceTable)
            .set({ stage, updatedAt: new Date() })
            .where(eq(contactIntelligenceTable.contactId, String(input.contact_id)));
        } else {
          await db.insert(contactIntelligenceTable).values({ contactId: String(input.contact_id), stage });
        }
        return `✓ Contact stage updated to "${stage}"`;
      } catch (err) {
        return `Stage update failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "search_contacts": {
      try {
        const query = String(input.query);
        const limit = typeof input.limit === "number" ? Math.min(input.limit, 20) : 5;
        const contacts = await db.select().from(contactsTable)
          .where(
            or(
              ilike(contactsTable.name, `%${query}%`),
              ilike(contactsTable.company, `%${query}%`),
              ilike(contactsTable.type, `%${query}%`),
            )
          )
          .limit(limit);

        if (contacts.length === 0) return `No contacts found for "${query}".`;
        return contacts.map((c, i) =>
          `${i + 1}. ${c.name}${c.company ? ` (${c.company})` : ""}\n   Status: ${c.status} | Type: ${c.type || "N/A"} | Phone: ${c.phone || "N/A"} | Stage: ${c.pipelineStage || "Lead"}`
        ).join("\n\n");
      } catch (err) {
        return `Contact search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "schedule_meeting": {
      const contactName = String(input.contactName || "");
      const purpose = String(input.purpose || "sales").toLowerCase();
      const preferredDate = String(input.preferredDate);
      const duration = typeof input.duration === "number" ? input.duration : 30;
      const contactEmail = input.contactEmail ? String(input.contactEmail) : undefined;

      // Scope gatekeeper
      const isSalesRelated = purpose === "sales" || purpose === "ramy_support"
        || contactName.toLowerCase().includes("ramy");
      if (!isSalesRelated) {
        return `⚠️ SCOPE GATEKEEPER: This meeting doesn't appear to be sales-related or Ramy support. Tony's priority: (1) Sales calls, (2) Ramy support, (3) everything else pushed to off-hours. Confirm this is a sales conversation or Ramy coordination.`;
      }

      // Morning protection
      const startDate = new Date(preferredDate);
      const pacificStart = new Date(startDate.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
      const startHour = pacificStart.getHours();
      if (startHour < 12 && contactEmail) {
        return `⛔ Morning Protection: Tony's morning (before noon PT) is reserved for outbound calls only. No external meetings before noon. Please schedule this for 12 PM or later.`;
      }

      // Calculate end time
      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      const result = await createEvent({
        summary: `Sales Call — ${contactName}`,
        description: `Purpose: ${purpose}. Scheduled via TCC AI.`,
        start: preferredDate,
        end: endDate.toISOString(),
        attendees: contactEmail ? [contactEmail] : undefined,
      });
      if (result.ok) return `✓ Meeting scheduled with ${contactName} for ${new Date(preferredDate).toLocaleString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit", weekday: "short", month: "short", day: "numeric" })} (${duration} min). Event ID: ${result.eventId}`;
      if (result.error?.includes("not connected")) return `⚠️ Google Calendar not yet authorized`;
      return `✗ Failed to schedule meeting: ${result.error}`;
    }

    case "research_contact": {
      try {
        const { communicationLogTable: commLog } = await import("../../lib/schema-v2.js");
        let contact;
        if (input.contactId) {
          [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, String(input.contactId))).limit(1);
        } else if (input.contactName) {
          [contact] = await db.select().from(contactsTable)
            .where(ilike(contactsTable.name, `%${String(input.contactName)}%`)).limit(1);
        }
        if (!contact) return `No contact found for "${input.contactName || input.contactId}".`;

        const [intel] = await db.select().from(contactIntelligenceTable)
          .where(eq(contactIntelligenceTable.contactId, contact.id)).limit(1);

        // Last 5 interactions from communication_log
        const recentComms = await db.select().from(commLog)
          .where(eq(commLog.contactId, contact.id))
          .orderBy(desc(commLog.loggedAt))
          .limit(5);

        const totalComms = await db.select({ count: sql<number>`count(*)` }).from(commLog)
          .where(eq(commLog.contactId, contact.id));
        const total = Number(totalComms[0]?.count ?? 0);

        let result = `🔍 CONTACT RESEARCH: ${contact.name}\n`;
        result += `Company: ${contact.company || "N/A"} | Type: ${contact.type || "N/A"}\n`;
        result += `Status: ${contact.status} | Phone: ${contact.phone || "N/A"} | Email: ${contact.email || "N/A"}\n`;
        result += `Next Step: ${contact.nextStep || "None"}\n`;

        if (intel) {
          result += `\n📊 INTELLIGENCE\n`;
          result += `AI Score: ${intel.aiScore || "Not scored"} | Stage: ${intel.stage}\n`;
          result += `Total Interactions: ${total} | Last Comm: ${intel.lastCommunicationDate || "Never"} via ${intel.lastCommunicationType || "N/A"}\n`;
          if (intel.personalityNotes) result += `Personality: ${intel.personalityNotes}\n`;
          if (intel.nextAction) result += `Next Action: ${intel.nextAction}${intel.nextActionDate ? ` by ${intel.nextActionDate}` : ""}\n`;
        }

        if (recentComms.length > 0) {
          result += `\n📝 LAST ${recentComms.length} INTERACTIONS\n`;
          recentComms.forEach((c, i) => {
            const date = c.loggedAt ? new Date(c.loggedAt).toLocaleDateString("en-US") : "unknown date";
            result += `${i + 1}. [${date}] ${c.channel}: ${c.summary || c.subject || "(no summary)"}\n`;
          });
        }

        return result;
      } catch (err) {
        return `Research failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Build system prompt ──────────────────────────────────────────────────────
async function buildSystemPrompt(): Promise<string> {
  const [brainRow, businessPlanRow, plan90Row] = await Promise.all([
    db.select().from(systemInstructionsTable).where(eq(systemInstructionsTable.section, "email_brain")).then(r => r[0]),
    db.select().from(businessContextTable).where(eq(businessContextTable.documentType, "business_plan")).then(r => r[0]),
    db.select().from(businessContextTable).where(eq(businessContextTable.documentType, "90_day_plan")).then(r => r[0]),
  ]);

  const brainSection = brainRow?.content
    ? `\n\nEMAIL BRAIN (Tony's learned email priorities):\n${brainRow.content}`
    : "";

  const businessPlanSection = businessPlanRow?.summary
    ? `\n\nBUSINESS PLAN SUMMARY:\n${businessPlanRow.summary}`
    : "";

  const plan90Section = plan90Row?.summary
    ? `\n\n90-DAY PLAN SUMMARY:\n${plan90Row.summary}`
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

SCOPE GATEKEEPER:
- If Tony asks to create a calendar event, check if it's sales-related or Ramy support. If not, warn him and suggest he reconsider.
- Keep Tony focused on his North Star. Redirect if he's drifting.

YOUR JOB:
- Keep Tony focused on SALES and EXECUTION
- Draft emails, suggest replies, check and summarize calendar
- Provide accountability — redirect Tony if he's drifting
- Use your tools to take real actions when asked
- Be brief and direct — Tony does NOT like to read

TOOLS AVAILABLE:
- list_recent_emails: Read Tony's unread Gmail inbox
- draft_gmail_reply: Create a Gmail draft Tony can review and send
- send_email: Send emails via Gmail from tony@flipiq.com
- get_today_calendar: See what's on Tony's Google Calendar today
- create_calendar_event: Schedule a meeting (scope gatekeeper active)
- send_slack_message: Post to any Slack channel
- read_slack_channel: Read recent messages from a Slack channel
- list_slack_channels: List all channels in Tony's Slack workspace
- search_slack: Search across all Slack messages
- create_linear_issue: Create tech tasks in Linear
- create_task: Create a new task for tracking
- get_email_brain: Check Tony's learned email priority rules
- get_meeting_history: Look up past meeting notes for a contact before a follow-up call
- log_meeting_context: Save meeting notes, next steps, and outcome after a call or meeting
- analyze_transcript: Analyze a call/meeting transcript to extract action items, decisions, and follow-ups
- get_contact_brief: Quick summary of a contact's stage, score, and history
- update_contact_stage: Move a contact through the sales pipeline
- search_contacts: Search Tony's contact database by name, company, or type

SCRIPTURE ANCHORS:
- "Seek first the kingdom of God" — Matthew 6:33
- "Commit your work to the Lord" — Proverbs 16:3${brainSection}${businessPlanSection}${plan90Section}`;
}

const router: IRouter = Router();

router.post("/claude", async (req, res): Promise<void> => {
  const parsed = ClaudePromptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, context } = parsed.data;

  // Support optional threadId for chat persistence
  const threadId = typeof req.body.threadId === "string" ? req.body.threadId : null;

  let activeThreadId = threadId;

  // If no threadId provided, create a new thread
  if (!activeThreadId) {
    const [newThread] = await db.insert(chatThreadsTable).values({
      contextType: "general",
    }).returning();
    activeThreadId = newThread.id;

    // Auto-title the new thread from the first message using Haiku
    anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      messages: [{ role: "user", content: `Generate a 3-6 word title for this conversation. Title only, no quotes.\n\n"${prompt.substring(0, 200)}"` }],
    }).then(r => {
      const titleBlock = r.content.find(b => b.type === "text");
      if (titleBlock?.type === "text" && titleBlock.text) {
        db.update(chatThreadsTable)
          .set({ title: titleBlock.text.replace(/"/g, "").trim() })
          .where(eq(chatThreadsTable.id, activeThreadId!))
          .catch(() => {});
      }
    }).catch(() => {});
  }

  // Persist user message
  await db.insert(chatMessagesTable).values({
    threadId: activeThreadId,
    role: "user",
    content: prompt,
  });

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

    // Persist assistant response
    if (finalText) {
      await db.insert(chatMessagesTable).values({
        threadId: activeThreadId,
        role: "assistant",
        content: finalText,
        toolCalls: toolResults.length > 0 ? toolResults : undefined,
      });

      // Update thread's updatedAt
      await db.update(chatThreadsTable)
        .set({ updatedAt: new Date() })
        .where(eq(chatThreadsTable.id, activeThreadId));
    }

    res.json({ text: finalText, ok: true, toolResults, threadId: activeThreadId });
  } catch (err) {
    req.log.error({ err }, "Claude API error");
    res.status(500).json({ error: "Claude API error", ok: false, text: "" });
  }
});

export default router;
