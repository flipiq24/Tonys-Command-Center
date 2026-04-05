import React, { useState, useEffect, useCallback } from "react";
import { F, FS } from "./constants";
import { get, post } from "@/lib/api";
import type { TaskItem, CalItem, EmailItem, SlackItem, LinearItem } from "./types";

interface Contact { name: string; phone?: string; company?: string; nextStep?: string; status?: string; }

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  slackItems?: SlackItem[];
  linearItems?: LinearItem[];
  topCallContacts?: Contact[];
  onClose: () => void;
  onRefresh?: () => Promise<void>;
}

const SAMPLE_SLACK: SlackItem[] = [
  { from: "Ethan Jolly", message: "Linear sprint blockers need your review", level: "high", channel: "#engineering" },
  { from: "Faisal", message: "Command deploy blocked on merge conflict", level: "mid", channel: "#dev" },
  { from: "Dennis", message: "Sales numbers ready for review", level: "low", channel: "#sales" },
];

const DATE_STR = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ─────────────────────────────────────────────────────────────────
// SAMPLE DATA — used when real data isn't loaded yet (from your
// actual FlipIQ Daily Action Sheet v2 Excel file)
// ─────────────────────────────────────────────────────────────────
const SAMPLE_TOP3: TaskItem[] = [
  { id: "s1", text: "Call Dennis — review weekly sales numbers & pipeline", cat: "Sales" },
  { id: "s2", text: "Follow up with John (TDR) re: Command onboarding feedback", cat: "Operations" },
  { id: "s3", text: "Review & approve Ramy's OMS user adaptation report", cat: "Operations" },
];
const SAMPLE_CALLS: Contact[] = [
  { name: "Mike Torres", company: "Coko Acq.", phone: "(951) 555-0142", status: "Hot" },
  { name: "Sarah Chen", company: "Investor Lead", phone: "(626) 555-0198", status: "Warm" },
  { name: "David Park", company: "Broker-Inv.", phone: "(714) 555-0233", status: "New" },
  { name: "Lisa Rodriguez", company: "STJ", phone: "(909) 555-0317", status: "Hot" },
  { name: "James Wu", company: "PropertyRadar", phone: "(415) 555-0421", status: "Warm" },
  { name: "Rachel Kim", company: "DCP", phone: "(310) 555-0544", status: "New" },
  { name: "Tom Bradley", company: "Hegemark", phone: "(818) 555-0619", status: "Warm" },
  { name: "Ana Gutierrez", company: "Acq. Homes", phone: "(562) 555-0788", status: "Cold" },
  { name: "Kevin O'Brien", company: "New Lead", phone: "(949) 555-0855", status: "New" },
  { name: "Maria Espinoza", company: "DispoPro", phone: "(213) 555-0961", status: "Warm" },
];
const SAMPLE_MEETINGS: CalItem[] = [
  { t: "9:00 AM", tEnd: "9:30 AM", n: "Sales Team Standup", loc: "Zoom", note: "Review pipeline #s", real: true },
  { t: "10:30 AM", tEnd: "11:00 AM", n: "OMS Adaptation Check-in — Ramy", loc: "Google Meet", note: "Bring P0 status", real: true },
  { t: "1:00 PM", tEnd: "1:45 PM", n: "Sales Playbook Review — Dennis", loc: "Office", note: "Bondelin scripts", real: true },
  { t: "3:00 PM", tEnd: "3:30 PM", n: "Weekly COO Sync — Ethan", loc: "Google Meet", note: "Linear blockers", real: true },
  { t: "4:30 PM", tEnd: "5:00 PM", n: "EOD Wrap / Day Review", loc: "", note: "Update CRM, set tomorrow Top 3", real: true },
];
const SAMPLE_EMAILS: EmailItem[] = [
  { id: 1, from: "Rick Sharga", subj: "Lightning Docs positioning", why: "Strategic decision pending", p: "Reply by EOD" },
  { id: 2, from: "John @ TDR", subj: "RE: Command bugs — onboarding blocker", why: "Active client issue", p: "Fwd to Faisal" },
  { id: 3, from: "David Breneman", subj: "Dialpad replacement quote", why: "Vendor eval in progress", p: "Review numbers" },
  { id: 4, from: "Ethan Jolly", subj: "Linear sprint audit — missing owners", why: "Engineering risk flag", p: "Discuss @ 3pm" },
  { id: 5, from: "Ana Gutierrez / Acq. Homes", subj: "Seller Direct Phase 3 interest", why: "New pipeline opp", p: "Schedule call" },
];
const SAMPLE_LINEAR: LinearItem[] = [
  { id: "COM-221", task: "Command 1.5 — contact merge fix", who: "Faisal", level: "high" },
  { id: "COM-224", task: "Dashboard filter persistence", who: "Faisal", level: "mid" },
  { id: "COM-230", task: "DispoPro integration endpoint", who: "Haris", level: "high" },
  { id: "COM-219", task: "Acceptance criteria audit — deployed unchecked", who: "Faisal", level: "high" },
  { id: "FND-118", task: "MLS accuracy pipeline v2", who: "Haris", level: "mid" },
  { id: "FND-122", task: "Agent data dedup engine", who: "Haris", level: "low" },
  { id: "MKT-089", task: "Marketplace listing photo upload", who: "Bishal", level: "mid" },
  { id: "OMS-045", task: "OMS auto-sequence triggers", who: "Anas", level: "mid" },
];

