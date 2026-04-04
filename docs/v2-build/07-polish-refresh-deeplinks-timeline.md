# Prompt 07: Polish — Auto-Refresh, Deep Links, Schedule Timeline, Print View

## CONTEXT

Quality-of-life polish features that make the Command Center feel like a living dashboard: background auto-refresh so Tony never sees stale data, separate email polling on a faster cadence, deep links so he can jump to the source of any item in one click, a timeline indicator in the schedule view, a manual refresh button, and a printable daily sheet he can carry into meetings.

## PREREQUISITES

- Prompts 00-02 completed (brief data loads, EmailsView, ScheduleView, SalesView all working)
- Gmail, Calendar, Slack, and Linear data flowing into the brief

## WHAT TO BUILD

### Step 1: Auto-refresh brief data every 15 minutes

**File: `artifacts/tcc/src/App.tsx`**

Add a new `useEffect` after the initial data load effect. This must NOT reset the current view or scroll position — it only updates the `brief` state in the background.

Find the existing `useEffect` that fetches brief data on mount (the one calling `get<DailyBrief>("/brief/today")`). After that effect, add:

```typescript
// Auto-refresh brief data every 15 minutes (background, no UI disruption)
useEffect(() => {
  // Only refresh after initial load is complete
  if (loading) return;

  const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

  const refreshBrief = async () => {
    try {
      const freshBrief = await get<DailyBrief>("/brief/today");
      setBrief(freshBrief);
      setLastRefresh(new Date());
      // Do NOT call setLoading, setView, or any scroll-related state
      console.log("[auto-refresh] Brief data refreshed at", new Date().toLocaleTimeString());
    } catch {
      // Silent fail — stale data is better than no data
      console.warn("[auto-refresh] Brief refresh failed, keeping current data");
    }
  };

  const interval = setInterval(refreshBrief, REFRESH_INTERVAL);
  return () => clearInterval(interval);
}, [loading]);
```

### Step 2: Separate email polling every 5 minutes

**File: `artifacts/tcc/src/App.tsx`** — Add another `useEffect` for email-specific polling:

```typescript
// Email polling every 5 minutes (faster cadence than full brief refresh)
useEffect(() => {
  if (loading) return;

  const EMAIL_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

  const pollEmails = async () => {
    try {
      const result = await get<{ emails: EmailItem[] }>("/emails/poll");
      if (result.emails && brief) {
        // Update just the email portion of the brief without touching other data
        setBrief(prev => prev ? { ...prev, emailsImportant: result.emails } : prev);
        setLastRefresh(new Date());
        console.log("[email-poll] Emails refreshed at", new Date().toLocaleTimeString());
      }
    } catch {
      console.warn("[email-poll] Email poll failed, keeping current data");
    }
  };

  const interval = setInterval(pollEmails, EMAIL_POLL_INTERVAL);
  return () => clearInterval(interval);
}, [loading]);
```

**File: `artifacts/api-server/src/routes/tcc/emails.ts`** — Add the poll endpoint:

```typescript
router.get("/emails/poll", async (_req, res): Promise<void> => {
  try {
    // Reuse existing email fetch logic — just returns the latest important emails
    const emails = await fetchLiveEmails(); // same function used by brief
    res.json({ emails });
  } catch (err) {
    res.status(500).json({ error: "Email poll failed" });
  }
});
```

**IMPORTANT:** Neither the brief refresh nor the email poll should reset the current view, scroll position, or any user interaction state. They only update data in the background.

### Step 3: Add "Updated: [time]" timestamp and manual refresh button to header

**File: `artifacts/tcc/src/App.tsx`**

Add state for the last refresh time:
```typescript
const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
```

In the header section, add the timestamp and a manual refresh button. Find the header JSX and add:

