import { useState, useEffect, useCallback, useRef } from "react";
import { get, post, patch, put, del } from "@/lib/api";
import { C, F } from "@/components/tcc/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanItem = {
  id: string;
  level: "category" | "subcategory" | "task";
  category: string;
  subcategory?: string | null;
  title: string;
  owner?: string | null;
  coOwner?: string | null;
  priority?: string | null;
  status?: string | null;
  dueDate?: string | null;
  weekNumber?: number | null;
  month?: string | null;
  completedAt?: string | null;
  atomicKpi?: string | null;
  source?: string | null;
  executionTier?: string | null;
  linearId?: string | null;
  workNotes?: string | null;
  priorityOrder?: number;
  parentId?: string | null;
  sprintId?: string;
};

type SubcategoryWithTasks = PlanItem & { tasks: PlanItem[]; totalTasks: number; completedTasks: number };
type CategoryWithSubs = PlanItem & { subcategories: SubcategoryWithTasks[]; totalTasks: number; completedTasks: number };
type Tab = "goals" | "team" | "tasks" | "plan";

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, { bg: string; border: string; accent: string }> = {
  adaptation: { bg: "#FAEEDA", border: "#E8C78A", accent: "#B45309" },
  sales:      { bg: "#EAF3DE", border: "#9FC97A", accent: "#3B6D11" },
  tech:       { bg: "#E6F1FB", border: "#7FB3E8", accent: "#185FA5" },
  capital:    { bg: "#EEEDFE", border: "#A89CE0", accent: "#5B3FA0" },
  team:       { bg: "#F1EFE8", border: "#C4B8A8", accent: "#5F5E5A" },
};

const PERSON_COLORS: Record<string, string> = {
  tony: "#A32D2D", ethan: "#185FA5", ramy: "#3B6D11", faisal: "#BA7517",
  haris: "#534AB7", nate: "#5F5E5A", bondilyn: "#7B2D8B",
};
function personColor(name: string): string {
  const key = (name || "").toLowerCase().split(" ")[0];
  return PERSON_COLORS[key] || "#6B7280";
}

const CAT_LABELS: Record<string, string> = {
  adaptation: "01 Adaptation", sales: "02 Sales", tech: "03 Tech",
  capital: "04 Capital", team: "05 Team",
};

const TEAM_SOW = [
  {
    id: "tony", name: "Tony Diaz", role: "CEO", salary: "$5K/mo", hiring: false,
    does: [
      "Sales — 60%+ of time minimum (5 demos/week, 15+ active prospects, 3 new operators/month)",
      "Pricing & revenue model decisions",
      "Capital strategy — bridge loan vs growth loan, Kiavi broker, investor meetings",
      "AAA product spec (all agent flows, inputs, outputs, logic)",
      "Support Ramy on operator adaptation strategy",
      "OMS Owner/Operator Expectation Doc — builds then hands to Ramy",
      "Sales playbook rough drafts (investor/broker/agent/vendor) → Bondilyn refines",
      "COO Dashboard front-end prototype design",
    ],
    doesNot: [
      "Daily 8 AM operator training calls (→ Ramy owns fully)",
      "Engineering standups (→ PM when hired, then Ethan in interim)",
      "Linear ticket triage (→ PM + Ramy)",
      "Production QA / late-night debugging (→ PM + Nate SLA)",
      "Building new accountability frameworks (this doc IS the system — no mods 90 days)",
      "Customer onboarding walkthroughs (→ Ramy, OMS Layers 1–2)",
    ],
  },
  {
    id: "ethan", name: "Ethan Jolly", role: "COO / CFO", salary: "$10K/mo", hiring: false,
    does: [
      "Accountability — every task in Linear has a date, size, status, assignee. Tony never discovers a missed commitment himself.",
      "Finance & P&L — monthly burn rate, DBTM revenue tracking, Q2 model, Ramy bonus structure",
      "PM hire — job spec, sourcing, screening, offer. Non-negotiable timeline.",
      "Monday Linear status check (all tasks have dates, no orphans)",
      "Friday Tech Report (sprint delivery, blockers, SLA status, AA metrics)",
      "Suspension criteria enforcement in Linear workflow",
      "Audit Tony's calendar every Monday — is 60%+ on sales? If not, escalate.",
      "AWS cost reduction push — Ethan does not accept open-ended timelines from Nate",
    ],
    doesNot: [
      "Engineering execution",
      "Product feature decisions",
      "Sales demos or closing calls",
      "User training",
      "Creating new systems outside this doc (90-day lockdown)",
    ],
  },
  {
    id: "ramy", name: "Ramy", role: "CS Manager", salary: "$5K/mo", hiring: false,
    does: [
      "User adaptation — contact every operator, classify: active / struggling / dead weight",
      "Weekly adaptation report to Ethan every Friday (operator health, AA activation %)",
      "Autotracker training for all active operators — Tony trains once, Ramy owns everything after",
      "OMS onboarding — Layers 1–3 for all new operators",
      "10DLC compliance check and resolution for all operators",
      "Feature adoption dashboard — 14-day non-use triggers, disengagement alerts (3+ zero-activity days)",
      "Client Status Checklist (Level 1: Onboarding Started / Level 2: System Usable / Level 3: System Optimized)",
    ],
    doesNot: [
      "Engineering tickets (→ Faisal + Haris via Linear)",
      "Sales calls or demos",
      "Billing, finance, or payment disputes",
      "Changing feature behavior in production",
      "Suspension decisions alone (→ Tony + Ethan must approve)",
    ],
  },
  {
    id: "faisal", name: "Faisal Nazik", role: "Command Engineer", salary: "$3K/mo", hiring: false,
    does: [
      "Command dashboard sprint delivery — COO view, MyStats tab, Template Health tab",
      "QA completion each sprint — zero open Critical/High bugs at sprint close",
      "40+ story points per sprint cycle minimum — no punts",
      "SMS compliance UI and feature registration in phase matrix",
      "Bugs and adaptation-related fixes through April (no new improvements until PM hired)",
    ],
    doesNot: [
      "Foundation or data layer (→ Haris owns)",
      "User training or operator communication",
      "Sprint planning (→ PM when hired, → Ethan in interim)",
      "Direct operator communication",
      "AWS infrastructure",
    ],
  },
  {
    id: "haris", name: "Haris Aqeel", role: "Foundation Engineer", salary: "$2K/mo", hiring: false,
    does: [
      "Foundation — MLS accuracy, agent pipeline stability, data sync reliability",
      "DispoPro integration into Command (first week April milestone)",
      "Agent contact matching — close the 15% gap",
      "Cross-platform infrastructure audit",
      "CSM items and foundation ticket delivery",
    ],
    doesNot: [
      "Command-only UI features (→ Faisal)",
      "Sprint planning",
      "Customer or operator communication",
      "AWS management",
      "New feature design",
    ],
  },
  {
    id: "nate", name: "Nate Worcester", role: "CTO Advisory (SLA)", salary: "$6K/mo", hiring: false,
    does: [
      "AWS cost reduction — hard start/end date required, currently $5K/mo (unacceptable)",
      "Architecture reviews — estimate-first / approve-first / bill-after structure",
      "Foundation knowledge transfer to Haris — scoped, dated, no open-ended timeline",
      "Google Cloud migration architecture review",
      "SLA: Architecture questions 24hr | Production blockers 4hr | Feature specs 48hr",
      "AAA into Command Light v2.0 review and integration design",
      "Tony approves ALL scopes in writing before work begins",
    ],
    doesNot: [
      "Day-to-day engineering management",
      "Ticket triage",
      "Code without written Tony approval",
      "Customer or operator interaction",
      "Open-ended timelines — Ethan enforces hard dates",
    ],
  },
  {
    id: "bondilyn", name: "Bondilyn Jolly", role: "Marketing / Sales Support", salary: "$5K/mo", hiring: false,
    does: [
      "Sales presentation and pitch deck refinement (all 4 tiers: investor/broker/agent/vendor)",
      "USale Seller Direct script writing",
      "Outreach databases — Wealthwise, KW, qualified prospect lists",
      "Podcast and video scripts (Jessica Nieto records intro video for buyer outreach)",
      "Affiliate playbook v1",
    ],
    doesNot: [
      "Direct sales or closing calls (→ Tony)",
      "Engineering",
      "Customer success",
      "Finance",
      "Operations management",
    ],
  },
  {
    id: "tbdpm", name: "TBD — PM/Engineer", role: "PM / Engineer", salary: "$6K/mo", hiring: true,
    does: [
      "Linear workspace audit — Week 1 gate (sprint plan delivered by April 7)",
      "Daily standups with engineering team (Faisal, Haris)",
      "COO Dashboard backend features",
      "AAA build ownership — starts Day 1, completes end of May",
      "Single written weekly update to Tony only — no daily check-ins after Week 4",
    ],
    doesNot: [
      "Customer success",
      "Sales or demos",
      "Strategy decisions",
      "Daily Tony check-ins after Week 4",
      "Priority changes without Ethan approval",
    ],
  },
  {
    id: "tbdonboard", name: "TBD — Onboarding Manager", role: "Onboarding Manager", salary: "$2.5K/mo", hiring: true,
    does: [
      "Operator intake and OMS checklist execution",
      "First-contact quality control and activation",
      "Escalate issues to Ramy per defined escalation path",
      "Cross-train with CS team to eliminate single points of failure",
      "Track and report onboarding completion rates",
    ],
    doesNot: ["Ongoing support (→ Ramy)", "Sales", "Engineering", "Billing", "Suspension decisions"],
  },
  {
    id: "tbdam", name: "TBD — Adaptation Manager", role: "Adaptation Manager", salary: "$2.5K/mo", hiring: true,
    does: [
      "Feature adoption tracking per operator",
      "Disengagement alerts and proactive outreach to at-risk operators",
      "Training sessions on feature usage",
      "Weekly adoption data report to Ramy",
    ],
    doesNot: ["Onboarding (→ Onboarding Manager)", "Sales", "Engineering", "Suspension decisions", "Direct AM communication"],
  },
];

const GAP_ANALYSIS = [
  { n: 1, text: "No PM. Tony loses 20–30% of sales time to engineering overhead every week. At $100K/month target, this is a $20–30K/month gap in capacity." },
  { n: 2, text: "Ramy is a single point of failure. All CS, onboarding, and adaptation stops when he's unavailable. Zero backup." },
  { n: 3, text: "Nate's 29 issues orphaned since Mar 6. Several are P0 tech debt. No clear owner. Ethan must get hard dates this week." },
  { n: 4, text: "No sales support. Tony does demos, pitches, AND closes alone. Bondilyn supports materials but Tony has zero sales leverage." },
  { n: 5, text: "DBTM revenue not tracked. 2 acquisitions/week happening but $0 appears in the April P&L. This is unaccounted revenue." },
];

const APRIL_WEEKS = [
  { n: 1, label: "Wk 1", dates: "Apr 7–11" },
  { n: 2, label: "Wk 2", dates: "Apr 14–18" },
  { n: 3, label: "Wk 3", dates: "Apr 21–25" },
  { n: 4, label: "Wk 4", dates: "Apr 28–30" },
];

/** Generate 4 week options starting from the week containing the given date (or today) */
function getWeeksForDate(dateStr?: string): { n: number; label: string; dates: string }[] {
  const d = dateStr ? new Date(dateStr + "T12:00:00") : new Date();
  const mon = d.toLocaleString("en-US", { month: "short", timeZone: "America/Los_Angeles" });
  // Find the Monday of the week containing d
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset);
  // First day of month
  const firstOfMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  const firstMonday = new Date(firstOfMonth);
  const fDay = firstOfMonth.getDay();
  firstMonday.setDate(firstOfMonth.getDate() + (fDay === 0 ? 1 : fDay === 1 ? 0 : 8 - fDay));
  // Which week of the month is this?
  const weekOfMonth = Math.max(1, Math.ceil((monday.getDate()) / 7));
  const weeks: { n: number; label: string; dates: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const wkStart = new Date(monday); wkStart.setDate(monday.getDate() + i * 7);
    const wkEnd = new Date(wkStart); wkEnd.setDate(wkStart.getDate() + 4);
    const wkMon = wkStart.toLocaleString("en-US", { month: "short", timeZone: "America/Los_Angeles" });
    weeks.push({
      n: weekOfMonth + i,
      label: `Wk ${weekOfMonth + i}`,
      dates: `${wkMon} ${wkStart.getDate()}–${wkEnd.getDate()}`,
    });
  }
  return weeks;
}

