# Prompt 01: Gmail Send + Email Compose UI

## CONTEXT

v1 sends emails via AgentMail (a proxy service). v2 sends directly from tony@flipiq.com via the Gmail API. This prompt adds a backend send route, a frontend compose component with Gmail Contacts autocomplete, a connected-call modal with follow-up scheduling, and email polling for received messages.

**Key decisions:**
- Email replies use "Send via Gmail" ONLY — no "Copy to Clipboard" button anywhere
- AttemptModal follow-up: After logging an attempt, show Claude's draft in the EmailCompose modal for Tony to review/edit before sending — never auto-send
- Connected call modal: 3 fields (outcome notes, next step, follow-up date). Follow-up date sets `contact_intelligence.next_action_date` AND creates a Google Calendar reminder
- Gmail Contacts autocomplete: Google People API powers To/CC/BCC fields
- Email polling: Separate 5-minute interval checks for new received emails (independent of the 15-minute brief refresh)

## PREREQUISITES

- Prompt 00 completed (google-auth.ts exists with `getPeople()`, Gmail lib updated, schema-v2 tables created)
- `GOOGLE_REFRESH_TOKEN` env var set with `gmail.send` + `contacts.readonly` scopes

## WHAT TO BUILD

### Step 1: Backend — Email send route

**Create NEW file: `artifacts/api-server/src/routes/tcc/email-send.ts`**

```typescript
import { Router, type IRouter } from "express";
import { z } from "zod";
import { getGmail } from "../../lib/google-auth";
import { db } from "@workspace/db";
import { communicationLogTable, contactsTable } from "../../lib/schema-v2";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const SendEmailBody = z.object({
  to: z.string().email(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  subject: z.string().min(1),
  body: z.string().min(1),
  threadId: z.string().optional(),
  contactId: z.string().uuid().optional(),
  isHtml: z.boolean().optional().default(false),
});

router.post("/email/send", async (req, res): Promise<void> => {
  const parsed = SendEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, cc, bcc, subject, body, threadId, contactId, isHtml } = parsed.data;

  try {
    const gmail = getGmail();

    const contentType = isHtml ? "text/html" : "text/plain";
    const messageParts = [
      `From: Tony Diaz <tony@flipiq.com>`,
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      bcc ? `Bcc: ${bcc}` : "",
      `Subject: ${subject}`,
      `Content-Type: ${contentType}; charset=utf-8`,
      "",
      body,
    ].filter(Boolean).join("\r\n");

    const encoded = Buffer.from(messageParts)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encoded,
        threadId: threadId || undefined,
      },
    });

    // Log to communication_log
    let contactName = to;
    if (contactId) {
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
      if (contact) contactName = contact.name;
    }

    await db.insert(communicationLogTable).values({
      contactId: contactId || undefined,
      contactName,
      channel: "email_sent",
      direction: "outbound",
      subject,
      summary: body.substring(0, 300),
      fullContent: body,
      gmailMessageId: result.data.id || undefined,
      gmailThreadId: result.data.threadId || undefined,
    });

    res.json({
      ok: true,
      messageId: result.data.id,
      threadId: result.data.threadId,
    });
  } catch (err) {
    req.log.error({ err }, "Gmail send failed");
    res.status(500).json({ error: "Failed to send email" });
  }
});

// AI draft suggestion endpoint
const SuggestDraftBody = z.object({
  to: z.string(),
  subject: z.string().optional(),
  context: z.string().optional(),
  contactName: z.string().optional(),
  replyToSnippet: z.string().optional(),
});

router.post("/email/suggest-draft", async (req, res): Promise<void> => {
  const parsed = SuggestDraftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { to, subject, context, contactName, replyToSnippet } = parsed.data;

  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const anthropic = new Anthropic();

    // Before calling Claude, fetch context from DB:
    // 1. Query system_instructions for email_brain
    const [emailBrain] = await db.select().from(businessContextTable)
      .where(eq(businessContextTable.documentType, "email_brain")).limit(1)
      .catch(() => [undefined]);
    // 2. If contactName, query communication_log for last 5 interactions
    let recentComms: { channel: string; summary: string; loggedAt: Date | null }[] = [];
    if (contactName) {
      recentComms = await db.select({
        channel: communicationLogTable.channel,
        summary: communicationLogTable.summary,
        loggedAt: communicationLogTable.loggedAt,
      }).from(communicationLogTable)
        .where(eq(communicationLogTable.contactName, contactName))
        .orderBy(desc(communicationLogTable.loggedAt))
        .limit(5)
        .catch(() => []);
    }
    // 3. If contactName, query contact_briefs for latest brief
    let latestBrief: { briefText: string } | undefined;
    if (contactName) {
      const [brief] = await db.select({ briefText: contactBriefsTable.briefText })
        .from(contactBriefsTable)
        .where(eq(contactBriefsTable.contactName, contactName))
        .orderBy(desc(contactBriefsTable.generatedAt))
        .limit(1)
        .catch(() => [undefined]);
      latestBrief = brief;
    }
    // Include all of this in the Claude prompt as context.
    const dbContext = [
      emailBrain?.content ? `EMAIL BRAIN INSTRUCTIONS:\n${emailBrain.content.substring(0, 500)}` : "",
      recentComms.length > 0 ? `RECENT COMMUNICATIONS:\n${recentComms.map(c => `- [${c.channel}] ${c.summary}`).join("\n")}` : "",
      latestBrief?.briefText ? `CONTACT BRIEF:\n${latestBrief.briefText.substring(0, 500)}` : "",
    ].filter(Boolean).join("\n\n");

    const prompt = replyToSnippet
      ? `Draft a reply email from Tony Diaz (FlipIQ CEO) to ${contactName || to}.
