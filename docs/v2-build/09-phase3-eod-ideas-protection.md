# Prompt 09: Phase 3 — Auto-EOD, Ideas Pushback, Morning Protection, Meeting Warning, Check-in Patterns, Spiritual Anchor, Demo Feedback, Ethan Cowork

## CONTEXT

Eight accountability features that turn the Command Center from a dashboard into Tony's operating system. Auto-EOD sends the daily report without Tony having to remember. Ideas pushback forces Tony to justify distractions against the North Star, business plan, and 90-day plan. Morning protection guards his sales hours. Meeting warnings keep him on time. Check-in pattern alerts surface health trends. The spiritual anchor grounds his day. Demo pitch feedback analyzes recordings. Ethan's Cowork setup enables his AI assistant access.

## PREREQUISITES

- Prompts 00-02 completed (communication_log, contact_intelligence, business_context tables exist)
- Prompt 01 completed (Gmail send route works via Gmail API)
- Prompt 08 completed (business_context table populated with 90-day plan and business plan)
- EOD report generation already works (`artifacts/api-server/src/routes/tcc/eod.ts` exists)
- IdeasModal classification flow works (`artifacts/api-server/src/routes/tcc/ideas.ts` exists)
- Calendar data loads into the brief (`artifacts/api-server/src/routes/tcc/brief.ts`)
- Slack integration exists (`artifacts/api-server/src/lib/slack.ts`)
- `daily_suggestions`, `business_context`, `checkins` tables exist (created in Prompt 00 schema)
- Meeting recordings folder: `1g1itXWZj82oudTpMSp96HCoKk79_ZkdX`

## WHAT TO BUILD

### Step 1: Auto-EOD at 4:30 PM Pacific — Server-side guard

**File: `artifacts/api-server/src/routes/tcc/eod.ts`** — Add a new auto-EOD endpoint. The server checks if today's EOD has already been sent (preventing double-send). EOD button is REMOVED from the header. Manual fallback = Tony says "send EOD" in Claude Chat.

Add imports at the top if not already present:
```typescript
import { dailySuggestionsTable, businessContextTable } from "../../lib/schema-v2";
import { getGmail } from "../../lib/google-auth";
```

Add this new route AFTER the existing `router.post("/eod-report", ...)`:

```typescript
router.post("/eod-report/auto", async (req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];

  // Guard: check if EOD was already sent today
  const [existing] = await db.select().from(eodReportsTable).where(eq(eodReportsTable.date, today));
  if (existing && existing.sentAt) {
    res.json({ ok: true, alreadySent: true, message: "EOD already sent today" });
    return;
  }

  try {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    const [calls, demoRows, taskCompletions, workedOnTasks] = await Promise.all([
      db.select().from(callLogTable).where(gte(callLogTable.createdAt, todayDate)),
      db.select().from(demosTable).where(eq(demosTable.scheduledDate, today)),
      db.select().from(taskCompletionsTable).where(gte(taskCompletionsTable.completedAt, todayDate)),
      db.select().from(taskWorkedOnTable).where(gte(taskWorkedOnTable.createdAt, todayDate)),
    ]);

    // Fetch today's emails sent count
    let emailsSent = 0;
    try {
      const emailLogs = await db.select().from(communicationLogTable)
        .where(gte(communicationLogTable.createdAt, todayDate));
      emailsSent = emailLogs.filter(e => e.type === "email" && e.direction === "outbound").length;
    } catch { /* non-critical */ }

    // Fetch ideas submitted today
    let ideasToday: string[] = [];
    try {
      const ideas = await db.select().from(ideasTable).where(gte(ideasTable.createdAt, todayDate));
      ideasToday = ideas.map(i => i.text || "");
    } catch { /* non-critical */ }

    // Fetch meetings from today's calendar (actual events that have passed)
    let meetingsToday: string[] = [];
    try {
      const { listTodayEvents } = await import("../../lib/gcal");
      const allEvents = await listTodayEvents();
      const pastMeetings = allEvents.filter(e => new Date(e.end) < new Date());
      meetingsToday = pastMeetings.map(e => e.summary);
    } catch { /* non-critical */ }

    // Demo feedback: analyze any "FlipIQ Demo" events that passed
    let demoFeedback: string[] = [];
    try {
      const { analyzeDemoRecording } = await import("../../lib/demo-feedback");
      const { listTodayEvents: listEvents } = await import("../../lib/gcal");
      const todayEvents = await listEvents();
      const demoEvents = todayEvents.filter(e =>
        e.summary.toLowerCase().includes("flipiq demo") && new Date(e.end) < new Date()
      );
      for (const demoEvent of demoEvents) {
        const feedback = await analyzeDemoRecording(demoEvent.summary, today);
        if (feedback) demoFeedback.push(feedback);
      }
    } catch { /* non-critical */ }

    // Overrides today: query ideas with status "override" created today
    let overridesToday: string[] = [];
    try {
      const overrides = await db.select().from(ideasTable)
        .where(and(
          gte(ideasTable.createdAt, todayDate),
          eq(ideasTable.status, "override")
        ));
      overridesToday = overrides.map(o => o.text || "");
    } catch { /* non-critical */ }

    // Out-of-sequence detection
    let outOfSequenceItems: string[] = [];
    try {
      const [businessCtx] = await db.select()
        .from(businessContextTable)
        .where(eq(businessContextTable.documentType, "90_day_plan"));

      if (businessCtx) {
        const completedLinear = taskCompletions
          .filter(t => t.source === "linear" || t.category === "linear")
          .map(t => t.taskText || "");

        if (completedLinear.length > 0) {
          const priorities = businessCtx.content || "";
          outOfSequenceItems = completedLinear.filter(task =>
            !priorities.toLowerCase().includes(task.toLowerCase().substring(0, 20))
          );
        }
      }
    } catch { /* non-critical */ }

    // Items without due dates
    let noDueDateItems: string[] = [];
    try {
      const noDueDate = await db.select().from(taskCompletionsTable)
        .where(sql`${taskCompletionsTable.dueDate} IS NULL`);
      noDueDateItems = noDueDate.map(t => t.taskText || "");
    } catch { /* non-critical */ }

    // Worked-on tasks with notes
    const workedOnSummary = workedOnTasks.map(t => `- ${t.taskText}: ${t.note || "no note"}`).join("\n") || "- None";

    // Calculate accountability score (simple heuristic)
    const totalPlanned = 10; // baseline expected daily tasks
    const completionRate = Math.min(100, Math.round(((taskCompletions.length + workedOnTasks.length) / totalPlanned) * 100));

    // ====== TONY'S REPORT ======
    const tonyReportPrompt = `Generate Tony's EOD report for ${today}.

