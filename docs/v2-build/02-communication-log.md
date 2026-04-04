# Prompt 02: Unified Communication Log

## CONTEXT

Every interaction with a contact (email sent, email received, call, text, meeting, Slack) must be logged to one table: `communication_log`. This enables contact briefs, AI scoring, and the 3-tier sales view. The table was created in Prompt 00. Now we wire up all channels to write to it, including:

- Mirror ALL phone_log entries to communication_log
- Connected call follow-up dates update `contact_intelligence.next_action_date` AND create Calendar reminders
- Email received detection via 5-minute polling (route created in Prompt 01)

**Key decisions:**
- `communication_log.channel` values: `"email_sent"`, `"email_received"`, `"call_outbound"`, `"call_inbound"`, `"text_sent"`, `"text_received"`, `"meeting"`
- `communication_log.direction` values: `"inbound"` or `"outbound"` for quick filtering
- Every insert into communication_log should also call `updateContactComms()` to keep contact_intelligence counters in sync
- Follow-up dates from Connected call modal flow through: calls.ts -> contact_intelligence.next_action_date + Google Calendar reminder (wired in Prompt 01, Step 4)

## PREREQUISITES

- Prompt 00 completed (communicationLogTable + contactIntelligenceTable exist in schema + database)
- Prompt 01 completed (email/send already logs to communication_log, email-poll.ts logs received emails, calls/connected-outcome sets follow-up dates + calendar reminders)

## WHAT TO BUILD

### Step 1: Backend — Communication log query routes

**Create NEW file: `artifacts/api-server/src/routes/tcc/communication-log.ts`**

```typescript
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { communicationLogTable } from "../../lib/schema-v2";
import { eq, desc, and, gte, sql } from "drizzle-orm";

const router: IRouter = Router();

// Get communication log for a specific contact
router.get("/communication-log/:contactId", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const logs = await db.select()
    .from(communicationLogTable)
    .where(eq(communicationLogTable.contactId, contactId))
    .orderBy(desc(communicationLogTable.loggedAt))
    .limit(limit)
    .offset(offset);

  const [countResult] = await db.select({ count: sql<number>`COUNT(*)` })
    .from(communicationLogTable)
    .where(eq(communicationLogTable.contactId, contactId));

  res.json({ logs, total: countResult?.count || 0 });
});

// Get recent communications across all contacts (for morning brief)
// IMPORTANT: this route must be registered BEFORE /:contactId to avoid path conflict
router.get("/communication-log/recent", async (req, res): Promise<void> => {
  const hours = Number(req.query.hours) || 48;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const logs = await db.select()
    .from(communicationLogTable)
    .where(gte(communicationLogTable.loggedAt, since))
    .orderBy(desc(communicationLogTable.loggedAt))
    .limit(100);

  res.json(logs);
});

// Get communication stats for a contact
router.get("/communication-log/:contactId/stats", async (req, res): Promise<void> => {
  const { contactId } = req.params;

  const stats = await db.select({
    channel: communicationLogTable.channel,
    count: sql<number>`COUNT(*)`,
    lastDate: sql<string>`MAX(logged_at)`,
  })
    .from(communicationLogTable)
    .where(eq(communicationLogTable.contactId, contactId))
    .groupBy(communicationLogTable.channel);

  const total = stats.reduce((sum, s) => sum + Number(s.count), 0);
  const lastComm = stats.reduce((latest, s) =>
    !latest || new Date(s.lastDate) > new Date(latest) ? s.lastDate : latest,
    "" as string
  );

  // Also compute days_since_contact at query time (NOT a generated column)
  const daysSince = lastComm
    ? Math.floor((Date.now() - new Date(lastComm).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  res.json({
    stats: Object.fromEntries(stats.map(s => [s.channel, { count: Number(s.count), lastDate: s.lastDate }])),
    totalInteractions: total,
    lastCommunication: lastComm || null,
    daysSinceContact: daysSince,
  });
});

export default router;
```