```typescript
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
  <span style={{ fontSize: 11, color: C.mut }}>
    Updated: {lastRefresh.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
  </span>
  <button
    onClick={async () => {
      try {
        const freshBrief = await get<DailyBrief>("/brief/today");
        setBrief(freshBrief);
        setLastRefresh(new Date());
        console.log("[manual-refresh] Brief data refreshed");
      } catch {
        console.warn("[manual-refresh] Refresh failed");
      }
    }}
    title="Refresh now"
    style={{
      background: "none",
      border: `1px solid ${C.brd}`,
      borderRadius: 6,
      padding: "4px 8px",
      cursor: "pointer",
      fontSize: 14,
      color: C.mut,
      display: "flex",
      alignItems: "center",
    }}
  >
    🔄
  </button>
</div>
```

Also update `setLastRefresh(new Date())` in the initial data load effect so the timestamp is set on first load.

### Step 4: Create the DeepLink component

**Create NEW file: `artifacts/tcc/src/components/tcc/DeepLink.tsx`**

```typescript
import { C } from "./constants";

type LinkType = "email" | "calendar" | "slack" | "linear";

interface Props {
  type: LinkType;
  /** Gmail message ID for email, raw calendar event ID for calendar, etc. */
  id: string;
  /** For Slack: the channel ID */
  channelId?: string;
  /** For Slack: the message timestamp (e.g. "1711234567.000100") */
  messageTs?: string;
  /** For Linear: the issue identifier (e.g. "FLI-123") */
  identifier?: string;
}

function buildUrl(props: Props): string | null {
  switch (props.type) {
    case "email": {
      if (!props.id) return null;
      return `https://mail.google.com/mail/u/0/#inbox/${props.id}`;
    }
    case "calendar": {
      if (!props.id) return null;
      // Google Calendar deep link requires base64-encoded event ID
      const encoded = btoa(props.id).replace(/=+$/, "");
      return `https://www.google.com/calendar/event?eid=${encoded}`;
    }
    case "slack": {
      if (!props.channelId || !props.messageTs) return null;
      // Slack deep link: remove the dot from the timestamp
      const tsNoDot = props.messageTs.replace(".", "");
      return `https://flipiq.slack.com/archives/${props.channelId}/p${tsNoDot}`;
    }
    case "linear": {
      if (!props.identifier) return null;
      return `https://linear.app/flipiq/issue/${props.identifier}`;
    }
    default:
      return null;
  }
}

export function DeepLink(props: Props) {
  const url = buildUrl(props);
  if (!url) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open in ${props.type === "email" ? "Gmail" : props.type === "calendar" ? "Google Calendar" : props.type === "slack" ? "Slack" : "Linear"}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: 4,
        fontSize: 11,
        textDecoration: "none",
        color: C.mut,
        background: "transparent",
        flexShrink: 0,
        transition: "color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => {
        (e.target as HTMLElement).style.color = C.blu;
        (e.target as HTMLElement).style.background = C.bluBg;
      }}
      onMouseLeave={e => {
        (e.target as HTMLElement).style.color = C.mut;
        (e.target as HTMLElement).style.background = "transparent";
      }}
    >
      {"->"}
    </a>
  );
}
```

### Step 5: Add DeepLink to email items in EmailsView

**File: `artifacts/tcc/src/components/tcc/EmailsView.tsx`**

Add import at the top:
```typescript
import { DeepLink } from "./DeepLink";
```

**File: `artifacts/tcc/src/components/tcc/types.ts`** — Update `EmailItem`:

```typescript
export interface EmailItem {
  id: number;
  from: string;
  subj: string;
  why: string;
  time?: string;
  p?: string;
  gmailMessageId?: string;    // ADD THIS
  calendarEventId?: string;   // ADD THIS (for meetings shown as emails)
}
```

Back in **EmailsView.tsx**, find where each email row is rendered. Inside each email row, next to the subject, add:

```typescript
{e.gmailMessageId && <DeepLink type="email" id={e.gmailMessageId} />}
```

### Step 6: Add DeepLink to calendar items in ScheduleView

**File: `artifacts/tcc/src/components/tcc/types.ts`** — Update `CalItem`:

```typescript
export interface CalItem {
  t: string;
  n: string;
  loc?: string;
  note?: string;
  real?: boolean;
  calendarEventId?: string;   // ADD THIS
  slackChannelId?: string;    // ADD THIS
  slackMessageTs?: string;    // ADD THIS
}
```

**File: `artifacts/tcc/src/components/tcc/ScheduleView.tsx`** — Add import and deep link rendering (see Step 8 for the full enhanced ScheduleView).

### Step 7: Ensure brief.ts passes through the IDs

**File: `artifacts/api-server/src/routes/tcc/brief.ts`**

In the `fetchLiveCalendar()` function, add to the CalItem mapping:
```typescript
calendarEventId: e.id || undefined,
```

In the `fetchLiveEmails()` function, add to the EmailItem mapping:
```typescript
gmailMessageId: msg.id || undefined,
```

### Step 8: Schedule timeline — now indicator + past/current highlighting

**File: `artifacts/tcc/src/components/tcc/ScheduleView.tsx`** — REPLACE the entire component with the enhanced version:

```typescript
import { useState, useEffect } from "react";
import { C, FS, card, btn1, btn2 } from "./constants";
import { DeepLink } from "./DeepLink";
import type { CalItem } from "./types";