const CAT_KEYS = ["adaptation", "sales", "tech", "capital", "team"];
const OWNER_OPTIONS = ["Tony", "Ethan", "Ramy", "Faisal", "Haris", "Nate", "Bondilyn", "Chris", "TBD PM"];
const PRIORITY_OPTS = [
  { value: "P0", label: "P0 — Critical. Blocks revenue or AA performance today." },
  { value: "P1", label: "P1 — High priority. Must ship this week." },
  { value: "P2", label: "P2 — Standard. Complete this sprint." },
];
const TIER_OPTS = ["Sprint", "Strategic", "Maintenance"];
const SOURCE_OPTS = ["OAP", "Linear", "TCC", "manual"];

// ─── Mini components ──────────────────────────────────────────────────────────

function ProgressBar({ done, total, color }: { done: number; total: number; color?: string }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 4, height: 5, flex: 1, marginLeft: 8 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color || C.grn, borderRadius: 4, transition: "width 0.4s" }} />
    </div>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    P0: { bg: "#FEE2E2", color: "#B91C1C" }, P1: { bg: "#FFF3E0", color: "#B45309" },
    P2: { bg: "#FEFCE8", color: "#A16207" }, High: { bg: "#FFF3E0", color: "#B45309" }, Low: { bg: "#F3F4F6", color: "#6B7280" },
  };
  const s = map[p] || { bg: "#F3F4F6", color: "#6B7280" };
  return <span style={{ fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap" }}>{p}</span>;
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:    { bg: C.bluBg, color: C.blu, label: "active" },
    completed: { bg: C.grnBg, color: C.grn, label: "done ✓" },
    late:      { bg: C.redBg, color: C.red, label: "late" },
    blocked:   { bg: C.ambBg, color: C.amb, label: "blocked" },
  };
  const st = map[s] || { bg: "#F3F4F6", color: "#6B7280", label: s };
  return <span style={{ fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, borderRadius: 10, padding: "1px 8px", whiteSpace: "nowrap" }}>{st.label}</span>;
}

function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: "#1e293b", color: "#fff", borderRadius: 10, padding: "12px 22px",
      fontSize: 13, fontWeight: 600, fontFamily: F, zIndex: 9999, cursor: "pointer",
      boxShadow: "0 8px 32px rgba(0,0,0,0.25)", maxWidth: 400, textAlign: "center",
    }}>{msg}</div>
  );
}

// ─── Task checkbox row ────────────────────────────────────────────────────────

function TaskRow({ task, onToggle }: { task: PlanItem; onToggle: (id: string, complete: boolean) => void }) {
  const done = task.status === "completed";
  const isLate = !done && task.dueDate && new Date(task.dueDate) < new Date("2026-04-09");
  const pc = personColor(task.owner || "");
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.brd}`, opacity: done ? 0.6 : 1 }}>
      <button
        onClick={() => onToggle(task.id, !done)}
        style={{
          width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${done ? C.grn : "#d1d5db"}`,
          background: done ? C.grn : "transparent", color: "#fff", fontSize: 9, flexShrink: 0,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2,
        }}
      >{done ? "✓" : ""}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: done ? C.mut : isLate ? C.red : C.tx, textDecoration: done ? "line-through" : "none", fontFamily: F, lineHeight: 1.4 }}>
          {task.title}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 2, alignItems: "center" }}>
          {task.owner && <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + "18", borderRadius: 8, padding: "0 6px" }}>{task.owner}</span>}
          {task.dueDate && <span style={{ fontSize: 10, color: isLate ? C.red : C.mut }}>{isLate ? "⚠ " : ""}{task.dueDate}</span>}
          {task.priority && <PriorityBadge p={task.priority} />}
        </div>
      </div>
    </div>
  );
}

// ─── GPS Cards ────────────────────────────────────────────────────────────────