### Step 2: Helper to update contact_intelligence when communications happen

**Create NEW file: `artifacts/api-server/src/lib/contact-comms.ts`**

```typescript
import { db } from "@workspace/db";
import { contactIntelligenceTable } from "./schema-v2";
import { sql } from "drizzle-orm";

/**
 * Call this after ANY communication is logged to communication_log.
 * Updates the contact_intelligence row with latest stats and counters.
 */
export async function updateContactComms(contactId: string, channel: string, summary: string) {
  if (!contactId) return;

  try {
    // Map channel to the right counter column name
    const counterColumn =
      channel.startsWith("call") ? "total_calls" :
      channel === "email_sent" ? "total_emails_sent" :
      channel === "email_received" ? "total_emails_received" :
      channel.startsWith("text") ? "total_texts" :
      channel === "meeting" ? "total_meetings" : null;

    if (counterColumn) {
      // Upsert: increment the counter and update last communication fields
      await db.execute(sql`
        INSERT INTO contact_intelligence (id, contact_id, ${sql.raw(counterColumn)}, last_communication_date, last_communication_type, last_communication_summary, updated_at)
        VALUES (gen_random_uuid(), ${contactId}, 1, NOW(), ${channel}, ${summary.substring(0, 300)}, NOW())
        ON CONFLICT (contact_id) DO UPDATE SET
          ${sql.raw(counterColumn)} = COALESCE(contact_intelligence.${sql.raw(counterColumn)}, 0) + 1,
          last_communication_date = NOW(),
          last_communication_type = ${channel},
          last_communication_summary = ${summary.substring(0, 300)},
          updated_at = NOW()
      `);
    }
  } catch (err) {
    console.warn("[contact-comms] Failed to update contact intelligence:", err);
  }
}
```

### Step 3: Wire existing call logging (calls.ts) into communication_log

**File: `artifacts/api-server/src/routes/tcc/calls.ts`** — After inserting into `callLogTable`, also insert into `communicationLogTable`.

Add these imports at the top:

```typescript
import { communicationLogTable } from "../../lib/schema-v2";
import { updateContactComms } from "../../lib/contact-comms";
```

After the existing `db.insert(callLogTable)` block, add:

```typescript
// Mirror to unified communication log
const commChannel = type === "connected" ? "call_outbound" : "call_outbound";
const commSummary = notes || `${type} call with ${contactName}`;

await db.insert(communicationLogTable).values({
  contactId: contactId ?? undefined,
  contactName,
  channel: commChannel,
  direction: "outbound",
  subject: type === "attempt" ? "Call attempt" : "Connected call",
  summary: commSummary,
  fullContent: notes || undefined,
}).catch(err => req.log.warn({ err }, "Failed to log to communication_log"));

// Update contact_intelligence counters
if (contactId) {
  await updateContactComms(contactId, commChannel, commSummary);
}
```

**IMPORTANT:** The connected-call follow-up flow (setting `next_action_date` + Calendar reminder) is handled by the `POST /calls/connected-outcome` endpoint added in Prompt 01, Step 4. When a connected call's follow-up date is set:
1. `contact_intelligence.next_action_date` is updated via upsert
2. A Google Calendar all-day reminder event is created via `createReminder()`

This already works from Prompt 01. No additional wiring needed here.

### Step 4: Wire phone-log (MacroDroid webhook) into communication_log

**File: `artifacts/api-server/src/routes/tcc/phone-log.ts`** — After inserting into `phoneLogTable`, add:

Add these imports at the top:

```typescript
import { communicationLogTable } from "../../lib/schema-v2";
import { updateContactComms } from "../../lib/contact-comms";
```

After the existing insert into phoneLogTable, add:

```typescript
// Determine channel based on type and direction
const channel = parsed.data.type === "call"
  ? (parsed.data.direction === "incoming" ? "call_inbound" : "call_outbound")
  : (parsed.data.direction === "incoming" ? "text_received" : "text_sent");

const direction = parsed.data.direction === "incoming" ? "inbound" : "outbound";
const commSummary = parsed.data.body || `${parsed.data.type} — ${parsed.data.direction}`;

// Mirror to unified communication log
await db.insert(communicationLogTable).values({
  contactId: matchedContact?.id || undefined,
  contactName: matchedContact?.name || parsed.data.phone_number,
  channel,
  direction,
  subject: parsed.data.type === "call" ? "Phone call" : "SMS",
  summary: commSummary,
  fullContent: parsed.data.body || undefined,
}).catch(err => console.warn("Failed to log to communication_log:", err));

// Update contact_intelligence counters
if (matchedContact?.id) {
  await updateContactComms(matchedContact.id, channel, commSummary);
}
```

### Step 5: Wire SMS sending into communication_log

**File: `artifacts/api-server/src/routes/tcc/send-sms.ts`** — After the existing insert into `phoneLogTable`, add:

Add these imports at the top:

```typescript
import { communicationLogTable } from "../../lib/schema-v2";
import { updateContactComms } from "../../lib/contact-comms";
```

After existing insert:

```typescript
// Mirror to unified communication log
await db.insert(communicationLogTable).values({
  contactId: contact_id || undefined,
  contactName: contactName || phone_number,
  channel: "text_sent",
  direction: "outbound",
  subject: "SMS",
  summary: message.substring(0, 300),
  fullContent: message,
}).catch(() => {});

// Update contact_intelligence counters
if (contact_id) {
  await updateContactComms(contact_id, "text_sent", message.substring(0, 300));
}
```

### Step 6: Wire email send into contact_intelligence updates

**File: `artifacts/api-server/src/routes/tcc/email-send.ts`** — The email send route from Prompt 01 already inserts into `communicationLogTable`. Add the contact-comms update after it.

Add this import at the top:

```typescript
import { updateContactComms } from "../../lib/contact-comms";
```

After the existing `db.insert(communicationLogTable)` block, add:

```typescript
// Update contact_intelligence counters
if (contactId) {
  await updateContactComms(contactId, "email_sent", body.substring(0, 300));
}
```

### Step 7: Wire email polling into contact_intelligence updates

**File: `artifacts/api-server/src/routes/tcc/email-poll.ts`** — The email polling route from Prompt 01 already inserts received emails into `communicationLogTable`. Add the contact-comms update.

Add this import at the top:

```typescript
import { updateContactComms } from "../../lib/contact-comms";
```

After the existing `db.insert(communicationLogTable)` block inside the message loop, add:

```typescript
// Update contact_intelligence counters for received emails
if (matchedContactId) {
  await updateContactComms(matchedContactId, "email_received", snippet.substring(0, 300));
}
```

### Step 8: Register the communication-log route

**File: `artifacts/api-server/src/routes/index.ts`** — Add:

```typescript
import communicationLogRouter from "./tcc/communication-log";

// IMPORTANT: register BEFORE any routes that use /:id patterns
// to ensure /communication-log/recent doesn't match as a contactId
router.use(communicationLogRouter);
```

### Step 9: Summary of the complete communication flow

After all three prompts, here is the full picture:

| Event | Source | communication_log channel | contact_intelligence counter | Follow-up action |
|---|---|---|---|---|
| Tony sends email | EmailCompose -> email-send.ts | `email_sent` | `total_emails_sent` | -- |
| Tony receives email | email-poll.ts (5-min interval) | `email_received` | `total_emails_received` | -- |
| Tony makes call attempt | SalesView -> calls.ts | `call_outbound` | `total_calls` | Opens EmailCompose for follow-up draft |
| Tony connects on call | SalesView -> calls.ts + ConnectedCallModal -> calls/connected-outcome | `call_outbound` | `total_calls` | Sets next_action_date + Calendar reminder + opens EmailCompose |
| Inbound call detected | MacroDroid -> phone-log.ts | `call_inbound` | `total_calls` | -- |
| Tony sends SMS | SalesView -> send-sms.ts | `text_sent` | `total_texts` | -- |
| Inbound SMS detected | MacroDroid -> phone-log.ts | `text_received` | `total_texts` | -- |