// ─────────────────────────────────────────────────────────────────
// TIME SCHEDULING — compute free work blocks from today's meetings
// ─────────────────────────────────────────────────────────────────
function parseTimeMins(t: string): number | null {
  const m = t?.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const p = m[3].toUpperCase();
  if (p === "PM" && h !== 12) h += 12;
  if (p === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const p = h >= 12 ? "PM" : "AM";
  const dh = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${dh}:${m.toString().padStart(2, "0")} ${p}`;
}

interface WorkBlocks { salesCalls?: string; tasks?: string; emails?: string; }

function computeWorkBlocks(meetingList: CalItem[]): WorkBlocks {
  const WORK_START = 7 * 60;  // 7:00 AM
  const WORK_END   = 18 * 60; // 6:00 PM
  const MIN_USEFUL = 30;

  const busy = meetingList
    .map(m => {
      const start = parseTimeMins(m.t);
      const end   = m.tEnd ? parseTimeMins(m.tEnd) : (start !== null ? start + 30 : null);
      return start !== null && end !== null ? { start, end } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a!.start - b!.start) as { start: number; end: number }[];

  const free: { start: number; end: number }[] = [];
  let cursor = WORK_START;
  for (const b of busy) {
    if (b.start > cursor + MIN_USEFUL) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < WORK_END - MIN_USEFUL) free.push({ start: cursor, end: WORK_END });

  const fmt = (b: { start: number; end: number }) => `${fmtMins(b.start)} – ${fmtMins(b.end)}`;
  const morning   = free.filter(b => b.start < 12 * 60 && (b.end - b.start) >= MIN_USEFUL);
  const afternoon = free.filter(b => b.start >= 11 * 60 && (b.end - b.start) >= MIN_USEFUL);

  return {
    salesCalls: morning[0]   ? fmt(morning[0])   : free[0] ? fmt(free[0]) : undefined,
    tasks:      morning[1]   ? fmt(morning[1])   : afternoon[0] ? fmt(afternoon[0]) : undefined,
    emails:     afternoon[0] ? fmt(afternoon[0]) : free[2]  ? fmt(free[2])  : undefined,
  };
}

// ── Shared palette ──
const BLK = "#111";
const BORDER = "1px solid #bbb";
const HEAVY = "2px solid #222";
const HDR_BG = "#F2F2F2";
const PAGE_W = 760;

// ── Checkbox ──
function CB({ id, done, onToggle }: { id: string; done: boolean; onToggle: (id: string) => void }) {
  return (
    <div
      onClick={() => onToggle(id)}
      title="Click to check off"
      style={{
        width: 14, height: 14, border: done ? "2px solid #111" : "1.5px solid #888",
        borderRadius: 2, background: done ? "#111" : "#fff", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        transition: "all 0.1s",
      }}
    >
      {done && <span style={{ color: "#fff", fontSize: 9, lineHeight: 1, fontWeight: 900 }}>✓</span>}
    </div>
  );
}

// ── Table header cell ──
function TH({ children, w, center }: { children: React.ReactNode; w?: number | string; center?: boolean }) {
  return (
    <th style={{
      fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8,
      color: "#444", padding: "4px 6px", textAlign: center ? "center" : "left",
      background: HDR_BG, borderBottom: HEAVY, whiteSpace: "nowrap",
      width: w !== undefined ? (typeof w === "number" ? w : w) : undefined,
    }}>{children}</th>
  );
}

// ── Table data cell ──
function TD({ children, center, bold, small, dim, strike }: {
  children?: React.ReactNode; center?: boolean; bold?: boolean;
  small?: boolean; dim?: boolean; strike?: boolean;
}) {
  return (
    <td style={{
      fontSize: small ? 9 : 11, fontWeight: bold ? 700 : 400,
      color: dim ? "#999" : BLK, padding: "5px 6px",
      textAlign: center ? "center" : "left",
      textDecoration: strike ? "line-through" : "none",
      borderBottom: "1px solid #E8E8E8", verticalAlign: "top",
    }}>{children}</td>
  );
}

// ── Section label ──
function SL({ text, color = "#444", time }: { text: string; color?: string; time?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginBottom: 4, marginTop: 14,
    }}>
      <div style={{
        fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.5, color,
      }}>{text}</div>
      {time && (
        <div style={{
          fontSize: 9, fontWeight: 700, color: "#888",
          background: "#F2F2F2", border: "1px solid #DDD", borderRadius: 4,
          padding: "1px 6px", letterSpacing: 0.3, fontFamily: "monospace",
        }}>{time}</div>
      )}
    </div>
  );
}

// ── Page wrapper (both screen + print) ──
function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={className} style={{
      background: "#fff",
      width: PAGE_W, minHeight: 980,
      boxShadow: "0 6px 32px rgba(0,0,0,0.4), 0 1px 4px rgba(0,0,0,0.2)",
      borderRadius: 3, overflow: "hidden", flexShrink: 0, fontFamily: F,
      fontSize: 11, color: BLK,
    }}>
      {children}
    </div>
  );
}

// ── Page header ──
function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{
      padding: "12px 18px 10px", borderBottom: HEAVY,
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div>
        <div style={{ fontFamily: FS, fontSize: 18, fontWeight: 900, letterSpacing: 1, color: BLK }}>{title}</div>
        <div style={{ fontSize: 10, color: "#666", marginTop: 2 }}>{DATE_STR}</div>
      </div>
      <div style={{ fontSize: 9, color: "#888", fontStyle: "italic", textAlign: "right", maxWidth: 280 }}>
        "{sub}"
      </div>
    </div>
  );
}


export function PrintView({ tasks, tDone, calendarData, emailsImportant, slackItems = [], linearItems = [], topCallContacts = [], onClose, onRefresh }: Props) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [inboxEmail, setInboxEmail] = useState<string>("");
  const [processing, setProcessing] = useState(false);
  const [processResult, setProcessResult] = useState<string | null>(null);

  const toggle = useCallback((id: string) => {
    setDone(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    get<{ ok: boolean; email?: string }>("/sheet-scan/inbox")
      .then(r => { if (r.ok && r.email) setInboxEmail(r.email); })
      .catch(() => {});
  }, []);

  const handleProcessScan = async () => {
    if (processing) return;
    setProcessing(true);
    setProcessResult(null);
    try {
      const r = await post<{ ok: boolean; callsLogged?: string[]; tasksCompleted?: number[]; confidence?: string; error?: string }>("/sheet-scan/process");
      if (r.ok) {
        const parts = [];
        if ((r.callsLogged?.length ?? 0) > 0) parts.push(`${r.callsLogged!.length} call(s) logged`);
        if ((r.tasksCompleted?.length ?? 0) > 0) parts.push(`${r.tasksCompleted!.length} task(s) marked done`);
        setProcessResult(parts.length > 0 ? `✅ Processed (${r.confidence}): ${parts.join(", ")}` : "✅ Sheet scanned — nothing checked yet");
      } else {
        setProcessResult(`⚠ ${r.error ?? "Could not process"}`);
      }
    } catch {
      setProcessResult("⚠ Error contacting server");
    } finally {
      setProcessing(false);
    }
  };

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      if (onRefresh) await onRefresh();
    } catch { /* ok */ } finally { setRefreshing(false); }
  };

  const ck = (id: string) => done.has(id);

  // Data prep — fall back to sample data when real data is empty
  const realTop3 = tasks.filter(t => !tDone[t.id] && !t.sales).slice(0, 3);
  const top3 = realTop3.length > 0 ? realTop3 : SAMPLE_TOP3;

  const realCalls = topCallContacts.slice(0, 10);
  const callList = realCalls.length > 0 ? realCalls : SAMPLE_CALLS;

  const realMeetings = calendarData.filter(c => c.real);
  const meetings = realMeetings.length > 0 ? realMeetings : SAMPLE_MEETINGS;

  const realEmails = emailsImportant.slice(0, 6);
  const emails = realEmails.length > 0 ? realEmails : SAMPLE_EMAILS;

  const realLinear = linearItems.slice(0, 8);
  const linActive = realLinear.length > 0 ? realLinear : SAMPLE_LINEAR;

  const realSlack = slackItems.slice(0, 6);
  const slackActive = realSlack.length > 0 ? realSlack : SAMPLE_SLACK;

  // Compute free-window schedule from meeting times
  const workBlocks = computeWorkBlocks(meetings);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 20000, background: "#1C1C1E",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* ── Toolbar ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 24px", background: "#111", borderBottom: "1px solid #2a2a2a", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: FS, fontSize: 15, color: "#fff", fontWeight: 800, letterSpacing: 0.5 }}>
            FlipIQ Daily Action Sheet
          </div>
          <div style={{ fontSize: 11, color: "#777", marginTop: 1 }}>{DATE_STR}</div>
        </div>
        <Btn label={refreshing ? "Refreshing…" : "↻ Refresh"} onClick={handleRefresh} disabled={refreshing} dim />
        <Btn label={processing ? "Processing…" : "📷 Process Scanned Sheet"} onClick={handleProcessScan} disabled={processing} dim />
        <Btn label="🖨 Print" onClick={() => window.print()} primary />
        <Btn label="✕ Close" onClick={onClose} dim />
      </div>
      {processResult && (
        <div style={{
          padding: "8px 24px", background: processResult.startsWith("✅") ? "#1A3A1A" : "#3A1A1A",
          color: processResult.startsWith("✅") ? "#86efac" : "#fca5a5",
          fontSize: 12, fontFamily: F, fontWeight: 600, borderBottom: "1px solid #2a2a2a",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>{processResult}</span>
          <button onClick={() => setProcessResult(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 14, padding: "0 4px" }}>✕</button>
        </div>
      )}

      {/* ── Scrollable sheets area ── */}
      <div style={{
        flex: 1, overflow: "auto",
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "32px 24px 48px", gap: 40,
      }} className="no-print">

        {/* ════ FRONT ════ */}
        <label style={{ fontSize: 9, color: "#666", letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontFamily: F, alignSelf: "flex-start", marginLeft: `calc(50% - ${PAGE_W / 2}px)` }}>PAGE 1 — FRONT</label>
        <Page className="print-front">
          <PageHeader title="FLIPIQ DAILY ACTION SHEET" sub="Follow the plan that I gave you! — God" />
          <div style={{ padding: "14px 18px" }}>

            {/* ══ TOP 3 — DO THESE FIRST (full width, no sales calls) ══ */}
            <SL text="★ Top 3 — Do These First" color="#B7791F" />
            <div style={{ marginBottom: 12, border: "1.5px solid #E8D5A3", borderRadius: 4, overflow: "hidden" }}>
              {Array.from({ length: 3 }).map((_, i) => {
                const t = top3[i];
                const id = t ? `top3-${t.id}` : `top3-blank-${i}`;
                return (
                  <div key={id} style={{
                    display: "flex", gap: 8, alignItems: "flex-start",
                    padding: "8px 10px",
                    borderBottom: i < 2 ? "1px solid #EEE4CC" : "none",
                    background: i === 0 ? "#FFFBF2" : "#fff",
                    minHeight: 34,
                  }}>
                    <CB id={id} done={ck(id)} onToggle={toggle} />
                    <div style={{
                      width: 16, height: 16, background: i === 0 ? BLK : "#E0E0E0",
                      color: i === 0 ? "#fff" : "#888", borderRadius: 3,
                      fontSize: 9, fontWeight: 900, display: "flex", alignItems: "center",
                      justifyContent: "center", flexShrink: 0, marginTop: 1,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      {t ? (
                        <div style={{
                          fontSize: 11, fontWeight: i === 0 ? 700 : 600,
                          color: ck(id) ? "#bbb" : BLK,
                          textDecoration: ck(id) ? "line-through" : "none",
                          lineHeight: 1.4,
                        }}>{t.text}</div>
                      ) : (
                        <div style={{ borderBottom: "1px solid #DDD", width: "100%", marginTop: 8 }} />
                      )}
                    </div>
                    <div style={{ width: 220, borderBottom: "1px solid #DDD", marginTop: 10, flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>

            {/* ══ 2-COL: CALLS (left) | CALENDAR (right) ══ */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 6 }}>

              {/* LEFT — Sales Calls */}
              <div>
                <SL text="📞 Sales Calls — 10 Today" color="#C62828" time={workBlocks.salesCalls} />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr>
                      <TH w={18} center>✓</TH>
                      <TH w={14} center>#</TH>
                      <TH>NAME / CO.</TH>
                      <TH w={50}>STATUS</TH>
                      <TH>OUTCOME</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const c = callList[i];
                      const id = `call-${i}`;
                      const done2 = ck(id);
                      return (
                        <tr key={id} style={{ height: 26, background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                          <TD center small dim>{i + 1}</TD>
                          {c ? (
                            <>
                              <td style={{ fontSize: 9, fontWeight: 700, color: done2 ? "#bbb" : BLK, padding: "4px 6px", borderBottom: "1px solid #E8E8E8", verticalAlign: "top", textDecoration: done2 ? "line-through" : "none" }}>
                                {c.name}
                                {c.company && <div style={{ fontSize: 7, color: "#888", fontWeight: 400 }}>{c.company}</div>}
                              </td>
                              <TD center small bold>
                                <span style={{ color: c.status === "Hot" ? "#C62828" : c.status === "Warm" ? "#E65100" : "#555" }}>
                                  {c.status || "—"}
                                </span>
                              </TD>
                            </>
                          ) : (
                            <><TD /><TD /></>
                          )}
                          <td style={{ borderBottom: "1px solid #E8E8E8", verticalAlign: "bottom", padding: "0 4px 3px" }}>
                            <div style={{ borderBottom: "1px solid #CCC", width: "100%", height: 1, marginBottom: 2 }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* RIGHT — Calendar */}
              <div>
                <SL text="📅 Today's Calendar" color="#1565C0" />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr>
                      <TH w={18} center>✓</TH>
                      <TH w={68}>TIME</TH>
                      <TH>MEETING</TH>
                      <TH w={60}>PREP</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {meetings.length === 0 && (
                      <tr><td colSpan={4} style={{ padding: "8px 6px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No meetings today</td></tr>
                    )}
                    {meetings.map((m, i) => {
                      const id = `meet-${i}`;
                      const done2 = ck(id);
                      return (
                        <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                          <TD small bold>{m.t}{m.tEnd ? `–${m.tEnd}` : ""}</TD>
                          <TD strike={done2} small>{m.n}</TD>
                          <TD small dim>{m.loc || m.note || ""}</TD>
                        </tr>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 10 - meetings.length) }).map((_, i) => (
                      <tr key={`meetblank-${i}`} style={{ background: (meetings.length + i) % 2 === 0 ? "#fff" : "#FAFAFA", height: 26 }}>
                        <TD center><CB id={`meetblank-${i}`} done={ck(`meetblank-${i}`)} onToggle={toggle} /></TD>
                        <TD /><TD /><TD />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ══ SCAN FOOTER ══ */}
            <div style={{
              marginTop: 8, padding: "7px 12px",
              border: "1.5px dashed #BBB", borderRadius: 4,
              background: "#FAFAFA",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div style={{ fontSize: 8, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1, color: "#888" }}>
                📷 Fill &amp; scan — email photo to TCC
              </div>
              <div style={{ fontSize: 9, fontWeight: 700, color: "#444", fontFamily: "monospace" }}>
                {inboxEmail || "loading inbox…"}
              </div>
              <div style={{ fontSize: 8, color: "#888" }}>TCC reads it automatically &amp; updates your system</div>
            </div>

          </div>
        </Page>

        {/* ════ BACK ════ */}
        <label style={{ fontSize: 9, color: "#666", letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontFamily: F, alignSelf: "flex-start", marginLeft: `calc(50% - ${PAGE_W / 2}px)` }}>PAGE 2 — BACK</label>
        <Page className="print-back">
          <PageHeader title="OPERATIONS & AWARENESS" sub="North Star: 2 deals/month/AA @ $2,500 per acquisition. Everything else is noise." />
          <div style={{ padding: "14px 18px" }}>

            {/* Linear — Engineering in Progress */}
            <SL text="⚡ Linear — Engineering in Progress" color="#2563EB" />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER, marginBottom: 14 }}>
              <thead>
                <tr>
                  <TH w={22} center>✓</TH>
                  <TH w={70}>ID</TH>
                  <TH>TASK</TH>
                  <TH w={80}>OWNER</TH>
                  <TH w={80}>STATUS</TH>
                </tr>
              </thead>
              <tbody>
                {linActive.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "8px 6px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No active Linear issues</td></tr>
                )}
                {linActive.map((l, i) => {
                  const id = `linear-${i}`;
                  const done2 = ck(id);
                  const isHigh = l.level === "high";
                  return (
                    <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                      <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                      <TD small bold><span style={{ color: "#2563EB" }}>{l.id}</span></TD>
                      <TD strike={done2}>{l.task}</TD>
                      <TD small>{l.who || "—"}</TD>
                      <TD small><span style={{ color: isHigh ? "#C62828" : l.level === "mid" ? "#E65100" : "#555", fontWeight: isHigh ? 700 : 400 }}>{isHigh ? "🔴 High" : l.level === "mid" ? "⚠ Mid" : "Low"}</span></TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── Rami Tasks | Ethan Tasks side by side ── */}
            {(() => {
              const ramiItems = linActive.filter(l => (l.who || "").toLowerCase().includes("rami") || (l.who || "").toLowerCase().includes("ramy"));
              const ethanItems = linActive.filter(l => (l.who || "").toLowerCase().includes("ethan"));
              const renderPersonRows = (items: LinearItem[], prefix: string) => {
                const rows = items.slice(0, 5);
                const blanks = Math.max(0, 5 - rows.length);
                return (
                  <>
                    {rows.map((l, i) => {
                      const id = `${prefix}-${i}`;
                      const done2 = ck(id);
                      return (
                        <div key={id} style={{ display: "flex", gap: 7, alignItems: "flex-start", padding: "6px 8px", borderBottom: i < rows.length - 1 || blanks > 0 ? "1px solid #E8E8E8" : "none", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <CB id={id} done={done2} onToggle={toggle} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 8, color: "#2563EB", fontWeight: 700 }}>{l.id}</div>
                            <div style={{ fontSize: 10, fontWeight: 500, color: done2 ? "#bbb" : BLK, textDecoration: done2 ? "line-through" : "none", lineHeight: 1.3 }}>{l.task}</div>
                          </div>
                        </div>
                      );
                    })}
                    {Array.from({ length: blanks }).map((_, i) => (
                      <div key={`${prefix}-blank-${i}`} style={{ display: "flex", gap: 7, alignItems: "center", padding: "7px 8px", borderBottom: i < blanks - 1 ? "1px solid #E8E8E8" : "none", background: (rows.length + i) % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                        <CB id={`${prefix}-blank-${i}`} done={false} onToggle={toggle} />
                        <div style={{ flex: 1, height: 1, background: "#E8E8E8" }} />
                      </div>
                    ))}
                  </>
                );
              };
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>
                  <div>
                    <SL text="👤 Rami — Tasks" color="#555" />
                    <div style={{ border: BORDER, borderRadius: 2, overflow: "hidden" }}>
                      {renderPersonRows(ramiItems, "rami")}
                    </div>
                  </div>
                  <div>
                    <SL text="👤 Ethan — Tasks" color="#555" />
                    <div style={{ border: BORDER, borderRadius: 2, overflow: "hidden" }}>
                      {renderPersonRows(ethanItems, "ethan")}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Priority Emails + Slack side by side ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 10 }}>

              {/* Priority Emails */}
              <div>
                <SL text="📧 Priority Emails" color="#E65100" time={workBlocks.emails} />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr>
                      <TH w={22} center>✓</TH>
                      <TH w={110}>FROM</TH>
                      <TH>SUBJECT</TH>
                      <TH w={70}>ACTION</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {emails.map((e, i) => {
                      const id = `email-${i}`;
                      const done2 = ck(id);
                      return (
                        <tr key={id} style={{ background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                          <TD center><CB id={id} done={done2} onToggle={toggle} /></TD>
                          <TD bold strike={done2}>{e.from}</TD>
                          <TD strike={done2} small>{e.subj}</TD>
                          <TD small bold><span style={{ color: "#1565C0" }}>{e.p || "—"}</span></TD>
                        </tr>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 4 - emails.length) }).map((_, i) => (
                      <tr key={`emailblank-${i}`} style={{ background: (emails.length + i) % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                        <TD center><CB id={`emailblank-${i}`} done={ck(`emailblank-${i}`)} onToggle={toggle} /></TD>
                        <TD /><TD /><TD />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Slack Items */}
              <div>
                <SL text="💬 Slack — Needs Attention" color="#611f69" />
                <div style={{ border: BORDER, borderRadius: 2, overflow: "hidden" }}>
                  {slackActive.map((s, i) => {
                    const levelC = s.level === "high" ? "#C62828" : s.level === "mid" ? "#E65100" : "#555";
                    return (
                      <div key={i} style={{ padding: "7px 10px", borderBottom: i < slackActive.length - 1 ? "1px solid #E8E8E8" : "none", background: s.level === "high" ? "#FFF5F5" : "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, color: levelC, textTransform: "uppercase" }}>{s.level}</span>
                          <span style={{ fontSize: 8, color: "#888" }}>{s.channel}</span>
                        </div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: "#333" }}>{s.from}</div>
                        <div style={{ fontSize: 9, color: "#666", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.message}</div>
                      </div>
                    );
                  })}
                  {slackActive.length === 0 && (
                    <div style={{ padding: "8px 10px", fontSize: 10, color: "#bbb", fontStyle: "italic" }}>No Slack items today 🎉</div>
                  )}
                </div>
              </div>
            </div>

            {/* ── Scratch Notes — HUGE ── */}
            <SL text="📝 Scratch Notes" color="#555" />
            <div style={{
              border: HEAVY, borderRadius: 2, padding: "10px 14px",
              background: "#FDFDFC", marginBottom: 10,
            }}>
              {Array.from({ length: 22 }).map((_, i) => (
                <div key={i} style={{
                  height: 26,
                  borderBottom: i < 21 ? "1px solid #E4E4E4" : "none",
                  display: "flex", alignItems: "flex-end",
                }}>
                  <span style={{ fontSize: 8, color: "#DDD", marginBottom: 2, width: 14, flexShrink: 0, userSelect: "none" }}>{i + 1}</span>
                </div>
              ))}
            </div>

            {/* ── 3 Wins for Today — bottom strip ── */}
            <SL text="🏆 3 Wins for Today" color="#B7791F" />
            <div style={{
              border: "2px solid #B7791F33", borderRadius: 4,
              background: "#FFFBF2", padding: "4px 10px",
            }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{
                  display: "flex", gap: 10, alignItems: "center",
                  padding: "9px 0",
                  borderBottom: n < 3 ? "1px solid #EEE4CC" : "none",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#B7791F", width: 18, flexShrink: 0 }}>{n}.</span>
                  <div style={{ flex: 1, height: 1, background: "#E8D5A3" }} />
                </div>
              ))}
            </div>

          </div>
        </Page>

        <div style={{ fontSize: 10, color: "#555", fontFamily: F, textAlign: "center", paddingBottom: 8 }}>
          Print → Portrait · Letter · 2 pages (front &amp; back of one sheet)
        </div>
      </div>

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body > * { display: none !important; }
          .print-front, .print-back { display: block !important; }
          .print-front {
            position: fixed; top: 0; left: 0; width: 100vw; min-height: 100vh;
            box-shadow: none !important; border-radius: 0 !important;
            page-break-after: always;
          }
          .print-back {
            position: fixed; top: 0; left: 0; width: 100vw; min-height: 100vh;
            box-shadow: none !important; border-radius: 0 !important;
          }
        }
        @page { size: letter portrait; margin: 0.4in; }
      `}</style>
    </div>
  );
}

// ── Toolbar button ──
function Btn({ label, onClick, disabled, primary, dim }: {
  label: string; onClick: () => void; disabled?: boolean; primary?: boolean; dim?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 8, cursor: disabled ? "default" : "pointer",
      border: primary ? "none" : "1px solid #333",
      background: primary ? "#fff" : "none",
      color: disabled ? "#555" : primary ? "#111" : dim ? "#999" : "#eee",
      fontFamily: F, opacity: disabled ? 0.5 : 1, flexShrink: 0,
    }}>{label}</button>
  );
}