function GPSCards() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
      <div style={{ background: "#FFF8E7", border: "1px solid #F6C04A", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#B45309", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: F }}>⚡ Atomic KPI — North Star</div>
        <div style={{ fontSize: 13, color: "#92400E", fontFamily: F, lineHeight: 1.5 }}>
          Every Acquisition Associate closes <strong>2 deals per month.</strong><br />
          Each operator has 4 full-time AAs. If it does not move an AA toward 2 deals/month — <strong>it is noise.</strong>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div style={{ background: "#FFF0F0", border: "1px solid #FCA5A5", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#B91C1C", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: F }}>🎯 5-Year BAG</div>
          <div style={{ fontSize: 12, color: "#7F1D1D", fontFamily: F, lineHeight: 1.5 }}>
            USale Marketplace = largest off-market RE platform.<br />
            375 operators × 5 users = 1,875 users, 75 metros.<br />
            <strong>$1 BILLION exit.</strong>
          </div>
        </div>
        <div style={{ background: "#F5F0FF", border: "1px solid #C4B5FD", borderRadius: 10, padding: "12px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#6D28D9", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: F }}>📍 3-Year Milestone</div>
          <div style={{ fontSize: 12, color: "#4C1D95", fontFamily: F, lineHeight: 1.5 }}>
            375 operators · $1.5M/mo run rate<br />
            $16.2M cumulative · 75 metros<br />
            Command 2.0 + AAA deployed
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Category Grid — 2-column, numbered subcategories 1-5 ────────────────────

function CategoryGrid({
  categories,
}: {
  categories: CategoryWithSubs[];
  onToggleTask: (id: string, complete: boolean) => void;
}) {
  if (categories.length === 0) {
    return <div style={{ textAlign: "center", padding: "48px", color: C.mut, fontFamily: F }}>Loading…</div>;
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 48px", marginBottom: 32 }}>
      {categories.map((cat) => {
        const slots = Array.from({ length: 5 }, (_, i) => cat.subcategories[i] || null);
        const colorKey = (cat.category || "") as keyof typeof CAT_COLORS;
        const colors = CAT_COLORS[colorKey] || { accent: "#00007A" };
        const accent = colors.accent;
        const catPct = cat.totalTasks > 0 ? Math.round((cat.completedTasks / cat.totalTasks) * 100) : 0;

        return (
          <div key={cat.id} style={{ marginBottom: 32 }}>
            {/* Category title + stats */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: accent, fontFamily: F }}>
                {cat.title}
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: accent, fontFamily: F, opacity: 0.85, whiteSpace: "nowrap", marginLeft: 8 }}>
                {cat.completedTasks}/{cat.totalTasks} · {catPct}% done
              </span>
            </div>
            {/* Thick underline in category color */}
            <div style={{ height: 3, background: accent, marginBottom: 8 }} />

            {/* Numbered slots 1-5 */}
            {slots.map((sub, i) => {
              const done = sub?.status === "completed";
              const subPct = sub ? (sub.totalTasks > 0 ? Math.round((sub.completedTasks / sub.totalTasks) * 100) : 0) : null;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ccc", padding: "5px 0", minHeight: 28 }}>
                  <span style={{ fontSize: 12, color: "#999", width: 14, flexShrink: 0, fontFamily: F }}>{i + 1}</span>
                  {sub ? (
                    <>
                      <span style={{
                        fontSize: 13, color: accent, fontFamily: F,
                        textDecoration: done ? "line-through" : "none",
                        fontWeight: 500, flex: 1,
                      }}>
                        {sub.title}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: accent, fontFamily: F, opacity: 0.75, whiteSpace: "nowrap", flexShrink: 0 }}>
                        {sub.completedTasks}/{sub.totalTasks} · {subPct}%
                      </span>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Weekly Grid — original design: rotated name left, 4 week columns ─────────

const ROWS_PER_PERSON = 5;

// Category → solid color (text / border)
const CAT_COLOR: Record<string, string> = {
  adaptation: "#92400E",
  sales:      "#166534",
  tech:       "#1D4ED8",
  capital:    "#6D28D9",
  team:       "#374151",
};

function WeeklyGrid({ byOwner, onToggleTask }: {
  byOwner: Record<string, Record<number, PlanItem[]>>;
  onToggleTask: (id: string, complete: boolean) => void;
}) {
  const ORDERED = ["Tony", "Ethan", "Ramy", "Faisal", "Haris", "Nate", "Bondilyn"];
  const owners = [...ORDERED.filter(o => byOwner[o]), ...Object.keys(byOwner).filter(o => !ORDERED.includes(o))];
  if (owners.length === 0) return null;

  const dateLabel = "April 7 - 11";

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: "#666", fontFamily: F, marginLeft: 48, marginBottom: 4 }}>{dateLabel}</div>

      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 48 }} />
          <col /><col /><col /><col />
        </colgroup>
        <thead>
          <tr>
            <th style={{ padding: 0 }} />
            {APRIL_WEEKS.map(w => (
              <th key={w.n} style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: C.tx, fontFamily: F, padding: "6px 8px 10px" }}>
                Week {w.n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {owners.map(owner => {
            const weeks = byOwner[owner] || {};
            const pc = personColor(owner);
            const rows = Array.from({ length: ROWS_PER_PERSON }, (_, ri) => ({
              w1: (weeks[1] || [])[ri] || null,
              w2: (weeks[2] || [])[ri] || null,
              w3: (weeks[3] || [])[ri] || null,
              w4: (weeks[4] || [])[ri] || null,
            }));

            return rows.map((row, ri) => {
              const isFirstRow = ri === 0;
              const isLastRow = ri === ROWS_PER_PERSON - 1;
              return (
                <tr key={`${owner}-${ri}`}>
                  {isFirstRow && (
                    <td
                      rowSpan={ROWS_PER_PERSON}
                      style={{
                        verticalAlign: "middle", textAlign: "center",
                        padding: 0, borderBottom: "2px solid #ddd", width: 48,
                      }}
                    >
                      <div style={{
                        writingMode: "vertical-rl", transform: "rotate(180deg)",
                        fontSize: 13, fontWeight: 700, color: pc,
                        fontFamily: F, letterSpacing: 0.5, whiteSpace: "nowrap",
                      }}>
                        {owner}
                      </div>
                    </td>
                  )}
                  {[row.w1, row.w2, row.w3, row.w4].map((task, wi) => {
                    const done = task?.status === "completed";
                    const cat = task?.category ?? "";
                    const sub = task?.subcategory ?? null;
                    const txColor = done ? "#bbb" : (CAT_COLOR[cat] ?? "#1565C0");
                    return (
                      <td
                        key={wi}
                        style={{
                          borderBottom: isLastRow ? "2px solid #aaa" : "1px solid #ddd",
                          borderLeft: task ? `3px solid ${done ? "#ddd" : (CAT_COLOR[cat] ?? "#1565C0")}` : "3px solid transparent",
                          padding: "4px 7px",
                          verticalAlign: "top",
                          background: "#fff",
                          minHeight: 34,
                        }}
                      >
                        {task ? (
                          <div style={{ display: "flex", gap: 5, alignItems: "flex-start" }}>
                            <button
                              onClick={() => onToggleTask(task.id, !done)}
                              style={{
                                width: 12, height: 12, borderRadius: 2, marginTop: 2, flexShrink: 0,
                                border: `1.5px solid ${done ? C.grn : (CAT_COLOR[cat] ?? "#aaa")}`,
                                background: done ? C.grn : "transparent",
                                color: "#fff", fontSize: 7, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >{done ? "✓" : ""}</button>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                fontSize: 11, fontWeight: 600, color: txColor,
                                textDecoration: done ? "line-through" : "none",
                                fontFamily: F, lineHeight: 1.3,
                                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                              }}>
                                {task.title.replace(/^[^:]+:\s*/, "")}
                              </div>
                              {sub && (
                                <div style={{
                                  marginTop: 1,
                                  fontSize: 8, fontWeight: 600,
                                  color: done ? "#ccc" : (CAT_COLOR[cat] ?? "#555"),
                                  letterSpacing: 0.2,
                                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                  {sub}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            });
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────

function AddTaskModal({
  onClose, onCreated, categories, prefill,
}: {
  onClose: () => void;
  onCreated: (task: PlanItem & { sprintId: string; position: number; total: number; prevTask?: { title: string; sprintId: string } | null; nextTask?: { title: string; sprintId: string } | null }) => void;
  categories: CategoryWithSubs[];
  prefill?: Record<string, string> | null;
}) {
  const [form, setForm] = useState(() => {
    const defaults = { title: "", category: "", subcategoryName: "", owner: "", coOwner: "", priority: "P1", dueDate: "", weekNumber: "", atomicKpi: "", source: "manual", executionTier: "Sprint", workNotes: "", linearId: "" };
    if (prefill) return { ...defaults, ...Object.fromEntries(Object.entries(prefill).filter(([_, v]) => v != null && v !== "")) };
    return defaults;
  });
  const [subcats, setSubcats] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!form.category) { setSubcats([]); return; }
    // Prefer passed categories, else fetch from API
    const cat = categories.find(c => c.category === form.category);
    if (cat) {
      setSubcats(cat.subcategories.map(s => s.title));
    } else {
      get(`/plan/subcategories/${form.category}`)
        .then(d => setSubcats((d.subcategories || []).map((s: { title: string }) => s.title)))
        .catch(() => setSubcats([]));
    }
    setForm(f => ({ ...f, subcategoryName: "" }));
  }, [form.category, categories]);

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setErr("Task title is required"); return; }
    if (!form.category) { setErr("Category is required"); return; }
    setLoading(true); setErr("");
    try {
      const result = await post("/plan/task", { ...form, month: "2026-04", weekNumber: form.weekNumber ? parseInt(form.weekNumber) : undefined });
      onCreated(result);
    } catch (e: any) {
      setErr(e.message || "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  const inputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, fontSize: 13, background: "#fff", boxSizing: "border-box" };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, fontFamily: F, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.bg, borderRadius: "16px 16px 0 0", padding: "24px 28px 32px", width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 -8px 40px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.tx, fontFamily: F }}>Add task to 411 Plan</div>
            <div style={{ fontSize: 12, color: C.sub, fontFamily: F, marginTop: 2 }}>Fill in the details and the task will be placed by priority</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: C.mut, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        <form onSubmit={submit}>
          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Task title *</label>
            <input value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Tony: close 2 new operators" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Category */}
            <div>
              <label style={labelStyle}>Category *</label>
              <select value={form.category} onChange={e => set("category", e.target.value)} style={inputStyle}>
                <option value="">Select category</option>
                {CAT_KEYS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>
            {/* Subcategory */}
            <div>
              <label style={labelStyle}>Subcategory</label>
              <select value={form.subcategoryName} onChange={e => set("subcategoryName", e.target.value)} style={inputStyle} disabled={!form.category}>
                <option value="">Select subcategory</option>
                {subcats.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Owner */}
            <div>
              <label style={labelStyle}>Owner</label>
              <select value={form.owner} onChange={e => set("owner", e.target.value)} style={inputStyle}>
                <option value="">Unassigned</option>
                {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            {/* Co-Owner */}
            <div>
              <label style={labelStyle}>Co-Owner</label>
              <select value={form.coOwner} onChange={e => set("coOwner", e.target.value)} style={inputStyle}>
                <option value="">— None —</option>
                {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Priority */}
            <div>
              <label style={labelStyle}>Priority — determines placement</label>
              <select value={form.priority} onChange={e => set("priority", e.target.value)} style={inputStyle}>
                {PRIORITY_OPTS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
            {/* Due date */}
            <div>
              <label style={labelStyle}>Due date</label>
              <input type="date" value={form.dueDate} onChange={e => set("dueDate", e.target.value)} style={inputStyle} />
            </div>
            {/* Week */}
            <div>
              <label style={labelStyle}>Week</label>
              <select value={form.weekNumber} onChange={e => set("weekNumber", e.target.value)} style={inputStyle}>
                <option value="">None</option>
                {getWeeksForDate(form.dueDate || undefined).map(w => <option key={w.n} value={String(w.n)}>{w.label} ({w.dates})</option>)}
              </select>
            </div>
            {/* Execution tier */}
            <div>
              <label style={labelStyle}>Execution tier</label>
              <select value={form.executionTier} onChange={e => set("executionTier", e.target.value)} style={inputStyle}>
                {TIER_OPTS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Atomic KPI */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Atomic KPI — how does this move an AA toward 2 deals/month?</label>
            <input value={form.atomicKpi} onChange={e => set("atomicKpi", e.target.value)} placeholder="e.g. Signed operator = 4 new AAs in pipeline" style={inputStyle} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Source</label>
              <select value={form.source} onChange={e => set("source", e.target.value)} style={inputStyle}>
                {SOURCE_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Work notes</label>
              <input value={form.workNotes} onChange={e => set("workNotes", e.target.value)} placeholder="Context, blockers, links…" style={inputStyle} />
            </div>
          </div>

          {form.source === "Linear" && (
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Linear Issue ID</label>
              <input value={form.linearId} onChange={e => set("linearId", e.target.value)} placeholder="e.g. FLI-123 or paste Linear issue URL" style={inputStyle} />
              <div style={{ fontSize: 10, color: C.mut, marginTop: 3 }}>Links this task to Linear — completion will sync both ways</div>
            </div>
          )}

          {form.source !== "Linear" && <div style={{ marginBottom: 6 }} />}

          {err && <div style={{ background: C.redBg, color: C.red, borderRadius: 7, padding: "8px 12px", fontSize: 12, marginBottom: 14, fontFamily: F }}>{err}</div>}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "transparent", color: C.sub, fontSize: 13, cursor: "pointer", fontFamily: F }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: F }}>
              {loading ? "Adding…" : "Add task & place in 411 plan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Task Detail Modal ───────────────────────────────────────────────────────

function TaskDetailModal({ task, onClose, onSaved }: {
  task: PlanItem & { sprintId?: string };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    workNotes: task.workNotes || "",
    atomicKpi: task.atomicKpi || "",
    dueDate: task.dueDate || "",
    owner: task.owner || "",
    priority: task.priority || "",
    title: task.title || "",
    category: task.category || "",
    subcategory: task.subcategory || "",
    executionTier: task.executionTier || "Sprint",
    source: task.source || "manual",
    linearId: task.linearId || "",
    coOwner: task.coOwner || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [subcats, setSubcats] = useState<string[]>([]);

  const [validationErr, setValidationErr] = useState("");

  // Fetch subcategories when category changes — reset subcategory on category change
  const prevCat = useRef(form.category);
  useEffect(() => {
    if (!form.category) { setSubcats([]); return; }
    get<{ subcategories: { title: string }[] }>(`/plan/subcategories/${form.category}`)
      .then(d => setSubcats((d.subcategories || []).map(s => s.title)))
      .catch(() => setSubcats([]));
    if (prevCat.current && prevCat.current !== form.category) {
      setForm(p => ({ ...p, subcategory: "" }));
    }
    prevCat.current = form.category;
  }, [form.category]);

  const catColor = CAT_COLOR[task.category] ?? "#555";

  async function handleSave() {
    // Validate required fields
    if (!form.title.trim()) { setValidationErr("Task title is required"); return; }
    if (!form.category) { setValidationErr("Category is required"); return; }
    if (!form.subcategory) { setValidationErr("Subcategory is required"); return; }
    if (!form.owner) { setValidationErr("Owner is required"); return; }
    if (!form.priority) { setValidationErr("Priority is required"); return; }
    setValidationErr("");
    setSaving(true);
    try {
      await patch(`/plan/item/${task.id}`, form);
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 600);
    } catch { /**/ }
    finally { setSaving(false); }
  }

  const inp: React.CSSProperties = {
    width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.brd}`,
    fontFamily: F, fontSize: 13, background: "#fafafa", boxSizing: "border-box",
  };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9000, display: "flex", alignItems: "flex-start", justifyContent: "flex-end" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.25)" }} onClick={onClose} />

      {/* Slide-in panel */}
      <div style={{
        position: "relative", zIndex: 1, width: 480, height: "100vh",
        background: "#fff", boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
        display: "flex", flexDirection: "column", overflowY: "auto",
      }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: `2px solid ${C.brd}`, background: "#FAFAFA" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {task.sprintId && <span style={{ fontSize: 11, fontWeight: 800, color: catColor, background: catColor + "15", borderRadius: 5, padding: "2px 8px", fontFamily: "monospace" }}>{task.sprintId}</span>}
              {task.priority && <PriorityBadge p={task.priority} />}
              {task.status && <StatusPill s={task.status} />}
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: C.mut, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, lineHeight: 1.4, marginBottom: 6 }}>{task.title}</div>
          <div style={{ fontSize: 11, color: C.sub }}>
            <span style={{ fontWeight: 600, color: catColor, textTransform: "capitalize" }}>{task.category}</span>
            {task.subcategory && <span> · {task.subcategory}</span>}
            {task.owner && <span> · <span style={{ fontWeight: 600 }}>{task.owner}</span></span>}
          </div>
          {task.completedAt && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.grn, fontWeight: 600 }}>
              ✓ Completed {new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </div>
          )}
        </div>

        {/* Editable fields */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>

          <div>
            <label style={lbl}>Task title</label>
            <input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inp} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Owner</label>
              <select value={form.owner} onChange={e => setForm(p => ({ ...p, owner: e.target.value }))} style={inp}>
                <option value="">—</option>
                {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Co-Owner</label>
              <select value={form.coOwner} onChange={e => setForm(p => ({ ...p, coOwner: e.target.value }))} style={inp}>
                <option value="">— None —</option>
                {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Priority</label>
              <select value={form.priority} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))} style={inp}>
                <option value="">—</option>
                <option value="P0">P0 — Critical</option>
                <option value="P1">P1 — High</option>
                <option value="P2">P2 — Standard</option>
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} style={inp}>
                <option value="">—</option>
                {CAT_KEYS.map(k => <option key={k} value={k}>{CAT_LABELS[k] || k}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Subcategory</label>
              <select value={form.subcategory} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} style={inp}>
                <option value="">— Select —</option>
                {subcats.map(s => <option key={s} value={s}>{s}</option>)}
                {form.subcategory && !subcats.includes(form.subcategory) && (
                  <option value={form.subcategory}>{form.subcategory}</option>
                )}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Execution Tier</label>
              <select value={form.executionTier} onChange={e => setForm(p => ({ ...p, executionTier: e.target.value }))} style={inp}>
                <option value="Sprint">Sprint</option>
                <option value="Strategic">Strategic</option>
                <option value="Maintenance">Maintenance</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Source</label>
              <select value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} style={inp}>
                <option value="manual">Manual</option>
                <option value="OAP">OAP</option>
                <option value="Linear">Linear</option>
                <option value="TCC">TCC</option>
              </select>
            </div>
          </div>

          <div>
            <label style={lbl}>Due date</label>
            <input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} style={inp} />
          </div>

          {form.source === "Linear" && (
            <div>
              <label style={lbl}>Linear ID</label>
              <input value={form.linearId} onChange={e => setForm(p => ({ ...p, linearId: e.target.value }))} style={inp} placeholder="e.g. COM-341" />
            </div>
          )}

          <div>
            <label style={lbl}>Atomic KPI</label>
            <input value={form.atomicKpi} onChange={e => setForm(p => ({ ...p, atomicKpi: e.target.value }))} placeholder="What does done look like?" style={inp} />
          </div>

          <div>
            <label style={lbl}>Work notes / context</label>
            <textarea
              value={form.workNotes}
              onChange={e => setForm(p => ({ ...p, workNotes: e.target.value }))}
              placeholder="Blockers, links, context, decisions…"
              rows={6}
              style={{ ...inp, resize: "vertical", lineHeight: 1.5 }}
            />
          </div>

          {(task.linearId || form.linearId) && (
            <div>
              <label style={lbl}>Linear Link</label>
              <a href={`https://linear.app/issue/${form.linearId || task.linearId}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 13, color: C.blu }}>{form.linearId || task.linearId} ↗</a>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${C.brd}`, display: "flex", flexDirection: "column", gap: 10 }}>
          {validationErr && (
            <div style={{ padding: "8px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6, fontSize: 12, color: "#991B1B", fontWeight: 600 }}>
              {validationErr}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "transparent", color: C.sub, fontSize: 13, cursor: "pointer", fontFamily: F }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || saved} style={{
              flex: 2, padding: "10px", borderRadius: 8, border: "none",
              background: saved ? C.grn : "#F97316", color: "#fff",
              fontSize: 13, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: F,
            }}>
              {saved ? "✓ Saved" : saving ? "Saving…" : "Save changes"}
            </button>
          </div>
          {confirmDelete ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA" }}>
              <span style={{ fontSize: 12, color: "#991B1B", flex: 1 }}>Delete this task permanently?</span>
              <button onClick={async () => {
                setDeleting(true);
                try { await del(`/plan/task/${task.id}`); onSaved(); onClose(); } catch { /**/ }
                finally { setDeleting(false); }
              }} disabled={deleting} style={{ padding: "5px 14px", borderRadius: 6, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button onClick={() => setConfirmDelete(false)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.brd}`, background: "#fff", color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: F }}>No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={{ padding: "8px", borderRadius: 8, border: `1px solid #FECACA`, background: "transparent", color: "#DC2626", fontSize: 11, cursor: "pointer", fontFamily: F, fontWeight: 600 }}>
              Delete task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sprint ID recalculator (client-side, mirrors server logic) ──────────────

const CAT_PREFIX_CLIENT: Record<string, string> = {
  adaptation: "ADP", sales: "SLS", tech: "TCH", capital: "CAP", team: "TME",
};

function recalcSprintIds(taskList: (PlanItem & { sprintId?: string })[]): (PlanItem & { sprintId: string })[] {
  const catCounter: Record<string, number> = {};
  return taskList.map(t => {
    const cat = t.category || "misc";
    if (!catCounter[cat]) catCounter[cat] = 0;
    catCounter[cat]++;
    const prefix = CAT_PREFIX_CLIENT[cat] || cat.slice(0, 3).toUpperCase();
    return { ...t, sprintId: `${prefix}-${String(catCounter[cat]).padStart(2, "0")}` };
  });
}

// ─── Master Task Table ────────────────────────────────────────────────────────

type PendingDrop = {
  movedTask: PlanItem & { sprintId?: string };
  displacedTasks: (PlanItem & { sprintId?: string })[];
  fromIdx: number;
  toIdx: number;
  newTasks: (PlanItem & { sprintId?: string })[];
  prevTasks: (PlanItem & { sprintId?: string })[];
};

type OrganizePreview = {
  newOrder: (PlanItem & { sprintId?: string })[];
  currentOrder: (PlanItem & { sprintId?: string })[];
};

function MasterTaskTab({ onRefreshAll, categories }: { onRefreshAll: () => void; categories: CategoryWithSubs[] }) {
  const [tasks, setTasks] = useState<(PlanItem & { sprintId?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterWeek, setFilterWeek] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [sortCol, setSortCol] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [showAdd, setShowAdd] = useState(false);
  const [prefillData, setPrefillData] = useState<Record<string, string> | null>(null);
  const [placementToast, setPlacementToast] = useState<string | null>(null);

  // Listen for idea-to-task prefill events
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) { setPrefillData(detail); setShowAdd(true); }
    };
    window.addEventListener("tcc:prefill-task", handler);
    return () => window.removeEventListener("tcc:prefill-task", handler);
  }, []);
  const [editId, setEditId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragTaskRef = useRef<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<(PlanItem & { sprintId?: string }) | null>(null);
  type HoverInfo = { task: PlanItem & { sprintId?: string }; x: number; y: number };
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Training modal state
  const [pendingDrop, setPendingDrop] = useState<PendingDrop | null>(null);
  const [trainingExplanation, setTrainingExplanation] = useState("");
  const [submittingTraining, setSubmittingTraining] = useState(false);
  const [aiReflection, setAiReflection] = useState<string | null>(null);

  // AI Organize state
  const [organizing, setOrganizing] = useState(false);
  const [organizePreview, setOrganizePreview] = useState<OrganizePreview | null>(null);
  const [confirmingOrganize, setConfirmingOrganize] = useState(false);

  const loadTasks = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await get("/plan/tasks");
      setTasks((data as any).tasks || []);
    } catch { /**/ }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // All filtering is client-side so cards always have full per-category data
  let displayed = tasks;
  if (filterCat) displayed = displayed.filter(t => t.category === filterCat);
  if (filterOwner) displayed = displayed.filter(t => t.owner === filterOwner);
  if (filterStatus) displayed = displayed.filter(t => t.status === filterStatus);
  if (filterPriority) displayed = displayed.filter(t => t.priority === filterPriority);
  if (filterWeek) displayed = displayed.filter(t => String(t.weekNumber) === filterWeek);
  if (searchQ.trim()) {
    const q = searchQ.trim().toLowerCase();
    displayed = displayed.filter(t =>
      (t.title || "").toLowerCase().includes(q) ||
      (t.owner || "").toLowerCase().includes(q) ||
      (t.coOwner || "").toLowerCase().includes(q) ||
      (t.category || "").toLowerCase().includes(q) ||
      (t.subcategory || "").toLowerCase().includes(q) ||
      (t.atomicKpi || "").toLowerCase().includes(q) ||
      (t.workNotes || "").toLowerCase().includes(q) ||
      (t.source || "").toLowerCase().includes(q) ||
      (t.linearId || "").toLowerCase().includes(q)
    );
  }

  // Sort
  if (sortCol) {
    const SORT_KEYS: Record<string, (t: PlanItem & { sprintId?: string }) => string> = {
      "Sprint ID": t => t.sprintId || "",
      "Tier": t => t.executionTier || "",
      "Category": t => t.category || "",
      "Sub-Category": t => t.subcategory || "",
      "Task": t => t.title || "",
      "Atomic KPI": t => t.atomicKpi || "",
      "Owner": t => t.owner || "",
      "Co-Owner": t => t.coOwner || "",
      "Source": t => t.source || "",
      "Priority": t => t.priority || "",
      "Status": t => t.status || "",
      "Due Date": t => t.dueDate || "",
      "Completed": t => t.completedAt || "",
      "Notes": t => t.workNotes || "",
      "Linear": t => t.linearId || "",
    };
    const keyFn = SORT_KEYS[sortCol];
    if (keyFn) {
      displayed = [...displayed].sort((a, b) => {
        const av = keyFn(a).toLowerCase(), bv = keyFn(b).toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
  }

  async function handleToggle(id: string, complete: boolean) {
    // Optimistic UI update — instant visual feedback
    setTasks(prev => prev.map(t =>
      t.id === id ? { ...t, status: complete ? "completed" : "active", completedAt: complete ? new Date().toISOString() : null } : t
    ));
    try {
      if (complete) await post(`/plan/task/${id}/complete`, {});
      else await post(`/plan/task/${id}/uncomplete`, {});
      await loadTasks(true);
      onRefreshAll();
    } catch {
      // Revert on failure
      setTasks(prev => prev.map(t =>
        t.id === id ? { ...t, status: complete ? "active" : "completed", completedAt: complete ? null : t.completedAt } : t
      ));
    }
  }

  // Drag to reorder — now shows Training Modal instead of immediately saving
  function onDragStart(id: string) { dragTaskRef.current = id; }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id); }
  function onDragLeave() { setDragOverId(null); }

  function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const fromId = dragTaskRef.current;
    if (!fromId || fromId === targetId) return;

    const fromIdx = tasks.findIndex(t => t.id === fromId);
    const toIdx = tasks.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    // Block cross-category moves — tasks can only be reordered within their own category
    if (tasks[fromIdx].category !== tasks[toIdx].category) return;

    const prevTasks = [...tasks];
    const newTasks = [...tasks];
    const [moved] = newTasks.splice(fromIdx, 1);
    newTasks.splice(toIdx, 0, moved);

    // Re-calculate sprint IDs immediately for visual update
    const withNewIds = recalcSprintIds(newTasks.map((t, i) => ({ ...t, priorityOrder: i })));
    setTasks(withNewIds);

    // Determine displaced tasks (tasks that were leapfrogged)
    const lo = Math.min(fromIdx, toIdx);
    const hi = Math.max(fromIdx, toIdx);
    const displacedTasks = fromIdx > toIdx
      ? prevTasks.slice(toIdx, fromIdx)     // moved up: leapfrogged tasks between toIdx and fromIdx
      : prevTasks.slice(fromIdx + 1, toIdx + 1); // moved down

    // Show Training Modal
    setPendingDrop({
      movedTask: moved,
      displacedTasks: displacedTasks.slice(0, 5),
      fromIdx,
      toIdx,
      newTasks: withNewIds,
      prevTasks,
    });
    setTrainingExplanation("");
    setAiReflection(null);
  }

  async function submitTraining() {
    if (!pendingDrop || !trainingExplanation.trim()) return;
    setSubmittingTraining(true);
    const movedUp = pendingDrop.toIdx < pendingDrop.fromIdx;
    const updates = pendingDrop.newTasks.map((t, i) => ({ id: t.id, priorityOrder: i }));
    try {
      const result = await post<{ ok: boolean; aiReflection?: string }>("/plan/reorder", {
        items: updates,
        movedItemId: pendingDrop.movedTask.id,
        movedItemTitle: pendingDrop.movedTask.title,
        fromPosition: pendingDrop.fromIdx,
        toPosition: pendingDrop.toIdx,
        displacedItemIds: pendingDrop.displacedTasks.map(t => t.id),
        displacedItemTitles: pendingDrop.displacedTasks.map(t => t.title),
        explanation: trainingExplanation.trim(),
        direction: movedUp ? "up" : "down",
      });
      if (result.aiReflection) {
        setAiReflection(result.aiReflection);
      } else {
        closePendingDrop();
      }
    } catch {
      // Revert on error
      setTasks(pendingDrop.prevTasks);
      closePendingDrop();
    }
    setSubmittingTraining(false);
  }

  function cancelTraining() {
    if (pendingDrop) setTasks(pendingDrop.prevTasks);
    closePendingDrop();
  }

  function closePendingDrop() {
    setPendingDrop(null);
    setTrainingExplanation("");
    setAiReflection(null);
    setSubmittingTraining(false);
  }

  async function runAiOrganize() {
    setOrganizing(true);
    try {
      const data = await get<{ tasks: (PlanItem & { sprintId?: string })[] }>("/plan/brain/order");
      if (data.tasks && data.tasks.length > 0) {
        const newOrderWithIds = recalcSprintIds(data.tasks.map((t, i) => ({ ...t, priorityOrder: i })));
        setOrganizePreview({ newOrder: newOrderWithIds, currentOrder: tasks });
      }
    } catch { /**/ }
    setOrganizing(false);
  }

  async function confirmAiOrganize() {
    if (!organizePreview) return;
    setConfirmingOrganize(true);
    const updates = organizePreview.newOrder.map((t, i) => ({ id: t.id, priorityOrder: i }));
    try {
      await post("/plan/reorder", { items: updates });
      setTasks(organizePreview.newOrder);
      setOrganizePreview(null);
    } catch { loadTasks(); }
    setConfirmingOrganize(false);
  }

  function handleAddCreated(result: any) {
    setShowAdd(false);
    loadTasks();
    onRefreshAll();
    setPlacementToast(`✓ ${result.sprintId} added · position ${result.position}/${result.total}${result.prevTask ? ` · after "${result.prevTask.title.split(":")[0].trim()}"` : ""}`);
  }

  const selStyle: React.CSSProperties = { fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, background: C.card };

  // Count tasks per category for the nav bar badges
  const catCounts = CAT_KEYS.reduce<Record<string, number>>((acc, k) => {
    acc[k] = tasks.filter(t => t.category === k).length;
    return acc;
  }, {});

  return (
    <div>
      {/* Sticky header: nav bar + filter row */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30,
        background: "#fff", borderBottom: `2px solid ${C.brd}`,
        paddingBottom: 10,
      }}>

        {/* ── Category nav bar ── */}
        <div style={{
          display: "flex", gap: 0, borderBottom: `1px solid ${C.brd}`,
          marginBottom: 10, overflowX: "auto",
        }}>
          {/* All button */}
          <button
            onClick={() => setFilterCat("")}
            style={{
              padding: "9px 18px", border: "none", cursor: "pointer",
              fontFamily: F, fontSize: 12, fontWeight: filterCat === "" ? 800 : 500,
              color: filterCat === "" ? "#F97316" : C.sub,
              background: "transparent",
              borderBottom: filterCat === "" ? "3px solid #F97316" : "3px solid transparent",
              whiteSpace: "nowrap", transition: "all 0.15s",
            }}
          >All · {tasks.length}</button>

          {CAT_KEYS.map(k => {
            const active = filterCat === k;
            const color = CAT_COLOR[k] ?? C.sub;
            return (
              <button
                key={k}
                onClick={() => setFilterCat(active ? "" : k)}
                style={{
                  padding: "9px 18px", border: "none", cursor: "pointer",
                  fontFamily: F, fontSize: 12, fontWeight: active ? 800 : 500,
                  color: active ? color : C.sub,
                  background: "transparent",
                  borderBottom: active ? `3px solid ${color}` : "3px solid transparent",
                  whiteSpace: "nowrap", transition: "all 0.15s",
                }}
              >
                {CAT_LABELS[k]} · {catCounts[k] ?? 0}
              </button>
            );
          })}
        </div>

        {/* ── Filter row ── */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", minWidth: 180 }}>
            <input
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="Search tasks..."
              style={{
                padding: "6px 10px 6px 28px", borderRadius: 8, border: `1px solid ${C.brd}`,
                fontSize: 12, fontFamily: F, color: C.tx, background: C.card, width: "100%",
                outline: "none",
              }}
              onFocus={e => (e.target.style.borderColor = "#F97316")}
              onBlur={e => (e.target.style.borderColor = C.brd)}
            />
            <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: C.mut, pointerEvents: "none" }}>🔍</span>
          </div>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selStyle}>
            <option value="">All categories</option>
            {CAT_KEYS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
          <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={selStyle}>
            <option value="">All owners</option>
            {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select value={filterWeek} onChange={e => setFilterWeek(e.target.value)} style={selStyle}>
            <option value="">All weeks</option>
            <option value="1">Week 1</option>
            <option value="2">Week 2</option>
            <option value="3">Week 3</option>
            <option value="4">Week 4</option>
          </select>
          {/* Priority chips */}
          {[["", "All"], ["P0", "P0"], ["P1", "P1"], ["P2", "P2"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterPriority(val)}
              style={{
                padding: "4px 11px", borderRadius: 20, border: `1px solid ${filterPriority === val ? C.blu : C.brd}`,
                background: filterPriority === val ? C.bluBg : "transparent",
                color: filterPriority === val ? C.blu : C.sub, fontSize: 11, fontWeight: 600,
                cursor: "pointer", fontFamily: F, whiteSpace: "nowrap",
              }}
            >{label}</button>
          ))}
          {/* Status chips */}
          {[["", "All"], ["pending", "Not Started"], ["active", "Active"], ["completed", "Done"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val)}
              style={{
                padding: "4px 11px", borderRadius: 20,
                border: `1px solid ${filterStatus === val ? (val === "completed" ? C.grn : val === "pending" ? C.amb : val === "active" ? C.blu : C.brd) : C.brd}`,
                background: filterStatus === val ? (val === "completed" ? C.grnBg : val === "pending" ? C.ambBg : val === "active" ? C.bluBg : C.card) : "transparent",
                color: filterStatus === val ? (val === "completed" ? C.grn : val === "pending" ? C.amb : val === "active" ? C.blu : C.tx) : C.sub,
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F, whiteSpace: "nowrap",
              }}
            >{label}</button>
          ))}
          <span style={{ marginLeft: "auto", fontSize: 11, color: C.mut }}>
            {loading ? "Loading…" : `${displayed.length} tasks`}
          </span>
          <span style={{ fontSize: 10, color: C.mut, fontFamily: F }}>⠿ drag rows to reorder</span>
          <button
            onClick={runAiOrganize}
            disabled={organizing || loading}
            style={{
              padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.blu}`,
              background: organizing ? C.bluBg : C.bluBg, color: C.blu,
              fontSize: 12, fontWeight: 700, cursor: organizing ? "wait" : "pointer", fontFamily: F,
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {organizing ? "🧠 Thinking…" : "🧠 AI Organize"}
          </button>
          <button onClick={() => setShowAdd(true)} style={{ padding: "7px 16px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>+ Add task</button>
        </div>
      </div>

      {/* Table — full-width, scrollable */}
      <div style={{ overflowX: "auto", borderRadius: "0 0 10px 10px", border: `1px solid ${C.brd}`, marginTop: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1400 }}>
          <thead>
            <tr style={{ background: C.card, borderBottom: `2px solid ${C.brd}` }}>
              {["","Sprint ID","Tier","Category","Sub-Category","Task","Atomic KPI","Owner","Co-Owner","Source","Priority","Status","Due Date","Completed","Notes","Linear"].map((h, i) => (
                <th key={i} onClick={() => {
                  if (!h) return;
                  if (sortCol === h) setSortDir(d => d === "asc" ? "desc" : "asc");
                  else { setSortCol(h); setSortDir("asc"); }
                }} style={{ position: "sticky", top: 0, background: C.card, fontSize: 10, fontWeight: 700, color: sortCol === h ? "#F97316" : C.sub, textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap", borderRight: `1px solid ${C.brd}`, borderBottom: `2px solid ${C.brd}`, zIndex: 10, cursor: h ? "pointer" : "default", userSelect: "none" }}>
                  {h}{sortCol === h ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayed.map((task) => {
              const done = task.status === "completed";
              const isLate = !done && task.dueDate && new Date(task.dueDate) < new Date("2026-04-09");
              const isDraggingOver = dragOverId === task.id;
              const rowBg = isDraggingOver ? "#EFF6FF" : done ? "#F9FFF9" : isLate ? "#FFF8F8" : "#fff";
              const pc = personColor(task.owner || "");

              return (
                <tr
                  key={task.id}
                  draggable
                  onDragStart={() => onDragStart(task.id)}
                  onDragOver={e => onDragOver(e, task.id)}
                  onDragLeave={onDragLeave}
                  onDrop={e => onDrop(e, task.id)}
                  onClick={() => setSelectedTask(task)}
                  onMouseEnter={e => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    const x = e.clientX; const y = e.clientY;
                    hoverTimer.current = setTimeout(() => setHoverInfo({ task, x, y }), 500);
                  }}
                  onMouseMove={e => {
                    if (hoverInfo) setHoverInfo(h => h ? { ...h, x: e.clientX, y: e.clientY } : null);
                  }}
                  onMouseLeave={() => {
                    if (hoverTimer.current) clearTimeout(hoverTimer.current);
                    setHoverInfo(null);
                  }}
                  style={{ background: rowBg, borderBottom: `1px solid ${C.brd}`, borderTop: isDraggingOver ? `2px solid ${C.blu}` : undefined, transition: "background 0.1s", cursor: "pointer" }}
                >
                  {/* Drag + checkbox combined */}
                  <td onClick={e => e.stopPropagation()} style={{ padding: "6px 8px", textAlign: "center", cursor: "grab", color: C.mut, fontSize: 14, whiteSpace: "nowrap" }}>
                    <span style={{ marginRight: 4, opacity: 0.4 }}>⠿</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleToggle(task.id, !done); }}
                      style={{ width: 15, height: 15, borderRadius: 3, border: `1.5px solid ${done ? C.grn : "#d1d5db"}`, background: done ? C.grn : "transparent", color: "#fff", fontSize: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                    >{done ? "✓" : ""}</button>
                  </td>
                  {/* Sprint ID */}
                  <td style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: C.sub, fontFamily: "monospace", whiteSpace: "nowrap" }}>{task.sprintId || "—"}</td>
                  {/* Tier */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, whiteSpace: "nowrap" }}>{task.executionTier || "—"}</td>
                  {/* Category */}
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: "capitalize", color: C.tx }}>{task.category}</span>
                  </td>
                  {/* Subcategory */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub }}>{task.subcategory || "—"}</td>
                  {/* Task title */}
                  <td style={{ padding: "8px 10px", maxWidth: 220, minWidth: 140 }}>
                    <span style={{ fontSize: 12, color: done ? C.mut : C.tx, textDecoration: done ? "line-through" : "none", lineHeight: 1.4, display: "block" }}>{task.title}</span>
                  </td>
                  {/* Atomic KPI */}
                  <td style={{ padding: "8px 10px", maxWidth: 160, fontSize: 11, color: C.sub }}>{task.atomicKpi || "—"}</td>
                  {/* Owner */}
                  <td style={{ padding: "8px 10px" }}>
                    {task.owner && <span style={{ fontSize: 11, fontWeight: 700, color: pc, background: pc + "18", borderRadius: 8, padding: "1px 7px", whiteSpace: "nowrap" }}>{task.owner}</span>}
                  </td>
                  {/* Co-Owner — read-only in table, editable in detail modal */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, whiteSpace: "nowrap" }}>{task.coOwner || "—"}</td>
                  {/* Source */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.mut, whiteSpace: "nowrap" }}>{task.source || "—"}</td>
                  {/* Priority */}
                  <td style={{ padding: "8px 10px" }}>{task.priority && <PriorityBadge p={task.priority} />}</td>
                  {/* Status */}
                  <td style={{ padding: "8px 10px" }}>{task.status && <StatusPill s={isLate ? "late" : task.status} />}</td>
                  {/* Due date */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: isLate ? C.red : C.mut, whiteSpace: "nowrap" }}>{task.dueDate || "—"}</td>
                  {/* Completed date */}
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap" }}>
                    {task.completedAt ? (
                      <span style={{ fontSize: 11, color: C.grn, fontWeight: 600 }}>
                        ✓ {new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    ) : <span style={{ color: C.mut, fontSize: 11 }}>—</span>}
                  </td>
                  {/* Notes */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, maxWidth: 100 }}>{task.workNotes || "—"}</td>
                  {/* Linear */}
                  <td style={{ padding: "8px 10px", fontSize: 11 }}>
                    {task.linearId ? (
                      <a href={`https://linear.app/issue/${task.linearId}`} target="_blank" rel="noopener noreferrer" style={{ color: C.blu }}>{task.linearId}</a>
                    ) : (
                      <span style={{ color: C.mut }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && displayed.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: C.mut, fontFamily: F, fontSize: 14 }}>No tasks found</div>
        )}
      </div>

      {showAdd && (
        <AddTaskModal
          onClose={() => { setShowAdd(false); setPrefillData(null); }}
          onCreated={handleAddCreated}
          categories={categories}
          prefill={prefillData}
        />
      )}
      {placementToast && <Toast msg={placementToast} onDismiss={() => setPlacementToast(null)} />}

      {/* Hover tooltip — shows after 500ms hover */}
      {hoverInfo && !selectedTask && (() => {
        const t = hoverInfo.task;
        const catColor = CAT_COLOR[t.category] ?? "#555";
        const wx = typeof window !== "undefined" ? window.innerWidth : 1400;
        const wy = typeof window !== "undefined" ? window.innerHeight : 800;
        const left = hoverInfo.x + 20 + 320 > wx ? hoverInfo.x - 340 : hoverInfo.x + 20;
        const top = Math.min(hoverInfo.y - 10, wy - 280);
        return (
          <div style={{
            position: "fixed", left, top, zIndex: 8000,
            width: 320, background: "#fff", borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)", border: `1px solid ${C.brd}`,
            pointerEvents: "none",
          }}>
            <div style={{ background: catColor, borderRadius: "10px 10px 0 0", padding: "10px 14px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "rgba(255,255,255,0.75)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
                {t.sprintId && `${t.sprintId} · `}{t.category}{t.subcategory ? ` · ${t.subcategory}` : ""}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", lineHeight: 1.4 }}>{t.title}</div>
            </div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {t.priority && <PriorityBadge p={t.priority} />}
                {t.status && <StatusPill s={t.status} />}
                {t.owner && <span style={{ fontSize: 10, fontWeight: 700, color: catColor }}>{t.owner}</span>}
              </div>
              {t.dueDate && <div style={{ fontSize: 11, color: C.mut }}>Due: <strong>{t.dueDate}</strong></div>}
              {t.completedAt && <div style={{ fontSize: 11, color: C.grn, fontWeight: 600 }}>✓ Completed {new Date(t.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</div>}
              {t.atomicKpi && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5 }}>Atomic KPI</div>
                  <div style={{ fontSize: 12, color: C.tx, marginTop: 2 }}>{t.atomicKpi}</div>
                </div>
              )}
              {t.workNotes && (
                <div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5 }}>Notes</div>
                  <div style={{ fontSize: 12, color: C.tx, marginTop: 2, lineHeight: 1.5 }}>{t.workNotes}</div>
                </div>
              )}
              {!t.atomicKpi && !t.workNotes && <div style={{ fontSize: 11, color: C.mut, fontStyle: "italic" }}>Click to add notes →</div>}
            </div>
          </div>
        );
      })()}

      {/* Click-to-edit detail panel */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onSaved={() => { loadTasks(); onRefreshAll(); }}
        />
      )}

      {/* ─── Training Modal ─────────────────────────────────────────────── */}
      {pendingDrop && !aiReflection && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000 }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 32, width: 520, maxWidth: "94vw", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 10 }}>🧠 Brain Training</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, fontFamily: F, marginBottom: 4 }}>
              Moving <span style={{ color: pendingDrop.toIdx < pendingDrop.fromIdx ? C.blu : C.mut }}>"{pendingDrop.movedTask.title}"</span>
            </div>
            {pendingDrop.displacedTasks.length > 0 && (
              <div style={{ fontSize: 12, color: C.mut, marginBottom: 16 }}>
                <span>{pendingDrop.toIdx < pendingDrop.fromIdx ? "above " : "below "}</span>
                {pendingDrop.displacedTasks.slice(0, 3).map((t, i) => (
                  <span key={t.id}>{i > 0 ? ", " : ""}<em style={{ color: C.tx }}>"{t.title}"</em></span>
                ))}
                {pendingDrop.displacedTasks.length > 3 && <span> +{pendingDrop.displacedTasks.length - 3} more</span>}
              </div>
            )}
            <div style={{ fontSize: 13, color: pendingDrop.toIdx < pendingDrop.fromIdx ? C.blu : C.mut, marginBottom: 10, fontWeight: 700 }}>
              {pendingDrop.toIdx < pendingDrop.fromIdx ? "⬆️ Why is it MORE important right now?" : "⬇️ Why is it LESS important right now?"}
            </div>
            <textarea
              autoFocus
              value={trainingExplanation}
              onChange={e => setTrainingExplanation(e.target.value)}
              placeholder={pendingDrop.toIdx < pendingDrop.fromIdx
                ? "e.g. This unblocks our biggest deal this week. Revenue before process."
                : "e.g. Operator stability is more urgent. This can wait until next sprint."}
              rows={4}
              style={{
                width: "100%", boxSizing: "border-box", background: C.bg, border: `1px solid ${C.brd}`,
                borderRadius: 8, padding: "10px 12px", color: C.tx, fontSize: 13, fontFamily: F,
                resize: "vertical", outline: "none",
              }}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitTraining(); }}
            />
            <div style={{ fontSize: 10, color: C.mut, marginTop: 4, marginBottom: 20 }}>⌘/Ctrl+Enter to submit · Your reasoning trains the AI</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={cancelTraining} disabled={submittingTraining} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "transparent", color: C.mut, fontSize: 13, cursor: "pointer", fontFamily: F }}>Cancel (revert)</button>
              <button
                onClick={submitTraining}
                disabled={!trainingExplanation.trim() || submittingTraining}
                style={{
                  padding: "9px 24px", borderRadius: 8, border: "none",
                  background: !trainingExplanation.trim() || submittingTraining ? C.brd : C.blu,
                  color: "#fff", fontSize: 13, fontWeight: 700, cursor: !trainingExplanation.trim() ? "not-allowed" : "pointer", fontFamily: F,
                }}
              >
                {submittingTraining ? "Saving + reflecting…" : "Log & Save →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── AI Reflection (after training log submit) ───────────────────── */}
      {pendingDrop && aiReflection && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9001 }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 32, width: 500, maxWidth: "94vw", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 14 }}>🧠 Brain reflection</div>
            <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.7, marginBottom: 8, fontStyle: "italic", borderLeft: `3px solid ${C.blu}`, paddingLeft: 14 }}>{aiReflection}</div>
            <div style={{ fontSize: 11, color: C.mut, marginBottom: 20 }}>Not quite right? Edit your reasoning and resubmit to refine the reflection.</div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setAiReflection(null)}
                style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "transparent", color: C.sub, fontSize: 13, cursor: "pointer", fontFamily: F }}
              >✏️ Re-correct</button>
              <button onClick={closePendingDrop} style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: C.blu, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Got it ✓</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── AI Organize Preview ─────────────────────────────────────────── */}
      {organizePreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.70)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9002 }}>
          <div style={{ background: C.card, borderRadius: 16, padding: 28, width: 640, maxWidth: "96vw", maxHeight: "85vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", border: `1px solid ${C.brd}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 }}>🧠 AI Organize Preview</div>
            <div style={{ fontSize: 13, color: C.mut, marginBottom: 16 }}>
              Claude re-ranked your tasks based on revenue impact, urgency, and your training history.
              <span style={{ marginLeft: 12, color: C.grn, fontWeight: 600 }}>▲ moved up</span>
              <span style={{ marginLeft: 8, color: C.amb, fontWeight: 600 }}>▼ moved down</span>
            </div>
            <div style={{ flex: 1, overflow: "auto" }}>
              {organizePreview.newOrder.slice(0, 40).map((t, i) => {
                const oldIdx = organizePreview.currentOrder.findIndex(c => c.id === t.id);
                const moved = oldIdx - i;
                const upColor = C.grn;
                const dnColor = C.amb;
                const moveBadge = moved > 0 ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: upColor, background: C.grnBg, borderRadius: 4, padding: "1px 5px" }}>▲{moved}</span>
                ) : moved < 0 ? (
                  <span style={{ fontSize: 10, fontWeight: 700, color: dnColor, background: C.ambBg, borderRadius: 4, padding: "1px 5px" }}>▼{Math.abs(moved)}</span>
                ) : null;
                const catColor = CAT_COLORS[t.category as keyof typeof CAT_COLORS]?.accent || C.mut;
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", borderBottom: `1px solid ${C.brd}`, background: moved > 2 ? `${upColor}10` : moved < -2 ? `${dnColor}10` : "transparent", borderRadius: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: C.mut, width: 22, textAlign: "right", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: catColor, width: 50, flexShrink: 0 }}>{t.sprintId || t.category?.slice(0, 3).toUpperCase()}</span>
                    <span style={{ flex: 1, fontSize: 12, color: C.tx }}>{t.title}</span>
                    {moveBadge && <span style={{ flexShrink: 0 }}>{moveBadge}</span>}
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20, borderTop: `1px solid ${C.brd}`, paddingTop: 16 }}>
              <button onClick={() => setOrganizePreview(null)} style={{ padding: "9px 20px", borderRadius: 8, border: `1px solid ${C.brd}`, background: "transparent", color: C.mut, fontSize: 13, cursor: "pointer", fontFamily: F }}>Discard</button>
              <button
                onClick={confirmAiOrganize}
                disabled={confirmingOrganize}
                style={{ padding: "9px 24px", borderRadius: 8, border: "none", background: C.blu, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}
              >
                {confirmingOrganize ? "Applying…" : "Apply AI Order ✓"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(id: string) { setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  const activeCount = TEAM_SOW.filter(m => !m.hiring).length;
  const hiringCount = TEAM_SOW.filter(m => m.hiring).length;
  const burnTotal = TEAM_SOW.filter(m => !m.hiring).reduce((sum, m) => sum + parseInt((m.salary || "$0").replace(/\D/g, "")), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Active", value: activeCount, bg: C.grnBg, color: C.grn },
          { label: "Hiring", value: hiringCount, bg: C.ambBg, color: C.amb },
          { label: "Monthly burn", value: `$${burnTotal}K`, bg: C.redBg, color: C.red },
        ].map(m => (
          <div key={m.label} style={{ flex: 1, background: m.bg, border: `1px solid ${m.color}40`, borderRadius: 10, padding: "14px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: m.color, fontFamily: F }}>{m.value}</div>
            <div style={{ fontSize: 11, color: m.color, opacity: 0.8 }}>{m.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {TEAM_SOW.map(member => {
          const isExpanded = expanded.has(member.id);
          const pc = personColor(member.id);
          return (
            <div key={member.id} style={{ border: `1px solid ${C.brd}`, borderRadius: 10, overflow: "hidden" }}>
              <button onClick={() => toggle(member.id)} style={{ width: "100%", background: C.card, border: "none", padding: "12px 16px", cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: member.hiring ? C.amb : pc, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {member.hiring ? "?" : member.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F }}>{member.name}</span>
                    {member.hiring && <span style={{ fontSize: 10, fontWeight: 700, background: C.ambBg, color: C.amb, borderRadius: 10, padding: "2px 8px" }}>HIRING</span>}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub }}>{member.role}</div>
                </div>
                <span style={{ color: C.mut }}>{isExpanded ? "▲" : "▼"}</span>
              </button>

              {isExpanded && (
                <div style={{ padding: "16px", background: "#fafafa", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.grn, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>✓ Scope of Work</div>
                    {member.does.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.tx, lineHeight: 1.5, borderLeft: `3px solid ${C.grn}`, paddingLeft: 10, marginBottom: 8 }}>{item}</div>
                    ))}
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.red, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>✕ Doesn't Touch</div>
                    {member.doesNot.map((item, i) => (
                      <div key={i} style={{ fontSize: 12, color: C.tx, lineHeight: 1.5, borderLeft: `3px solid ${C.red}`, paddingLeft: 10, marginBottom: 8 }}>{item}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 24, background: C.ambBg, border: `1px solid ${C.amb}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.amb, marginBottom: 12, fontFamily: F }}>⚠ AI Gap Analysis — Critical Risks</div>
        {GAP_ANALYSIS.map(g => (
          <div key={g.n} style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.amb, flexShrink: 0 }}>#{g.n}</span>
            <span style={{ fontSize: 12, color: "#7C3A00", lineHeight: 1.5 }}>{g.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Business Plan Tab ────────────────────────────────────────────────────────

const BUSINESS_PLAN = `FLIPIQ OPERATING BRAIN
The source of truth for every decision. Updated April 9, 2026.

If a task, idea, or meeting cannot be justified by this document — it is noise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO WE ARE

FlipIQ is an AI-powered acquisition intelligence platform for experienced real estate investor-operators. We make operators more efficient by providing transaction intelligence: which agents close, which investors are active, where deals are. We do not teach people to flip. We arm experienced teams with better data and smarter automation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE BUILD

Command — CRM and deal management. Operator dashboard, pipeline, agent relationships, offers, communication. What operators live in daily.

DispoPro — Disposition tools in Command. List acquired properties, find buyers through agent networks.

USale Marketplace — Free off-market platform. Operators post deals, buyers get notified, transactions happen direct. Launching July 1, 2026.

USale Seller Direct — Co-op brand. Operators pool resources for low-cost 'sell your house as-is' leads. Feeds inventory into Marketplace. Target $100K/mo by Dec 2026.

AAA — Acquisition Intelligence System. AI layer on Command. Continuous scoring, automated matching, offer generation. AA opens app → prioritized opportunities already analyzed → approve and send. End state: fully autonomous.

TCC — CEO operating system. Morning check-in, email triage, sales CRM, task management, accountability. Keeps the CEO on sales, not in engineering.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NORTH STAR

Atomic KPI: Every AA closes 2 deals per month. Each operator has 4 full-time AAs.

The math: 2 flips + 6 wholesales per operator per month = $10,370 in FlipIQ revenue. At 375 operators = $3.9M/month.

Decision filter: Does this move an AA toward 2 deals/month? If no — it is noise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHERE WE ARE GOING

This year (2026): Get all 7 current operators to atomic KPI. Prove the model works. Launch Marketplace by July 1. Seller Direct generating $100K/mo by December. Raise $400K for 6-month runway. Hire PM, Onboarding Manager, Adaptation Manager.

3 years: 375 operators across 75 metros. $1.5M/month run rate at 50% forecast. $16.2M cumulative. Command 2.0 + AAA fully deployed. Self-funding from loan brokerage + success fees.

5 years: USale Marketplace = largest off-market RE platform. Seller Direct = largest sell-as-is brand. 1,875 users (375 operators × 5 each). 7,500 deals/month. Revenue stack: Command + loans + title + escrow = $100M ARR. Exit at $1B (10x).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW WE MAKE MONEY

Source                              Amount              Per operator/month
Flip loan brokerage (0.5%)          $1,285 per flip     $2,570 (2 flips)
Wholesale success fee (10%)         $1,300 per deal     $7,800 (6 wholesales)
Setup fee (subsidized by lender)    $10,000 one-time    —
TOTAL                               —                   $10,370/month

Setup fee is $50K. Sponsoring lender subsidizes it to $10K. Cheapest in market. Operator must use our lending partner (Kiavi) — that's how we earn the half-point. If they don't use our lender: full $50K.

Future: loans + title + escrow at scale → $100M ARR.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GROWTH PLAN

Phase     Months    Pace             End operators    Run rate
Setup     1–6       Prove with 7     7                $18K/mo
Crawl     7–12      1 new/week       31               $67K/mo
Walk      13–18     2/week           85               $231K/mo
Jog       19–24     3/week           163              $542K/mo
Run       25–30     4/week           265              $977K/mo
Sprint    31–36     5/week           375              $1.5M/mo

All numbers at 50% forecast (conservative). Even at 25% = $11.7M/year at scale.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE SPEND

Monthly burn: ~$64K. 6-month need (May–Oct): $400K. Revenue forecast ~$200K reduces gap.

Role/cost                Monthly    Notes
CEO                      $5K
COO/CFO                  $10K
CTO (advisory)           $6K        SLA model
Engineers (2)            $5K        Faisal $3K + Haris $2K
CS Manager               $5K        Ramy
Marketing                $5K        Bondilyn
PM/Engineer (hire)       $6K        Target May
2 CX hires               $5K        $2.5K each
AWS                      $5K        Target $2–3K after reduction
Data/MLS/AI              $4.5K
Legal/misc               $2.5K

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CAPITAL STRATEGY

Path A (preferred): Bootstrap. Tony signs as Kiavi broker. Half-point per loan, no dependency. 20 commitments at $10K = $200K. Chris Wesser + advisors fund the $400K gap.

Path B (fallback): Lender partnership. Nema/Lightning Docs or RCN invests $400K–$1M for exclusive lending distribution. Risk: they control the loan relationship.

Decision by: May 15, 2026. Pursue both simultaneously until then.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIVE PRIORITIES FOR 2026

In order. If #1 and #2 aren't working, nothing else matters.

01 ADAPTATION
1. Assess each of the 7 operators individually
2. Finalize Customer Success Dashboard
3. Contact every user — classify engaged vs dead weight, suspend non-performers
4. Document DBTM success model — replicate to all operators
5. Deploy success workflow to all AAs

02 SALES
1. Lock $10K pricing with sponsoring lender
2. Get 20 commitments at $10K
3. Demo workflow: lender + title company lined up
4. Deliver sales materials: presentation, script, databases
5. Pipeline: 5 demos/week, 15+ prospects, 3 new operators/month

03 TECH
1. Finalize CS Dashboard
2. Finalize Foundation + DispoPro
3. AWS cost reduction + Google Cloud credits/grant
4. Build AAA
5. Deploy USale Marketplace by July 1

04 CAPITAL
1. Decide: Kiavi broker vs lender buy-in
2. Finalize 6-month financial plan ($400K)
3. Present plan to Chris Wesser + Rick Sharga
4. Kiavi broker application signed
5. Nema/Lightning Docs as option B

05 TEAM
1. Hire PM/Engineer at $6K
2. Hire Onboarding Manager at $2.5K
3. Hire Adaptation Manager at $2.5K
4. Clarify CTO advisory role, reassign 29 issues
5. SOW updates for all team members

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO DOES WHAT

Role                    Does                                                    Does not touch
CEO                     Sales 60%+. Pricing. Capital. AAA spec. CS support.     Standups. Linear. QA. Onboarding. New frameworks.
COO                     Accountability. Finance. Hiring. Dashboard oversight.    Engineering. Product. Sales demos. Training.
CTO (SLA)               AWS cost. Architecture. AAA review. PM transfer.         Day-to-day engineering. Triage. Code without approval.
CS Manager              Adaptation. User contact. Success workflow. Training.    Engineering. Sales. Finance. Feature changes.
Command Engineer        Dashboard. QA. Sprint delivery. SMS UI.                  Foundation. Training. Operators. AWS.
Foundation Engineer     MLS. Agent pipeline. DispoPro. Contact matching.         Command UI. Sprint planning. Customers.
Marketing               Sales presentation. Scripts. Databases. Playbook.        Sales calls. Engineering. CS. Finance.
PM (hire)               Linear audit. Sprints. Standups. Backend. AAA build.     CS. Sales. Strategy. Daily CEO updates after Wk 4.
Onboarding Mgr (hire)   Intake. OMS checklist. First-contact quality.            Ongoing support. Sales. Engineering.
Adaptation Mgr (hire)   Adoption tracking. Alerts. Outreach. Training.          Onboarding. Sales. Engineering.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

90-DAY RULES

One system. 90 days. No modifications.

Every item has an owner and a date. When a date passes, the owner flags it same day. COO surfaces all misses in Friday report. CEO responds same day with a specific correction — not a new plan.

Every task in Linear. If not in Linear, it does not exist. Required fields: Status, Start Date, Due Date, Size, Assignee, Next Step. Sprint target: 80%+ of 40+ committed points.

CEO scope: Sales, then CS support. Everything else pushed back.

If CEO is doing engineering work: COO flags it. Correct that week.
If CEO creates a new framework: Stop. This document is the system.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STOP DOING / DO INSTEAD

Stop                                      Instead
New framework                             Enforce this doc 90 days
Soft accountability                       What, by when, what if missed
Tech work instead of selling              COO flags → correct that week
Delegate discomfort to a document         Say it directly, face to face
New products before Command stable        List does not grow
50 calls but 3 conversations              5 demos/week, tracked, verified

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW THE AI USES THIS DOCUMENT

When evaluating any task, idea, meeting, or decision:

1. Does it move an AA toward 2 deals/month? → If no: noise. Park it.
2. Does it align with one of the 5 priorities? → If no: not this cycle.
3. Is it in the 90-day plan? → If no: it's an idea. Assign a number. Say what's ahead of it.
4. Who owns it? → If nobody: assign or kill.
5. Does it have a date? → If no: it doesn't exist.

Updated April 9, 2026. Next review: July 1, 2026.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const OAP_NARRATIVE = `FLIPIQ 90-DAY PLAN
April 7 — July 4, 2026

This plan does not grow. It does not get modified. It gets executed. Every item has an owner. Every owner has a date. When a date passes without delivery, the owner flags it same day. If a new idea surfaces that isn't in this plan — it gets parked. If someone wants to add scope — the answer is no. 90 days.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHERE WE ARE TODAY

FlipIQ has 7 active operator clients. The platform is live. Operators are using Command for acquisition management. But we have a problem: the operators are not consistently hitting the atomic KPI. Some are performing — DBTM is doing 2 acquisitions per week. Others are not engaging at all. We don't have clear visibility into who is active and who isn't because the Customer Success Dashboard doesn't exist yet.

The sales engine is stalled. The CEO has been building systems instead of selling. The pricing model is confirmed ($50K subsidized to $10K by the sponsoring lender) but zero new commitments have been signed. The sales materials are incomplete — Bondilyn has been waiting since March 31 for the broker presentation and USale script.

The tech stack is functional but unfinished. Command 1.5 has open QA items that need shipping. Foundation (the data layer) is not complete. DispoPro is partially integrated. The admin panel hasn't been deployed to production. AWS costs are running at $5K/month, which is double what they should be.

The team is lean but has critical gaps. There is no PM — the CEO is still attending engineering meetings and doing Linear triage. Ramy is a single point of failure for all customer success. Nate stepped back from CTO on March 6 and left 29 Linear issues without owners. The 3 hiring positions (PM, Onboarding Manager, Adaptation Manager) are not yet posted.

Capital: Ethan completed the 6-month financial analysis on April 9. The company needs $400K to fund operations May through October. Two capital paths exist: bootstrap through Kiavi loan brokerage, or bring in a lending partner. No decision has been made.

This is the starting point. Not where we want to be — where we actually are.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 1: ADAPTATION — MAKE THE CURRENT OPERATORS WORK

Before we sell to new operators, the 7 we have need to be producing. If they're not hitting the atomic KPI (2 deals/month per AA), we can't prove the model to anyone else. This is not optional — it's the foundation everything else sits on.

The plan: Ramy contacts every single user by April 17. Not an email blast — actual conversations. Who is engaged? Who is struggling? Who has checked out? By the end of April, every operator is classified as active, struggling, or dead weight. Dead weight gets suspended — we are not carrying non-performers while we burn cash.

Simultaneously, Faisal ships the Customer Success Dashboard so we have real-time visibility. Tony assesses each operator individually — starting with DBTM (the one that works) and working through all 7 by end of Week 2. We document what DBTM is doing right and turn it into a success playbook that gets distributed to every AA.

End of month 1: Every operator assessed. Engaged users getting support. Dead weight identified. Success workflow in every AA's hands.

End of 90 days: Active operators at 70%+ atomic KPI. All dead weight suspended. Adaptation Manager hired and cross-trained with Ramy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 2: SALES — START CLOSING

The CEO's job is to sell. 60% of his time, minimum. For the past several weeks, that hasn't been happening — system building, engineering oversight, and operational work have consumed the calendar. This plan stops that.

Week 1: Tony is on the phone 10 calls per day. He responds to Bondilyn's requests for the broker presentation and USale script — she's been waiting since March 31. He starts the Kiavi broker application so we have loan revenue flowing without external dependency.

By Week 2: Kiavi broker agreement is signed. 5 demos are completed. The pitch is simple: $50K platform subsidized to $10K by the sponsoring lender. Use our lender for flips, we earn a half-point. Don't want to use our lender? Full $50K. It's the cheapest and most advanced platform in the market.

By end of April: 10+ operators in the pipeline. By end of May: 3 new commitments signed. By end of June: 20 total commitments at $10K each, representing $200K in near-term contracts.

Enforcement: Ethan audits Tony's calendar every Monday. If Tony is in engineering meetings instead of selling, Ethan flags it. If Tony creates a new framework instead of making calls, Claude flags it. No exceptions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 3: TECH — SHIP WHAT'S BUILT, START WHAT'S NEXT

The engineering team has three lanes with zero overlap. Faisal owns Command 1.5: ship the QA items, deploy the admin panel, build the CS Dashboard. Haris owns Foundation: complete the data layer, integrate DispoPro, close the 15% agent matching gap. Nate (on SLA) owns architecture: AWS cost reduction, AAA spec, and knowledge transfer to the new PM.

The first month is about finishing. Everything in QA ships. The admin panel goes to production. Foundation gets stable. AWS costs start coming down from $5K to the $2–3K target.

The second month is about building. The PM is hired and ramped. AAA (the Acquisition Intelligence System) starts its 30-day build: infrastructure in Week 1, intelligence layer in Week 2, integration in Weeks 3–4. By end of May, AAA is in testing with 1–2 live AAs.

The third month is about preparing for launch. AAA goes to production. The marketplace data layer is designed and development starts. By July 1 — the 91st day — USale Marketplace launches as a free off-market listing platform.

Sprint discipline: 40+ points committed per cycle. 80%+ completion rate. Every ticket in Linear with Status, Start Date, Due Date, Size, Assignee, and Next Step. Ethan enforces on Monday. Reports on Friday.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 4: CAPITAL — SECURE THE RUNWAY

The company needs $400K for the 6-month runway May through October. Two paths are being pursued simultaneously.

Path A is the preferred approach: bootstrap. Tony signs up as Kiavi broker and earns a half-point on every flip loan flowing through our network. Combined with $10K setup fees from 20 operator commitments, this generates $200K+ in near-term revenue. The remaining gap is funded through Chris Wesser and advisor-connected investors at favorable terms.

Path B is the fallback: a lending partner (Nema/Lightning Docs or similar) invests $400K–$1M in exchange for exclusive loan distribution through FlipIQ. This brings capital fast but gives the lender control over the loan relationship.

The sequence: Ethan finalizes the P&L in Week 1. Tony and Ethan confirm the capital strategy (Kiavi broker vs lender) by Week 2. Chris Wesser gets the presentation by Week 3. By May 15, the decision is made and the capital path is locked.

Non-negotiable: No investor conversations without Ethan's approval on the numbers. No commitments to lenders without Tony's written approval on the terms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 5: TEAM — FILL THE GAPS

Three positions need to be filled: PM/Engineer ($6K/month), Onboarding Manager ($2.5K), and Adaptation Manager ($2.5K). The PM is the most urgent — until this person is hired, Tony is stuck doing engineering oversight and the CEO can't sell full-time.

Ethan owns hiring. PM job spec finalized Week 1, posted Week 3, interviews Week 4, offer by early May. The PM's first deliverable is a Linear workspace audit and sprint plan within 7 days of starting. By Day 30, the PM is fully autonomous — zero CEO involvement in daily engineering.

The two CX hires (Onboarding Manager and Adaptation Manager) go under Ramy. They're posted in May and hired in June. Until then, Ramy handles both onboarding and adaptation alone — which is why he's classified as a single point of failure in the gap analysis.

Nate's 29 orphaned issues from March 6 get reassigned immediately — to Faisal, Haris, or parked for the PM. SOW updates for every team member are completed by the end of April so there is zero ambiguity about who does what.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW THE TEAM IS ORGANIZED

Three engineers. Three lanes. Zero overlap. Every other role has a clear scope.

Role                   Lane                    Owns
CEO                    Sales + Strategy        Demos, pricing, capital, AAA spec, Ramy support
COO                    Accountability+Finance  Linear dates, Friday report, P&L, hiring
CS Manager             Adaptation + OMS        User contact, classification, workflow, reports
Command Engineer       Command 1.5             Dashboard, QA, sprint delivery, SMS UI
Foundation Engineer    Foundation + DispoPro   MLS, agent pipeline, DispoPro, matching
CTO (SLA)              Architecture            AWS, specs, reviews, PM transfer
Marketing              Sales Support           Presentation, scripts, databases, playbooks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW WE STAY ACCOUNTABLE

Every task is in Linear. If it's not in Linear, it doesn't exist. Required fields: Status, Start Date, Due Date, Size, Assignee, Next Step. Sprint target: 80%+ of 40+ committed points.

The COO never opens Linear to discover a missed commitment. If the CEO has to ask about a deadline, the accountability system has failed.

Monday: COO checks all Linear tasks have dates and assignees.
Friday: COO delivers Tech Report — what shipped, what missed, what's blocked. CEO responds same day with a specific correction.

CTO SLA terms: Architecture questions: 24 hours. Emergencies: 4 hours. Feature specs: 48 hours. All scopes approved in writing before work begins. Estimate first, approve first, bill after.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE STOP DOING

Creating a new framework instead of enforcing this plan. This document is the system. No new operating plans, accountability systems, or tracking frameworks. Enforce this one.

Soft accountability with no deliverable. Every conversation ends with: what is being delivered, by when, and what happens if it's missed.

The CEO doing tech work instead of selling. If the COO flags it, correct that week. If Claude flags it, correct that day.

Delegating discomfort to a document. Don't write a doc when a direct conversation is needed. Say it to the person.

Adding scope. This list does not grow. New ideas get parked with a number. The AI says what's ahead of it.

Reporting activity instead of results. 50 calls means nothing if there are 3 real conversations. 5 demos per week, tracked, verified.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT DONE LOOKS LIKE — JULY 4, 2026

Operators: All 7 assessed. Active ones at or near atomic KPI. Dead weight suspended. Success workflow adopted. DBTM model documented and replicated.

Sales: 20+ commitments at $10K. $200K in signed contracts. Active pipeline of 15+ prospects. 5 demos per week sustained. Kiavi broker generating loan revenue.

Revenue: On track for $100K/month. Success fees being collected. DBTM revenue tracked and in the P&L.

Capital: $400K secured through Path A or B. Runway confirmed through October. Decision made, not still being discussed.

Tech: Command 1.5 stable with zero critical bugs. Foundation complete. DispoPro integrated. CS Dashboard live. AAA deployed with 1–2 live AAs. AWS at $2–3K/month.

Team: PM hired, ramped, and running sprints autonomously. Onboarding Manager and Adaptation Manager hired. All SOWs current. Nate's 29 issues resolved.

Marketplace: Data layer designed. Architecture reviewed. Development underway. July 1 launch on track.

If these outcomes are met, the next 90-day plan builds on success. If they're not, the next plan starts with an honest assessment of why — and the same five questions: does it move an AA toward 2 deals/month? Does it align with the priorities? Who owns it? When is it due?

This plan resets July 4, 2026.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

function BusinessPlanTab() {
  const [activeDoc, setActiveDoc] = useState<"bp" | "oap" | "brain">("bp");
  const [brainContent, setBrainContent] = useState("");
  const [brainSaving, setBrainSaving] = useState(false);
  const [brainSaved, setBrainSaved] = useState(false);
  const [brainLoading, setBrainLoading] = useState(false);

  useEffect(() => {
    if (activeDoc === "brain") {
      setBrainLoading(true);
      get<{ content: string }>("/plan/brain/context")
        .then(d => { setBrainContent(d.content || ""); })
        .catch(() => {})
        .finally(() => setBrainLoading(false));
    }
  }, [activeDoc]);

  async function saveBrainContext() {
    if (!brainContent.trim()) return;
    setBrainSaving(true);
    try {
      await put("/plan/brain/context", { content: brainContent });
      setBrainSaved(true);
      setTimeout(() => setBrainSaved(false), 2500);
    } catch { /**/ }
    setBrainSaving(false);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button onClick={() => setActiveDoc("bp")} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.brd}`, background: activeDoc === "bp" ? "#F97316" : C.card, color: activeDoc === "bp" ? "#fff" : C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>📋 Business Plan</button>
        <button onClick={() => setActiveDoc("oap")} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.brd}`, background: activeDoc === "oap" ? "#F97316" : C.card, color: activeDoc === "oap" ? "#fff" : C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>🗓 90-Day OAP</button>
        <button onClick={() => setActiveDoc("brain")} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${activeDoc === "brain" ? C.blu : C.brd}`, background: activeDoc === "brain" ? C.bluBg : C.card, color: activeDoc === "brain" ? C.blu : C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>🧠 Brain Context</button>
      </div>

      {activeDoc === "brain" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ background: C.bluBg, border: `1px solid ${C.blu}40`, borderRadius: 10, padding: "14px 16px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.blu, marginBottom: 4 }}>🧠 Brain Context Document</div>
            <div style={{ fontSize: 12, color: C.tx, lineHeight: 1.6 }}>
              This document gives the AI context when organizing your sprint. Describe your current priorities, constraints, relationships, and business logic that doesn't fit in a task. Be direct and specific — Tony-style.
            </div>
          </div>
          {brainLoading ? (
            <div style={{ fontSize: 13, color: C.mut, padding: 24 }}>Loading…</div>
          ) : (
            <textarea
              value={brainContent}
              onChange={e => setBrainContent(e.target.value)}
              placeholder={`Example:\n\n- Capital is the #1 constraint. Anything that doesn't directly move revenue or reduce burn is noise.\n- DBTM operator is our showcase client — never let them wait.\n- Bondilyn has been waiting 2 weeks for sales materials. That's a P0.\n- Engineering is solid. Don't micromanage Faisal or Haris.\n- Tony's most productive hours are 6–10am. Don't schedule calls before 10am.`}
              rows={18}
              style={{
                width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.brd}`,
                borderRadius: 10, padding: "16px 18px", color: C.tx, fontSize: 13, fontFamily: "ui-monospace, monospace",
                lineHeight: 1.7, resize: "vertical", outline: "none",
              }}
            />
          )}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
            {brainSaved && <span style={{ fontSize: 12, color: C.grn, fontWeight: 600 }}>✓ Saved</span>}
            <button
              onClick={saveBrainContext}
              disabled={brainSaving || !brainContent.trim()}
              style={{
                padding: "9px 24px", borderRadius: 8, border: "none",
                background: brainSaving || !brainContent.trim() ? C.brd : C.blu,
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: brainContent.trim() ? "pointer" : "not-allowed", fontFamily: F,
              }}
            >
              {brainSaving ? "Saving…" : "Save Brain Context"}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "24px 28px" }}>
          <pre style={{ fontSize: 12, color: C.tx, fontFamily: "ui-monospace, monospace", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
            {activeDoc === "bp" ? BUSINESS_PLAN : OAP_NARRATIVE}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── Main BusinessView ────────────────────────────────────────────────────────

export function BusinessView({ onBack, defaultTab }: { onBack: () => void; defaultTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(defaultTab || "goals");
  const [categories, setCategories] = useState<CategoryWithSubs[]>([]);
  const [byOwner, setByOwner] = useState<Record<string, Record<number, PlanItem[]>>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  type PlanTask = { id: string; title: string; category: string; subcategory?: string | null; owner?: string | null; priority?: string | null; sprintId?: string; status?: string | null; dueDate?: string | null; };
  const [top3, setTop3] = useState<PlanTask[]>([]);

  const loadTop3 = useCallback(async () => {
    try { const d = await get("/plan/top3"); setTop3(d.tasks || []); } catch { /**/ }
  }, []);

  const loadPlan = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await get("/plan/categories");
      setCategories((data as any).categories || []);
    } catch { if (!silent) setErr("Failed to load 411 plan"); }
    finally { if (!silent) setLoading(false); }
  }, []);

  const loadWeekly = useCallback(async () => {
    try {
      const data = await get("/plan/weekly/2026-04");
      setByOwner(data.byOwner || {});
    } catch { /**/ }
  }, []);

  useEffect(() => { loadPlan(); loadWeekly(); loadTop3(); }, [loadPlan, loadWeekly, loadTop3]);

  async function handleToggleTask(id: string, complete: boolean) {
    // Optimistic UI update — instant visual feedback
    const updateItem = (item: PlanItem): PlanItem =>
      item.id === id ? { ...item, status: complete ? "completed" : "active", completedAt: complete ? new Date().toISOString() : null } : item;

    setCategories(prev => prev.map(cat => ({
      ...cat,
      completedTasks: cat.completedTasks + (cat.subcategories.some(s => s.tasks.some(t => t.id === id)) ? (complete ? 1 : -1) : 0),
      subcategories: cat.subcategories.map(sub => ({
        ...sub,
        completedTasks: sub.completedTasks + (sub.tasks.some(t => t.id === id) ? (complete ? 1 : -1) : 0),
        tasks: sub.tasks.map(updateItem),
      })),
    })));
    setByOwner(prev => {
      const next = { ...prev };
      for (const owner of Object.keys(next)) {
        next[owner] = { ...next[owner] };
        for (const week of Object.keys(next[owner])) {
          next[owner][Number(week)] = next[owner][Number(week)].map(updateItem);
        }
      }
      return next;
    });

    loadTop3();
    try {
      if (complete) await post(`/plan/task/${id}/complete`, {});
      else await post(`/plan/task/${id}/uncomplete`, {});
      await Promise.all([loadPlan(true), loadWeekly()]);
    } catch (e: any) {
      // Revert on failure
      await Promise.all([loadPlan(true), loadWeekly()]);
      if (e.message?.includes("remaining")) setToast(e.message);
    }
  }

  async function handlePullFromSheet() {
    setSyncing(true);
    try { await post("/business/sync-from-sheet", {}); await loadPlan(); } catch { setErr("Pull from Sheet failed"); }
    finally { setSyncing(false); }
  }

  async function handlePushToSheet() {
    setSyncing(true);
    try { await post("/business/push-to-sheet", {}); setToast("✓ Pushed to Google Sheet"); } catch { setErr("Push to Sheet failed"); }
    finally { setSyncing(false); }
  }

  const totalTasks = categories.reduce((s, c) => s + c.totalTasks, 0);
  const doneTasks = categories.reduce((s, c) => s + c.completedTasks, 0);

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12,
    fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: F,
    background: active ? "#F97316" : C.card, color: active ? "#fff" : C.sub,
    transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: C.bg, borderBottom: `1px solid ${C.brd}`, padding: "0 32px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", paddingTop: 18, paddingBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button onClick={onBack} style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 13, fontFamily: F }}>← Back</button>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.tx }}>Business Brain</div>
                <div style={{ fontSize: 11, color: C.sub }}>
                  {tab === "goals" && `411 Goal Cascade — ${doneTasks}/${totalTasks} tasks · ${totalTasks > 0 ? Math.round(doneTasks/totalTasks*100) : 0}% complete`}
                  {tab === "team" && "Team roster — scope, accountability, gaps"}
                  {tab === "tasks" && "Master task list — drag to reorder · sprint ID format"}
                  {tab === "plan" && "Business plan + 90-day OAP narrative"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {tab === "goals" && (
                <>
                  <button onClick={handlePullFromSheet} disabled={syncing} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.brd}`, background: C.card, color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: F }}>↓ Pull</button>
                  <button onClick={handlePushToSheet} disabled={syncing} style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.grn}`, background: C.grnBg, color: C.grn, fontSize: 12, cursor: "pointer", fontFamily: F }}>↑ Push</button>
                </>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, paddingBottom: 14 }}>
            <button style={tabStyle(tab === "goals")} onClick={() => setTab("goals")}>🎯 411 plan</button>
            <button style={tabStyle(tab === "team")} onClick={() => setTab("team")}>👥 Team roster</button>
            <button style={tabStyle(tab === "tasks")} onClick={() => setTab("tasks")}>✅ Master task</button>
            <button style={tabStyle(tab === "plan")} onClick={() => setTab("plan")}>📄 Business plan</button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: tab === "tasks" ? "none" : 1000, margin: "0 auto", padding: tab === "tasks" ? "0 16px 24px" : "24px 32px" }}>
        {err && (
          <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 14px", color: C.red, fontSize: 13, marginBottom: 16, display: "flex", justifyContent: "space-between" }}>
            {err}<button onClick={() => setErr(null)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>✕</button>
          </div>
        )}

        {tab === "goals" && (
          <>
            <GPSCards />
            {loading ? (
              <div style={{ textAlign: "center", padding: "48px", color: C.mut }}>Loading 411 plan…</div>
            ) : (
              <>
                <CategoryGrid
                  categories={categories}
                  onToggleTask={handleToggleTask}
                />
                <WeeklyGrid byOwner={byOwner} onToggleTask={handleToggleTask} />
              </>
            )}
          </>
        )}

        {tab === "team" && <TeamTab />}
        {tab === "tasks" && <MasterTaskTab onRefreshAll={() => { loadPlan(); loadWeekly(); }} categories={categories} />}
        {tab === "plan" && <BusinessPlanTab />}
      </div>

      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default BusinessView;
