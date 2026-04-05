import { Router, type IRouter } from "express";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { ClaudePromptBody } from "@workspace/api-zod";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { db, systemInstructionsTable, meetingHistoryTable, contactsTable, checkinsTable } from "@workspace/db";
import { businessContextTable, chatThreadsTable, chatMessagesTable, contactIntelligenceTable, contactBriefsTable, communicationLogTable } from "../../lib/schema-v2";
import { createLinearIssue, getLinearIssues } from "../../lib/linear";
import { sendAutoEod } from "./eod";
import { postSlackMessage, getSlackChannelHistory, listSlackChannels, searchSlack } from "../../lib/slack";
import { sendEmail, listRecentEmails, draftReply } from "../../lib/gmail";
import { getTodayEvents, createEvent } from "../../lib/gcal";
import { getDrive, getGmail, getCalendar } from "../../lib/google-auth";
import { getSheetValues } from "../../lib/google-sheets";
import { getDocText } from "../../lib/google-docs";

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
  {
    name: "web_search",
    description: "Search the internet. Use for company research, news, market data, or anything not in the app database.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "browse_url",
    description: "Fetch and read the text content of any webpage URL. Use to read articles, company websites, or any link Tony mentions.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "Full URL to fetch, including https://" },
      },
      required: ["url"],
    },
  },
  {
    name: "query_database",
    description: "Run a read-only SQL SELECT query on Tony's PostgreSQL database. Gives full access to all tables: contacts, communication_log, contact_intelligence, business_context, meeting_history, tcc_checkins, journals, chat_messages, etc. Only SELECT is allowed.",
    input_schema: {
      type: "object" as const,
      properties: {
        sql: { type: "string", description: "A valid SQL SELECT statement" },
      },
      required: ["sql"],
    },
  },
  {
    name: "read_google_sheet",
    description: "Read rows from a Google Sheet. Use to pull data Tony has stored in spreadsheets.",
    input_schema: {
      type: "object" as const,
      properties: {
        sheet_id: { type: "string", description: "The Google Sheet ID (from the URL)" },
        tab_name: { type: "string", description: "The tab/sheet name, e.g. 'Sheet1' or 'Contacts'" },
        range: { type: "string", description: "Optional A1 range, e.g. 'A1:Z100'. Defaults to entire tab." },
      },
      required: ["sheet_id", "tab_name"],
    },
  },
  {
    name: "read_google_doc",
    description: "Read the full text content of a Google Doc by its document ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        doc_id: { type: "string", description: "The Google Doc ID (from the URL)" },
      },
      required: ["doc_id"],
    },
  },
  {
    name: "search_google_drive",
    description: "Search Google Drive for files by name or content. Returns file names, types, IDs, and last modified dates.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Drive search query, e.g. 'proposal', 'contract 2026', 'FlipIQ'" },
        limit: { type: "number", description: "Max results (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_business_context",
    description: "Fetch all stored business context: business plan, 90-day plan, and any other documents in the business_context table.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_all_tasks",
    description: "Fetch all open Linear tasks/issues with status, priority, assignee, and due dates.",
    input_schema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "get_communication_log",
    description: "Fetch recent entries from Tony's communication log (emails, calls, texts logged). Optionally filter by contact name or channel.",
    input_schema: {
      type: "object" as const,
      properties: {
        contact_name: { type: "string", description: "Filter by contact name (optional)" },
        channel: { type: "string", description: "Filter by channel: email, call, sms, slack (optional)" },
        limit: { type: "number", description: "Max results to return (default 20)" },
      },
      required: [],
    },
  },
  {
    name: "get_daily_checkin_history",
    description: "Fetch Tony's recent daily check-in history: sleep hours, Bible reading, bedtime, exercise, mood, and top priorities.",
    input_schema: {
      type: "object" as const,
      properties: {
        days: { type: "number", description: "Number of recent check-ins to fetch (default 7)" },
      },
      required: [],
    },
  },
  {
    name: "read_email_thread",
    description: "Read a full Gmail email thread by thread ID. Returns all messages in the thread with from, to, date, subject, and body.",
    input_schema: {
      type: "object" as const,
      properties: {
        thread_id: { type: "string", description: "Gmail thread ID" },
      },
      required: ["thread_id"],
    },
  },
  {
    name: "search_emails",
    description: "Search Tony's Gmail with any query (same format as Gmail search bar). Returns from, subject, date, snippet for each match. Examples: 'from:john subject:proposal', 'newer_than:3d FlipIQ', 'Fernando'.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Gmail search query" },
        limit: { type: "number", description: "Max results to return (default 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "read_email_message",
    description: "Read a single Gmail message by message ID. Returns full from, to, cc, date, subject, and body text.",
    input_schema: {
      type: "object" as const,
      properties: {
        message_id: { type: "string", description: "Gmail message ID" },
      },
      required: ["message_id"],
    },
  },
  {
    name: "get_calendar_range",
    description: "Fetch Google Calendar events for any date range. Use to see Tony's schedule for a specific week, day, or period.",
    input_schema: {
      type: "object" as const,
      properties: {
        start_date: { type: "string", description: "Start date as ISO string, e.g. '2026-04-07' or '2026-04-07T00:00:00-07:00'" },
        end_date: { type: "string", description: "End date as ISO string, e.g. '2026-04-11' or '2026-04-11T23:59:59-07:00'" },
      },
      required: ["start_date", "end_date"],
    },
  },
  {
    name: "create_calendar_reminder",
    description: "Create a quick personal calendar reminder for Tony (no attendees, no scope gatekeeper). Use for personal reminders like 'call Fernando back at 3pm' or 'pick up prescription'.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: { type: "string", description: "Reminder title" },
        datetime: { type: "string", description: "ISO 8601 datetime string, e.g. 2026-04-05T15:00:00-07:00" },
        notes: { type: "string", description: "Optional notes for the reminder" },
      },
      required: ["title", "datetime"],
    },
  },
  {
    name: "update_calendar_event",
    description: "Update an existing Google Calendar event. Can change title, description, start/end time, location, or attendees.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: { type: "string", description: "Google Calendar event ID" },
        summary: { type: "string", description: "New event title (optional)" },
        description: { type: "string", description: "New event description (optional)" },
        start: { type: "string", description: "New start datetime ISO string (optional)" },
        end: { type: "string", description: "New end datetime ISO string (optional)" },
        location: { type: "string", description: "New location (optional)" },
      },
      required: ["event_id"],
    },
  },
  {
    name: "delete_calendar_event",
    description: "Delete or cancel a Google Calendar event by event ID.",
    input_schema: {
      type: "object" as const,
      properties: {
        event_id: { type: "string", description: "Google Calendar event ID to delete" },
      },
      required: ["event_id"],
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

    case "web_search": {
      const query = String(input.query);
      try {
        const serpKey = process.env.SERPAPI_KEY;
        const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
        const googleCx = process.env.GOOGLE_SEARCH_CX;
        if (serpKey) {
          const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${serpKey}&num=5`;
          const res = await fetch(url);
          const data = await res.json() as { organic_results?: { title: string; snippet: string; link: string }[] };
          const results = data.organic_results?.slice(0, 5) || [];
          if (results.length === 0) return `No results found for "${query}".`;
          return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join("\n\n");
        } else if (googleKey && googleCx) {
          const url = `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(query)}&key=${googleKey}&cx=${googleCx}&num=5`;
          const res = await fetch(url);
          const data = await res.json() as { items?: { title: string; snippet: string; link: string }[] };
          const results = data.items?.slice(0, 5) || [];
          if (results.length === 0) return `No results found for "${query}".`;
          return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.link}`).join("\n\n");
        } else {
          return `Web search is not configured. To enable it, add SERPAPI_KEY or GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX to environment variables.`;
        }
      } catch (err) {
        return `Web search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "browse_url": {
      const url = String(input.url);
      try {
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TCC-Bot/1.0)" } });
        if (!res.ok) return `Failed to fetch ${url}: HTTP ${res.status}`;
        const html = await res.text();
        const text = html
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, " ")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&#\d+;/g, "")
          .trim()
          .slice(0, 5000);
        return `Content from ${url}:\n\n${text}`;
      } catch (err) {
        return `Failed to fetch URL: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "query_database": {
      const rawSql = String(input.sql).trim();
      const upperSql = rawSql.toUpperCase();
      const blocked = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"];
      if (blocked.some(k => upperSql.includes(k))) {
        return `Only SELECT queries are allowed. Blocked keywords detected.`;
      }
      if (!upperSql.startsWith("SELECT")) {
        return `Only SELECT queries are allowed.`;
      }
      try {
        const result = await db.execute(sql.raw(rawSql));
        const rows = result.rows as Record<string, unknown>[];
        if (rows.length === 0) return "Query returned 0 rows.";
        const header = Object.keys(rows[0]).join(" | ");
        const divider = "-".repeat(header.length);
        const body = rows.slice(0, 50).map(r => Object.values(r).map(v => String(v ?? "")).join(" | ")).join("\n");
        return `${header}\n${divider}\n${body}\n\n(${rows.length} row${rows.length === 1 ? "" : "s"}${rows.length > 50 ? ", truncated to 50" : ""})`;
      } catch (err) {
        return `Query failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "read_google_sheet": {
      try {
        const range = input.range ? `${input.tab_name}!${input.range}` : String(input.tab_name);
        const rows = await getSheetValues(String(input.sheet_id), range);
        if (!rows || rows.length === 0) return `No data found in sheet "${input.tab_name}".`;
        return rows.slice(0, 100).map(r => r.join(" | ")).join("\n");
      } catch (err) {
        return `Google Sheet read failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "read_google_doc": {
      try {
        const text = await getDocText(String(input.doc_id));
        if (!text) return `Google Doc "${input.doc_id}" is empty or could not be read.`;
        return text.slice(0, 8000);
      } catch (err) {
        return `Google Doc read failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "search_google_drive": {
      try {
        const drive = getDrive();
        const q = String(input.query);
        const limit = typeof input.limit === "number" ? Math.min(input.limit, 20) : 10;
        const res = await drive.files.list({
          q: `name contains '${q.replace(/'/g, "\\'")}' or fullText contains '${q.replace(/'/g, "\\'")}'`,
          pageSize: limit,
          fields: "files(id,name,mimeType,modifiedTime,webViewLink)",
        });
        const files = res.data.files || [];
        if (files.length === 0) return `No Drive files found for "${q}".`;
        return files.map((f, i) => {
          const type = (f.mimeType || "").replace("application/vnd.google-apps.", "").replace("application/", "");
          const modified = f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("en-US") : "unknown";
          return `${i + 1}. ${f.name} [${type}] — modified ${modified}\n   ID: ${f.id}${f.webViewLink ? `\n   ${f.webViewLink}` : ""}`;
        }).join("\n\n");
      } catch (err) {
        return `Drive search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "get_business_context": {
      const rows = await db.select().from(businessContextTable).orderBy(desc(businessContextTable.updatedAt));
      if (rows.length === 0) return "No business context documents stored yet.";
      return rows.map(r => {
        const header = `=== ${r.documentType?.toUpperCase() || "DOCUMENT"} (updated ${r.updatedAt ? new Date(r.updatedAt).toLocaleDateString("en-US") : "unknown"}) ===`;
        const body = r.content ? r.content.slice(0, 3000) : r.summary || "(no content)";
        return `${header}\n${body}`;
      }).join("\n\n");
    }

    case "get_all_tasks": {
      try {
        const issues = await getLinearIssues();
        if (issues.length === 0) return "No open Linear tasks found.";
        return issues.map((t, i) => {
          const priority = ["", "Urgent", "High", "Medium", "Low"][t.priority] || "Unknown";
          const due = t.dueDate ? ` | Due: ${t.dueDate}` : "";
          const assignee = t.assignee?.name ? ` | Assignee: ${t.assignee.name}` : "";
          return `${i + 1}. [${t.identifier}] ${t.title}\n   Status: ${t.state?.name || "Unknown"} | Priority: ${priority}${due}${assignee}`;
        }).join("\n\n");
      } catch (err) {
        return `Failed to fetch Linear tasks: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "get_communication_log": {
      try {
        const lim = typeof input.limit === "number" ? Math.min(input.limit, 50) : 20;
        let query = db.select().from(communicationLogTable);
        if (input.contact_name) {
          const [contact] = await db.select().from(contactsTable)
            .where(ilike(contactsTable.name, `%${String(input.contact_name)}%`)).limit(1);
          if (contact) {
            // @ts-ignore dynamic where
            query = query.where(eq(communicationLogTable.contactId, contact.id));
          }
        }
        const rows = await query.orderBy(desc(communicationLogTable.loggedAt)).limit(lim);
        if (rows.length === 0) return "No communication log entries found.";
        return rows.map((r, i) => {
          const date = r.loggedAt ? new Date(r.loggedAt).toLocaleDateString("en-US") : "unknown";
          return `${i + 1}. [${date}] ${r.channel || "?"}: ${r.summary || r.subject || "(no summary)"}`;
        }).join("\n");
      } catch (err) {
        return `Communication log failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "get_daily_checkin_history": {
      const days = typeof input.days === "number" ? Math.min(input.days, 30) : 7;
      const rows = await db.select().from(checkinsTable).orderBy(desc(checkinsTable.date)).limit(days);
      if (rows.length === 0) return "No check-in history found.";
      return rows.map((r, i) => {
        const parts = [`${i + 1}. [${r.date}]`];
        if (r.sleepHours != null) parts.push(`Sleep: ${r.sleepHours}h`);
        if (r.bibleRead != null) parts.push(`Bible: ${r.bibleRead ? "✓" : "✗"}`);
        if (r.exercised != null) parts.push(`Exercise: ${r.exercised ? "✓" : "✗"}`);
        if (r.mood) parts.push(`Mood: ${r.mood}`);
        if (r.priority1) parts.push(`\n   P1: ${r.priority1}`);
        if (r.priority2) parts.push(`P2: ${r.priority2}`);
        if (r.priority3) parts.push(`P3: ${r.priority3}`);
        return parts.join(" | ");
      }).join("\n");
    }

    case "read_email_thread": {
      try {
        const gmail = await getGmail();
        const thread = await gmail.users.threads.get({ userId: "me", id: String(input.thread_id), format: "full" });
        const messages = thread.data.messages || [];
        if (messages.length === 0) return "Thread is empty or not found.";
        return messages.map((m, i) => {
          const headers = m.payload?.headers || [];
          const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value || "";
          let body = "";
          const parts = m.payload?.parts || [];
          const textPart = parts.find(p => p.mimeType === "text/plain") || m.payload;
          if (textPart?.body?.data) {
            body = Buffer.from(textPart.body.data, "base64").toString("utf-8").slice(0, 1000);
          }
          return `[Message ${i + 1}]\nFrom: ${get("from")}\nTo: ${get("to")}\nDate: ${get("date")}\nSubject: ${get("subject")}\n${body}`;
        }).join("\n\n---\n\n");
      } catch (err) {
        return `Failed to read email thread: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "search_emails": {
      try {
        const gmail = await getGmail();
        const lim = typeof input.limit === "number" ? Math.min(input.limit, 20) : 10;
        const list = await gmail.users.messages.list({ userId: "me", q: String(input.query), maxResults: lim });
        const msgIds = list.data.messages || [];
        if (msgIds.length === 0) return `No emails found for "${input.query}".`;
        const results = await Promise.all(msgIds.slice(0, lim).map(async (m, i) => {
          try {
            const msg = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
            const headers = msg.data.payload?.headers || [];
            const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value || "";
            return `${i + 1}. From: ${get("from")}\n   Subject: ${get("subject")}\n   Date: ${get("date")}\n   Snippet: ${msg.data.snippet || ""}\n   ID: ${m.id}`;
          } catch {
            return `${i + 1}. (could not fetch message ${m.id})`;
          }
        }));
        return results.join("\n\n");
      } catch (err) {
        return `Gmail search failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "read_email_message": {
      try {
        const gmail = await getGmail();
        const msg = await gmail.users.messages.get({ userId: "me", id: String(input.message_id), format: "full" });
        const headers = msg.data.payload?.headers || [];
        const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value || "";
        let body = "";
        const extractText = (payload: typeof msg.data.payload): string => {
          if (!payload) return "";
          if (payload.mimeType === "text/plain" && payload.body?.data) {
            return Buffer.from(payload.body.data, "base64").toString("utf-8");
          }
          if (payload.parts) {
            for (const part of payload.parts) {
              const t = extractText(part);
              if (t) return t;
            }
          }
          return "";
        };
        body = extractText(msg.data.payload).slice(0, 3000);
        return `From: ${get("from")}\nTo: ${get("to")}\nCc: ${get("cc")}\nDate: ${get("date")}\nSubject: ${get("subject")}\n\n${body}`;
      } catch (err) {
        return `Failed to read email message: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "get_calendar_range": {
      try {
        const cal = await getCalendar();
        const timeMin = new Date(String(input.start_date)).toISOString();
        const timeMax = new Date(String(input.end_date)).toISOString();
        const res = await cal.events.list({
          calendarId: "primary",
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 50,
        });
        const events = res.data.items || [];
        if (events.length === 0) return `No calendar events found between ${input.start_date} and ${input.end_date}.`;
        return events.map((e, i) => {
          const start = e.start?.dateTime ? new Date(e.start.dateTime).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : e.start?.date || "";
          const end = e.end?.dateTime ? new Date(e.end.dateTime).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", minute: "2-digit" }) : "";
          const attendees = (e.attendees || []).map(a => a.email).join(", ");
          return `${i + 1}. ${e.summary || "(no title)"}\n   ${start}${end ? ` – ${end}` : ""}${e.location ? `\n   📍 ${e.location}` : ""}${attendees ? `\n   👥 ${attendees}` : ""}${e.description ? `\n   ${e.description.slice(0, 100)}` : ""}\n   ID: ${e.id}`;
        }).join("\n\n");
      } catch (err) {
        return `Calendar range fetch failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "create_calendar_reminder": {
      try {
        const startDt = String(input.datetime);
        const endDate = new Date(startDt);
        endDate.setMinutes(endDate.getMinutes() + 30);
        const result = await createEvent({
          summary: String(input.title),
          description: input.notes ? String(input.notes) : undefined,
          start: startDt,
          end: endDate.toISOString(),
        });
        if (result.ok) return `✓ Reminder created: "${input.title}" at ${new Date(startDt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} (ID: ${result.eventId})`;
        return `✗ Failed to create reminder: ${result.error}`;
      } catch (err) {
        return `Reminder creation failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "update_calendar_event": {
      try {
        const cal = await getCalendar();
        const patch: Record<string, unknown> = {};
        if (input.summary) patch.summary = String(input.summary);
        if (input.description) patch.description = String(input.description);
        if (input.location) patch.location = String(input.location);
        if (input.start) patch.start = { dateTime: String(input.start) };
        if (input.end) patch.end = { dateTime: String(input.end) };
        const res = await cal.events.patch({ calendarId: "primary", eventId: String(input.event_id), requestBody: patch });
        return `✓ Calendar event updated: "${res.data.summary}" (ID: ${res.data.id})`;
      } catch (err) {
        return `Failed to update event: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    case "delete_calendar_event": {
      try {
        const cal = await getCalendar();
        await cal.events.delete({ calendarId: "primary", eventId: String(input.event_id) });
        return `✓ Calendar event deleted (ID: ${input.event_id})`;
      } catch (err) {
        return `Failed to delete event: ${err instanceof Error ? err.message : String(err)}`;
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

  return `You are Tony Diaz's UNRESTRICTED Command Center AI — his personal daily operating system for running FlipIQ.

ABOUT TONY:
- Tony runs FlipIQ, a real estate wholesale platform
- Tony has ADHD — he needs clear, direct, action-oriented responses
- Tony's North Star: Every Acquisition Associate closes 2 deals/month
- Revenue target: $50K break-even → $100K Phase 1 → $250K Scale

TONY'S RULES:
- "Today, I will follow the plan I wrote when I was clear."
- "I do not substitute clarity for action. I execute. I stabilize. I serve."
- Sales calls FIRST. Everything else is secondary.
- Morning block is for calls only — but Tony may override this any time.

YOUR JOB:
- Execute WHATEVER Tony asks. No refusals, no blocks.
- Be proactive: use multiple tools to give Tony the full picture, not just the minimum.
- When Tony asks about a contact → use research_contact + get_communication_log + search_emails together.
- When Tony asks about his day → check calendar + tasks + emails.
- When Tony asks about a company → use web_search.
- When Tony asks about a document → use search_google_drive or read_google_doc.
- Be brief and direct — Tony does NOT like to read. Bullet points, key facts first.
- If Tony asks for something non-sales-related, gently note it ("Heads up — this is outside your sales block") but ALWAYS execute it.
- If Tony is clearly drifting from his priorities, note it once, then do what he asked.

SCOPE ADVISORY (not a gatekeeper — always execute):
- Calendar events outside sales hours: add a note like "Note: this falls in your morning sales block" but still create it.
- Non-sales meetings: note they're not sales-related, but create them if Tony asks.
- Tony can always override any advisory.

PROACTIVE BEHAVIOR:
- When Tony gives a name → automatically pull contact brief + recent comms.
- When asked to draft an email → also check recent thread history for context.
- When asked about schedule → pull the full date range, not just today.
- Always give MORE context, not less. Tony can scan it.

TOOLS AVAILABLE (38 total):
Email: list_recent_emails, search_emails, read_email_message, read_email_thread, send_email, draft_gmail_reply, get_email_brain
Calendar: get_today_calendar, get_calendar_range, create_calendar_event, create_calendar_reminder, update_calendar_event, delete_calendar_event, schedule_meeting
Slack: send_slack_message, read_slack_channel, list_slack_channels, search_slack
Contacts: search_contacts, get_contact_brief, research_contact, update_contact_stage, get_communication_log
Google: read_google_sheet, read_google_doc, search_google_drive
Tasks: create_linear_issue, create_task, get_all_tasks
Meetings: get_meeting_history, log_meeting_context, analyze_transcript
Business: get_business_context, get_daily_checkin_history
Database: query_database
Internet: web_search, browse_url
Reports: send_eod_report

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