Today's Data:
- Calls made: ${calls.length}
- Demos booked/completed: ${demoRows.length}
- Emails sent: ${emailsSent}
- Tasks completed: ${taskCompletions.length}
- Tasks worked on (with notes):\n${workedOnSummary}
- Ideas submitted: ${ideasToday.length > 0 ? ideasToday.join(", ") : "None"}
- Meetings attended: ${meetingsToday.length}
- Tomorrow's suggested top 3: (infer from today's activity and unfinished tasks)

Format as a professional EOD email for Tony. Include:
1. Quick 2-3 sentence summary
2. Key metrics table
3. Call activity breakdown
4. Tasks completed vs worked on
5. Pattern observations (what went well, what could improve)
6. Tomorrow's top 3 priorities`;

    const tonyReport = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: tonyReportPrompt }],
    });

    const tonyText = tonyReport.content.find(b => b.type === "text");
    const tonyReportText = tonyText?.type === "text" ? tonyText.text : "Report generation failed.";

    // ====== ETHAN'S REPORT ======
    const ethanReportPrompt = `Generate Ethan's EOD report for ${today}. Ethan is Tony's AI assistant/chief of staff.

Tony's Activity Summary:
- Calls: ${calls.length}, Demos: ${demoRows.length}, Emails: ${emailsSent}
- Tasks completed: ${taskCompletions.length}, Worked on: ${workedOnTasks.length}
- Accountability score: ${completionRate}%

Items Without Due Dates (need Ethan to assign):
${noDueDateItems.length > 0 ? noDueDateItems.map(t => `- ${t}`).join("\n") : "- All items have due dates"}

Out-of-Sequence Work (not on 90-day plan):
${outOfSequenceItems.length > 0 ? outOfSequenceItems.map(t => `- ${t}`).join("\n") : "- All work aligned with plan"}

Tony's Overrides Today:
${overridesToday.length > 0 ? overridesToday.map(o => `- ${o}`).join("\n") : "- No overrides today"}

Pitch/Demo Feedback:
${demoFeedback.length > 0 ? demoFeedback.join("\n\n---\n\n") : "- No demos analyzed today"}

Format Ethan's report to include:
1. Tony's activity summary (brief)
2. Items without due dates (list with links if available)
3. Out-of-sequence work alerts
4. Tony's overrides today
5. Pitch/demo feedback if available
6. Accountability score: ${completionRate}%
7. Dynamic action items for Ethan (what Ethan should do tomorrow based on today's data)`;

    const ethanReport = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: ethanReportPrompt }],
    });

    const ethanText = ethanReport.content.find(b => b.type === "text");
    const ethanReportText = ethanText?.type === "text" ? ethanText.text : "Ethan report generation failed.";

    // Send Tony's report via Gmail API
    const gmail = getGmail();

    const tonyEmail = [
      `From: Tony Diaz <tony@flipiq.com>`,
      `To: tony@flipiq.com`,
      `Subject: EOD Report - ${today}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      tonyReportText,
    ].join("\r\n");

    const tonyEncoded = Buffer.from(tonyEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: tonyEncoded },
    });

    // Send Ethan's report via Gmail API
    const ethanEmail = [
      `From: Tony Diaz <tony@flipiq.com>`,
      `To: ethan@flipiq.com`,
      `Subject: Ethan's EOD Brief - ${today}`,
      `Content-Type: text/plain; charset=utf-8`,
      "",
      ethanReportText,
    ].join("\r\n");

    const ethanEncoded = Buffer.from(ethanEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: ethanEncoded },
    });

    // Save to database
    await db.insert(eodReportsTable).values({
      date: today,
      reportText: tonyReportText,
      ethanReportText,
      callsMade: calls.length,
      demosBooked: demoRows.length,
      tasksCompleted: taskCompletions.length,
      emailsSent,
      accountabilityScore: completionRate,
      sentAt: new Date(),
    }).onConflictDoUpdate({
      target: eodReportsTable.date,
      set: { reportText: tonyReportText, ethanReportText, sentAt: new Date() },
    });

    res.json({ ok: true, alreadySent: false });
  } catch (err) {
    req.log.error({ err }, "Auto-EOD failed");
    res.status(500).json({ ok: false, error: "Auto-EOD failed" });
  }
});
```

### Step 2: Auto-EOD client-side timer + remove EOD button from header

**File: `artifacts/tcc/src/App.tsx`**

REMOVE the EOD send button from the header. The EOD is now fully automatic. Manual fallback = Tony says "send EOD" in Claude Chat.

Add a `useEffect` that checks every minute if it's 4:30 PM Pacific:

```typescript
// Auto-EOD at 4:30 PM Pacific — no button needed
useEffect(() => {
  let eodSentToday = false;

  const checkAutoEod = async () => {
    if (eodSentToday) return;

    const now = new Date();
    const pacific = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
    const hour = pacific.getHours();
    const minute = pacific.getMinutes();

    // Trigger at 4:30 PM Pacific (16:30)
    if (hour === 16 && minute >= 30 && minute <= 32) {
      console.log("[auto-eod] 4:30 PM Pacific — triggering auto-EOD");
      try {
        const result = await post<{ ok: boolean; alreadySent: boolean }>("/eod-report/auto", {});
        if (result.alreadySent) {
          console.log("[auto-eod] EOD already sent today");
        } else {
          console.log("[auto-eod] EOD sent successfully");
        }
        eodSentToday = true;
      } catch {
        console.warn("[auto-eod] Auto-EOD failed, Tony can say 'send EOD' in Claude Chat");
      }
    }

    // If it's past 4:30 and app just opened (retroactive send)
    if (hour >= 17 && !eodSentToday) {
      console.log("[auto-eod] App opened after 4:30 PM — sending retroactive EOD");
      try {
        const result = await post<{ ok: boolean; alreadySent: boolean }>("/eod-report/auto", {});
        eodSentToday = true;
        if (!result.alreadySent) {
          console.log("[auto-eod] Retroactive EOD sent successfully");
        }
      } catch {
        console.warn("[auto-eod] Retroactive EOD failed");
      }
    }
  };

  // Check immediately on load (handles retroactive send)
  checkAutoEod();

  const interval = setInterval(checkAutoEod, 60_000);
  return () => clearInterval(interval);
}, []);
```

### Step 3: Ideas pushback against North Star + business plan + 90-day plan

**File: `artifacts/api-server/src/routes/tcc/ideas.ts`**

In the classification route, after the AI returns the initial classification, add pushback logic. The pushback checks against ALL three documents in the `business_context` table.

Add imports:
```typescript
import { businessContextTable } from "../../lib/schema-v2";
```

After the AI classification, add:

```typescript
let pushback: { message: string; priorityRank: number | null; action: "park" | "override" | "escalate" | null } | null = null;

