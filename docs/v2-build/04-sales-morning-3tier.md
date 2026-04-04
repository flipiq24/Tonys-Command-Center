# Prompt 04: 3-Tier Morning Sales View + Top-3 Focus Tasks

## CONTEXT

v1 SalesView shows a flat list of contacts sorted Hot > Warm > New. v2 redesigns this into three prioritized tiers: (1) Urgent Responses -- contacts who communicated in the last 48 hours (NO LIMIT on count), (2) Follow-ups -- contacts with a next_action_date due today or overdue (NO LIMIT), (3) Top 10 New -- AI-scored contacts not contacted in 24+ hours, Broker-Investors first. A pipeline summary bar shows temperature/stage counts. Above everything, a Top-3 Focus Tasks section shows prominently, where task #1 is ALWAYS "10 Sales Calls" which routes to Sales Mode.

Contacts have TWO separate fields:
- **Stage** (pipeline position): new, outreach, engaged, meeting_scheduled, negotiating, closed, dormant
- **Status** (temperature): Hot, Warm, Cold, New

Connected call modal has 3 fields: outcome notes, next step, follow-up date picker. Follow-up date sets next_action_date AND creates a calendar reminder.

## PREREQUISITES

- Prompt 00 completed (contact_intelligence and communication_log tables exist)
- Prompt 02 completed (communication_log is being populated from all channels)
- Contacts exist in the `contacts` table with data

## WHAT TO BUILD

### Step 1: Backend -- Sales morning data route

**Create NEW file: `artifacts/api-server/src/routes/tcc/sales-morning.ts`**