Original email subject: "${subject || "No subject"}"
Original email snippet: "${replyToSnippet}"
${context ? `Additional context: ${context}` : ""}

Write a professional but warm reply. Keep it concise (3-5 sentences max). Tony's style: direct, friendly, action-oriented. Sign off as "Tony".
${dbContext ? `\n\nADDITIONAL CONTEXT FROM DATABASE:\n${dbContext}` : ""}`
      : `Draft an email from Tony Diaz (FlipIQ CEO) to ${contactName || to}.
Subject: "${subject || "Write a good subject"}"
${context ? `Context: ${context}` : ""}

Write a professional but warm email. Keep it concise. Tony's style: direct, friendly, action-oriented. Sign off as "Tony".
${dbContext ? `\n\nADDITIONAL CONTEXT FROM DATABASE:\n${dbContext}` : ""}`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find(b => b.type === "text");
    const draft = textBlock?.type === "text" ? textBlock.text : "";

    res.json({ ok: true, draft, suggestedSubject: subject || "" });
  } catch (err) {
    req.log.error({ err }, "Email draft suggestion failed");
    res.status(500).json({ error: "Failed to generate draft" });
  }
});

export default router;
```

### Step 2: Backend — Gmail Contacts autocomplete route

**Create NEW file: `artifacts/api-server/src/routes/tcc/contacts-autocomplete.ts`**

This uses the Google People API (`contacts.readonly` scope) to power autocomplete on To/CC/BCC fields.