try {
  // Fetch all business context documents
  const contextDocs = await db.select().from(businessContextTable);
  const northStar = contextDocs.find(d => d.documentType === "north_star")?.content || "";
  const businessPlan = contextDocs.find(d => d.documentType === "business_plan")?.content || "";
  const ninetyDayPlan = contextDocs.find(d => d.documentType === "90_day_plan")?.content || "";

  const combinedContext = [
    northStar ? `NORTH STAR:\n${northStar.substring(0, 1000)}` : "",
    businessPlan ? `BUSINESS PLAN:\n${businessPlan.substring(0, 2000)}` : "",
    ninetyDayPlan ? `90-DAY PLAN:\n${ninetyDayPlan.substring(0, 2000)}` : "",
  ].filter(Boolean).join("\n\n");

  if (combinedContext) {
    // Check if this is a tech bug (auto-route to engineering)
    const isTechBug = classification.category === "tech_bug" || text.toLowerCase().includes("bug");

    if (isTechBug) {
      // Auto-post to Slack #engineering
      pushback = {
        message: "Tech bug detected. Auto-posting to #engineering with severity + priority recommendation.",
        priorityRank: null,
        action: null,
      };

      // Post to Slack (fire and forget)
      const { postToSlack } = await import("../../lib/slack");
      postToSlack({
        channel: "#engineering",
        text: `*Bug Report (auto-filed from TCC)*\n\n> ${text}\n\n*Severity:* ${classification.urgency || "Unknown"}\n*Priority Recommendation:* ${classification.urgency === "Now" ? "P1" : classification.urgency === "This Week" ? "P2" : "P3"}`,
      }).catch(() => {});
    } else {
      const pushbackCheck = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `Given these business priorities:\n${combinedContext}\n\nA new idea was submitted: "${text}"\n\nDoes this conflict with or distract from current priorities? If yes, estimate what priority rank (1-100) this would be on the 90-day plan. Is this unreasonable enough to park and escalate to Ethan?\n\nRespond as JSON: { "conflicts": true/false, "rank": number|null, "reason": "brief explanation", "unreasonable": true/false }`,
        }],
      });

      const pushbackText = pushbackCheck.content.find(b => b.type === "text");
      if (pushbackText?.type === "text") {
        try {
          const parsed = JSON.parse(pushbackText.text);
          if (parsed.unreasonable) {
            pushback = {
              message: "I'm parking this and booking a meeting with Ethan to discuss.",
              priorityRank: parsed.rank,
              action: "escalate",
            };
          } else if (parsed.conflicts && parsed.rank && parsed.rank > 10) {
            pushback = {
              message: `This is #${parsed.rank} on your 90-day plan. Convince me why it should jump to #1.`,
              priorityRank: parsed.rank,
              action: "park",
            };
          }
        } catch { /* ignore parse errors */ }
      }
    }
  }
} catch { /* non-critical */ }