```typescript
import { Router, type IRouter } from "express";
import { db, contactsTable } from "@workspace/db";
import { contactIntelligenceTable, communicationLogTable } from "../../lib/schema-v2";
import { eq, desc, gte, lte, and, sql, isNotNull, or, isNull } from "drizzle-orm";

const router: IRouter = Router();

router.get("/sales/morning", async (_req, res): Promise<void> => {
  try {
    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const hours48Ago = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const hours24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // ─── Tier 1: Urgent Responses (NO LIMIT -- could be 35+) ───────────
    // Contacts who communicated (inbound) in last 48 hours
    const urgentComms = await db
      .selectDistinctOn([communicationLogTable.contactId], {
        contactId: communicationLogTable.contactId,
        contactName: communicationLogTable.contactName,
        channel: communicationLogTable.channel,
        summary: communicationLogTable.summary,
        subject: communicationLogTable.subject,
        loggedAt: communicationLogTable.loggedAt,
      })
      .from(communicationLogTable)
      .where(
        and(
          gte(communicationLogTable.loggedAt, hours48Ago),
          isNotNull(communicationLogTable.contactId),
          or(
            eq(communicationLogTable.channel, "email_received"),
            eq(communicationLogTable.channel, "call_inbound"),
            eq(communicationLogTable.channel, "text_received"),
          )
        )
      )
      .orderBy(communicationLogTable.contactId, desc(communicationLogTable.loggedAt));
    // NOTE: No .limit() -- Tier 1 has NO LIMIT

    // Enrich with contact + intel data
    const urgentResponses = [];
    for (const u of urgentComms) {
      if (!u.contactId) continue;
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, u.contactId)).limit(1);
      const [intel] = await db.select().from(contactIntelligenceTable).where(eq(contactIntelligenceTable.contactId, u.contactId)).limit(1);
      if (contact) {
        urgentResponses.push({
          ...contact,
          aiScore: intel?.aiScore || null,
          aiScoreReason: intel?.aiScoreReason || null,
          stage: intel?.stage || "new",
          lastComm: { channel: u.channel, summary: u.summary || u.subject, loggedAt: u.loggedAt },
        });
      }
    }

    // ─── Tier 2: Follow-ups (NO LIMIT) ─────────────────────────────────
    // Contacts with next_action_date <= today
    const followUpRows = await db
      .select({
        contactId: contactIntelligenceTable.contactId,
        stage: contactIntelligenceTable.stage,
        aiScore: contactIntelligenceTable.aiScore,
        aiScoreReason: contactIntelligenceTable.aiScoreReason,
        nextAction: contactIntelligenceTable.nextAction,
        nextActionDate: contactIntelligenceTable.nextActionDate,
        lastCommunicationDate: contactIntelligenceTable.lastCommunicationDate,
        lastCommunicationType: contactIntelligenceTable.lastCommunicationType,
        lastCommunicationSummary: contactIntelligenceTable.lastCommunicationSummary,
      })
      .from(contactIntelligenceTable)
      .where(
        and(
          isNotNull(contactIntelligenceTable.nextActionDate),
          lte(contactIntelligenceTable.nextActionDate, todayStr)
        )
      )
      .orderBy(contactIntelligenceTable.nextActionDate);
    // NOTE: No .limit() -- Tier 2 has NO LIMIT

    const followUps = [];
    for (const f of followUpRows) {
      if (!f.contactId) continue;
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, f.contactId)).limit(1);
      if (contact) {
        followUps.push({
          ...contact,
          aiScore: f.aiScore,
          aiScoreReason: f.aiScoreReason,
          stage: f.stage || "new",
          nextAction: f.nextAction,
          nextActionDate: f.nextActionDate,
          lastComm: {
            date: f.lastCommunicationDate,
            type: f.lastCommunicationType,
            summary: f.lastCommunicationSummary,
          },
        });
      }
    }

    // ─── Tier 3: Top 10 New ─────────────────────────────────────────────
    // AI-scored contacts not contacted in 24h, Broker-Investors first
    const top10Rows = await db
      .select({
        contactId: contactIntelligenceTable.contactId,
        aiScore: contactIntelligenceTable.aiScore,
        aiScoreReason: contactIntelligenceTable.aiScoreReason,
        stage: contactIntelligenceTable.stage,
        lastCommunicationDate: contactIntelligenceTable.lastCommunicationDate,
        lastCommunicationType: contactIntelligenceTable.lastCommunicationType,
        lastCommunicationSummary: contactIntelligenceTable.lastCommunicationSummary,
      })
      .from(contactIntelligenceTable)
      .where(
        or(
          isNull(contactIntelligenceTable.lastCommunicationDate),
          lte(contactIntelligenceTable.lastCommunicationDate, hours24Ago)
        )
      )
      .orderBy(desc(contactIntelligenceTable.aiScore))
      .limit(20);

    const top10New = [];
    for (const t of top10Rows) {
      if (!t.contactId) continue;
      const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, t.contactId)).limit(1);
      if (contact) {
        top10New.push({
          ...contact,
          aiScore: t.aiScore,
          aiScoreReason: t.aiScoreReason,
          stage: t.stage || "new",
          lastComm: {
            date: t.lastCommunicationDate,
            type: t.lastCommunicationType,
            summary: t.lastCommunicationSummary,
          },
        });
      }
    }

    // Sort: Broker-Investor type first, then by AI score
    top10New.sort((a, b) => {
      const aIsBroker = (a.type || "").toLowerCase().includes("broker") ? 0 : 1;
      const bIsBroker = (b.type || "").toLowerCase().includes("broker") ? 0 : 1;
      if (aIsBroker !== bIsBroker) return aIsBroker - bIsBroker;
      return (Number(b.aiScore) || 0) - (Number(a.aiScore) || 0);
    });

    // ─── Pipeline Summary (both Stage AND Status counts) ────────────────
    const stageCounts = await db
      .select({
        stage: contactIntelligenceTable.stage,
        count: sql<number>`COUNT(*)`,
      })
      .from(contactIntelligenceTable)
      .groupBy(contactIntelligenceTable.stage);

    const statusCounts = await db
      .select({
        status: contactsTable.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(contactsTable)
      .groupBy(contactsTable.status);

    // Count overdue (next_action_date < today)
    const [overdueRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(contactIntelligenceTable)
      .where(
        and(
          isNotNull(contactIntelligenceTable.nextActionDate),
          lte(contactIntelligenceTable.nextActionDate, todayStr)
        )
      );

    const pipelineSummary = {
      byStage: Object.fromEntries(stageCounts.map(s => [s.stage || "new", Number(s.count)])),
      byStatus: Object.fromEntries(statusCounts.map(s => [s.status || "New", Number(s.count)])),
      overdue: Number(overdueRow?.count || 0),
    };

    res.json({
      urgentResponses,
      followUps,
      top10New: top10New.slice(0, 10),
      pipelineSummary,
    });
  } catch (err) {
    console.error("[sales-morning] Error:", err);
    res.status(500).json({ error: "Failed to build morning sales data" });
  }
});

// Stage update endpoint
const VALID_STAGES = ["new", "outreach", "engaged", "meeting_scheduled", "negotiating", "closed", "dormant"];

router.post("/contacts/:contactId/stage", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const { stage } = req.body;

  if (!stage || !VALID_STAGES.includes(stage)) {
    res.status(400).json({ error: `Invalid stage. Must be one of: ${VALID_STAGES.join(", ")}` });
    return;
  }

  try {
    const [existing] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    if (existing) {
      await db.update(contactIntelligenceTable)
        .set({ stage, updatedAt: new Date() })
        .where(eq(contactIntelligenceTable.contactId, contactId));
    } else {
      await db.insert(contactIntelligenceTable).values({ contactId, stage });
    }

    res.json({ ok: true, stage });
  } catch (err) {
    console.error("[stage update] Error:", err);
    res.status(500).json({ error: "Failed to update stage" });
  }
});

// Status (temperature) update endpoint
const VALID_STATUSES = ["Hot", "Warm", "Cold", "New"];

router.post("/contacts/:contactId/status", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const { status } = req.body;

  if (!status || !VALID_STATUSES.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` });
    return;
  }

  try {
    await db.update(contactsTable)
      .set({ status })
      .where(eq(contactsTable.id, contactId));
    res.json({ ok: true, status });
  } catch (err) {
    console.error("[status update] Error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Connected call modal -- log outcome + set follow-up
router.post("/contacts/:contactId/call-outcome", async (req, res): Promise<void> => {
  const { contactId } = req.params;
  const { outcomeNotes, nextStep, followUpDate } = req.body;

  try {
    // Update contact_intelligence with next action
    const [existing] = await db.select().from(contactIntelligenceTable)
      .where(eq(contactIntelligenceTable.contactId, contactId)).limit(1);

    const updates: Record<string, any> = {
      nextAction: nextStep || null,
      nextActionDate: followUpDate || null,
      lastCommunicationDate: new Date(),
      lastCommunicationType: "call_outbound",
      lastCommunicationSummary: outcomeNotes || "Connected call",
      updatedAt: new Date(),
    };

    if (existing) {
      await db.update(contactIntelligenceTable).set(updates)
        .where(eq(contactIntelligenceTable.contactId, contactId));
    } else {
      await db.insert(contactIntelligenceTable).values({ contactId, ...updates });
    }

    // Log to communication_log
    const [contact] = await db.select().from(contactsTable).where(eq(contactsTable.id, contactId)).limit(1);
    await db.insert(communicationLogTable).values({
      contactId,
      contactName: contact?.name || "Unknown",
      channel: "call_outbound",
      summary: outcomeNotes || "Connected call",
    });

    // If followUpDate provided, create calendar reminder
    let calendarEventId = null;
    if (followUpDate) {
      try {
        const { createEvent } = await import("../../lib/gcal");
        const followUp = new Date(followUpDate);
        followUp.setHours(9, 0, 0, 0); // Default to 9 AM
        const endTime = new Date(followUp.getTime() + 15 * 60 * 1000); // 15 min reminder
        const result = await createEvent({
          summary: `Follow up: ${contact?.name || "Contact"}`,
          start: followUp.toISOString(),
          end: endTime.toISOString(),
          description: `Next step: ${nextStep || "Follow up"}\n\nCall notes: ${outcomeNotes || "N/A"}`,
        });
        if (result.ok) calendarEventId = result.eventId;
      } catch { /* calendar reminder is best-effort */ }
    }

    res.json({ ok: true, calendarEventId });
  } catch (err) {
    console.error("[call-outcome] Error:", err);
    res.status(500).json({ error: "Failed to log call outcome" });
  }
});

export default router;
```

### Step 2: Register the route

**File: `artifacts/api-server/src/routes/index.ts`** -- Add:

```typescript
import salesMorningRouter from "./tcc/sales-morning";
// ... existing imports ...

router.use(salesMorningRouter);
```

### Step 3: Frontend -- SalesMorning component

**Create NEW file: `artifacts/tcc/src/components/tcc/SalesMorning.tsx`**

```typescript
import { useState, useEffect, useRef } from "react";
import { get, post } from "@/lib/api";
import { C, F, FS, card, btn2, SC } from "./constants";
import { SmsModal } from "./SmsModal";
import type { Contact, CallEntry } from "./types";

interface SalesContact extends Contact {
  aiScore?: string | null;
  aiScoreReason?: string | null;
  stage?: string;
  lastComm?: { channel?: string; summary?: string; loggedAt?: string; date?: string; type?: string };
  nextAction?: string;
  nextActionDate?: string;
}

interface MorningData {
  urgentResponses: SalesContact[];
  followUps: SalesContact[];
  top10New: SalesContact[];
  pipelineSummary: {
    byStatus: Record<string, number>;
    byStage: Record<string, number>;
    overdue: number;
  };
}

interface Props {
  contacts: Contact[];
  calls: CallEntry[];
  demos: number;
  calSide: boolean;
  apiBase: string;
  onAttempt: (contact: { id: string | number; name: string }) => void;
  onConnected: (contactName: string) => void;
  onDemoChange: (delta: number) => void;
  onSwitchToTasks: () => void;
  onBackToSchedule: () => void;
  onCompose?: (contact: Contact) => void;
  onBrief?: (contactId: string) => void;
  onOpenChat?: (contextType: string, contextId: string, contextLabel: string) => void;
  onResearch?: (contactId: string) => void;
}

// Stage = pipeline position
const STAGE_LABELS: Record<string, string> = {
  new: "New", outreach: "Outreach", engaged: "Engaged",
  meeting_scheduled: "Meeting", negotiating: "Negotiating",
  closed: "Closed", dormant: "Dormant",
};

const STAGE_COLORS: Record<string, string> = {
  new: C.blu, outreach: C.amb, engaged: C.grn,
  meeting_scheduled: "#7B1FA2", negotiating: C.red,
  closed: C.grn, dormant: C.mut,
};

// Status = temperature
const STATUS_LABELS: Record<string, string> = { Hot: "Hot", Warm: "Warm", Cold: "Cold", New: "New" };
const STATUS_COLORS: Record<string, string> = { Hot: C.red, Warm: C.amb, Cold: C.blu, New: C.mut };

export function SalesMorning({
  contacts: fallbackContacts, calls, demos, calSide, apiBase,
  onAttempt, onConnected, onDemoChange, onSwitchToTasks, onBackToSchedule,
  onCompose, onBrief, onOpenChat, onResearch,
}: Props) {
  const [morningData, setMorningData] = useState<MorningData | null>(null);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [smsContact, setSmsContact] = useState<Contact | null>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const [connectedCall, setConnectedCall] = useState<SalesContact | null>(null);
  const [callOutcome, setCallOutcome] = useState({ notes: "", nextStep: "", followUpDate: "" });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load morning data
  useEffect(() => {
    get<MorningData>("/sales/morning")
      .then(data => { setMorningData(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!search.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await get<{ contacts: Contact[]; total: number } | Contact[]>(`/contacts?search=${encodeURIComponent(search)}&limit=100`);
        setSearchResults(Array.isArray(data) ? data : data.contacts);
      } catch { /* keep existing */ }
      finally { setSearching(false); }
    }, 300);
  }, [search]);

  const toggleSection = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const handleStageChange = async (contactId: string | number, newStage: string) => {
    try {
      await post(`/contacts/${contactId}/stage`, { stage: newStage });
      const data = await get<MorningData>("/sales/morning");
      setMorningData(data);
    } catch { /* silent fail */ }
  };

  const handleStatusChange = async (contactId: string | number, newStatus: string) => {
    try {
      await post(`/contacts/${contactId}/status`, { status: newStatus });
      const data = await get<MorningData>("/sales/morning");
      setMorningData(data);
    } catch { /* silent fail */ }
  };

  const handleCallOutcomeSubmit = async () => {
    if (!connectedCall) return;
    try {
      await post(`/contacts/${connectedCall.id}/call-outcome`, {
        outcomeNotes: callOutcome.notes,
        nextStep: callOutcome.nextStep,
        followUpDate: callOutcome.followUpDate || null,
      });
      setConnectedCall(null);
      setCallOutcome({ notes: "", nextStep: "", followUpDate: "" });
      // Refresh data
      const data = await get<MorningData>("/sales/morning");
      setMorningData(data);
    } catch { /* silent fail */ }
  };

  const renderContactCard = (c: SalesContact, tier: string) => (
    <div key={`${tier}-${c.id}`} style={{ display: "flex", gap: 12, padding: 14, marginBottom: 6, background: "#FAFAF8", borderRadius: 12, borderLeft: `4px solid ${STAGE_COLORS[c.stage || "new"] || C.blu}`, alignItems: "flex-start" }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>

          {/* AI Score badge */}
          {c.aiScore && (
            <span style={{ fontSize: 10, fontWeight: 700, color: Number(c.aiScore) >= 70 ? C.grn : Number(c.aiScore) >= 40 ? C.amb : C.mut, background: Number(c.aiScore) >= 70 ? C.grnBg : Number(c.aiScore) >= 40 ? C.ambBg : "#F5F5F5", padding: "2px 7px", borderRadius: 4 }}>
              AI: {Number(c.aiScore).toFixed(0)}
            </span>
          )}

          {/* Stage dropdown (pipeline position) */}
          <select
            value={c.stage || "new"}
            onChange={e => handleStageChange(c.id, e.target.value)}
            style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.brd}`, background: C.card, color: STAGE_COLORS[c.stage || "new"] || C.blu, cursor: "pointer", fontFamily: F }}
          >
            {Object.entries(STAGE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>

          {/* Status dropdown (temperature) -- SEPARATE from Stage */}
          <select
            value={c.status || "New"}
            onChange={e => handleStatusChange(c.id, e.target.value)}
            style={{ fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4, border: `1px solid ${C.brd}`, background: C.card, color: STATUS_COLORS[c.status || "New"] || C.mut, cursor: "pointer", fontFamily: F }}
          >
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>

        {c.company && <div style={{ fontSize: 12, color: C.sub }}>{c.company}</div>}
        {c.type && <div style={{ fontSize: 11, color: C.blu, marginTop: 2 }}>{c.type}</div>}

        {/* Tier 3: "Why" reason from AI score */}
        {tier === "top10" && c.aiScoreReason && (
          <div style={{ fontSize: 11, color: C.grn, marginTop: 4, fontStyle: "italic" }}>
            Why: {c.aiScoreReason.split("\n")[0]}
          </div>
        )}

        {/* Last comm info */}
        {c.lastComm && (c.lastComm.summary || c.lastComm.channel) && (
          <div style={{ fontSize: 12, color: C.sub, marginTop: 4, padding: "4px 8px", background: "#F0EFE8", borderRadius: 6 }}>
            {c.lastComm.channel && <span style={{ fontWeight: 600 }}>[{c.lastComm.channel}] </span>}
            {c.lastComm.summary || "No summary"}
            {(c.lastComm.loggedAt || c.lastComm.date) && (
              <span style={{ color: C.mut, marginLeft: 6 }}>
                {new Date(c.lastComm.loggedAt || c.lastComm.date || "").toLocaleDateString()}
              </span>
            )}
          </div>
        )}

        {c.nextAction && (
          <div style={{ fontSize: 12, marginTop: 4 }}>
            <span style={{ fontWeight: 600 }}>Next:</span> {c.nextAction}
            {c.nextActionDate && <span style={{ color: C.mut }}> (due {c.nextActionDate})</span>}
          </div>
        )}

        <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>{c.phone} {c.email ? `| ${c.email}` : ""}</div>
      </div>

      {/* Quick action buttons: Call, Text, Email, Schedule, Brief, Research */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
        {c.phone && <a href={`tel:${c.phone}`} style={{ ...btn2, padding: "6px 10px", fontSize: 10, textDecoration: "none", textAlign: "center" }}>Call</a>}
        {c.phone && <button onClick={() => setSmsContact(c)} style={{ ...btn2, padding: "6px 10px", fontSize: 10, color: C.blu, borderColor: C.blu }}>Text</button>}
        {c.email && onCompose && <button onClick={() => onCompose(c)} style={{ ...btn2, padding: "6px 10px", fontSize: 10, color: C.amb, borderColor: C.amb }}>Email</button>}
        <button onClick={() => setConnectedCall(c)} style={{ ...btn2, padding: "6px 10px", fontSize: 10, color: C.grn, borderColor: C.grn }}>Connected</button>
        {onBrief && <button onClick={() => onBrief(String(c.id))} style={{ ...btn2, padding: "6px 10px", fontSize: 10 }}>Brief</button>}
        {onResearch && <button onClick={() => onResearch(String(c.id))} style={{ ...btn2, padding: "6px 10px", fontSize: 10, color: "#7B1FA2", borderColor: "#7B1FA2" }}>Research</button>}
        <button onClick={() => onAttempt({ id: c.id, name: c.name })} style={{ ...btn2, padding: "6px 10px", fontSize: 10 }}>Log</button>
        {onOpenChat && <button onClick={() => onOpenChat("contact", String(c.id), c.name)} style={{ ...btn2, padding: "6px 10px", fontSize: 10, color: "#7B1FA2", borderColor: "#7B1FA2" }}>AI</button>}
      </div>
    </div>
  );

  return (
    <>
      {smsContact && <SmsModal contact={smsContact} apiBase={apiBase} onClose={() => setSmsContact(null)} />}

      {/* Connected Call Modal -- 3 fields + calendar reminder */}
      {connectedCall && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setConnectedCall(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 28, width: 440, maxWidth: "90vw" }}>
            <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 16px" }}>Connected: {connectedCall.name}</h3>

            {/* Field 1: Outcome notes */}
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Outcome Notes</label>
            <textarea
              value={callOutcome.notes}
              onChange={e => setCallOutcome(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="What happened on the call?"
              style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 8, padding: 10, fontFamily: F, fontSize: 13, minHeight: 70, resize: "vertical", boxSizing: "border-box", marginBottom: 12 }}
            />

            {/* Field 2: Next step */}
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Next Step</label>
            <input
              type="text"
              value={callOutcome.nextStep}
              onChange={e => setCallOutcome(prev => ({ ...prev, nextStep: e.target.value }))}
              placeholder="e.g., Send proposal, Schedule demo..."
              style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 8, padding: 10, fontFamily: F, fontSize: 13, boxSizing: "border-box", marginBottom: 12 }}
            />

            {/* Field 3: Follow-up date picker */}
            <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>Follow-up Date (sets next_action_date + calendar reminder)</label>
            <input
              type="date"
              value={callOutcome.followUpDate}
              onChange={e => setCallOutcome(prev => ({ ...prev, followUpDate: e.target.value }))}
              style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 8, padding: 10, fontFamily: F, fontSize: 13, boxSizing: "border-box", marginBottom: 16 }}
            />

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleCallOutcomeSubmit} style={{ ...btn2, flex: 1, padding: "10px 0", fontSize: 13, color: C.grn, borderColor: C.grn, fontWeight: 700 }}>Save</button>
              <button onClick={() => setConnectedCall(null)} style={{ ...btn2, padding: "10px 16px", fontSize: 13, color: C.mut }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>

        {/* ═══ TOP-3 FOCUS TASKS (above sales tiers) ═══ */}
        <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${C.blu}` }}>
          <h3 style={{ fontFamily: FS, fontSize: 17, margin: "0 0 10px", color: C.blu }}>Top 3 Focus</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Task #1 is ALWAYS "10 Sales Calls" -- clicking routes to Sales Mode */}
            <div
              onClick={() => {/* Already in sales mode */}}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: C.bluBg, borderRadius: 10, cursor: "default" }}
            >
              <span style={{ fontSize: 18, fontWeight: 800, color: C.blu }}>1</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>10 Sales Calls</div>
                <div style={{ fontSize: 11, color: C.sub }}>Progress: {calls.length}/10 calls today</div>
              </div>
            </div>
            {/* Tasks #2 and #3 are placeholders -- wired in TaskView prompt */}
            <div style={{ padding: "10px 14px", background: "#FAFAF8", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.mut }}>2</span>
              <div style={{ fontSize: 13, color: C.mut }}>Next focus task (from TaskView)</div>
            </div>
            <div style={{ padding: "10px 14px", background: "#FAFAF8", borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.mut }}>3</span>
              <div style={{ fontSize: 13, color: C.mut }}>Next focus task (from TaskView)</div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Sales Mode</h3>
            <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, fontWeight: 700 }}>
              <span>Calls: {calls.length}</span>
              {demos > 0 && <span style={{ color: C.blu }}>Demos: {demos}</span>}
              <div style={{ display: "flex", gap: 4 }}>
                {demos > 0 && <button onClick={() => onDemoChange(-1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.brd}`, background: C.card, cursor: "pointer", fontSize: 14, fontWeight: 700 }}>-</button>}
                <button onClick={() => onDemoChange(1)} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${C.grn}`, background: C.grnBg, cursor: "pointer", fontSize: 14, fontWeight: 700, color: C.grn }}>+</button>
              </div>
            </div>
          </div>

          {/* Pipeline summary bar: Hot: N | Warm: N | Engaged: N | Meetings: N | Overdue: N */}
          {morningData?.pipelineSummary && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
              {morningData.pipelineSummary.byStatus.Hot > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: C.red, background: "#FFF0F0", padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.brd}` }}>
                  Hot: {morningData.pipelineSummary.byStatus.Hot}
                </div>
              )}
              {morningData.pipelineSummary.byStatus.Warm > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: C.amb, background: C.ambBg, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.brd}` }}>
                  Warm: {morningData.pipelineSummary.byStatus.Warm}
                </div>
              )}
              {(morningData.pipelineSummary.byStage.engaged || 0) > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: C.grn, background: C.grnBg, padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.brd}` }}>
                  Engaged: {morningData.pipelineSummary.byStage.engaged}
                </div>
              )}
              {(morningData.pipelineSummary.byStage.meeting_scheduled || 0) > 0 && (
                <div style={{ fontSize: 11, fontWeight: 600, color: "#7B1FA2", background: "#F3E5F5", padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.brd}` }}>
                  Meetings: {morningData.pipelineSummary.byStage.meeting_scheduled}
                </div>
              )}
              {morningData.pipelineSummary.overdue > 0 && (
                <div style={{ fontSize: 11, fontWeight: 700, color: C.red, background: "#FFF0F0", padding: "4px 10px", borderRadius: 6, border: `1px solid ${C.red}` }}>
                  Overdue: {morningData.pipelineSummary.overdue} !!!
                </div>
              )}
            </div>
          )}

          {/* Search bar */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search contacts by name, company, phone, email..."
              style={{ width: "100%", border: `1px solid ${C.brd}`, borderRadius: 10, padding: "9px 36px 9px 12px", fontFamily: F, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#FAFAF8" }}
            />
            {searching && <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: C.mut }}>...</span>}
            {search && !searching && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut }}>x</button>}
          </div>
        </div>

        {/* Search results override tiers */}
        {search.trim() ? (
          <div style={{ ...card, marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.mut, marginBottom: 8 }}>
              {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
            </div>
            {searchResults.map(c => renderContactCard(c as SalesContact, "search"))}
          </div>
        ) : loading ? (
          <div style={{ ...card, textAlign: "center", padding: 40, color: C.mut }}>Loading morning sales data...</div>
        ) : (
          <>
            {/* Tier 1: Urgent Responses -- RED header, NO LIMIT */}
            <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${C.red}` }}>
              <div onClick={() => toggleSection("urgent")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: collapsed.urgent ? 0 : 12 }}>
                <h3 style={{ fontFamily: FS, fontSize: 17, margin: 0, color: C.red }}>
                  Urgent Responses ({morningData?.urgentResponses.length || 0})
                </h3>
                <span style={{ fontSize: 12, color: C.mut }}>{collapsed.urgent ? "+" : "-"}</span>
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, display: collapsed.urgent ? "none" : "block" }}>
                Communicated in last 48 hours -- they're waiting on you
              </div>
              {!collapsed.urgent && (morningData?.urgentResponses || []).map(c => renderContactCard(c, "urgent"))}
              {!collapsed.urgent && (morningData?.urgentResponses || []).length === 0 && (
                <div style={{ fontSize: 12, color: C.mut, padding: "10px 0" }}>No urgent responses. Inbox clear.</div>
              )}
            </div>

            {/* Tier 2: Follow-ups -- AMBER header, NO LIMIT */}
            <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${C.amb}` }}>
              <div onClick={() => toggleSection("followups")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: collapsed.followups ? 0 : 12 }}>
                <h3 style={{ fontFamily: FS, fontSize: 17, margin: 0, color: C.amb }}>
                  Follow-ups Due ({morningData?.followUps.length || 0})
                </h3>
                <span style={{ fontSize: 12, color: C.mut }}>{collapsed.followups ? "+" : "-"}</span>
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, display: collapsed.followups ? "none" : "block" }}>
                next_action_date is today or overdue
              </div>
              {!collapsed.followups && (morningData?.followUps || []).map(c => renderContactCard(c, "followups"))}
              {!collapsed.followups && (morningData?.followUps || []).length === 0 && (
                <div style={{ fontSize: 12, color: C.mut, padding: "10px 0" }}>No follow-ups due today.</div>
              )}
            </div>

            {/* Tier 3: Top 10 New -- GREEN header */}
            <div style={{ ...card, marginBottom: 16, borderLeft: `4px solid ${C.grn}` }}>
              <div onClick={() => toggleSection("top10")} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: collapsed.top10 ? 0 : 12 }}>
                <h3 style={{ fontFamily: FS, fontSize: 17, margin: 0, color: C.grn }}>
                  Top 10 to Contact ({morningData?.top10New.length || 0})
                </h3>
                <span style={{ fontSize: 12, color: C.mut }}>{collapsed.top10 ? "+" : "-"}</span>
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, display: collapsed.top10 ? "none" : "block" }}>
                AI-scored, not contacted in 24+ hours. Broker-Investors first. Each shows "Why" from AI scoring.
              </div>
              {!collapsed.top10 && (morningData?.top10New || []).map(c => renderContactCard(c, "top10"))}
              {!collapsed.top10 && (morningData?.top10New || []).length === 0 && (
                <div style={{ fontSize: 12, color: C.mut, padding: "10px 0" }}>No scored contacts available. Run AI scoring first (Prompt 05).</div>
              )}
            </div>
          </>
        )}

        {/* Call log */}
        {calls.length > 0 && (
          <div style={{ ...card, marginBottom: 16, background: C.grnBg }}>
            <h3 style={{ fontFamily: FS, fontSize: 17, margin: "0 0 10px" }}>Call Log ({calls.length})</h3>
            {calls.map((cl, i) => (
              <div key={i} style={{ fontSize: 13, padding: "3px 0", color: C.grn }}>
                {cl.contactName} -- {cl.type} {cl.createdAt ? new Date(cl.createdAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : ""}
              </div>
            ))}
          </div>
        )}

        <button onClick={onSwitchToTasks} style={{ ...btn2, width: "100%", marginBottom: 10 }}>Switch to Tasks</button>
        <button onClick={onBackToSchedule} style={{ ...btn2, width: "100%", marginBottom: 40, color: C.mut }}>Back to Schedule</button>
      </div>
    </>
  );
}
```

### Step 4: Replace SalesView with SalesMorning in App.tsx

**File: `artifacts/tcc/src/App.tsx`**

**4a.** Add the import:
```typescript
import { SalesMorning } from "@/components/tcc/SalesMorning";
```

**4b.** In the Sales View rendering block (look for `// SALES VIEW`), replace `<SalesView ... />` with `<SalesMorning ... />`. Keep all the same props and add the new ones:

```typescript
  // ═══ SALES VIEW ═══
  if (view === "sales") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {sharedHeader}
      {calSide && <CalendarSidebar items={brief?.calendarData || []} onClose={() => setCalSide(false)} />}
      {sharedModals}
      <AttemptModal contact={attempt} onClose={() => setAttempt(null)} onLog={call => setCalls(prev => [...prev, call])} />
      <SalesMorning
        contacts={contacts}
        calls={calls}
        demos={demos}
        calSide={calSide}
        apiBase={`${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`}
        onAttempt={c => setAttempt(c)}
        onConnected={name => handleLogCall(name, "connected")}
        onDemoChange={handleDemoChange}
        onSwitchToTasks={() => persistView("tasks")}
        onBackToSchedule={() => persistView("schedule")}
        onOpenChat={openChatWithContext}
      />
    </div>
  );
```

**Note:** The `onCompose`, `onBrief`, `onResearch`, and `onOpenChat` props are optional and will be wired up in later prompts (05 for brief/research, 03 for chat). The component handles undefined gracefully.

### Step 5: Keep the original SalesView file

**DO NOT DELETE** `artifacts/tcc/src/components/tcc/SalesView.tsx`. It can remain as a fallback. The new `SalesMorning.tsx` is the replacement that gets imported in App.tsx.

## VERIFY BEFORE MOVING ON

1. `GET /api/sales/morning` returns JSON with `urgentResponses`, `followUps`, `top10New`, and `pipelineSummary` (which has `byStatus`, `byStage`, and `overdue` fields)
2. Navigate to Sales view in the app -- Top-3 Focus Tasks section renders at the top with task #1 "10 Sales Calls" showing today's call count
3. Three collapsible tier sections render: Urgent (red), Follow-ups (amber), Top 10 (green)
4. Tier 1 and Tier 2 have NO LIMIT on items (could show 35+ if data exists)
5. Tier 3 contacts each show "Why: [reason]" line from AI score reason
6. Pipeline summary bar shows: Hot: N | Warm: N | Engaged: N | Meetings: N | Overdue: N (with warning style)
7. Each contact card has TWO separate dropdowns: Stage (pipeline) AND Status (temperature)
8. Change a Stage dropdown -- `contact_intelligence.stage` updates to new value (new/outreach/engaged/meeting_scheduled/negotiating/closed/dormant)
9. Change a Status dropdown -- `contacts.status` updates to new value (Hot/Warm/Cold/New)
10. Quick action buttons work: Call (tel: link), Text (SMS modal), Email (compose), Connected (call modal), Brief, Research
11. Connected call modal has 3 fields: outcome notes, next step, follow-up date picker
12. Submit connected call with a follow-up date -- `contact_intelligence.next_action_date` is set AND a Google Calendar reminder is created
13. Search bar still works -- type a name, results appear
14. Call log still appears at the bottom in green
15. All other views (emails, schedule, tasks, chat) still work