**Follow-up date flow (Connected call):**
1. Tony logs a connected call -> ConnectedCallModal opens
2. Tony fills in outcome notes, next step, follow-up date
3. `POST /calls/connected-outcome` fires:
   - Inserts into `communication_log` (channel: `call_outbound`)
   - Upserts `contact_intelligence.next_action_date` with the follow-up date
   - Creates a Google Calendar all-day reminder via `createReminder()`
4. After saving, EmailCompose opens pre-addressed to the contact for optional follow-up email

**Email polling flow:**
1. Frontend `useEffect` calls `GET /api/emails/poll` every 5 minutes (separate from 15-min brief refresh)
2. Route checks Gmail for unread messages received in the last 5 minutes
3. For each new message not already in `communication_log`:
   - Tries to match sender email to a contact in `contactsTable`
   - Inserts into `communication_log` with `channel = "email_received"`
   - Calls `updateContactComms()` to increment `total_emails_received`

### Step 7: Verify MacroDroid phone-log integration (Story 15.1)

The existing `phone-log.ts` route already handles MacroDroid webhooks. After adding the communication_log mirror in Step 4, verify:
- Outbound calls log as channel='call_outbound', direction='outbound'
- Inbound calls log as channel='call_inbound', direction='inbound'
- Inbound texts log as channel='text_received', direction='inbound'
- Secret key auth rejects requests without ?key=MACRODROID_SECRET
- Matched contacts get contact_intelligence counters updated

### Step 8: FlipIQ-tagged unknown call auto-contact creation (Story 15.2)

In `phone-log.ts`, after the existing contact matching logic, add:

If no contact matched AND the request body includes `flipiq_tagged: true` (or the call happened during a "FlipIQ Demo" calendar event), auto-create a contact:

```typescript
if (!matchedContact && parsed.data.flipiq_tagged) {
  const [newContact] = await db.insert(contactsTable).values({
    name: `Unknown — ${parsed.data.phone_number}`,
    phone: parsed.data.phone_number,
    source: "phone",
    status: "New",
  }).returning();
  // Link the phone_log entry to the new contact
  // Also create a contact_intelligence row
}
```

If NOT tagged, just log with matched=false. Do NOT auto-create.

## VERIFY BEFORE MOVING ON

1. Make a call via the Sales View -> check `communication_log` table has a new row with `channel = 'call_outbound'`
2. Log a connected call with a follow-up date -> check:
   - `communication_log` has `channel = 'call_outbound'` with the outcome notes
   - `contact_intelligence` has `next_action_date` set to the chosen date
   - Google Calendar has a new all-day reminder event for that date
3. Send an email via the compose modal -> check `communication_log` has `channel = 'email_sent'`
4. Wait 5 minutes (or manually hit `GET /api/emails/poll`) -> new received emails appear in `communication_log` with `channel = 'email_received'`
5. Send an SMS -> check `communication_log` has `channel = 'text_sent'`
6. Trigger an inbound phone-log webhook -> check `communication_log` has the correct channel (`call_inbound` or `text_received`)
7. `GET /api/communication-log/{contactId}` returns the contact's communication history
8. `GET /api/communication-log/{contactId}/stats` returns correct counts per channel AND `daysSinceContact`
9. `GET /api/communication-log/recent` returns recent communications across all contacts
10. Check `contact_intelligence` table — the contact's `total_calls`, `total_emails_sent`, `total_emails_received`, `last_communication_date`, etc. are all updated correctly
11. All existing features still work (calls, SMS, emails, brief, schedule)