res.json({
  ok: true,
  classification: { ...classification, pushback },
});
```

### Step 4: Ideas pushback UI + override/park/escalate flow

**File: `artifacts/tcc/src/components/tcc/IdeasModal.tsx`**

Add pushback state and UI. When Tony overrides, post to Slack #leadership and notify Ethan. When unreasonable, auto-park and book meeting.

```typescript
const [pushback, setPushback] = useState<{
  message: string; priorityRank: number | null; action: "park" | "override" | "escalate" | null;
} | null>(null);
const [override, setOverride] = useState<{ justification: string } | null>(null);
```

In the classify handler:
```typescript
if (res.classification.pushback) {
  setPushback(res.classification.pushback);
}
```

In the review step JSX, before the save button:

```typescript
{pushback && pushback.action === "escalate" && (
  <div style={{ padding: 16, background: C.redBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.red}` }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 8 }}>Scope Check</div>
    <div style={{ fontSize: 13, color: C.tx, marginBottom: 12 }}>{pushback.message}</div>
    <button
      onClick={async () => {
        setStep("saving");
        try {
          await post("/ideas", { text, category: finalCat, urgency: "Someday", status: "parked_escalated" });
          await post("/ideas/escalate-to-ethan", { text }).catch(() => {});
          onSave({ id: Date.now().toString(), text, category: finalCat, urgency: "Someday" });
          handleClose();
        } catch { setError("Failed to park idea"); setStep("review"); }
      }}
      style={{ ...btn2, width: "100%", color: C.red, borderColor: C.red }}
    >
      OK, Park It
    </button>
  </div>
)}

{pushback && pushback.action === "park" && !override && (
  <div style={{ padding: 16, background: C.ambBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.amb}` }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: C.amb, marginBottom: 8 }}>Pushback</div>
    <div style={{ fontSize: 13, color: C.tx, marginBottom: 12 }}>{pushback.message}</div>
    <div style={{ display: "flex", gap: 8 }}>
      <button
        onClick={async () => {
          setStep("saving");
          try {
            await post("/ideas", { text, category: finalCat, urgency: "Someday", status: "parked" });
            onSave({ id: Date.now().toString(), text, category: finalCat, urgency: "Someday" });
            handleClose();
          } catch { setError("Failed to park idea"); setStep("review"); }
        }}
        style={{ ...btn2, flex: 1, color: C.amb, borderColor: C.amb }}
      >
        Park It
      </button>
      <button
        onClick={() => { setOverride({ justification: "" }); setPushback(null); }}
        style={{ ...btn1, flex: 1, background: C.red }}
      >
        Override — Do It Anyway
      </button>
    </div>
  </div>
)}

