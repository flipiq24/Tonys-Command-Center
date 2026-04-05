import React, { useState, useEffect, useCallback, useRef } from "react";
import { C, F, FS } from "./constants";
import { get, patch } from "@/lib/api";
import { ContactDrawer } from "./ContactDrawer";
import { SmsModal } from "./SmsModal";
import type { TaskItem, CalItem, EmailItem, LinearItem, SlackItem } from "./types";

// ── Types ──────────────────────────────────────────────────────────
interface LocalTask { id: string; text: string; dueDate?: string | null; taskType?: string | null; size?: string | null; }
interface Contact { id?: string; name: string; phone?: string; company?: string; status?: string; nextStep?: string; lastContactDate?: string; email?: string; }
type NavView = "emails" | "schedule" | "sales" | "tasks";

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calendarData: CalItem[];
  emailsImportant: EmailItem[];
  linearItems: LinearItem[];
  slackItems?: SlackItem[];
  contacts: Contact[];
  onComplete: (task: TaskItem) => void;
  onNavigate: (view: NavView) => void;
  onOpenEmail?: (em: EmailItem) => void;
  onAttempt?: (contact: { id: string | number; name: string; email?: string }) => void;
  onCompose?: (contact: Contact) => void;
}


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
interface WorkBlock { start: number; end: number; label: string; kind: "sales" | "email"; }

function computeWorkBlocks(meetingList: CalItem[]) {
  const WORK_START = 8 * 60, WORK_END = 18 * 60, MIN_USEFUL = 30;
  const SALES_NEED = 120, EMAIL_NEED = 30;
  const busy = meetingList.map(m => {
    const start = parseTimeMins(m.t);
    const end = m.tEnd ? parseTimeMins(m.tEnd) : (start !== null ? start + 30 : null);
    return start !== null && end !== null ? { start, end } : null;
  }).filter(Boolean).sort((a, b) => a!.start - b!.start) as { start: number; end: number }[];

  const getFreeSlots = (occupiedBusy: { start: number; end: number }[]) => {
    const free: { start: number; end: number }[] = [];
    let cursor = WORK_START;
    for (const b of occupiedBusy) {
      if (b.start > cursor + MIN_USEFUL) free.push({ start: cursor, end: b.start });
      cursor = Math.max(cursor, b.end);
    }
    if (cursor < WORK_END - MIN_USEFUL) free.push({ start: cursor, end: WORK_END });
    return free;
  };

  const fmt = (b: { start: number; end: number }) => `${fmtMins(b.start)} – ${fmtMins(b.end)}`;

  const free0 = getFreeSlots(busy);
  const morning = free0.filter(b => b.start < 12 * 60 && (b.end - b.start) >= MIN_USEFUL);
  const afternoon = free0.filter(b => b.start >= 11 * 60 && (b.end - b.start) >= MIN_USEFUL);

  // ── Compute Sales Calls auto-blocks (2 hrs starting 8 AM, split if needed) ──
  const autoBlocks: WorkBlock[] = [];
  let salesRemaining = SALES_NEED;
  const busyForSales = [...busy];
  for (const slot of getFreeSlots(busyForSales)) {
    if (salesRemaining <= 0) break;
    if (slot.start < WORK_START) continue;
    const avail = slot.end - slot.start;
    if (avail < MIN_USEFUL) continue;
    const take = Math.min(avail, salesRemaining);
    const isFirst = salesRemaining === SALES_NEED;
    const needsSplit = salesRemaining < SALES_NEED;
    autoBlocks.push({
      start: slot.start,
      end: slot.start + take,
      label: isFirst ? (take < SALES_NEED ? "Sales Calls (pt. 1)" : "Sales Calls") : needsSplit ? "Sales Calls (pt. 2)" : "Sales Calls",
      kind: "sales",
    });
    busyForSales.push({ start: slot.start, end: slot.start + take });
    busyForSales.sort((a, b) => a.start - b.start);
    salesRemaining -= take;
  }

  // ── Compute Priority Email block (30 min after sales calls) ──
  const allOccupied = [...busy, ...autoBlocks.map(b => ({ start: b.start, end: b.end }))].sort((a, b) => a.start - b.start);
  for (const slot of getFreeSlots(allOccupied)) {
    const avail = slot.end - slot.start;
    if (avail >= EMAIL_NEED) {
      autoBlocks.push({ start: slot.start, end: slot.start + EMAIL_NEED, label: "Priority Emails", kind: "email" });
      break;
    }
  }

  return {
    salesCalls: morning[0] ? fmt(morning[0]) : free0[0] ? fmt(free0[0]) : undefined,
    tasks: morning[1] ? fmt(morning[1]) : afternoon[0] ? fmt(afternoon[0]) : undefined,
    emails: afternoon[0] ? fmt(afternoon[0]) : free0[2] ? fmt(free0[2]) : undefined,
    autoBlocks,
  };
}