interface Props {
  items: CalItem[];
  onEnterSales: () => void;
  onEnterTasks: () => void;
}

/** Parse a time string like "9:00 AM" or "14:30" to minutes since midnight */
function parseTimeToMinutes(timeStr: string): number {
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (!match) return -1;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const ampm = match[3]?.toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function getNowMinutes(): number {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

export function ScheduleView({ items, onEnterSales, onEnterTasks }: Props) {
  const [nowMinutes, setNowMinutes] = useState(getNowMinutes());

  // Update "now" every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => setNowMinutes(getNowMinutes()), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Determine which item is current/next
  let currentIndex = -1;
  let nextIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const itemMinutes = parseTimeToMinutes(items[i].t);
    if (itemMinutes < 0) continue;
    if (itemMinutes <= nowMinutes) {
      currentIndex = i;
    }
    if (itemMinutes > nowMinutes && nextIndex === -1) {
      nextIndex = i;
    }
  }

  const highlightIndex = currentIndex >= 0 ? currentIndex : nextIndex;

  return (
    <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px" }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Today's Schedule</h3>
          <span style={{ fontSize: 12, color: C.mut }}>{items.length} items</span>
        </div>

        {items.map((c, i) => {
          const itemMinutes = parseTimeToMinutes(c.t);
          const isPast = itemMinutes >= 0 && itemMinutes < nowMinutes && i !== highlightIndex;
          const isHighlighted = i === highlightIndex;

          const prevMinutes = i > 0 ? parseTimeToMinutes(items[i - 1].t) : -1;
          const showNowLine = i > 0 && prevMinutes >= 0 && prevMinutes <= nowMinutes && itemMinutes > nowMinutes;

          return (
            <div key={i}>
              {/* Green "Now" indicator line */}
              {showNowLine && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.grn, flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 2, background: C.grn, borderRadius: 1 }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.grn, flexShrink: 0 }}>NOW</span>
                </div>
              )}

              <div style={{
                display: "flex", gap: 12, padding: "12px 14px", marginBottom: 4,
                background: c.real ? C.bluBg : "#FAFAF8",
                borderRadius: 10,
                borderLeft: `4px solid ${c.real ? C.blu : C.brd}`,
                opacity: isPast ? 0.5 : 1,
                border: isHighlighted ? `2px solid ${C.grn}` : undefined,
                borderLeftWidth: isHighlighted ? 4 : undefined,
                borderLeftColor: isHighlighted ? C.grn : (c.real ? C.blu : C.brd),
                transition: "opacity 0.3s ease",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: c.real ? C.blu : C.mut, minWidth: 75, flexShrink: 0 }}>{c.t}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: c.real ? 700 : 500 }}>{c.n}</div>
                    {c.calendarEventId && <DeepLink type="calendar" id={c.calendarEventId} />}
                  </div>
                  {c.loc && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{c.loc}</div>}
                  {c.note && <div style={{ fontSize: 12, color: C.amb, marginTop: 2 }}>{c.note}</div>}
                </div>
                {c.real
                  ? <span style={{ fontSize: 10, fontWeight: 700, color: C.blu, background: "#fff", padding: "2px 8px", borderRadius: 4, alignSelf: "center" }}>MEETING</span>
                  : <span style={{ fontSize: 10, color: C.mut, alignSelf: "center" }}>note</span>
                }
              </div>
            </div>
          );
        })}

        {/* If all items are in the past, show the "now" line at the bottom */}
        {items.length > 0 && parseTimeToMinutes(items[items.length - 1].t) <= nowMinutes && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.grn, flexShrink: 0 }} />
            <div style={{ flex: 1, height: 2, background: C.grn, borderRadius: 1 }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.grn, flexShrink: 0 }}>NOW</span>
          </div>
        )}
      </div>

      <button onClick={onEnterSales} style={{ ...btn1, width: "100%", padding: 18, fontSize: 17, marginBottom: 10 }}>
        Enter Sales Mode
      </button>
      <button onClick={onEnterTasks} style={{ ...btn2, width: "100%", padding: 14, marginBottom: 40 }}>
        Enter Task Mode
      </button>
    </div>
  );
}
```

### Step 9: Printable Daily Sheet (Story 3.7)

**File: `artifacts/tcc/src/App.tsx`** — Add a "Print" button to the header, next to the refresh button:

```typescript
<button
  onClick={() => setPrintMode(true)}
  title="Print daily sheet"
  style={{
    background: "none",
    border: `1px solid ${C.brd}`,
    borderRadius: 6,
    padding: "4px 8px",
    cursor: "pointer",
    fontSize: 14,
    color: C.mut,
    display: "flex",
    alignItems: "center",
  }}