```typescript
import { Router, type IRouter } from "express";
import { getPeople } from "../../lib/google-auth";

const router: IRouter = Router();

// Cache contacts for 10 minutes to avoid hitting People API rate limits
let cachedContacts: { name: string; email: string }[] = [];
let cacheExpiry = 0;

router.get("/contacts/autocomplete", async (req, res): Promise<void> => {
  const query = String(req.query.q || "").toLowerCase().trim();
  if (!query || query.length < 3) {
    res.json([]);
    return;
  }

  try {
    // Step 1: Search Supabase contacts first
    const dbResults = await db.select().from(contactsTable)
      .where(or(
        ilike(contactsTable.name, `%${query}%`),
        ilike(contactsTable.email, `%${query}%`),
        ilike(contactsTable.company, `%${query}%`)
      )).limit(5);
    const dbContacts = dbResults.map(c => ({ name: c.name, email: c.email || "", company: c.company || "" }));

    // Step 2: Google People API as fallback (only if < 5 DB results)
    let googleContacts: { name: string; email: string; company: string }[] = [];
    if (dbContacts.length < 5) {
      // Refresh cache if expired
      if (Date.now() > cacheExpiry || cachedContacts.length === 0) {
        const people = getPeople();
        const response = await people.people.connections.list({
          resourceName: "people/me",
          pageSize: 1000,
          personFields: "names,emailAddresses",
        });

        cachedContacts = (response.data.connections || [])
          .filter(c => c.emailAddresses?.length)
          .map(c => ({
            name: c.names?.[0]?.displayName || "",
            email: c.emailAddresses![0].value || "",
          }));

        // Also fetch "other contacts" (people emailed but not in Contacts)
        try {
          const otherResponse = await people.otherContacts.list({
            pageSize: 1000,
            readMask: "names,emailAddresses",
          });
          const others = (otherResponse.data.otherContacts || [])
            .filter(c => c.emailAddresses?.length)
            .map(c => ({
              name: c.names?.[0]?.displayName || "",
              email: c.emailAddresses![0].value || "",
            }));
          cachedContacts = [...cachedContacts, ...others];
        } catch {
          // otherContacts may fail if scope doesn't cover it — that's OK
        }

        cacheExpiry = Date.now() + 10 * 60 * 1000; // 10 minutes
      }

      // Filter by query
      googleContacts = cachedContacts
        .filter(c =>
          c.name.toLowerCase().includes(query) ||
          c.email.toLowerCase().includes(query)
        )
        .slice(0, 10 - dbContacts.length)
        .map(c => ({ ...c, company: "" }));
    }

    // Merge: DB results first, then Google, dedupe by email
    const seen = new Set<string>();
    const merged = [...dbContacts, ...googleContacts].filter(c => {
      if (!c.email || seen.has(c.email.toLowerCase())) return false;
      seen.add(c.email.toLowerCase());
      return true;
    }).slice(0, 10);

    res.json(merged);
  } catch (err) {
    console.warn("[Contacts] autocomplete failed:", err instanceof Error ? err.message : err);
    res.json([]);
  }
});

export default router;
```

### Step 3: Backend — Email polling route

**Create NEW file: `artifacts/api-server/src/routes/tcc/email-poll.ts`**

This route checks Gmail for new unread emails and logs received emails to `communication_log`. The frontend calls it every 5 minutes.