{override && (
  <div style={{ padding: 16, background: C.redBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.red}` }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: C.red, marginBottom: 8 }}>
      Why should this jump the queue?
    </div>
    <textarea
      value={override.justification}
      onChange={e => setOverride({ justification: e.target.value })}
      placeholder="Explain why this is urgent enough to override the plan..."
      style={{ ...inp, minHeight: 60, resize: "vertical", marginBottom: 8 }}
    />
    <button
      onClick={async () => {
        setStep("saving");
        try {
          await post("/ideas", { text, category: finalCat, urgency: finalUrg, status: "override", overrideJustification: override.justification });
          // Post override to Slack #leadership + notify Ethan
          await post("/ideas/notify-override", { text, justification: override.justification }).catch(() => {});
          onSave({ id: Date.now().toString(), text, category: finalCat, urgency: finalUrg });
          handleClose();
        } catch { setError("Failed to save idea"); setStep("review"); }
      }}
      disabled={!override.justification.trim()}
      style={{ ...btn1, width: "100%", opacity: override.justification.trim() ? 1 : 0.4 }}
    >
      Confirm Override + Notify Leadership
    </button>
  </div>
)}
```

### Step 5: Ideas override + escalation server routes

**File: `artifacts/api-server/src/routes/tcc/ideas.ts`**

```typescript
router.post("/ideas/notify-override", async (req, res): Promise<void> => {
  const { text, justification } = req.body;
  try {
    const { postToSlack } = await import("../../lib/slack");
    await postToSlack({
      channel: "#leadership",
      text: `*Priority Override Alert*\n\nTony overrode the 90-day plan to prioritize:\n> ${text}\n\n*Justification:* ${justification || "No justification provided"}`,
    });
    // Also notify Ethan directly
    await postToSlack({
      channel: "@ethan",
      text: `Tony overrode the plan. New priority: "${text}". Justification: ${justification || "None"}`,
    }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    console.warn("[ideas] Override notification failed:", err);
    res.json({ ok: true, slackFailed: true });
  }
});

router.post("/ideas/escalate-to-ethan", async (req, res): Promise<void> => {
  const { text, rank, reasoning } = req.body;
  try {
    const { postToSlack } = await import("../../lib/slack");
    await postToSlack({
      channel: "@ethan",
      text: `*Idea Parked + Meeting Requested*\n\nTony submitted an idea that was flagged as out-of-scope and auto-parked:\n> ${text}\n\nPlease schedule a meeting to discuss if this should be prioritized.`,
    });

    // When escalating to Ethan, ALSO create a calendar event:
    try {
      const { createEvent } = await import("../../lib/gcal");

      // Helper: find next available afternoon slot (2 PM)
      const nextSlot = new Date();
      nextSlot.setDate(nextSlot.getDate() + 1); // tomorrow
      nextSlot.setHours(14, 0, 0, 0); // 2 PM
      // Skip weekends
      if (nextSlot.getDay() === 0) nextSlot.setDate(nextSlot.getDate() + 1);
      if (nextSlot.getDay() === 6) nextSlot.setDate(nextSlot.getDate() + 2);

      const endSlot = new Date(nextSlot.getTime() + 30 * 60 * 1000); // 30 minutes

      await createEvent({
        summary: `Review plan change with Ethan — "${(text || "").substring(0, 50)}"`,
        start: nextSlot.toISOString(),
        end: endSlot.toISOString(),
        attendees: ["ethan@flipiq.com"],
        description: `Tony submitted: "${text}"\nAI priority: #${rank || "unknown"}\nTony's reasoning: "${reasoning || "Auto-parked, no justification"}"`,
      });
    } catch (calErr) {
      console.warn("[ideas] Calendar event creation failed:", calErr);
    }

    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: true, slackFailed: true });
  }
});
```

### Step 6: Morning protection + Scope gatekeeper

**File: `artifacts/tcc/src/App.tsx`**

Tony's scope: Sales > Ramy support > everything else pushed back. Mornings before noon are protected for sales calls.

Add state:
```typescript
const [scopeWarn, setScopeWarn] = useState<{
  message: string;
  type: "morning" | "scope";
  onOverride: () => void;
  onAccept: () => void;
} | null>(null);
```

Add helper functions:
```typescript
// Morning protection: block non-sales scheduling before noon Pacific
const checkMorningProtection = (startTime: string): boolean => {
  const start = new Date(startTime);
  const pacific = new Date(start.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return pacific.getHours() < 12;
};

// Scope gatekeeper: Sales > Ramy support > everything else
const checkScopeGuard = (taskDescription: string): boolean => {
  const lower = taskDescription.toLowerCase();
  const isSales = lower.includes("sales") || lower.includes("call") || lower.includes("demo") || lower.includes("prospect") || lower.includes("pipeline");
  const isRamy = lower.includes("ramy") || lower.includes("support");
  return !isSales && !isRamy; // returns true if OUT of scope
};
```

Add the scope warning banner JSX (dismissible banner at top, not modal):

```typescript
{scopeWarn && (
  <div style={{
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 10001,
    background: scopeWarn.type === "morning" ? C.ambBg : C.redBg,
    borderBottom: `2px solid ${scopeWarn.type === "morning" ? C.amb : C.red}`,
    padding: "14px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    animation: "slideDown 0.3s ease-out",
  }}>
    <div style={{ fontSize: 14, color: C.tx, flex: 1 }}>
      {scopeWarn.message}
    </div>
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      <button onClick={() => { scopeWarn.onAccept(); setScopeWarn(null); }}
        style={{ ...btn1, padding: "6px 14px", fontSize: 12, background: C.amb }}>
        {scopeWarn.type === "morning" ? "Move to Afternoon" : "Delegate / Park"}
      </button>
      <button onClick={() => { scopeWarn.onOverride(); setScopeWarn(null); }}
        style={{ ...btn2, padding: "6px 14px", fontSize: 12 }}>
        Override
      </button>
    </div>
  </div>
)}
```

Wire these checks into any meeting creation or task scheduling flow. When a morning slot is chosen: "Mornings are protected for sales calls. Move to afternoon?" When a task is outside scope: "This isn't in your scope. Delegate to Ethan or park it?" On override, notify Ethan.

### Step 7: Meeting 5-minute warning (dismissible banner)

**File: `artifacts/tcc/src/App.tsx`**

Add state:
```typescript
const [meetingWarning, setMeetingWarning] = useState<{
  name: string;
  startTime: string;
  attendeeBrief?: string;
  joinUrl?: string;
} | null>(null);
const [dismissedMeetings, setDismissedMeetings] = useState<Set<string>>(new Set());
```

Add `useEffect` that checks calendar items every minute:

```typescript
useEffect(() => {
  if (!brief?.calendarData) return;

  const checkMeetings = () => {
    const now = new Date();

    for (const item of brief.calendarData) {
      if (!item.real) continue;

      const match = item.t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (!match) continue;

      let hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const ampm = match[3]?.toUpperCase();
      if (ampm === "PM" && hours < 12) hours += 12;
      if (ampm === "AM" && hours === 12) hours = 0;

      const meetingTime = new Date();
      meetingTime.setHours(hours, minutes, 0, 0);

      const diff = meetingTime.getTime() - now.getTime();
      const meetingKey = `${item.n}-${item.t}`;

      if (diff > 0 && diff <= 5 * 60 * 1000 && !dismissedMeetings.has(meetingKey)) {
        setMeetingWarning({
          name: item.n,
          startTime: item.t,
          attendeeBrief: item.note || undefined,
          joinUrl: item.loc?.startsWith("http") ? item.loc : undefined,
        });
        break;
      }
    }
  };

  checkMeetings();
  const interval = setInterval(checkMeetings, 60_000);
  return () => clearInterval(interval);
}, [brief?.calendarData, dismissedMeetings]);
```

Render as a dismissible banner at top (not modal). Auto-dismiss after 15 seconds:

```typescript
{meetingWarning && (
  <div style={{
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 10002,
    background: C.bluBg, borderBottom: `2px solid ${C.blu}`,
    padding: "14px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
    animation: "slideDown 0.3s ease-out",
  }}>
    <div style={{ flex: 1 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.blu, textTransform: "uppercase" }}>
        Meeting in 5 minutes
      </span>
      <span style={{ fontFamily: FS, fontSize: 16, marginLeft: 12 }}>{meetingWarning.name}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: C.blu, marginLeft: 8 }}>{meetingWarning.startTime}</span>
      {meetingWarning.attendeeBrief && (
        <span style={{ fontSize: 12, color: C.sub, marginLeft: 12 }}>{meetingWarning.attendeeBrief.substring(0, 100)}</span>
      )}
    </div>
    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
      {meetingWarning.joinUrl && (
        <a href={meetingWarning.joinUrl} target="_blank" rel="noopener noreferrer"
          style={{ ...btn1, padding: "6px 14px", fontSize: 12, textDecoration: "none" }}>
          Join
        </a>
      )}
      <button onClick={() => {
        const key = `${meetingWarning.name}-${meetingWarning.startTime}`;
        setDismissedMeetings(prev => new Set([...prev, key]));
        setMeetingWarning(null);
      }} style={{ ...btn2, padding: "6px 14px", fontSize: 12 }}>
        Dismiss
      </button>
    </div>
  </div>
)}
```

Add auto-dismiss after 15 seconds:
```typescript
useEffect(() => {
  if (!meetingWarning) return;
  const timeout = setTimeout(() => {
    const key = `${meetingWarning.name}-${meetingWarning.startTime}`;
    setDismissedMeetings(prev => new Set([...prev, key]));
    setMeetingWarning(null);
  }, 15_000);
  return () => clearTimeout(timeout);
}, [meetingWarning]);
```

### Step 8: Check-in pattern alerts (Story 1.2)

**File: `artifacts/api-server/src/routes/tcc/checkin.ts`**

After saving the check-in, query the last 7 days and return pattern alerts.

```typescript
// After db.insert(checkinsTable)... add:

// Pattern detection: query last 7 days
const sevenDaysAgo = new Date();
sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

const recentCheckins = await db.select().from(checkinsTable)
  .where(gte(checkinsTable.createdAt, sevenDaysAgo));

const alerts: string[] = [];

// Workout missed 3+ days
const workoutDays = recentCheckins.filter(c => c.workout).length;
if (recentCheckins.length >= 3 && workoutDays < recentCheckins.length - 2) {
  alerts.push(`Workout missed ${recentCheckins.length - workoutDays} of the last ${recentCheckins.length} days.`);
}

// Bedtime past 11 PM 2+ nights
const lateBedtimes = recentCheckins.filter(c => {
  if (!c.bed) return false;
  const match = c.bed.match(/(\d+):?(\d*)\s*(am|pm)?/i);
  if (!match) return false;
  let h = parseInt(match[1], 10);
  const ampm = match[3]?.toLowerCase();
  if (ampm === "pm" && h < 12) h += 12;
  if (ampm === "am" && h === 12) h = 0;
  return h >= 23 || h < 5; // 11 PM or later (or early morning = very late)
}).length;
if (lateBedtimes >= 2) {
  alerts.push(`Late bedtime (past 11 PM) ${lateBedtimes} of the last ${recentCheckins.length} nights.`);
}

// Bible missed 2+ days
const bibleDays = recentCheckins.filter(c => c.bible).length;
if (recentCheckins.length >= 2 && bibleDays < recentCheckins.length - 1) {
  alerts.push(`Bible reading missed ${recentCheckins.length - bibleDays} of the last ${recentCheckins.length} days.`);
}

// Sleep under 6h for 3+ of 7 days
const lowSleepDays = recentCheckins.filter(c => {
  if (!c.sleep) return false;
  const hours = parseFloat(c.sleep);
  return !isNaN(hours) && hours < 6;
}).length;
if (lowSleepDays >= 3) {
  alerts.push(`Sleep under 6 hours ${lowSleepDays} of the last ${recentCheckins.length} days.`);
}

// Include scripture if any alerts
const scripture = alerts.length > 0
  ? "\"Do you not know that your bodies are temples of the Holy Spirit?\" — 1 Corinthians 6:19"
  : null;

