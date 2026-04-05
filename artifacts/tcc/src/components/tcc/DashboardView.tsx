import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { C, F, FS } from "./constants";
import { get, patch, post, del } from "@/lib/api";
import type { TaskItem, CalItem, EmailItem, LinearItem } from "./types";

// ── Types ──────────────────────────────────────────────────────────
interface LocalTask { id: string; text: string; dueDate?: string | null; taskType?: string | null; size?: string | null; }
interface Contact { name: string; phone?: string; company?: string; status?: string; }
interface ScratchNote { id: string; text: string; checked: boolean; position: number; }
interface AiPlanBlock { start: string; end: string; label: string; items: string[]; tip?: string; }

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
  { id: "COM-221", task: "Command 1.5 — contact merge fix", who: "Faisal", level: "high" },
  { id: "COM-224", task: "Dashboard filter persistence", who: "Faisal", level: "mid" },
  { id: "COM-230", task: "DispoPro integration endpoint", who: "Haris", level: "high" },
  { id: "COM-219", task: "Acceptance criteria audit — deployed unchecked", who: "Faisal", level: "high" },
  { id: "FND-118", task: "MLS accuracy pipeline v2", who: "Haris", level: "mid" },
  { id: "FND-122", task: "Agent data dedup engine", who: "Haris", level: "low" },
  { id: "MKT-089", task: "Marketplace listing photo upload", who: "Bishal", level: "mid" },
  { id: "OMS-045", task: "OMS auto-sequence triggers", who: "Anas", level: "mid" },
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
  const [dayPlan, setDayPlan] = useState<AiPlanBlock[] | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  // Track the last brief fingerprint that triggered an AI plan fetch so we can
  // re-fetch automatically whenever the underlying brief data changes (e.g. brief
  // is refreshed, new meetings load, contacts change) without infinite looping.
  const lastFetchedBriefKey = useRef<string | null>(null);

  // ── Scratch Notes state ─────────────────────────────────────────
  const [scratchNotes, setScratchNotes] = useState<ScratchNote[]>([]);
  const [scratchInput, setScratchInput] = useState("");
  const scratchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    get<LocalTask[]>("/tasks/local").then(setLocalTasks).catch(() => {});
    get<ScratchNote[]>("/notes/scratch").then(setScratchNotes).catch(() => {});
  }, []);

  // ── Brief fingerprint — stable key that changes when real brief data changes ──
  // Used to re-fetch AI plan on brief refresh without infinite looping.
  const briefKey = useMemo(() => {
    const hasData = tasks.length > 0 || calendarData.length > 0 || emailsImportant.length > 0 || contacts.length > 0;
    if (!hasData) return null;
    const realMeetings = calendarData.filter(c => c.real);
    // Include scheduling-critical fields so the key changes when times, statuses,
    // or priorities change — not just when names/IDs change.
    return [
      realMeetings.slice(0, 3).map(m => `${m.n}@${m.t}-${m.tEnd ?? ""}`).join("+"),
      contacts.slice(0, 3).map(c => `${c.name}:${c.status ?? ""}`).join("+"),
      tasks.slice(0, 3).map(t => `${t.id}:${t.text.slice(0, 20)}`).join("+"),
      emailsImportant.slice(0, 3).map(e => `${e.id}:${e.p ?? ""}`).join("+"),
    ].join("|");
  }, [
    tasks.length, tasks.slice(0,3).map(t=>`${t.id}:${t.text.slice(0,20)}`).join(","),
    calendarData.length, calendarData.filter(c=>c.real).slice(0,3).map(c=>`${c.n}@${c.t}-${c.tEnd??""}`).join(","),
    emailsImportant.length, emailsImportant.slice(0,3).map(e=>`${e.id}:${e.p??""}`).join(","),
    contacts.length, contacts.slice(0,3).map(c=>`${c.name}:${c.status??""}`).join(","),
  ]);

  // ── Fetch AI day plan whenever brief fingerprint changes ──────────
  useEffect(() => {
    if (!briefKey || briefKey === lastFetchedBriefKey.current) return;
    lastFetchedBriefKey.current = briefKey;
    setPlanLoading(true);
    const realMeetings = calendarData.filter(c => c.real);
    post<{ ok: boolean; blocks: AiPlanBlock[] }>("/schedule/ai-plan", {
      meetings: realMeetings.map(m => ({ time: m.t, name: m.n, tEnd: m.tEnd })),
      contacts: contacts.slice(0, 10).map(c => ({ name: c.name, company: c.company, status: c.status })),
      tasks: [
        ...tasks.filter(t => !tDone[t.id]).slice(0, 3).map(t => t.text),
        ...localTasks.map(t => t.text),
      ],
      emails: emailsImportant.slice(0, 5).map(e => ({ from: e.from, subject: e.subj, action: e.p })),
    })
      .then(r => { if (r.ok) setDayPlan(r.blocks); })
      .catch(() => {})
      .finally(() => setPlanLoading(false));
  }, [briefKey]);

  const toggle = useCallback((id: string) => {
    setChecked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const ck = (id: string) => checked.has(id);

  const completeLocalTask = async (id: string) => {
    toggle(`local-${id}`);
    await patch(`/tasks/local/${id}`, { status: "done" }).catch(() => {});
    setLocalTasks(prev => prev.filter(t => t.id !== id));
  };

  // ── Scratch Notes handlers ──────────────────────────────────────
  const toggleScratchNote = useCallback(async (id: string) => {
    const note = scratchNotes.find(n => n.id === id);
    if (!note) return;
    setScratchNotes(prev => prev.map(n => n.id === id ? { ...n, checked: !n.checked } : n));
    try {
      await patch(`/notes/scratch/${id}`, { checked: !note.checked });
    } catch {
      setScratchNotes(prev => prev.map(n => n.id === id ? { ...n, checked: note.checked } : n));
    }
  }, [scratchNotes]);

  const addScratchNote = useCallback(async () => {
    const text = scratchInput.trim();
    if (!text) return;
    setScratchInput("");
    try {
      const note = await post<ScratchNote>("/notes/scratch", { text });
      setScratchNotes(prev => [...prev, note]);
      scratchInputRef.current?.focus();
    } catch {
      setScratchInput(text);
    }
  }, [scratchInput]);

  const deleteScratchNote = useCallback(async (id: string) => {
    setScratchNotes(prev => prev.filter(n => n.id !== id));
    try {
      await del(`/notes/scratch/${id}`);
    } catch {
      get<ScratchNote[]>("/notes/scratch").then(setScratchNotes).catch(() => {});
    }
  }, []);

  // Data with sample fallbacks
  const top3    = tasks.filter(t => !tDone[t.id]).slice(0, 3).length > 0 ? tasks.filter(t => !tDone[t.id]).slice(0, 3) : SAMPLE_TOP3;
  const callList = contacts.length > 0 ? contacts.slice(0, 10) : SAMPLE_CALLS;
  const meetings = calendarData.filter(c => c.real).length > 0 ? calendarData.filter(c => c.real) : SAMPLE_MEETINGS;
  const emails   = emailsImportant.length > 0 ? emailsImportant.slice(0, 5) : SAMPLE_EMAILS;
  const linItems = linearItems.length > 0 ? linearItems.slice(0, 8) : SAMPLE_LINEAR;
  const linHigh  = linItems.filter(l => l.level === "high").slice(0, 4);
  const wb       = computeWorkBlocks(meetings);

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

        {/* ── AI Day Plan Banner ── */}
        <div style={{ padding: "10px 20px 0", borderBottom: "1px solid #EBEBEB" }}>
          <div style={{ fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.4, color: "#888", marginBottom: 8 }}>
            ◈ TODAY'S AI SCHEDULE PLAN
          </div>
          {planLoading && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  flex: 1, height: 72, borderRadius: 4, background: "#F0F0EE",
                  animation: "pulse 1.4s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }} />
              ))}
              <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
            </div>
          )}
          {!planLoading && dayPlan && (
            <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              {dayPlan.map((block, i) => (
                <div key={i} style={{
                  flex: "1 1 200px", minWidth: 180, border: `1px solid ${i === 0 ? "#222" : "#D4D4D4"}`,
                  borderRadius: 4, padding: "10px 12px",
                  background: i === 0 ? "#FAFAF8" : "#fff",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 900, color: BLK, marginBottom: 2 }}>
                    {block.start} – {block.end}
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#777", marginBottom: 6 }}>
                    {block.label}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 14, listStyle: "disc" }}>
                    {block.items.map((item, j) => (
                      <li key={j} style={{ fontSize: 10, color: BLK, lineHeight: 1.5, marginBottom: 1 }}>{item}</li>
                    ))}
                  </ul>
                  {block.tip && (
                    <div style={{ fontSize: 9, color: "#888", fontStyle: "italic", marginTop: 6, borderTop: "1px solid #EBEBEB", paddingTop: 5 }}>
                      {block.tip}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {!planLoading && !dayPlan && (
            <div style={{ fontSize: 10, color: "#bbb", fontStyle: "italic", paddingBottom: 12 }}>
              Loading your schedule... open app fresh each morning to generate today's AI plan.
            </div>
          )}
        </div>

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

            {/* ── SALES CALLS + APPOINTMENTS side by side ── */}
            <div className="dash-2col" style={{ marginBottom: 12 }}>

              {/* Sales Calls */}
              <div>
                <SL text="📞 Sales Calls" color="#C62828" time={wb.salesCalls} view="sales" onNavigate={onNavigate} />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr><TH w={22} center>✓</TH><TH w={18} center>#</TH><TH>NAME / CO.</TH><TH w={44}>STATUS</TH></tr>
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
                              <TD center small bold>
                                <span style={{ color: c.status === "Hot" ? "#C62828" : c.status === "Warm" ? "#E65100" : c.status === "Cold" ? "#888" : "#555" }}>{c.status || "—"}</span>
                              </TD>
                            </>
                          ) : <><TD /><TD /></>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Appointments */}
              <div>
                <SL text="📅 Today's Appointments" color="#1565C0" view="schedule" onNavigate={onNavigate} />
                <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER }}>
                  <thead>
                    <tr><TH w={22} center>✓</TH><TH w={68}>TIME</TH><TH>MEETING</TH></tr>
                  </thead>
                  <tbody>
                    {meetings.length === 0 && (
                      <tr><td colSpan={3} style={{ padding: "10px 7px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No meetings today</td></tr>
                    )}
                    {meetings.map((m, i) => {
                      const id = `meet-${i}`;
                      const done = ck(id);
                      return (
                        <tr key={id} className="dash-row-hover" style={{ background: "#fff" }}>
                          <TD center><CB id={id} checked={done} onToggle={toggle} /></TD>
                          <TD small bold>{m.t}</TD>
                          <TD strike={done}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: done ? "#ccc" : BLK }}>{m.n}</div>
                            {m.note && <div style={{ fontSize: 8, color: "#aaa" }}>{m.note}</div>}
                          </TD>
                        </tr>
                      );
                    })}
                    {Array.from({ length: Math.max(0, 4 - meetings.length) }).map((_, i) => (
                      <tr key={`mb-${i}`} style={{ background: "#fff" }}>
                        <TD center><CB id={`mb-${i}`} checked={ck(`mb-${i}`)} onToggle={toggle} /></TD>
                        <TD /><TD />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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

            {/* ── LINEAR ── */}
            <SL text="⚡ Linear — Engineering in Progress" color="#2563EB" />
            <table style={{ width: "100%", borderCollapse: "collapse", border: BORDER, marginBottom: 12 }}>
              <thead>
                <tr><TH w={22} center>✓</TH><TH w={72}>ID</TH><TH>TASK</TH><TH w={80}>OWNER</TH><TH w={64}>PRIORITY</TH></tr>
              </thead>
              <tbody>
                {linItems.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: "10px", fontSize: 10, color: "#bbb", fontStyle: "italic", textAlign: "center" }}>No active issues</td></tr>
                )}
                {linItems.map((l, i) => {
                  const id = `lin-${i}`;
                  const done = ck(id);
                  const isHigh = l.level === "high";
                  return (
                    <tr key={id} className="dash-row-hover" style={{ background: "#fff" }}>
                      <TD center><CB id={id} checked={done} onToggle={toggle} /></TD>
                      <TD small bold><span style={{ color: "#2563EB" }}>{l.id}</span></TD>
                      <TD strike={done}>{l.task}</TD>
                      <TD small>{l.who || "—"}</TD>
                      <TD small center>
                        <span style={{ fontWeight: isHigh ? 800 : 400, color: isHigh ? "#C62828" : l.level === "mid" ? "#E65100" : "#888" }}>
                          {isHigh ? "🔴 High" : l.level === "mid" ? "⚠ Mid" : "Low"}
                        </span>
                      </TD>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* ── FLAGS + SOFT SEQUENCE ── */}
            <div className="dash-2col" style={{ marginBottom: 12 }}>

              {/* Flags */}
              <div>
                <SL text="⚠ Flags & Blockers" color="#C62828" />
                <div style={{ border: BORDER, borderRadius: 3, overflow: "hidden" }}>
                  {linHigh.length === 0 && <div style={{ padding: "10px", fontSize: 10, color: "#bbb", fontStyle: "italic" }}>No high-priority flags 🎉</div>}
                  {linHigh.map((l, i) => (
                    <div key={i} style={{ padding: "8px 10px", borderBottom: i < linHigh.length - 1 ? "1px solid #EBEBEB" : "none", background: "#FFF5F5" }}>
                      <div style={{ fontSize: 9, color: "#2563EB", fontWeight: 700 }}>{l.id}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#C62828" }}>{l.task}</div>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 3 - linHigh.length) }).map((_, i) => (
                    <div key={i} style={{ padding: "9px 10px", borderTop: "1px solid #EBEBEB", display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 10, color: "#E65100" }}>⚠</span>
                      <div style={{ flex: 1, height: 1, background: "#EEE" }} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Soft Sequence */}
              <div>
                <SL text="○ Soft Sequence — Next Up" color="#555" />
                <div style={{ border: BORDER, borderRadius: 3, overflow: "hidden" }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <div key={n} style={{ display: "flex", gap: 8, alignItems: "center", padding: "9px 10px", borderBottom: n < 5 ? "1px solid #EBEBEB" : "none" }}>
                      <div style={{ width: 14, height: 14, border: "1.5px solid #ccc", borderRadius: "50%", flexShrink: 0 }} />
                      <div style={{ flex: 1, height: 1, background: "#EEE" }} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── SCRATCH NOTES ── */}
            <SL text="📝 Scratch Notes" color="#555" />
            <div style={{ border: HEAVY, borderRadius: 3, background: "#FDFDFC", marginBottom: 12, overflow: "hidden" }}>
              {scratchNotes.length === 0 && (
                <div style={{ padding: "12px 14px", fontSize: 10, color: "#ccc", fontStyle: "italic" }}>No notes yet — add one below</div>
              )}
              {scratchNotes.map((note) => (
                <div key={note.id} className="dash-row-hover" style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "7px 12px",
                  borderBottom: "1px solid #EBEBEB", background: "#FDFDFC",
                }}>
                  <CB id={`sn-${note.id}`} checked={note.checked} onToggle={() => toggleScratchNote(note.id)} />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 500,
                    color: note.checked ? "#bbb" : BLK,
                    textDecoration: note.checked ? "line-through" : "none",
                    opacity: note.checked ? 0.5 : 1,
                  }}>{note.text}</div>
                  <button
                    onClick={() => deleteScratchNote(note.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "0 2px",
                      fontSize: 11, color: "#ccc", lineHeight: 1, flexShrink: 0,
                    }}
                    title="Delete note"
                  >✕</button>
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderTop: scratchNotes.length > 0 ? "1px solid #EBEBEB" : "none" }}>
                <input
                  ref={scratchInputRef}
                  value={scratchInput}
                  onChange={e => setScratchInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addScratchNote(); }}
                  placeholder="Add a note..."
                  style={{
                    flex: 1, border: "none", outline: "none", fontSize: 12,
                    fontFamily: F, background: "transparent", color: BLK,
                    padding: "2px 0",
                  }}
                />
                <button
                  onClick={addScratchNote}
                  disabled={!scratchInput.trim()}
                  style={{
                    background: scratchInput.trim() ? BLK : "#EEE",
                    color: scratchInput.trim() ? "#fff" : "#bbb",
                    border: "none", borderRadius: 3, cursor: scratchInput.trim() ? "pointer" : "default",
                    fontSize: 10, fontWeight: 700, padding: "3px 10px", flexShrink: 0,
                    transition: "all 0.12s",
                  }}
                >Add</button>
              </div>
            </div>

            {/* ── 3 WINS ── */}
            <SL text="🏆 3 Wins for Today" color="#B7791F" />
            <div style={{ border: "2px solid #B7791F33", borderRadius: 4, background: "#FFFBF2", padding: "4px 10px" }}>
              {[1, 2, 3].map(n => (
                <div key={n} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 0", borderBottom: n < 3 ? "1px solid #EEE4CC" : "none" }}>
                  <span style={{ fontSize: 14, fontWeight: 900, color: "#B7791F", width: 18, flexShrink: 0 }}>{n}.</span>
                  <div style={{ flex: 1, height: 1, background: "#E8D5A3" }} />
                </div>
              ))}
            </div>

          </div>

      </div>
    </div>
  );
}
