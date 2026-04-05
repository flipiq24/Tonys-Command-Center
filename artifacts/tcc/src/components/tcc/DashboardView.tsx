import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, F, FS } from "./constants";
import { get, patch } from "@/lib/api";
import type { TaskItem, CalItem, EmailItem, LinearItem } from "./types";

// ── Types ──────────────────────────────────────────────────────────
interface LocalTask { id: string; text: string; dueDate?: string | null; taskType?: string | null; size?: string | null; }
interface Contact { name: string; phone?: string; company?: string; status?: string; }
type NavView = "emails" | "schedule" | "sales" | "tasks";

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  linearItems: LinearItem[];
  contacts: Contact[];
  onComplete: (task: TaskItem) => void;
  onNavigate: (view: NavView) => void;
}

// ── Sample fallback data ────────────────────────────────────────────
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
  { t: "10:30 AM", tEnd: "11:00 AM", n: "OMS Adaptation Check-in — Ramy", note: "Bring P0 status", real: true },
  { t: "1:00 PM", tEnd: "1:45 PM", n: "Sales Playbook Review — Dennis", loc: "Office", note: "Bondelin scripts", real: true },
  { t: "3:00 PM", tEnd: "3:30 PM", n: "Weekly COO Sync — Ethan", note: "Linear blockers", real: true },
  { t: "4:30 PM", tEnd: "5:00 PM", n: "EOD Wrap / Day Review", note: "Update CRM, set tomorrow Top 3", real: true },
];
const SAMPLE_EMAILS: EmailItem[] = [
  { id: 1, from: "Rick Sharga", subj: "Lightning Docs positioning", why: "Strategic decision pending", p: "Reply by EOD" },
  { id: 2, from: "John @ TDR", subj: "RE: Command bugs — onboarding blocker", why: "Active client issue", p: "Fwd to Faisal" },
  { id: 3, from: "David Breneman", subj: "Dialpad replacement quote", why: "Vendor eval in progress", p: "Review numbers" },
  { id: 4, from: "Ethan Jolly", subj: "Linear sprint audit — missing owners", why: "Engineering risk flag", p: "Discuss @ 3pm" },
  { id: 5, from: "Ana Gutierrez", subj: "Seller Direct Phase 3 interest", why: "New pipeline opp", p: "Schedule call" },
];
const SAMPLE_LINEAR: LinearItem[] = [
  { id: "COM-221", task: "Command 1.5 — contact merge fix", who: "Faisal", level: "high", size: "L", dueDate: new Date().toISOString().slice(0,10), inSequence: true, state: "In Progress", stateType: "started", description: "Fix the contact merge duplicates showing in Command 1.5. Root cause: ID collision on re-import.", labels: ["bug", "command"] },
  { id: "COM-230", task: "DispoPro integration endpoint", who: "Haris", level: "high", size: "XL", dueDate: new Date().toISOString().slice(0,10), inSequence: true, state: "In Progress", stateType: "started", description: "Build and expose the REST endpoint for DispoPro to push deal data into FlipIQ.", labels: ["integration"] },
  { id: "COM-219", task: "Acceptance criteria audit — deployed unchecked", who: "Faisal", level: "high", size: "M", dueDate: new Date(Date.now()+86400000).toISOString().slice(0,10), inSequence: false, state: "In Review", stateType: "started", description: "Several ACs were marked complete but not verified in production. Audit and document.", labels: ["qa"] },
  { id: "COM-224", task: "Dashboard filter persistence", who: "Faisal", level: "mid", size: "S", dueDate: new Date(Date.now()+2*86400000).toISOString().slice(0,10), inSequence: true, state: "Todo", stateType: "unstarted", description: "User's selected filters should persist across page navigation and browser refresh.", labels: ["ux"] },
  { id: "FND-118", task: "MLS accuracy pipeline v2", who: "Haris", level: "mid", size: "XL", dueDate: new Date(Date.now()+5*86400000).toISOString().slice(0,10), inSequence: true, state: "Todo", stateType: "unstarted", description: "Rebuild MLS ingestion pipeline to handle county-level accuracy improvements.", labels: ["data", "mls"] },
  { id: "MKT-089", task: "Marketplace listing photo upload", who: "Bishal", level: "mid", size: "M", dueDate: null, inSequence: true, state: "In Progress", stateType: "started", labels: ["marketplace"] },
  { id: "FND-122", task: "Agent data dedup engine", who: "Haris", level: "low", size: "L", dueDate: null, inSequence: true, state: "Backlog", stateType: "backlog", labels: ["data"] },
  { id: "COM-218", task: "CSV export — contact bulk download", who: "Faisal", level: "low", size: "S", dueDate: null, inSequence: true, state: "Done", stateType: "completed", description: "Bulk CSV download of contacts with all standard fields. Completed and deployed.", labels: ["feature"] },
  { id: "OPS-012", task: "Review & finalize equity contract terms", who: "Ethan", level: "high", size: "S", dueDate: new Date().toISOString().slice(0,10), inSequence: null, state: "In Progress", stateType: "started", description: "Equity stake revisions — align with Chris Wesser's commentary. Need signature before EOD.", labels: ["legal", "fundraise"] },
  { id: "OPS-015", task: "Q2 investor update deck", who: "Ethan", level: "mid", size: "M", dueDate: new Date(Date.now()+86400000).toISOString().slice(0,10), inSequence: null, state: "In Progress", stateType: "started", description: "Slide deck for Q2 investor update — include pipeline numbers, product milestones, hiring.", labels: ["investor"] },
  { id: "OPS-018", task: "Recruiter playbook finalize", who: "Ethan", level: "mid", size: "S", dueDate: new Date().toISOString().slice(0,10), inSequence: null, state: "Done", stateType: "completed", description: "Playbook for James and Jesse finalized and sent.", labels: ["hiring"] },
  { id: "OMS-031", task: "OMS user adaptation report → Tony", who: "Ramy", level: "high", size: "S", dueDate: new Date().toISOString().slice(0,10), inSequence: null, state: "In Progress", stateType: "started", description: "Report on OMS adoption: who's using it, who isn't, blockers, training gaps.", labels: ["oms", "ops"] },
  { id: "OMS-034", task: "Title company follow-up — 3 open deals", who: "Ramy", level: "mid", size: "XS", dueDate: new Date().toISOString().slice(0,10), inSequence: null, state: "Todo", stateType: "unstarted", description: "Follow up with title company on closing timelines for open deals.", labels: ["oms"] },
  { id: "OMS-037", task: "Compliance notes close-out (today)", who: "Ramy", level: "mid", size: "XS", dueDate: new Date().toISOString().slice(0,10), inSequence: null, state: "Done", stateType: "completed", description: "Compliance notes closed out for today's transactions.", labels: ["compliance"] },
];