res.json({ ok: true, alerts, scripture });
```

**File: `artifacts/tcc/src/components/tcc/CheckinGate.tsx`** — After the check-in submits successfully, show alerts:

```typescript
// After successful checkin submission, if alerts come back:
{checkinAlerts.length > 0 && (
  <div style={{ padding: 16, background: C.ambBg, borderRadius: 10, marginBottom: 14, border: `1px solid ${C.amb}` }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: C.amb, marginBottom: 8 }}>Pattern Alerts (Last 7 Days)</div>
    {checkinAlerts.map((a, i) => (
      <div key={i} style={{ fontSize: 13, color: C.tx, marginBottom: 4 }}>- {a}</div>
    ))}
    {checkinScripture && (
      <div style={{ fontSize: 12, fontStyle: "italic", color: C.sub, marginTop: 10 }}>{checkinScripture}</div>
    )}
    <button onClick={() => setCheckinAlerts([])} style={{ ...btn2, marginTop: 10, width: "100%", padding: 8 }}>
      Dismiss
    </button>
  </div>
)}
```

### Step 9: Morning spiritual anchor (Story 1.6)

**File: `artifacts/api-server/src/routes/tcc/checkin.ts`** — Add a new endpoint that generates the spiritual message:

```typescript
router.get("/checkin/spiritual-anchor", async (_req, res): Promise<void> => {
  try {
    // Get yesterday's check-in for performance context
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [yesterdayCheckin] = await db.select().from(checkinsTable)
      .where(gte(checkinsTable.createdAt, yesterday))
      .limit(1);

    const yesterdayContext = yesterdayCheckin
      ? `Yesterday: workout=${yesterdayCheckin.workout}, bible=${yesterdayCheckin.bible}, sleep=${yesterdayCheckin.sleep}h, mood=${yesterdayCheckin.mood}`
      : "No check-in data from yesterday.";

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{
        role: "user",
        content: `Generate a short (3-4 sentences) morning spiritual anchor message for Tony, a Christian CEO. Draw from scripture and apply it to his day. Yesterday's performance: ${yesterdayContext}. Be encouraging but honest. Include one specific Bible verse.`,
      }],
    });

    const textBlock = message.content.find(b => b.type === "text");
    res.json({ ok: true, message: textBlock?.type === "text" ? textBlock.text : "" });
  } catch (err) {
    res.json({ ok: true, message: "" }); // Graceful fallback
  }
});
```

**File: `artifacts/tcc/src/components/tcc/CheckinGate.tsx`** — After check-in saves, fetch and display the spiritual anchor. It is NOT dismissable — stays until Tony clicks "Start My Day":

```typescript
{spiritualAnchor && (
  <div style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 20000,
    display: "flex", alignItems: "center", justifyContent: "center",
  }}>
    <div style={{ background: C.card, borderRadius: 16, padding: 32, maxWidth: 500, textAlign: "center" }}>
      <div style={{ fontSize: 24, marginBottom: 16 }}>Morning Anchor</div>
      <div style={{ fontSize: 15, lineHeight: 1.8, color: C.tx, marginBottom: 24, whiteSpace: "pre-wrap" }}>
        {spiritualAnchor}
      </div>
      <button
        onClick={() => { setSpiritualAnchor(null); onCheckinComplete(); }}
        style={{ ...btn1, padding: "14px 32px", fontSize: 16 }}
      >
        Start My Day
      </button>
    </div>
  </div>
)}
```

### Step 10: Demo pitch AI feedback (Story 10.3)

**Create NEW file: `artifacts/api-server/src/lib/demo-feedback.ts`**

After "FlipIQ Demo" calendar events pass, scan the recordings folder for matching recordings. Claude analyzes and sends feedback in Ethan's EOD report.

```typescript
import { searchFiles } from "./google-drive";
import Anthropic from "@anthropic-ai/sdk";

const RECORDINGS_FOLDER_ID = process.env.MEETING_RECORDINGS_FOLDER_ID || "1g1itXWZj82oudTpMSp96HCoKk79_ZkdX";

const anthropic = new Anthropic();

/**
 * Scan for demo recordings matching a calendar event and generate AI feedback.
 * Returns the feedback text or null if no recording found.
 */