// ── Design tokens ───────────────────────────────────────────────────
const BLK = "#111";
const BORDER = "1px solid #D4D4D4";
const HEAVY = "2px solid #222";
const HDR_BG = "#F0F0EE";
const DATE_STR = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ── Day Timeline ─────────────────────────────────────────────────────
const TL_START = 6 * 60;              // 6:00 AM in minutes from midnight
const TL_END   = 21 * 60;            // 9:00 PM
const TL_TOTAL = TL_END - TL_START;  // 900 minutes
const PPM      = 2;                   // pixels per minute → 1800px total
const TL_W     = TL_TOTAL * PPM;     // 1800px

function getCurrentMins() {
  const n = new Date();
  return n.getHours() * 60 + n.getMinutes();
}

function DayTimeline({ meetings, autoBlocks, onNavigate }: { meetings: CalItem[]; autoBlocks: WorkBlock[]; onNavigate?: (v: NavView) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [nowMins, setNowMins] = useState<number>(getCurrentMins);

  const centerOnNow = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const mins = getCurrentMins();
    const clamped = Math.max(TL_START, Math.min(mins, TL_END));
    const nx = (clamped - TL_START) * PPM;
    const w = el.clientWidth || el.offsetWidth || 400;
    el.scrollLeft = Math.max(0, nx - w / 2);
  }, []);

  // Auto-recenter on mount (triple-try for slow flex layouts)
  useEffect(() => {
    let raf1: number, raf2: number;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(centerOnNow);
    });
    const t1 = setTimeout(centerOnNow, 200);
    const t2 = setTimeout(centerOnNow, 600);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [centerOnNow]);

  // Tick every minute — update the time and re-center so the line stays in view
  useEffect(() => {
    const interval = setInterval(() => {
      setNowMins(getCurrentMins());
      centerOnNow();
    }, 60_000);
    return () => clearInterval(interval);
  }, [centerOnNow]);


  const pan = (delta: number) => {
    if (!containerRef.current) return;
    containerRef.current.scrollLeft = Math.max(0, Math.min(containerRef.current.scrollLeft + delta, TL_W));
  };

  const nowX  = (nowMins - TL_START) * PPM;
  const inDay = nowMins >= TL_START && nowMins <= TL_END;
  const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6 AM..9 PM

  const arrowBtn: React.CSSProperties = {
    flexShrink: 0, width: 30, alignSelf: "stretch",
    display: "flex", alignItems: "center", justifyContent: "center",
    background: "#F8F8F8", border: "none", cursor: "pointer",
    fontSize: 18, fontWeight: 900, color: "#444",
    padding: 0,
  };

  return (
    <div style={{ borderBottom: "1px solid #EBEBEB", display: "flex", alignItems: "stretch", userSelect: "none" }}>
      <button style={{ ...arrowBtn, borderRight: "1px solid #E8E8E8" }} onClick={() => pan(-240)} title="Earlier">‹</button>
      <div
        ref={containerRef}
        style={{ flex: 1, overflowX: "hidden", overflowY: "hidden", padding: "8px 0 0" } as React.CSSProperties}
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
            const timeRange = wide
              ? `${m.t}${m.tEnd ? ` – ${m.tEnd}` : ""}`
              : m.t.replace(/ (AM|PM)$/i, "");
            return (
              <div key={i}
                onClick={() => onNavigate?.("schedule")}
                title={`${m.n}${m.t ? ` · ${m.t}` : ""}${m.loc ? ` · ${m.loc}` : ""}${m.note ? ` — ${m.note}` : ""} — Click to open Calendar`}
                style={{
                position: "absolute", left: x, top: 6,
                width: w, height: 58,
                background: "#fff", border: "1.5px solid #222",
                borderRadius: 3, padding: "4px 5px",
                overflow: "hidden", boxSizing: "border-box",
                cursor: onNavigate ? "pointer" : "default",
                transition: "border-color 0.15s, background 0.15s",
              }}
              onMouseEnter={e => { if (onNavigate) { e.currentTarget.style.borderColor = "#2563EB"; e.currentTarget.style.background = "#F0F6FF"; }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "#222"; e.currentTarget.style.background = "#fff"; }}
              >
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

          {/* Auto-inserted work blocks (Sales Calls + Priority Emails) */}
          {autoBlocks.map((blk, i) => {
            const x = Math.max(0, (blk.start - TL_START) * PPM);
            const w = Math.max(6, (blk.end - blk.start) * PPM - 2);
            const isSales = blk.kind === "sales";
            const borderColor = isSales ? "#C62828" : "#E65100";
            const bgColor = isSales ? "#FFF0F0" : "#FFF5EC";
            const textColor = isSales ? "#C62828" : "#E65100";
            const wide = w > 80;
            return (
              <div key={`auto-${i}`} style={{
                position: "absolute", left: x, top: 6,
                width: w, height: 58,
                background: bgColor,
                border: `1.5px solid ${borderColor}`,
                borderRadius: 3, padding: "4px 5px",
                overflow: "hidden", boxSizing: "border-box",
                cursor: "default",
              }}>
                <div style={{
                  fontSize: 9, fontWeight: 800, fontStyle: "italic", color: textColor,
                  lineHeight: 1.2, whiteSpace: "nowrap",
                  overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {blk.label}
                </div>
                {wide && (
                  <div style={{ fontSize: 8, color: textColor, opacity: 0.7, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {fmtMins(blk.start)} – {fmtMins(blk.end)}
                  </div>
                )}
              </div>
            );
          })}

          {/* Now line — green vertical line only, dot sits below meetings */}
          {inDay && (
            <>
              {/* vertical line — behind meetings */}
              <div style={{
                position: "absolute", left: nowX, top: 0, bottom: 22,
                width: 2, background: "#16A34A", borderRadius: 1, zIndex: 1,
              }} />
              {/* dot at the bottom of the line, below meeting blocks */}
              <div style={{
                position: "absolute", left: nowX - 4, bottom: 24,
                width: 10, height: 10,
                background: "#16A34A", borderRadius: "50%",
                zIndex: 2,
              }} />
              {/* time label below the dot */}
              <div style={{
                position: "absolute", left: nowX - 12, bottom: 4,
                fontSize: 9, fontWeight: 900, color: "#16A34A",
                letterSpacing: 0.3, whiteSpace: "nowrap",
                zIndex: 2,
              }}>
                {fmtMins(nowMins)}
              </div>
            </>
          )}

        </div>
      </div>
      <button style={{ ...arrowBtn, borderLeft: "1px solid #E8E8E8" }} onClick={() => pan(240)} title="Later">›</button>
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
function MgmtTable({ items, prefix, todayStr, trackStatus, fmtDue, setHoveredLin, setTooltipPos, slackItems = [] }: {
  items: LinearItem[];
  prefix: string;
  todayStr: string;
  trackStatus: (l: LinearItem) => "overdue" | "due-today" | "at-risk" | "ok";
  fmtDue: (d: string | null | undefined) => string;
  setHoveredLin: (l: LinearItem | null) => void;
  setTooltipPos: (p: { x: number; y: number }) => void;
  slackItems?: SlackItem[];
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
          const isMentioned = slackItems.some(s => l.id && s.message?.includes(l.id));
          return (
            <tr
              key={`${prefix}-${i}`}
              className="dash-row-hover"
              style={{ background: rowBg, opacity: isDone ? 0.55 : 1, cursor: l.url ? "pointer" : "default" }}
              onClick={() => l.url && window.open(l.url, "_blank", "noopener")}
              onMouseEnter={e => { setHoveredLin(l); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
              onMouseMove={e => setTooltipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={() => setHoveredLin(null)}
            >
              <TD center>
                <span style={{ fontSize: 13, fontWeight: 800, color: stateColor, lineHeight: 1 }}>{stateGlyph}</span>
              </TD>
              <TD small bold>
                {l.url
                  ? <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563EB", textDecoration: "none" }}>{l.identifier || l.id}</a>
                  : <span style={{ color: "#2563EB" }}>{l.identifier || l.id}</span>
                }
              </TD>
              <TD strike={isDone}>
                <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                  <span>{l.task}</span>
                  {isMentioned && (
                    <span style={{ fontSize: 9, fontWeight: 800, background: C.bluBg, color: C.blu, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", letterSpacing: 0.3 }}>@ Mentioned</span>
                  )}
                </span>
              </TD>
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
export function DashboardView({ tasks, tDone, calendarData, emailsImportant, linearItems, slackItems = [], contacts, onComplete, onNavigate, onOpenEmail, onAttempt, onCompose }: Props) {
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const [hoveredLin, setHoveredLin] = useState<LinearItem | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // ── Generic hover tooltip for calls / top3 / emails ──────────────
  type HoverPayload =
    | { kind: "call"; c: Contact }
    | { kind: "task"; t: TaskItem; rank: number }
    | { kind: "email"; em: EmailItem };
  const [hovered, setHovered] = useState<HoverPayload | null>(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const onHoverEnter = (payload: HoverPayload, e: React.MouseEvent) => {
    setHovered(payload); setHoverPos({ x: e.clientX, y: e.clientY });
  };
  const onHoverMove = (e: React.MouseEvent) => setHoverPos({ x: e.clientX, y: e.clientY });
  const onHoverLeave = () => setHovered(null);

  // ── Today's Wins — manual entries, persisted in localStorage per day ─
  const _winsKey = `tcc_wins_${new Date().toISOString().slice(0, 10)}`;
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [smsContact, setSmsContact] = useState<Contact | null>(null);

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


  // Data — real sources only
  const top3    = tasks.filter(t => !tDone[t.id]).filter(t => !/sales.?call/i.test(t.text)).slice(0, 3);
  const callList = contacts.slice(0, 10);
  const meetings = calendarData.filter(c => c.real);
  const emails   = emailsImportant.slice(0, 5);
  const allLinItems = linearItems.slice(0, 50);
  const ethanItems  = allLinItems.filter(l => l.who?.toLowerCase().includes("ethan"));
  const ramiItems   = allLinItems.filter(l => l.who?.toLowerCase().includes("rami") || l.who?.toLowerCase().includes("ramy") || l.who?.toLowerCase().includes("remy"));
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

        {/* ── Day Timeline ── real calendar data only (no sample fallback) */}
        <DayTimeline meetings={calendarData.filter(c => c.real)} autoBlocks={wb.autoBlocks} onNavigate={onNavigate} />

        <div style={{ padding: "12px 20px 18px" }}>

            {/* ── SALES CALLS — 10 Today ── */}
            <SL text="📞 Sales Calls — 10 Today" color="#C62828" view="sales" onNavigate={onNavigate} />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER, marginBottom: 2 }}>
              <thead>
                <tr><TH w={22} center>✓</TH><TH w={28} center>#</TH><TH>CONTACT</TH><TH w={120}>COMPANY</TH><TH w={90}>STATUS</TH><TH>NEXT STEP</TH></tr>
              </thead>
              <tbody>
                {callList.slice(0, 10).map((c, i) => {
                  const id = `call-${i}`;
                  const done = ck(id);
                  return (
                    <tr key={id} className="dash-row-hover" style={{ background: done ? "#FAFAF8" : "#fff" }}>
                      <TD center><CB id={id} checked={done} onToggle={() => toggle(id)} /></TD>
                      <TD center dim>{i + 1}</TD>
                      <TD bold strike={done}>
                        <span
                          onClick={() => c.id && setSelectedContactId(String(c.id))}
                          style={{ cursor: c.id ? "pointer" : "default", textDecoration: c.id ? "underline dotted" : "none", textUnderlineOffset: 3 }}
                          title={c.id ? "Click to view contact" : undefined}
                        >
                          {c.name}
                        </span>
                      </TD>
                      <TD small>{c.company || "—"}</TD>
                      <TD small><span style={{ color: done ? "#ccc" : (c.status === "Hot" ? "#C62828" : c.status === "Warm" ? "#B7791F" : c.status === "New" ? "#1565C0" : "#888") }}>{c.status || "—"}</span></TD>
                      <TD small dim strike={done}>{c.nextStep || "—"}</TD>
                    </tr>
                  );
                })}
                {callList.length < 10 && Array.from({ length: 10 - callList.length }).map((_, i) => (
                  <tr key={`cb-${i}`} style={{ background: "#fff" }}>
                    <TD center><CB id={`cb-blank-${i}`} checked={false} onToggle={() => {}} /></TD>
                    <TD center dim>{callList.length + i + 1}</TD>
                    <TD /><TD /><TD /><TD />
                  </tr>
                ))}
              </tbody>
            </table>

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
                  }}
                    onMouseEnter={e => t ? onHoverEnter({ kind: "task", t, rank: i + 1 }, e) : undefined}
                    onMouseMove={onHoverMove}
                    onMouseLeave={onHoverLeave}
                  >
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

            {/* ── PRIORITY EMAILS ── */}
            <SL text="📧 Priority Emails" color="#E65100" time={wb.emails} view="emails" onNavigate={onNavigate} />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
              <thead>
                <tr><TH w={22} center>✓</TH><TH w={120}>FROM</TH><TH>SUBJECT</TH><TH w={110}>WHY</TH><TH w={85}>ACTION</TH></tr>
              </thead>
              <tbody>
                {emails.map((em, i) => {
                  const id = `email-${i}`;
                  const done = ck(id);
                  return (
                    <tr key={id} className="dash-row-hover" style={{ background: "#fff", cursor: "pointer" }}
                      onClick={() => onNavigate("emails")}
                      onMouseEnter={e => onHoverEnter({ kind: "email", em }, e)}
                      onMouseMove={onHoverMove}
                      onMouseLeave={onHoverLeave}
                    >
                      <TD center><CB id={id} checked={done} onToggle={ev => { ev; toggle(id); }} /></TD>
                      <TD bold strike={done}>{em.from}</TD>
                      <TD small strike={done}>{em.subj}</TD>
                      <TD small dim>{em.why || ""}</TD>
                      <TD small bold><span style={{ color: "#1565C0" }}>{em.p || "—"}</span></TD>
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
            <SL text="⚡ Linear — Engineering in Progress" color="#E65100" />
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
                  const stateGlyph = isCompleted && l.stateType === "completed" ? "✓"
                    : isCompleted ? "✕"
                    : l.stateType === "started" ? "▷"
                    : l.stateType === "backlog" ? "·"
                    : "○";
                  const stateGlyphColor = isCompleted && l.stateType === "completed" ? "#2E7D32"
                    : isCompleted ? "#999"
                    : l.stateType === "started" ? "#2563EB"
                    : "#aaa";
                  const isMentioned = slackItems.some(s => l.id && s.message?.includes(l.id));
                  const isForTony = !!(l.who?.toLowerCase().includes("tony") || l.who?.toLowerCase().includes("diaz"));
                  return (
                    <tr
                      key={`lin-${i}`}
                      className="dash-row-hover"
                      style={{ background: rowBg, opacity: rowOpacity, cursor: l.url ? "pointer" : "default" }}
                      onClick={() => l.url && window.open(l.url, "_blank", "noopener")}
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
                          ? <a href={l.url} target="_blank" rel="noopener noreferrer" style={{ color: "#E65100", textDecoration: "none" }}>{l.identifier || l.id}</a>
                          : <span style={{ color: "#E65100" }}>{l.identifier || l.id}</span>
                        }
                      </TD>
                      <TD strike={isCompleted}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <span>{l.task}</span>
                          {isMentioned && (
                            <span style={{ fontSize: 9, fontWeight: 800, background: C.bluBg, color: C.blu, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", letterSpacing: 0.3 }}>@ Mentioned</span>
                          )}
                          {isForTony && (
                            <span style={{ fontSize: 9, fontWeight: 800, background: C.ambBg, color: C.amb, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", letterSpacing: 0.3 }}>Task for Tony</span>
                          )}
                        </span>
                      </TD>
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
                <MgmtTable items={ethanItems} prefix="ethan" todayStr={todayStr} trackStatus={trackStatus} fmtDue={fmtDue} setHoveredLin={setHoveredLin} setTooltipPos={setTooltipPos} slackItems={slackItems} />
              </>
            )}

            {/* ── CSM — Ramy ── */}
            {ramiItems.length > 0 && (
              <>
                <SL text="CSM — Ramy" color="#444" />
                <MgmtTable items={ramiItems} prefix="rami" todayStr={todayStr} trackStatus={trackStatus} fmtDue={fmtDue} setHoveredLin={setHoveredLin} setTooltipPos={setTooltipPos} slackItems={slackItems} />
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

      {/* ── GENERIC HOVER TOOLTIP (calls / top3 / emails) ── */}
      {hovered && (() => {
        const wx = typeof window !== "undefined" ? window.innerWidth : 1200;
        const style: React.CSSProperties = {
          position: "fixed",
          left: Math.min(hoverPos.x + 18, wx - 320),
          top: Math.max(hoverPos.y - 20, 8),
          zIndex: 9999,
          background: "#1C1C1E",
          color: "#F5F5F5",
          borderRadius: 8,
          padding: "14px 16px",
          width: 300,
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
          fontSize: 11,
          lineHeight: 1.55,
          pointerEvents: "none",
          fontFamily: F,
        };
        const Row = ({ label, val, color }: { label: string; val?: string | null; color?: string }) => val ? (
          <>
            <span style={{ color: "#666", fontSize: 10 }}>{label}</span>
            <span style={{ color: color || "#F5F5F5" }}>{val}</span>
          </>
        ) : null;

        if (hovered.kind === "call") {
          const { c } = hovered;
          const statusColor = c.status === "Hot" ? "#FCA5A5" : c.status === "Warm" ? "#FCD34D" : c.status === "Cold" ? "#93C5FD" : "#AAA";
          return (
            <div style={style}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 4 }}>{c.name}</div>
              {c.company && <div style={{ fontSize: 10, color: "#AAA", marginBottom: 10 }}>{c.company}</div>}
              <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "5px 8px", fontSize: 10.5 }}>
                <Row label="Phone" val={c.phone} />
                <span style={{ color: "#666", fontSize: 10 }}>Status</span>
                <span style={{ color: statusColor, fontWeight: 700 }}>{c.status === "Hot" ? "🔴 Hot" : c.status === "Warm" ? "🟡 Warm" : c.status === "Cold" ? "🔵 Cold" : c.status || "—"}</span>
              </div>
            </div>
          );
        }

        if (hovered.kind === "task") {
          const { t, rank } = hovered;
          return (
            <div style={style}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: rank === 1 ? "#fff" : "#555", color: rank === 1 ? "#111" : "#eee", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {rank}
                </div>
                {t.cat && <span style={{ fontSize: 9, fontWeight: 700, color: "#AAA", letterSpacing: 0.5, textTransform: "uppercase" }}>{t.cat}</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", lineHeight: 1.4, marginBottom: 8 }}>{t.text}</div>
              {(t as any).dueDate && (
                <div style={{ display: "grid", gridTemplateColumns: "72px 1fr", gap: "5px 8px", fontSize: 10.5 }}>
                  <Row label="Due" val={(t as any).dueDate} />
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: 10, color: "#666", fontStyle: "italic" }}>
                Click checkbox to mark complete →
              </div>
            </div>
          );
        }

        if (hovered.kind === "email") {
          const { em } = hovered;
          return (
            <div style={style}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#fff", marginBottom: 4 }}>{em.from}</div>
              <div style={{ fontSize: 11, color: "#D0D0D0", marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid #333" }}>{em.subj}</div>
              <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", gap: "5px 8px", fontSize: 10.5 }}>
                <Row label="Why" val={em.why} />
                <Row label="Action" val={em.p} color="#93C5FD" />
              </div>
              <div style={{ marginTop: 10, fontSize: 10, color: "#666", fontStyle: "italic" }}>
                Click row to open Emails →
              </div>
            </div>
          );
        }

        return null;
      })()}

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
              Click anywhere on the row to open in Linear ↗
            </div>
          )}
        </div>
      )}

      {/* ── Contact Drawer (same sidebar as Sales page) ── */}
      <ContactDrawer
        contactId={selectedContactId}
        onClose={() => setSelectedContactId(null)}
        onUpdated={() => {}}
        onDeleted={() => setSelectedContactId(null)}
        onAttempt={c => { if (onAttempt) onAttempt(c); setSelectedContactId(null); }}
        onConnected={() => setSelectedContactId(null)}
        onSmsOpen={c => { setSmsContact(c); setSelectedContactId(null); }}
        onCompose={onCompose ? c => { onCompose(c); setSelectedContactId(null); } : undefined}
      />

      {/* ── SMS Modal ── */}
      {smsContact && (
        <SmsModal contact={smsContact as any} onClose={() => setSmsContact(null)} />
      )}
    </div>
  );
}