```typescript
import { Router, type IRouter } from "express";
import { getGmail } from "../../lib/google-auth";
import { db } from "@workspace/db";
import { communicationLogTable, contactsTable } from "../../lib/schema-v2";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const router: IRouter = Router();

// Track the last polled message to avoid duplicates
let lastPollHistoryId: string | null = null;

router.get("/emails/poll", async (req, res): Promise<void> => {
  try {
    const gmail = getGmail();

    // List recent unread messages (last 5 minutes window)
    const fiveMinAgo = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);
    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 20,
      q: `is:unread after:${fiveMinAgo}`,
    });

    const messages = list.data.messages || [];
    const newEmails: { from: string; subject: string; snippet: string; messageId: string; threadId: string }[] = [];

    for (const msg of messages) {
      // Check if already logged
      const [existing] = await db.select({ id: communicationLogTable.id })
        .from(communicationLogTable)
        .where(eq(communicationLogTable.gmailMessageId, msg.id!))
        .limit(1);

      if (existing) continue;

      const detail = await gmail.users.messages.get({
        userId: "me",
        id: msg.id!,
        format: "metadata",
        metadataHeaders: ["From", "Subject", "Date"],
      });

      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || "";
      const from = getHeader("From");
      const subject = getHeader("Subject");
      const snippet = detail.data.snippet || "";

      // Try to match sender to a contact by email
      const senderEmail = from.match(/<(.+?)>/)?.[1] || from;
      let matchedContactId: string | undefined;
      let matchedContactName: string | undefined;

      try {
        const [contact] = await db.select()
          .from(contactsTable)
          .where(sql`LOWER(${contactsTable.email}) = LOWER(${senderEmail})`)
          .limit(1);
        if (contact) {
          matchedContactId = contact.id;
          matchedContactName = contact.name;
        }
      } catch { /* no match, that's fine */ }

      // Log to communication_log
      await db.insert(communicationLogTable).values({
        contactId: matchedContactId,
        contactName: matchedContactName || from,
        channel: "email_received",
        direction: "inbound",
        subject,
        summary: snippet.substring(0, 300),
        gmailMessageId: msg.id!,
        gmailThreadId: msg.threadId || undefined,
      });

      newEmails.push({
        from,
        subject,
        snippet,
        messageId: msg.id!,
        threadId: msg.threadId || "",
      });
    }

    res.json({ ok: true, newCount: newEmails.length, newEmails });
  } catch (err) {
    console.warn("[EmailPoll] failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Email poll failed" });
  }
});

export default router;
```

### Step 4: Backend — Connected call modal endpoint

**File: `artifacts/api-server/src/routes/tcc/calls.ts`** — Add a new endpoint for the connected-call outcome logging. This handles the 3-field connected call modal (outcome notes, next step, follow-up date):

Add this route to the existing calls router:

```typescript
import { contactIntelligenceTable } from "../../lib/schema-v2";
import { createReminder } from "../../lib/gcal";

const ConnectedCallBody = z.object({
  contactId: z.string().uuid(),
  contactName: z.string(),
  outcomeNotes: z.string().min(1),
  nextStep: z.string().optional(),
  followUpDate: z.string().optional(), // ISO date string e.g. "2026-04-10"
});

router.post("/calls/connected-outcome", async (req, res): Promise<void> => {
  const parsed = ConnectedCallBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { contactId, contactName, outcomeNotes, nextStep, followUpDate } = parsed.data;

  try {
    // 1. Log to communication_log
    await db.insert(communicationLogTable).values({
      contactId,
      contactName,
      channel: "call_outbound",
      direction: "outbound",
      subject: "Connected call",
      summary: outcomeNotes.substring(0, 300),
      fullContent: [outcomeNotes, nextStep ? `Next step: ${nextStep}` : ""].filter(Boolean).join("\n"),
    });

    // 2. Update contact_intelligence with next_action_date if follow-up date provided
    if (followUpDate) {
      const nextActionText = nextStep || `Follow up with ${contactName}`;

      // Upsert contact_intelligence
      await db.execute(sql`
        INSERT INTO contact_intelligence (id, contact_id, next_action, next_action_date, updated_at)
        VALUES (gen_random_uuid(), ${contactId}, ${nextActionText}, ${followUpDate}, NOW())
        ON CONFLICT (contact_id) DO UPDATE SET
          next_action = ${nextActionText},
          next_action_date = ${followUpDate},
          updated_at = NOW()
      `);

      // 3. Create Google Calendar reminder
      await createReminder({
        summary: `Follow up: ${contactName}`,
        date: followUpDate,
        description: `${outcomeNotes}\n\nNext step: ${nextStep || "Follow up"}`,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Connected call outcome logging failed");
    res.status(500).json({ error: "Failed to log connected call outcome" });
  }
});
```

Add necessary imports at the top of the file: `import { sql } from "drizzle-orm";`

### Step 5: Register the new routes

**File: `artifacts/api-server/src/routes/index.ts`** — Add:

```typescript
import emailSendRouter from "./tcc/email-send";
import contactsAutocompleteRouter from "./tcc/contacts-autocomplete";
import emailPollRouter from "./tcc/email-poll";
// ... existing imports ...

// In the router setup section, add:
router.use(emailSendRouter);
router.use(contactsAutocompleteRouter);
router.use(emailPollRouter);
```