>
  🖨
</button>
```

Add state:
```typescript
const [printMode, setPrintMode] = useState(false);
```

Render the PrintView component when print mode is active:
```typescript
{printMode && brief && (
  <PrintView brief={brief} onClose={() => setPrintMode(false)} />
)}
```

**Create NEW file: `artifacts/tcc/src/components/tcc/PrintView.tsx`**

```typescript
import { useEffect } from "react";
import { C, F, FS } from "./constants";
import type { DailyBrief } from "./types";

interface Props {
  brief: DailyBrief;
  onClose: () => void;
}

export function PrintView({ brief, onClose }: Props) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Auto-trigger print dialog on mount
  useEffect(() => {
    const timeout = setTimeout(() => {
      window.print();
    }, 300); // Small delay to let CSS render
    return () => clearTimeout(timeout);
  }, []);

  // Top 3 focus tasks
  const focusTasks = (brief.tasksTop3 || brief.tasks || []).slice(0, 3);

  // Sales calls with phone numbers (up to 10)
  const salesCalls = (brief.salesCalls || brief.callQueue || []).slice(0, 10);

  // Today's meetings with times
  const meetings = (brief.calendarData || []).filter(c => c.real);

  // Important emails (top 5)
  const emails = (brief.emailsImportant || []).slice(0, 5);

  // Slack items
  const slackItems = (brief.slackUrgent || []).slice(0, 5);

  // Linear sprint status
  const linearItems = (brief.linearIssues || []).slice(0, 5);

  return (
    <>
      {/* Print-specific CSS */}
      <style>{`
        @media print {
          body > *:not(.print-view) { display: none !important; }
          .print-view { display: block !important; }
          .no-print { display: none !important; }
          .print-view { font-family: ${F}; font-size: 11px; color: #000; }
          .print-page-break { page-break-before: always; }
          @page { margin: 0.5in; size: letter; }
        }
        @media screen {
          .print-view {
            position: fixed; inset: 0; z-index: 20000;
            background: white; overflow-y: auto; padding: 40px;
          }
        }
      `}</style>

      <div className="print-view">
        {/* Close button (screen only) */}
        <button
          className="no-print"
          onClick={onClose}
          style={{
            position: "fixed", top: 20, right: 20, zIndex: 20001,
            background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8,
            padding: "8px 16px", cursor: "pointer", fontFamily: F, fontSize: 14,
          }}
        >
          Close Print View
        </button>

        {/* === FRONT PAGE === */}
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <h1 style={{ fontFamily: FS, fontSize: 22, marginBottom: 4 }}>Tony's Daily Sheet</h1>
          <div style={{ fontSize: 12, color: "#666", marginBottom: 20 }}>{today}</div>

          {/* Top 3 Focus Tasks */}
          <h2 style={{ fontFamily: FS, fontSize: 16, borderBottom: "2px solid #000", paddingBottom: 4, marginBottom: 10 }}>
            Top 3 Focus Tasks
          </h2>
          <ol style={{ margin: "0 0 20px", paddingLeft: 20 }}>
            {focusTasks.map((t, i) => (
              <li key={i} style={{ fontSize: 13, lineHeight: 1.8, fontWeight: 700 }}>
                {typeof t === "string" ? t : t.text || t.name || ""}
              </li>
            ))}
            {focusTasks.length === 0 && <li style={{ color: "#999" }}>No focus tasks set</li>}
          </ol>

          {/* Sales Calls */}
          <h2 style={{ fontFamily: FS, fontSize: 16, borderBottom: "2px solid #000", paddingBottom: 4, marginBottom: 10 }}>
            Sales Calls ({salesCalls.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ccc", textAlign: "left" }}>
                <th style={{ padding: "4px 8px" }}>#</th>
                <th style={{ padding: "4px 8px" }}>Name</th>
                <th style={{ padding: "4px 8px" }}>Company</th>
                <th style={{ padding: "4px 8px" }}>Phone</th>
                <th style={{ padding: "4px 8px" }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {salesCalls.map((c, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #eee" }}>
                  <td style={{ padding: "4px 8px" }}>{i + 1}</td>
                  <td style={{ padding: "4px 8px", fontWeight: 600 }}>{c.name || ""}</td>
                  <td style={{ padding: "4px 8px" }}>{c.company || ""}</td>
                  <td style={{ padding: "4px 8px", fontFamily: "monospace" }}>{c.phone || ""}</td>
                  <td style={{ padding: "4px 8px", fontSize: 11, color: "#666" }}>{c.lastNote || c.nextStep || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Today's Meetings */}
          <h2 style={{ fontFamily: FS, fontSize: 16, borderBottom: "2px solid #000", paddingBottom: 4, marginBottom: 10 }}>
            Meetings ({meetings.length})
          </h2>
          {meetings.map((m, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "6px 0", borderBottom: "1px solid #eee", fontSize: 12 }}>
              <span style={{ fontWeight: 700, minWidth: 70 }}>{m.t}</span>
              <span>{m.n}</span>
              {m.loc && <span style={{ color: "#666" }}>({m.loc})</span>}
            </div>
          ))}
          {meetings.length === 0 && <div style={{ color: "#999", fontSize: 12, marginBottom: 20 }}>No meetings today</div>}
        </div>

        {/* === BACK PAGE === */}
        <div className="print-page-break" style={{ maxWidth: 700, margin: "0 auto", paddingTop: 20 }}>
          <h1 style={{ fontFamily: FS, fontSize: 18, marginBottom: 16 }}>Reference — {today}</h1>

          {/* Important Emails */}
          <h2 style={{ fontFamily: FS, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginBottom: 8 }}>
            Important Emails (Top 5)
          </h2>
          {emails.map((e, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #eee", fontSize: 11 }}>
              <span style={{ fontWeight: 600 }}>{e.from}</span>
              <span style={{ color: "#666" }}> — {e.subj}</span>
              {e.why && <span style={{ color: "#999", fontSize: 10 }}> ({e.why})</span>}
            </div>
          ))}
          {emails.length === 0 && <div style={{ color: "#999", fontSize: 11, marginBottom: 12 }}>No important emails</div>}

          {/* Slack Items */}
          <h2 style={{ fontFamily: FS, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginTop: 16, marginBottom: 8 }}>
            Slack Items
          </h2>
          {slackItems.map((s, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #eee", fontSize: 11 }}>
              <span style={{ fontWeight: 600 }}>#{s.channel || "unknown"}</span>
              <span> — {s.text || s.summary || ""}</span>
            </div>
          ))}
          {slackItems.length === 0 && <div style={{ color: "#999", fontSize: 11, marginBottom: 12 }}>No Slack items</div>}

          {/* Linear Sprint Status */}
          <h2 style={{ fontFamily: FS, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginTop: 16, marginBottom: 8 }}>
            Linear Sprint Status
          </h2>
          {linearItems.map((l, i) => (
            <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #eee", fontSize: 11 }}>
              <span style={{ fontWeight: 600 }}>{l.identifier || ""}</span>
              <span> — {l.title || ""}</span>
              <span style={{ color: "#666" }}> [{l.state || ""}]</span>
            </div>
          ))}
          {linearItems.length === 0 && <div style={{ color: "#999", fontSize: 11, marginBottom: 12 }}>No Linear issues</div>}

          {/* Out-of-sequence alerts */}
          {brief.outOfSequenceAlerts && brief.outOfSequenceAlerts.length > 0 && (
            <>
              <h2 style={{ fontFamily: FS, fontSize: 14, borderBottom: "1px solid #000", paddingBottom: 4, marginTop: 16, marginBottom: 8, color: "red" }}>
                Out-of-Sequence Alerts
              </h2>
              {brief.outOfSequenceAlerts.map((a, i) => (
                <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid #eee", fontSize: 11, color: "#c62828" }}>
                  {a}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
```

## VERIFY BEFORE MOVING ON

1. **Auto-refresh (15 min):** Open the app, wait 15 minutes (or temporarily change `REFRESH_INTERVAL` to 10000ms for testing). Open browser console — you should see "[auto-refresh] Brief data refreshed at ..." messages. The current view and scroll position must NOT change.
2. **Email poll (5 min):** Console shows "[email-poll] Emails refreshed at ..." on the 5-minute cadence. Email list updates without resetting the view.
3. **Updated timestamp:** The header shows "Updated: [time]" and it changes after each refresh.
4. **Manual refresh button:** Clicking the refresh button immediately triggers a data reload. The "Updated" timestamp changes. No view/scroll disruption.
5. **Deep links on emails:** Email items with a `gmailMessageId` show a small `->` icon. Clicking opens Gmail in a new tab.
6. **Deep links on calendar:** Calendar items with a `calendarEventId` show the `->` icon. Clicking opens Google Calendar.
7. **Schedule timeline:** The green "NOW" line appears between the last past item and the first future item. Past items have 50% opacity. The current/next item has a green highlight border.
8. **Timeline updates:** Wait a minute — the "NOW" indicator shifts as time passes.
9. **Print button:** Clicking the print button opens the PrintView overlay. The print dialog opens automatically.
10. **Print layout:** FRONT PAGE shows Top 3 tasks, sales calls table with phone numbers, and meetings with times. BACK PAGE shows emails, Slack items, Linear status, and any out-of-sequence alerts. Fits front/back of one letter-size page.
11. **Types updated:** `CalItem` and `EmailItem` interfaces accept the new optional ID fields without breaking existing code.