export async function analyzeDemoRecording(eventName: string, eventDate: string): Promise<string | null> {
  try {
    // Search for recordings matching the event name or date
    const recordings = await searchFiles({
      folderId: RECORDINGS_FOLDER_ID,
      nameContains: eventName.replace("FlipIQ Demo", "").trim() || eventDate,
      maxResults: 5,
    });

    if (recordings.length === 0) {
      console.log(`[demo-feedback] No recording found for "${eventName}" on ${eventDate}`);
      return null;
    }

    // Use the most recent matching recording
    const recording = recordings[0];
    console.log(`[demo-feedback] Found recording: ${recording.name}`);

    // If a transcript/recording exists, download and send the CONTENT to Claude for analysis
    // Don't just analyze metadata — analyze the actual conversation text
    // Extract: talk-to-listen ratio, questions asked count, prospect engagement signals, objections raised
    // Save analysis to contact_intelligence.personality_notes and communication_log
    let transcriptContent = "";
    try {
      const { getDrive } = await import("./google-auth");
      const drive = getDrive();
      const exported = await drive.files.export({
        fileId: recording.id,
        mimeType: "text/plain",
      });
      transcriptContent = typeof exported.data === "string" ? exported.data : JSON.stringify(exported.data);
    } catch {
      // If transcript export fails, fall back to metadata-only analysis
      console.log(`[demo-feedback] Could not export transcript, using metadata-only analysis`);
    }
    const feedback = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: `A FlipIQ demo was conducted: "${eventName}" on ${eventDate}. A recording exists: "${recording.name}".
${transcriptContent ? `\nTRANSCRIPT CONTENT:\n${transcriptContent.substring(0, 8000)}` : "(No transcript available — analyze based on metadata only.)"}

Generate coaching feedback for Tony covering:
1. Talk-to-listen ratio (aim for 60/40 prospect talking) ${transcriptContent ? "— compute from the transcript" : ""}
2. Questions asked count ${transcriptContent ? "— count from transcript" : ""}
3. Prospect engagement signals ${transcriptContent ? "— identify from transcript" : ""}
4. Objections raised ${transcriptContent ? "— extract from transcript" : ""}
5. Follow-up timing recommendation

Keep it concise and actionable.`,
      }],
    });

    const textBlock = feedback.content.find(b => b.type === "text");
    const analysisText = textBlock?.type === "text" ? textBlock.text : null;

    // Save analysis to communication_log for the contact
    if (analysisText) {
      try {
        const { db } = await import("@workspace/db");
        const { communicationLogTable } = await import("./schema-v2");
        await db.insert(communicationLogTable).values({
          contactName: eventName.replace("FlipIQ Demo", "").trim() || "Demo participant",
          channel: "meeting",
          direction: "outbound",
          subject: eventName,
          summary: analysisText.substring(0, 300),
          fullContent: analysisText,
        });
      } catch { /* non-critical */ }
    }

    return analysisText;
  } catch (err) {
    console.warn("[demo-feedback] Analysis failed:", err);
    return null;
  }
}
```

Wire this into the EOD generation (Step 1) by calling `analyzeDemoRecording` for any "FlipIQ Demo" events from today and including the result in Ethan's report.

### Step 11: Ethan's Cowork setup (Updated 12.1)

**Create NEW file: `artifacts/api-server/src/docs/ethan-cowork-setup.md`** (reference doc, not code)

This documents how to set up Ethan's Cowork project. Ethan accesses TCC through Claude Cowork (NOT Claude Project).

**Cowork Project Configuration:**

1. **Create a new Cowork project** named "FlipIQ Command Center - Ethan"

2. **Brain/Instructions** — The Cowork brain must match the TCC app's instructions. Include:
   ```
   You are Ethan, Tony Diaz's AI chief of staff for FlipIQ.

   SCOPE PRIORITIES (same as TCC):
   1. Sales (highest priority)
   2. Ramy support
   3. Everything else (push back or park)

   PRIORITIZATION LOGIC:
   - Classify all ideas against North Star + business plan + 90-day plan
   - If conflicts: push back with priority rank
   - If Tony overrides: post to Slack #leadership
   - If unreasonable: park and schedule meeting

   DATA ACCESS:
   - READ: Supabase (all tables), Google Drive (FlipIQ Command Center folder)
   - WRITE: Supabase (tasks, contacts, communication_log), Google Calendar

   DATA FLOW:
   - Ethan's changes go: Cowork -> Supabase -> Google Sheet (one-way sync)
   - Ethan does NOT edit Google Sheets directly
   - All task updates, contact changes, and notes flow through Supabase

   DAILY RESPONSIBILITIES:
   - Review Tony's EOD report
   - Act on dynamic action items from the EOD
   - Ensure all tasks have due dates
   - Flag out-of-sequence work
   - Maintain accountability score tracking
   ```

3. **Connect MCP servers:**
   - Supabase MCP (read + write access to the TCC database)
   - Google Drive MCP (read access to FlipIQ Command Center folder)
   - Google Calendar MCP (write access for scheduling)

4. **Data flow verification:**
   - Ethan creates a task in Cowork -> Verify it appears in Supabase `tasks` table
   - Wait for sheets-sync cycle (5 min) -> Verify task appears in Google Sheet
   - Confirm Sheet edits do NOT flow back to Supabase (one-way only)

### Step 12: Add animations to index.html

**File: `artifacts/tcc/index.html`** — Add to the existing `<style>` tag:

```html
@keyframes slideDown {
  from { transform: translateY(-100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes slideIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
```

## VERIFY BEFORE MOVING ON

1. **Auto-EOD:** Temporarily change the time check to 1 minute from now. Verify TWO separate emails are sent: Tony's report (to tony@flipiq.com) and Ethan's report (to ethan@flipiq.com). Ethan's includes: activity summary, items without due dates, out-of-sequence work, accountability score, dynamic action items. Calling it twice returns `alreadySent: true`.
2. **Retroactive EOD:** Close the app. Reopen after 4:30 PM Pacific. EOD sends retroactively.
3. **EOD button removed:** Confirm the header no longer has an EOD send button.
4. **Ideas pushback (aligned idea):** Submit an idea that matches the 90-day plan (e.g., "Improve sales pipeline tracking"). No pushback appears.
5. **Ideas pushback (conflicting idea):** Submit "Build a mobile app". Pushback appears: "This is #X on your 90-day plan. Convince me why it should jump to #1." Click "Park It" — saves with status "parked".
6. **Ideas override:** On a conflicting idea, click "Override". Justification box appears. Submit — posts to Slack #leadership and notifies Ethan.
7. **Ideas escalation (unreasonable):** Submit something wildly off-plan. System auto-parks and says "I'm parking this and booking a meeting with Ethan."
8. **Tech bug auto-route:** Submit an idea categorized as tech bug. Verify it auto-posts to Slack #engineering with severity + priority.
9. **Morning protection:** Attempt to schedule a meeting at 9 AM. Banner appears: "Mornings are protected for sales calls. Move to afternoon?" Override notifies Ethan.
10. **Scope gatekeeper:** Try to work on a non-sales, non-Ramy task. Banner: "This isn't in your scope. Delegate to Ethan or park it?"
11. **Meeting 5-min warning:** Add a calendar event 5 minutes from now. Dismissible banner slides down from top with meeting name, time, attendee brief, and "Join" button (if video link exists). Auto-dismisses after 15 seconds.
12. **Check-in pattern alerts:** Complete 7 days of check-ins with 3+ missed workouts. After today's check-in, alert appears: "Workout missed X of Y days." Scripture quote: "The body is the temple." Dismissible.
13. **Morning spiritual anchor:** After check-in saves, a full-screen overlay shows AI-generated spiritual message. Cannot be dismissed except by clicking "Start My Day."
14. **Demo feedback:** Create a "FlipIQ Demo" calendar event for yesterday. Place a file in the recordings folder. Run EOD generation. Ethan's report includes pitch feedback section.
15. **Ethan Cowork:** Follow the setup doc. Verify Ethan can read/write Supabase through Cowork. Verify changes flow: Cowork -> Supabase -> Google Sheet. Verify Sheet edits do NOT flow back.