### Step 6: Frontend — Email Compose Component with Contacts Autocomplete

**Create NEW file: `artifacts/tcc/src/components/tcc/EmailCompose.tsx`**

```typescript
import { useState, useEffect, useRef } from "react";
import { get, post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";

interface Props {
  open: boolean;
  onClose: () => void;
  prefillTo?: string;
  prefillSubject?: string;
  prefillBody?: string;
  prefillContactId?: string;
  prefillContactName?: string;
  replyToSnippet?: string;
  threadId?: string;
}

interface ContactSuggestion {
  name: string;
  email: string;
}

function ContactAutocomplete({
  value, onChange, placeholder, label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  const [suggestions, setSuggestions] = useState<ContactSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const handleInput = (v: string) => {
    onChange(v);
    clearTimeout(timeoutRef.current);
    // Extract the last email being typed (after the last comma)
    const lastToken = v.split(",").pop()?.trim() || "";
    if (lastToken.length >= 2) {
      timeoutRef.current = setTimeout(async () => {
        try {
          const results = await get<ContactSuggestion[]>(`/contacts/autocomplete?q=${encodeURIComponent(lastToken)}`);
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch {
          setSuggestions([]);
        }
      }, 200);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  };

  const selectSuggestion = (s: ContactSuggestion) => {
    // Replace the last token with the selected suggestion
    const parts = value.split(",").map(p => p.trim()).filter(Boolean);
    parts.pop(); // remove the partial token
    const display = s.name ? `${s.name} <${s.email}>` : s.email;
    parts.push(display);
    onChange(parts.join(", "));
    setShowSuggestions(false);
  };

  return (
    <div style={{ marginBottom: 12, position: "relative" }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>{label}</label>
      <input
        value={value}
        onChange={e => handleInput(e.target.value)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
        placeholder={placeholder}
        style={{ ...inp, fontSize: 14 }}
      />
      {showSuggestions && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100,
          background: C.card, border: `1px solid ${C.bdr}`, borderRadius: 8,
          maxHeight: 200, overflow: "auto", boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={i}
              onClick={() => selectSuggestion(s)}
              style={{
                padding: "8px 12px", cursor: "pointer", fontSize: 13,
                borderBottom: i < suggestions.length - 1 ? `1px solid ${C.bdr}` : "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.bg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ fontWeight: 600 }}>{s.name || s.email}</div>
              {s.name && <div style={{ fontSize: 11, color: C.mut }}>{s.email}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EmailCompose({
  open, onClose,
  prefillTo, prefillSubject, prefillBody, prefillContactId, prefillContactName,
  replyToSnippet, threadId,
}: Props) {
  const [to, setTo] = useState(prefillTo || "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState(prefillSubject || "");
  const [body, setBody] = useState(prefillBody || "");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [aiDrafting, setAiDrafting] = useState(false);

  // Reset when opened with new prefills
  useEffect(() => {
    if (open) {
      setTo(prefillTo || "");
      setSubject(prefillSubject || "");
      setBody(prefillBody || "");
      setCc("");
      setBcc("");
      setSent(false);
      setError("");
    }
  }, [open, prefillTo, prefillSubject, prefillBody]);

  const handleAiDraft = async () => {
    setAiDrafting(true);
    setError("");
    try {
      const result = await post<{ ok: boolean; draft: string; suggestedSubject?: string }>("/email/suggest-draft", {
        to,
        subject,
        contactName: prefillContactName,
        replyToSnippet,
        context: body || undefined,
      });
      if (result.draft) setBody(result.draft);
      if (result.suggestedSubject && !subject) setSubject(result.suggestedSubject);
    } catch {
      setError("Failed to generate AI draft");
    }
    setAiDrafting(false);
  };

  const handleSend = async () => {
    if (!to || !subject || !body) {
      setError("To, Subject, and Body are required");
      return;
    }
    setSending(true);
    setError("");
    try {
      await post("/email/send", {
        to, cc: cc || undefined, bcc: bcc || undefined, subject, body,
        threadId: threadId || undefined,
        contactId: prefillContactId || undefined,
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch {
      setError("Failed to send email. Check your connection and try again.");
    }
    setSending(false);
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 28, width: 600, maxWidth: "95vw", maxHeight: "90vh", overflow: "auto" }}>

        {sent ? (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#10003;</div>
            <div style={{ fontFamily: FS, fontSize: 20, color: C.grn }}>Email Sent</div>
            <div style={{ fontSize: 13, color: C.mut, marginTop: 6 }}>Sent from tony@flipiq.com</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: FS, fontSize: 20, margin: 0 }}>
                {replyToSnippet ? "Reply" : "Compose Email"}
              </h3>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.mut }}>&#10005;</button>
            </div>

            <ContactAutocomplete value={to} onChange={setTo} placeholder="name@example.com" label="To" />
            <ContactAutocomplete value={cc} onChange={setCc} placeholder="cc@example.com" label="CC (optional)" />
            <ContactAutocomplete value={bcc} onChange={setBcc} placeholder="bcc@example.com" label="BCC (optional)" />

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line" style={{ ...inp, fontSize: 14 }} />
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1 }}>Body</label>
                <button
                  onClick={handleAiDraft}
                  disabled={aiDrafting}
                  style={{ ...btn2, padding: "4px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}
                >
                  {aiDrafting ? "Drafting..." : "AI Draft"}
                </button>
              </div>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="Write your email here..."
                style={{ ...inp, minHeight: 180, resize: "vertical", fontSize: 14, lineHeight: 1.6 }}
              />
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ ...btn2, padding: "10px 20px" }}>Cancel</button>
              <button
                onClick={handleSend}
                disabled={sending || !to || !subject || !body}
                style={{
                  ...btn1,
                  padding: "10px 28px",
                  opacity: (sending || !to || !subject || !body) ? 0.4 : 1,
                }}
              >
                {sending ? "Sending..." : "Send via Gmail"}
              </button>
            </div>

            <div style={{ fontSize: 10, color: C.mut, marginTop: 10, textAlign: "center" }}>
              Sends directly from tony@flipiq.com via Gmail API
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

### Step 7: Frontend — Connected Call Modal

**Create NEW file: `artifacts/tcc/src/components/tcc/ConnectedCallModal.tsx`**

This modal opens after a "Connected" call is logged. It has 3 fields: outcome notes, next step, follow-up date picker. The follow-up date sets `contact_intelligence.next_action_date` AND creates a Google Calendar reminder.

```typescript
import { useState } from "react";
import { post } from "@/lib/api";
import { C, FS, inp, btn1, btn2 } from "./constants";