// ── Time scheduling ─────────────────────────────────────────────────
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
function computeWorkBlocks(meetingList: CalItem[]) {
  const WORK_START = 8 * 60, WORK_END = 18 * 60, MIN_USEFUL = 30;
  const busy = meetingList.map(m => {
    const start = parseTimeMins(m.t);
    const end = m.tEnd ? parseTimeMins(m.tEnd) : (start !== null ? start + 30 : null);
    return start !== null && end !== null ? { start, end } : null;
  }).filter(Boolean).sort((a, b) => a!.start - b!.start) as { start: number; end: number }[];
  const free: { start: number; end: number }[] = [];
  let cursor = WORK_START;
  for (const b of busy) {
    if (b.start > cursor + MIN_USEFUL) free.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < WORK_END - MIN_USEFUL) free.push({ start: cursor, end: WORK_END });
  const fmt = (b: { start: number; end: number }) => `${fmtMins(b.start)} – ${fmtMins(b.end)}`;
  const morning = free.filter(b => b.start < 12 * 60 && (b.end - b.start) >= MIN_USEFUL);
  const afternoon = free.filter(b => b.start >= 11 * 60 && (b.end - b.start) >= MIN_USEFUL);
  return {
    salesCalls: morning[0] ? fmt(morning[0]) : free[0] ? fmt(free[0]) : undefined,
    tasks: morning[1] ? fmt(morning[1]) : afternoon[0] ? fmt(afternoon[0]) : undefined,
    emails: afternoon[0] ? fmt(afternoon[0]) : free[2] ? fmt(free[2]) : undefined,
  };
}

// ── Design tokens ───────────────────────────────────────────────────
const BLK = "#111";
const BORDER = "1px solid #D4D4D4";
const HEAVY = "2px solid #222";
const HDR_BG = "#F0F0EE";
const DATE_STR = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ── Day Timeline ─────────────────────────────────────────────────────
const TL_START = 8 * 60;              // 8:00 AM in minutes from midnight
const TL_END   = 18 * 60;            // 6:00 PM
const TL_TOTAL = TL_END - TL_START;  // 600 minutes
const PPM      = 2;                   // pixels per minute → 1200px total
const TL_W     = TL_TOTAL * PPM;     // 1200px

function getCurrentMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function DayTimeline({ meetings }: { meetings: CalItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nowMins, setNowMins] = useState<number>(getCurrentMins);

  useEffect(() => {
    const interval = setInterval(() => setNowMins(getCurrentMins()), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const nowX = Math.max(0, Math.min((nowMins - TL_START) * PPM, TL_W));
    const containerW = containerRef.current.clientWidth;
    containerRef.current.scrollLeft = nowX - containerW / 2;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nowX  = (nowMins - TL_START) * PPM;
  const inDay = nowMins >= TL_START && nowMins <= TL_END;
  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8..18

  return (
    <div style={{ borderBottom: "1px solid #EBEBEB" }}>
      <div
        ref={containerRef}
        style={{ overflowX: "auto", overflowY: "hidden", padding: "8px 20px 0", WebkitOverflowScrolling: "touch" } as React.CSSProperties}
      >
        <div style={{ position: "relative", width: TL_W, height: 90, flexShrink: 0 }}>

          {/* Hour gridlines + labels */}
          {hours.map(h => {
            const x = (h * 60 - TL_START) * PPM;
            const isNoon = h === 12;
            const label  = isNoon ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`;
            return (
              <React.Fragment key={h}>
                <div style={{
                  position: "absolute", left: x, top: 0, bottom: 22,
                  width: 1, background: h === 8 ? "transparent" : "#EBEBEB",
                }} />
                <div style={{
                  position: "absolute", left: x + 3, bottom: 5,
                  fontSize: 8, fontWeight: isNoon ? 800 : 600,
                  color: isNoon ? "#555" : "#BBB",
                  letterSpacing: 0.2, whiteSpace: "nowrap",
                }}>
                  {label}
                </div>
              </React.Fragment>
            );
          })}

          {/* Meeting blocks */}
          {meetings.map((m, i) => {
            const startMin = parseTimeMins(m.t);
            const endMin   = m.tEnd ? parseTimeMins(m.tEnd) : startMin !== null ? startMin + 30 : null;
            if (startMin === null || endMin === null) return null;
            const x = Math.max(0, (startMin - TL_START) * PPM);
            const w = Math.max(6, (endMin - startMin) * PPM - 2);
            const wide = w > 100;
            // Compact time range for narrow blocks (e.g. "9:00" instead of "9:00 AM – 9:30 AM")
            const timeRange = wide
              ? `${m.t}${m.tEnd ? ` – ${m.tEnd}` : ""}`
              : m.t.replace(/ (AM|PM)$/i, "");
            return (
              <div key={i} style={{
                position: "absolute", left: x, top: 6,
                width: w, height: 58,
                background: "#fff", border: "1.5px solid #222",
                borderRadius: 3, padding: "4px 5px",
                overflow: "hidden", boxSizing: "border-box",
                cursor: "default",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 900, color: "#111",
                  lineHeight: 1.2, whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {m.n}
                </div>
                <div style={{ fontSize: 8, color: "#777", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {timeRange}
                </div>
                {wide && m.loc && (
                  <div style={{ fontSize: 8, color: "#AAA", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.loc}
                  </div>
                )}
              </div>
            );
          })}

          {/* Now line */}
          {inDay && (
            <>
              <div style={{
                position: "absolute", left: nowX, top: 0, bottom: 22,
                width: 2, background: "#C62828", borderRadius: 1, zIndex: 10,
              }} />
              <div style={{
                position: "absolute", left: nowX + 4, top: 6,
                fontSize: 8, fontWeight: 900, color: "#C62828",
                letterSpacing: 0.3, whiteSpace: "nowrap",
                background: "#fff", padding: "0 2px", zIndex: 11,
              }}>
                {fmtMins(nowMins)}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

// ── Interactive checkbox ─────────────────────────────────────────────
function CB({ id, checked, onToggle }: { id: string; checked: boolean; onToggle: (id: string) => void }) {
  return (
    <div onClick={() => onToggle(id)} style={{
      width: 16, height: 16,
      border: checked ? "2px solid #111" : "1.5px solid #aaa",
      borderRadius: 3, background: checked ? "#111" : "#fff",
      cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, transition: "all 0.12s",
    }}>
      {checked && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1, fontWeight: 900 }}>✓</span>}
    </div>
  );
}

// ── Section label with optional nav link and time badge ──────────────
function SL({ text, color = "#444", time, view, onNavigate }: {
  text: string; color?: string; time?: string;
  view?: NavView; onNavigate?: (v: NavView) => void;
}) {
  const clickable = view && onNavigate;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      marginBottom: 5, marginTop: 16,
    }}>
      <div
        onClick={clickable ? () => onNavigate!(view!) : undefined}
        style={{
          fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: 1.4,
          color, cursor: clickable ? "pointer" : "default",
          borderBottom: clickable ? `1.5px solid ${color}55` : "none",
          paddingBottom: clickable ? 1 : 0,
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        {text}
        {clickable && <span style={{ fontSize: 9, opacity: 0.6 }}>↗</span>}
      </div>
      {time && (
        <div style={{
          fontSize: 9, fontWeight: 700, color: "#888",
          background: "#EFEFED", border: "1px solid #DDD", borderRadius: 4,
          padding: "1px 7px", letterSpacing: 0.3, fontFamily: "monospace",
        }}>{time}</div>
      )}
    </div>
  );
}

// ── Table helpers ────────────────────────────────────────────────────
function TH({ children, w, center }: { children: React.ReactNode; w?: number; center?: boolean }) {
  return (
    <th style={{
      fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8,
      color: "#555", padding: "4px 7px", textAlign: center ? "center" : "left",
      background: HDR_BG, borderBottom: HEAVY, whiteSpace: "nowrap",
      width: w !== undefined ? w : undefined,
    }}>{children}</th>
  );
}
function TD({ children, center, bold, small, dim, strike }: {
  children?: React.ReactNode; center?: boolean; bold?: boolean;
  small?: boolean; dim?: boolean; strike?: boolean;
}) {
  return (
    <td style={{
      fontSize: small ? 9 : 11, fontWeight: bold ? 700 : 400,
      color: dim ? "#999" : BLK, padding: "5px 7px",
      textAlign: center ? "center" : "left",
      textDecoration: strike ? "line-through" : "none",
      borderBottom: "1px solid #EBEBEB", verticalAlign: "top",
    }}>{children}</td>
  );
}

// ── Management task table (Ethan / Ramy) ────────────────────────────
function MgmtTable({ items, prefix, todayStr, trackStatus, fmtDue, setHoveredLin, setTooltipPos }: {
  items: LinearItem[];
  prefix: string;
  todayStr: string;
  trackStatus: (l: LinearItem) => "overdue" | "due-today" | "at-risk" | "ok";
  fmtDue: (d: string | null | undefined) => string;
  setHoveredLin: (l: LinearItem | null) => void;
  setTooltipPos: (p: { x: number; y: number }) => void;
}) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER, marginBottom: 12 }}>
      <thead>
        <tr>
          <TH w={22} center>ST</TH>
          <TH w={68}>ID</TH>
          <TH>TASK</TH>
          <TH w={56} center>DUE</TH>
          <TH w={68} center>STATUS</TH>
          <TH w={36} center>SIZE</TH>
        </tr>
      </thead>
      <tbody>
        {items.map((l, i) => {
          const isDone = l.stateType === "completed" || l.stateType === "cancelled";
          const ts = trackStatus(l);
          const rowBg = isDone ? "#F9F9F9" : l.level === "high" ? "#FFF5F5" : "#fff";
          const trackColor = isDone ? "#999" : ts === "overdue" ? "#C62828" : ts === "due-today" ? "#E65100" : ts === "at-risk" ? "#E65100" : "#2E7D32";
          const trackLabel = isDone ? "— Done" : ts === "overdue" ? "✗ Overdue" : ts === "due-today" ? "🔥 Today" : ts === "at-risk" ? "⚠ At Risk" : "✓ OK";
          const sizeColor = l.size === "XL" ? "#C62828" : l.size === "L" ? "#1565C0" : l.size === "M" ? "#2E7D32" : "#888";
          const stateGlyph = isDone && l.stateType === "completed" ? "✓" : isDone ? "✕" : l.stateType === "started" ? "▷" : l.stateType === "backlog" ? "·" : "○";
          const stateColor = isDone && l.stateType === "completed" ? "#2E7D32" : isDone ? "#999" : l.stateType === "started" ? "#2563EB" : "#aaa";
          return (
            <tr
              key={`${prefix}-${i}`}
              className="dash-row-hover"
              style={{ background: rowBg, opacity: isDone ? 0.55 : 1, cursor: "default" }}
              onMouseEnter={e => { setHoveredLin(l); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
              onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHoveredLin(null)}
            >
              <TD center>
                <span style={{ fontSize: 13, fontWeight: 800, color: stateColor, lineHeight: 1 }}>{stateGlyph}</span>
              </TD>
              <TD small bold>
                {l.url
                  ? <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB", textDecoration: "none" }}>{l.id}</a>
                  : <span style={{ color: "#2563EB" }}>{l.id}</span>
                }
              </TD>
              <TD strike={isDone}>{l.task}</TD>
              <TD small center>
                <span style={{ fontWeight: ts === "overdue" || ts === "due-today" ? 800 : 400, color: ts === "overdue" ? "#C62828" : ts === "due-today" ? "#E65100" : "#777" }}>
                  {fmtDue(l.dueDate)}
                </span>
              </TD>
              <TD small center>
                <span style={{ fontWeight: 700, color: trackColor }}>{trackLabel}</span>
              </TD>
              <TD small center>
                <span style={{ fontWeight: 800, color: sizeColor }}>{l.size || "—"}</span>
              </TD>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── White "page" card ────────────────────────────────────────────────
function Sheet({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div style={{ marginBottom: 0 }}>
      <div style={{ fontSize: 9, color: "#666", letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", fontFamily: F, marginBottom: 8 }}>{label}</div>
      <div style={{
        background: "#fff", borderRadius: 4,
        boxShadow: "0 4px 24px rgba(0,0,0,0.35), 0 1px 4px rgba(0,0,0,0.15)",
        overflow: "hidden", fontFamily: F, color: BLK, fontSize: 11,
      }}>
        {children}
      </div>
    </div>
  );
}

// ── Page header ──────────────────────────────────────────────────────
function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div style={{ padding: "12px 18px 10px", borderBottom: HEAVY, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div>
        <div style={{ fontFamily: FS, fontSize: 16, fontWeight: 900, letterSpacing: 0.8, color: BLK }}>{title}</div>
        <div style={{ fontSize: 10, color: "#777", marginTop: 2 }}>{DATE_STR}</div>
      </div>
      <div style={{ fontSize: 9, color: "#999", fontStyle: "italic", textAlign: "right", maxWidth: 260, lineHeight: 1.4 }}>"{sub}"</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
export function DashboardView({ tasks, tDone, calendarData, emailsImportant, linearItems, contacts, onComplete, onNavigate }: Props) {
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [hoveredLin, setHoveredLin] = useState<LinearItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // ── Today's Wins — manual entries, persisted in localStorage per day ─
  const _winsKey = `tcc_wins_${new Date().toISOString().slice(0, 10)}`;
  const [wins, setWins] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(_winsKey) || '["",""]'); } catch { return ["", ""]; }
  });
  const updateWin = (i: number, val: string) => {
    setWins(prev => { const next = [...prev]; next[i] = val; localStorage.setItem(_winsKey, JSON.stringify(next)); return next; });
  };

  useEffect(() => {
    get<LocalTask[]>("/tasks/local").then(setLocalTasks).catch(() => {});
  }, []);

  const toggle = useCallback((id: string) => {
    setChecked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const ck = (id: string) => checked.has(id);

  const completeLocalTask = async (id: string) => {
    toggle(`local-${id}`);
    await patch(`/tasks/local/${id}`, { status: "done" }).catch(() => {});
    setLocalTasks(prev => prev.filter(t => t.id !== id));
  };


  // Data with sample fallbacks
  const top3    = tasks.filter(t => !tDone[t.id]).slice(0, 3).length > 0 ? tasks.filter(t => !tDone[t.id]).slice(0, 3) : SAMPLE_TOP3;
  const callList = contacts.length > 0 ? contacts.slice(0, 10) : SAMPLE_CALLS;
  const meetings = calendarData.filter(c => c.real).length > 0 ? calendarData.filter(c => c.real) : SAMPLE_MEETINGS;
  const emails   = emailsImportant.length > 0 ? emailsImportant.slice(0, 5) : SAMPLE_EMAILS;
  const allLinItems = linearItems.length > 0 ? linearItems.slice(0, 20) : SAMPLE_LINEAR;
  const ethanItems  = allLinItems.filter(l => l.who?.toLowerCase().includes("ethan"));
  const ramiItems   = allLinItems.filter(l => l.who?.toLowerCase().includes("ramy") || l.who?.toLowerCase().includes("remy"));
  const linItems    = allLinItems.filter(l => !ethanItems.includes(l) && !ramiItems.includes(l));
  const todayStr    = new Date().toISOString().slice(0, 10);
  const wb       = computeWorkBlocks(meetings);

  const trackStatus = (l: LinearItem): "overdue" | "due-today" | "at-risk" | "ok" => {
    if (l.dueDate) {
      if (l.dueDate < todayStr) return "overdue";
      if (l.dueDate === todayStr) return "due-today";
    }
    if (l.level === "high") return "at-risk";
    return "ok";
  };
  const fmtDue = (d: string | null | undefined): string => {
    if (!d) return "—";
    if (d === todayStr) return "Today";
    const tmrw = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (d === tmrw) return "Tmrw";
    return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "#fff" }}>
      <style>{`
        .dash-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        @media (max-width: 540px) { .dash-2col { grid-template-columns: 1fr; } }
        .dash-row-hover:hover { background: #F7F7F5 !important; }
      `}</style>

      <div style={{ width: "100%" }}>

        {/* ══ FRONT ════════════════════════════════════════════════ */}
        <PageHeader title="FLIPIQ DAILY ACTION SHEET" sub="Follow the plan that I gave you! — God" />

        {/* ── Day Timeline ── real calendar data only (no sample fallback) */}
        <DayTimeline meetings={calendarData.filter(c => c.real)} />

        <div style={{ padding: "12px 20px 18px" }}>

            {/* ── TOP 3 ── */}
            <SL text="★ Top 3 — Do These First" color="#B7791F" view="tasks" onNavigate={onNavigate} />
            <div style={{ marginBottom: 6 }}>
              {Array.from({ length: 3 }).map((_, i) => {
                const t = top3[i];
                const id = t ? `top3-${t.id}` : `top3-blank-${i}`;
                const done = t ? tDone[t.id] || ck(id) : false;
                return (
                  <div key={id} className="dash-row-hover" style={{
                    display: "flex", gap: 10, alignItems: "flex-start",
                    padding: "8px 10px", borderBottom: "1px solid #EBEBEB",
                    background: i === 0 ? "#FFFBF2" : "#fff", transition: "background 0.15s",
                  }}>
                    <CB id={id} checked={done} onToggle={t ? () => { toggle(id); onComplete(t); } : toggle} />
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0,
                      background: done ? "#ccc" : (i === 0 ? BLK : "#DDD"),
                      color: done ? "#aaa" : (i === 0 ? "#fff" : "#888"),
                      fontSize: 10, fontWeight: 900,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>{i + 1}</div>
                    {t ? (
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: i === 0 ? 700 : 600, color: done ? "#bbb" : BLK, textDecoration: done ? "line-through" : "none", lineHeight: 1.4 }}>{t.text}</div>
                        {t.cat && <div style={{ fontSize: 9, color: "#aaa", marginTop: 1 }}>{t.cat}</div>}
                      </div>
                    ) : <div style={{ flex: 1, height: 1, background: "#EEE", marginTop: 10 }} />}
                  </div>
                );
              })}
            </div>

            {/* ── MY TASKS ── */}
            {localTasks.length > 0 && (
              <>
                <SL text="My Tasks" color="#555" time={wb.tasks} view="tasks" onNavigate={onNavigate} />
                <div style={{ marginBottom: 6 }}>
                  {localTasks.map((t, i) => (
                    <div key={t.id} className="dash-row-hover" style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 10px", borderBottom: "1px solid #EBEBEB", background: "#fff" }}>
                      <CB id={`local-${t.id}`} checked={ck(`local-${t.id}`)} onToggle={() => completeLocalTask(t.id)} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: ck(`local-${t.id}`) ? "#ccc" : BLK, textDecoration: ck(`local-${t.id}`) ? "line-through" : "none" }}>{t.text}</div>
                        {t.size && <span style={{ fontSize: 9, fontWeight: 800, color: t.size === "XL" ? "#C62828" : t.size === "L" ? "#1565C0" : t.size === "M" ? "#2E7D32" : "#888", marginRight: 6 }}>{t.size}</span>}
                      </div>
                      {t.dueDate && <div style={{ fontSize: 9, color: "#aaa", flexShrink: 0 }}>Due {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── SALES CALLS ── */}
            <div style={{ marginBottom: 12 }}>
              <SL text="📞 Sales Calls" color="#C62828" time={wb.salesCalls} view="sales" onNavigate={onNavigate} />
              <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                <thead>
                  <tr><TH w={22} center>✓</TH><TH w={18} center>#</TH><TH>NAME / CO.</TH><TH w={80}>PHONE</TH><TH w={52}>STATUS</TH></tr>
                </thead>
                <tbody>
                  {Array.from({ length: 10 }).map((_, i) => {
                    const c = callList[i];
                    const id = `call-${i}`;
                    const done = ck(id);
                    return (
                      <tr key={id} className="dash-row-hover" style={{ background: "#fff" }}>
                        <TD center><CB id={id} checked={done} onToggle={toggle} /></TD>
                        <TD center small dim>{i + 1}</TD>
                        {c ? (
                          <>
                            <TD strike={done}>
                              <div style={{ fontWeight: 600, fontSize: 11, color: done ? "#ccc" : BLK }}>{c.name}</div>
                              {c.company && <div style={{ fontSize: 8, color: "#aaa" }}>{c.company}</div>}
                            </TD>
                            <TD small dim>{c.phone || "—"}</TD>
                            <TD center small bold>
                              <span style={{ color: c.status === "Hot" ? "#C62828" : c.status === "Warm" ? "#E65100" : c.status === "Cold" ? "#888" : "#555" }}>{c.status || "—"}</span>
                            </TD>
                          </>
                        ) : <><TD /><TD /><TD /></>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── PRIORITY EMAILS ── */}
            <SL text="📧 Priority Emails" color="#E65100" time={wb.emails} view="emails" onNavigate={onNavigate} />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
              <thead>
                <tr><TH w={22} center>✓</TH><TH w={120}>FROM</TH><TH>SUBJECT</TH><TH w={110}>WHY</TH><TH w={85}>ACTION</TH></tr>
              </thead>
              <tbody>
                {emails.map((e, i) => {
                  const id = `email-${i}`;
                  const done = ck(id);
                  return (
                    <tr key={id} className="dash-row-hover" style={{ background: "#fff", cursor: "pointer" }}
                      onClick={() => onNavigate("emails")}>
                      <TD center><CB id={id} checked={done} onToggle={e => { e; toggle(id); }} /></TD>
                      <TD bold strike={done}>{e.from}</TD>
                      <TD small strike={done}>{e.subj}</TD>
                      <TD small dim>{e.why || ""}</TD>
                      <TD small bold><span style={{ color: "#1565C0" }}>{e.p || "—"}</span></TD>
                    </tr>
                  );
                })}
                {Array.from({ length: Math.max(0, 3 - emails.length) }).map((_, i) => (
                  <tr key={`eb-${i}`} style={{ background: "#fff" }}>
                    <TD center><CB id={`eb-${i}`} checked={ck(`eb-${i}`)} onToggle={toggle} /></TD>
                    <TD /><TD /><TD /><TD />
                  </tr>
                ))}
              </tbody>
            </table>

          </div>

        {/* ══ DIVIDER + BACK ════════════════════════════════════════ */}
        <div style={{ borderTop: "3px solid #111", margin: "0 20px", paddingTop: 20 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            <div style={{ fontFamily: FS, fontSize: 14, fontWeight: 900, letterSpacing: 0.8, color: BLK }}>OPERATIONS & AWARENESS</div>
            <div style={{ fontSize: 9, color: "#999", fontStyle: "italic" }}>North Star: 2 deals/month/AA @ $2,500 per acquisition. Everything else is noise.</div>
          </div>
        </div>
        <div style={{ padding: "0 20px 18px" }}>

            {/* ── LINEAR — Engineering in Progress (flags + sequence baked in) ── */}
            <SL text="⚡ Linear — Engineering in Progress" color="#2563EB" />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER, marginBottom: 12 }}>
              <thead>
                <tr>
                  <TH w={22} center>✓</TH>
                  <TH w={22} center>#</TH>
                  <TH w={68}>ID</TH>
                  <TH>TASK</TH>
                  <TH w={64}>OWNER</TH>
                  <TH w={24} center>🚩</TH>
                  <TH w={56} center>DUE</TH>
                  <TH w={68} center>ON TRACK</TH>
                  <TH w={36} center>SIZE</TH>
                  <TH w={40} center>IN SEQ?</TH>
                </tr>
              </thead>
              <tbody>
                {linItems.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: "10px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No active issues</td></tr>
                )}
                {linItems.map((l, i) => {
                  const isCompleted = l.stateType === "completed" || l.stateType === "cancelled";
                  const ts = trackStatus(l);
                  const rowBg = isCompleted ? "#F9F9F9" : l.level === "high" ? "#FFF5F5" : "#fff";
                  const rowOpacity = isCompleted ? 0.55 : 1;
                  const trackColor = isCompleted ? "#999" : ts === "overdue" ? "#C62828" : ts === "due-today" ? "#E65100" : ts === "at-risk" ? "#E65100" : "#2E7D32";
                  const trackLabel = isCompleted ? "— Done" : ts === "overdue" ? "✗ Overdue" : ts === "due-today" ? "🔥 Today" : ts === "at-risk" ? "⚠ At Risk" : "✓ OK";
                  const flagIcon = isCompleted ? "" : l.level === "high" ? "🚩" : l.level === "mid" ? "⚠" : "";
                  const seqColor = l.inSequence === false ? "#C62828" : "#2E7D32";
                  const seqLabel = isCompleted ? "—" : l.inSequence === false ? "✗" : l.inSequence === true ? "✓" : "—";
                  const sizeColor = l.size === "XL" ? "#C62828" : l.size === "L" ? "#1565C0" : l.size === "M" ? "#2E7D32" : "#888";
                  // State indicator glyph
                  const stateGlyph = isCompleted && l.stateType === "completed" ? "✓"
                    : isCompleted ? "✕"
                    : l.stateType === "started" ? "▷"
                    : l.stateType === "backlog" ? "·"
                    : "○";
                  const stateGlyphColor = isCompleted && l.stateType === "completed" ? "#2E7D32"
                    : isCompleted ? "#999"
                    : l.stateType === "started" ? "#2563EB"
                    : "#aaa";
                  return (
                    <tr
                      key={`lin-${i}`}
                      className="dash-row-hover"
                      style={{ background: rowBg, opacity: rowOpacity, cursor: "default" }}
                      onMouseEnter={e => { setHoveredLin(l); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                      onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
                      onMouseLeave={() => setHoveredLin(null)}
                    >
                      <TD center>
                        <span style={{ fontSize: 13, fontWeight: 800, color: stateGlyphColor, lineHeight: 1 }}>{stateGlyph}</span>
                      </TD>
                      <TD center small dim>{isCompleted ? "" : i + 1}</TD>
                      <TD small bold>
                        {l.url
                          ? <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB", textDecoration: "none" }}>{l.id}</a>
                          : <span style={{ color: "#2563EB" }}>{l.id}</span>
                        }
                      </TD>
                      <TD strike={isCompleted}>{l.task}</TD>
                      <TD small>{l.who || "—"}</TD>
                      <TD center><span style={{ fontSize: 11 }}>{flagIcon}</span></TD>
                      <TD small center>
                        <span style={{ fontWeight: ts === "overdue" || ts === "due-today" ? 800 : 400, color: ts === "overdue" ? "#C62828" : ts === "due-today" ? "#E65100" : "#777" }}>
                          {fmtDue(l.dueDate)}
                        </span>
                      </TD>
                      <TD small center>
                        <span style={{ fontWeight: 700, color: trackColor }}>{trackLabel}</span>
                      </TD>
                      <TD small center>
                        <span style={{ fontWeight: 800, color: sizeColor }}>{l.size || "—"}</span>
                      </TD>
                      <TD small center>
                        <span style={{ fontWeight: 700, color: seqColor }}>{seqLabel}</span>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── COO — Ethan ── */}
            {ethanItems.length > 0 && (
              <>
                <SL text="COO — Ethan" color="#444" />
                <MgmtTable items={ethanItems} prefix="ethan" todayStr={todayStr} trackStatus={trackStatus} fmtDue={fmtDue} setHoveredLin={setHoveredLin} setTooltipPos={setTooltipPos} />
              </>
            )}

            {/* ── CSM — Ramy ── */}
            {ramiItems.length > 0 && (
              <>
                <SL text="CSM — Ramy" color="#444" />
                <MgmtTable items={ramiItems} prefix="rami" todayStr={todayStr} trackStatus={trackStatus} fmtDue={fmtDue} setHoveredLin={setHoveredLin} setTooltipPos={setTooltipPos} />
              </>
            )}

            {/* ── TODAY'S WINS ── */}
            <SL text="🏆 Today's Wins" color="#B7791F" />
            <div style={{ border: "2px solid #B7791F33", borderRadius: 4, background: "#FFFBF2", overflow: "hidden", marginBottom: 2 }}>

              {/* Win 1 — Auto: 10 calls + appointments booked */}
              {(() => {
                const callsDone = callList.filter((_, i) => ck(`call-${i}`)).length;
                const callWin = callsDone >= 10;
                const apptCount = meetings.length;
                return (
                  <div style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "11px 14px", borderBottom: "1px solid #EEE4CC",
                    background: callWin ? "#F0FDF4" : "#FFFBF2",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 900, color: callWin ? "#16A34A" : "#B7791F", width: 18, flexShrink: 0, textAlign: "center" }}>1.</span>
                    <div style={{ flex: 1 }}>
                      {callWin ? (
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#14532D" }}>
                          10 Sales Calls ✓ — {apptCount} appointment{apptCount !== 1 ? "s" : ""} booked
                        </div>
                      ) : (
                        <>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#78350F" }}>10 Sales Calls</div>
                          <div style={{ fontSize: 10, color: "#A16207", marginTop: 1 }}>
                            {callsDone} / 10 — {apptCount} appointment{apptCount !== 1 ? "s" : ""} booked so far
                          </div>
                        </>
                      )}
                    </div>
                    {callWin && <span style={{ fontSize: 10, fontWeight: 800, color: "#16A34A", letterSpacing: 0.4 }}>WIN</span>}
                  </div>
                );
              })()}

              {/* Wins 2 & 3 — manual */}
              {wins.map((val, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px",
                  borderBottom: i === 0 ? "1px solid #EEE4CC" : "none",
                }}>
                  <span style={{ fontSize: 13, fontWeight: 900, color: "#B7791F", width: 18, flexShrink: 0, textAlign: "center" }}>
                    {i + 2}.
                  </span>
                  <input
                    value={val}
                    onChange={e => updateWin(i, e.target.value)}
                    placeholder={`Add win #${i + 2}…`}
                    style={{
                      flex: 1, border: "none", outline: "none",
                      fontSize: 12, fontWeight: val ? 600 : 400,
                      fontFamily: F, background: "transparent",
                      color: val ? "#78350F" : "#C49A3A",
                      padding: "2px 0",
                    }}
                  />
                </div>
              ))}
            </div>

          </div>

      </div>

      {/* ── LINEAR HOVER TOOLTIP ── */}
      {hoveredLin && (
        <div
          style={{
            position: "fixed",
            left: Math.min(tooltipPos.x + 18, (typeof window !== "undefined" ? window.innerWidth : 1200) - 360),
            top: Math.max(tooltipPos.y - 20, 8),
            zIndex: 9999,
            background: "#1C1C1E",
            color: "#F5F5F5",
            borderRadius: 8,
            padding: "14px 16px",
            width: 340,
            boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
            fontSize: 11,
            lineHeight: 1.55,
            pointerEvents: "none",
            fontFamily: F,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: "#93C5FD", letterSpacing: 0.6 }}>{hoveredLin.id}</span>
            {hoveredLin.state && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 20,
                background: hoveredLin.stateType === "completed" ? "#14532D44" : hoveredLin.stateType === "started" ? "#1E3A5F44" : "#33333366",
                color: hoveredLin.stateType === "completed" ? "#86EFAC" : hoveredLin.stateType === "started" ? "#93C5FD" : "#AAA",
                border: "1px solid",
                borderColor: hoveredLin.stateType === "completed" ? "#86EFAC44" : hoveredLin.stateType === "started" ? "#93C5FD44" : "#55555544",
              }}>{hoveredLin.state}</span>
            )}
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#FFFFFF", marginBottom: 8, lineHeight: 1.4 }}>{hoveredLin.task}</div>
          {hoveredLin.description && (
            <div style={{ fontSize: 10.5, color: "#C0C0C0", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #333", lineHeight: 1.5 }}>
              {hoveredLin.description.length > 280 ? hoveredLin.description.slice(0, 280) + "…" : hoveredLin.description}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: "4px 8px", fontSize: 10.5 }}>
            <span style={{ color: "#777" }}>Assignee</span>
            <span style={{ color: "#F5F5F5" }}>{hoveredLin.who || "—"}</span>
            <span style={{ color: "#777" }}>Priority</span>
            <span style={{ color: hoveredLin.level === "high" ? "#FCA5A5" : hoveredLin.level === "mid" ? "#FCD34D" : "#AAA", fontWeight: 600 }}>
              {hoveredLin.level === "high" ? "🔴 High" : hoveredLin.level === "mid" ? "⚠ Medium" : "Low"}
            </span>
            <span style={{ color: "#777" }}>Due Date</span>
            <span style={{ color: "#F5F5F5" }}>{fmtDue(hoveredLin.dueDate)}</span>
            <span style={{ color: "#777" }}>Size</span>
            <span style={{ color: "#F5F5F5", fontWeight: 700 }}>{hoveredLin.size || "—"}</span>
            {hoveredLin.labels && hoveredLin.labels.length > 0 && (
              <>
                <span style={{ color: "#777" }}>Labels</span>
                <span style={{ color: "#F5F5F5" }}>{hoveredLin.labels.join(", ")}</span>
              </>
            )}
          </div>
          {hoveredLin.url && (
            <div style={{ marginTop: 10, paddingTop: 8, borderTop: "1px solid #333", fontSize: 10, color: "#93C5FD" }}>
              Open in Linear ↗ — click the ID to navigate
            </div>
          )}
        </div>
      )}
    </div>
  );
}