interface Props {
  open: boolean;
  onClose: () => void;
  contactId: string;
  contactName: string;
  contactEmail?: string;
  onFollowUpEmail?: (prefill: { to: string; subject: string; body: string; contactId: string; contactName: string }) => void;
}

export function ConnectedCallModal({ open, onClose, contactId, contactName, contactEmail, onFollowUpEmail }: Props) {
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    if (!outcomeNotes.trim()) {
      setError("Outcome notes are required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await post("/calls/connected-outcome", {
        contactId,
        contactName,
        outcomeNotes,
        nextStep: nextStep || undefined,
        followUpDate: followUpDate || undefined,
      });
      setSaved(true);

      // After a short delay, ask about follow-up email
      setTimeout(() => {
        onClose();
        // If there's a follow-up, offer to compose a follow-up email
        if (onFollowUpEmail && contactEmail) {
          onFollowUpEmail({
            to: contactEmail,
            subject: `Following up - ${contactName}`,
            body: "", // Will be filled by AI Draft
            contactId,
            contactName,
          });
        }
      }, 1200);
    } catch {
      setError("Failed to save. Try again.");
    }
    setSaving(false);
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 28, width: 500, maxWidth: "95vw" }}>

        {saved ? (
          <div style={{ textAlign: "center", padding: "30px 0" }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>&#10003;</div>
            <div style={{ fontFamily: FS, fontSize: 18, color: C.grn }}>Call Logged</div>
            {followUpDate && (
              <div style={{ fontSize: 12, color: C.mut, marginTop: 6 }}>
                Calendar reminder created for {followUpDate}
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontFamily: FS, fontSize: 20, margin: 0 }}>
                Connected Call: {contactName}
              </h3>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.mut }}>&#10005;</button>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                Outcome Notes *
              </label>
              <textarea
                value={outcomeNotes}
                onChange={e => setOutcomeNotes(e.target.value)}
                placeholder="What was discussed? Key takeaways..."
                style={{ ...inp, minHeight: 100, resize: "vertical", fontSize: 14, lineHeight: 1.5 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                Next Step
              </label>
              <input
                value={nextStep}
                onChange={e => setNextStep(e.target.value)}
                placeholder="e.g. Send proposal, Schedule demo, Send contract"
                style={{ ...inp, fontSize: 14 }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, display: "block", marginBottom: 4 }}>
                Follow-Up Date
              </label>
              <input
                type="date"
                value={followUpDate}
                onChange={e => setFollowUpDate(e.target.value)}
                style={{ ...inp, fontSize: 14 }}
              />
              <div style={{ fontSize: 10, color: C.mut, marginTop: 3 }}>
                Sets next_action_date + creates a Google Calendar reminder
              </div>
            </div>

            {error && (
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{ ...btn2, padding: "10px 20px" }}>Cancel</button>
              <button
                onClick={handleSave}
                disabled={saving || !outcomeNotes.trim()}
                style={{
                  ...btn1,
                  padding: "10px 28px",
                  opacity: (saving || !outcomeNotes.trim()) ? 0.4 : 1,
                }}
              >
                {saving ? "Saving..." : "Log Call"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

### Step 8: Frontend — Wire AttemptModal to open EmailCompose for follow-up

When Tony logs a call attempt and there is an associated contact email, the AttemptModal should close and then open the EmailCompose modal with Claude's AI-drafted follow-up email pre-loaded for review. Tony can then edit and send (or cancel).

**In the SalesView or wherever the AttemptModal is used:**

After the attempt is logged successfully, trigger the EmailCompose:

```typescript
// After successful attempt log:
onClose(); // close AttemptModal
// Open EmailCompose with AI draft context:
setEmailCompose({
  to: contact.email || "",
  subject: `Following up - ${contact.name}`,
  body: "", // leave empty — Tony clicks "AI Draft" to generate
  contactId: String(contact.id),
  contactName: contact.name,
  replyToSnippet: undefined, // not a reply
});
```

**IMPORTANT:** Do NOT auto-send the follow-up email. Always show the draft in EmailCompose for Tony to review/edit/send manually via the "Send via Gmail" button.

### Step 9: Frontend — Add EmailCompose + ConnectedCallModal to App.tsx

**File: `artifacts/tcc/src/App.tsx`** — Add the imports and state:

```typescript
// Add imports at top:
import { EmailCompose } from "@/components/tcc/EmailCompose";
import { ConnectedCallModal } from "@/components/tcc/ConnectedCallModal";

// Add state in the App component:
const [emailCompose, setEmailCompose] = useState<{
  to?: string; subject?: string; body?: string;
  contactId?: string; contactName?: string;
  replyToSnippet?: string; threadId?: string;
} | null>(null);

const [connectedCall, setConnectedCall] = useState<{
  contactId: string; contactName: string; contactEmail?: string;
} | null>(null);

// Add the components in the JSX (add them to the sharedModals variable):
const sharedModals = (
  <>
    <IdeasModal open={showIdea} onClose={() => setShowIdea(false)} onSave={idea => setIdeas(prev => [...prev, idea])} count={ideas.length} />
    <ClaudeModal open={showChat} onClose={() => setShowChat(false)} />
    <EmailCompose
      open={!!emailCompose}
      onClose={() => setEmailCompose(null)}
      prefillTo={emailCompose?.to}
      prefillSubject={emailCompose?.subject}
      prefillBody={emailCompose?.body}
      prefillContactId={emailCompose?.contactId}
      prefillContactName={emailCompose?.contactName}
      replyToSnippet={emailCompose?.replyToSnippet}
      threadId={emailCompose?.threadId}
    />
    <ConnectedCallModal
      open={!!connectedCall}
      onClose={() => setConnectedCall(null)}
      contactId={connectedCall?.contactId || ""}
      contactName={connectedCall?.contactName || ""}
      contactEmail={connectedCall?.contactEmail}
      onFollowUpEmail={prefill => setEmailCompose(prefill)}
    />
  </>
);
```

### Step 10: Frontend — Add email polling (5-minute interval)

**File: `artifacts/tcc/src/App.tsx`** — Add a useEffect for email polling:

```typescript
// Email polling — check for new received emails every 5 minutes
useEffect(() => {
  const pollEmails = async () => {
    try {
      await get("/emails/poll");
    } catch {
      // silent fail — non-critical background task
    }
  };

  // Poll immediately on load, then every 5 minutes
  pollEmails();
  const interval = setInterval(pollEmails, 5 * 60 * 1000);
  return () => clearInterval(interval);
}, []);
```

### Step 11: Wire compose and connected-call buttons in SalesView

**File: `artifacts/tcc/src/components/tcc/SalesView.tsx`**

Add `onCompose` and `onConnectedCall` props:

```typescript
interface Props {
  // ... existing props ...
  onCompose: (contact: Contact) => void;
  onConnectedCall: (contact: Contact) => void;
}
```

Add a compose button in each contact card, next to the Text button:

```typescript
<button onClick={() => onCompose(c)} style={{ ...btn2, padding: "7px 12px", fontSize: 11, color: C.blu, borderColor: C.blu }}>
  Email
</button>
```

When a call is logged as "connected", trigger the connected-call modal instead of the default behavior:

```typescript
// In the call logging handler, when type === "connected":
onConnectedCall(contact);
```

Wire it up in App.tsx where SalesView is rendered:

```typescript
<SalesView
  // ... existing props ...
  onCompose={c => setEmailCompose({
    to: c.email || "",
    contactId: String(c.id),
    contactName: c.name,
  })}
  onConnectedCall={c => setConnectedCall({
    contactId: String(c.id),
    contactName: c.name,
    contactEmail: c.email || undefined,
  })}
/>
```

## VERIFY BEFORE MOVING ON

1. Click "Email" on a contact card -> compose modal opens with To pre-filled
2. Type in the To field -> autocomplete dropdown shows matching Google Contacts
3. CC and BCC fields also have autocomplete
4. Click "AI Draft" -> body populates with AI-generated draft
5. Fill in Subject + Body -> click "Send via Gmail" -> email actually arrives in the recipient's inbox (there is NO "Copy to Clipboard" button)
6. Check the `communication_log` table in Supabase — a new row exists with `channel = 'email_sent'`
7. Log a connected call -> ConnectedCallModal opens with 3 fields (outcome notes, next step, follow-up date)
8. Set a follow-up date and save -> check `contact_intelligence` table has `next_action_date` set -> check Google Calendar has a reminder event
9. After connected call save, if contact has email -> EmailCompose opens for follow-up review (NOT auto-sent)
10. Log a call attempt -> after logging, EmailCompose opens for follow-up draft review
11. Wait 5 minutes (or manually hit `GET /api/emails/poll`) -> new received emails appear in `communication_log` with `channel = 'email_received'`
12. All existing email features still work (suggest reply, snooze, training)
