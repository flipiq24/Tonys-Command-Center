import { useState, useEffect, useCallback, useRef } from "react";
import { get, post } from "@/lib/api";
import { C, F } from "@/components/tcc/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

type PlanItem = {
  id: string;
  level: "category" | "subcategory" | "task";
  category: string;
  subcategory?: string | null;
  title: string;
  owner?: string | null;
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
      <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 10, padding: "10px 16px", display: "flex", gap: 24, alignItems: "center" }}>
        {[
          { label: "Break Even", value: "~$50K/mo", when: "March 2026", color: C.grn },
          { label: "Phase 1", value: "$100K/mo", when: "Apr–May 2026", color: "#185FA5" },
          { label: "Scale", value: "$250K+/mo", when: "Q3 2026", color: "#7B2D8B" },
        ].map(m => (
          <div key={m.label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: m.color, fontFamily: F }}>{m.value}</div>
            <div style={{ fontSize: 10, color: C.sub, fontFamily: F }}>{m.label}</div>
            <div style={{ fontSize: 10, color: C.mut, fontFamily: F }}>{m.when}</div>
          </div>
        ))}
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

        return (
          <div key={cat.id} style={{ marginBottom: 32 }}>
            {/* Category title */}
            <div style={{ fontSize: 22, fontWeight: 800, color: "#00007A", fontFamily: F, marginBottom: 4 }}>
              {cat.title}
            </div>
            {/* Thick underline */}
            <div style={{ height: 3, background: "#00007A", marginBottom: 8 }} />

            {/* Numbered slots 1-5 */}
            {slots.map((sub, i) => {
              const done = sub?.status === "completed";
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #ccc", padding: "5px 0", minHeight: 28 }}>
                  <span style={{ fontSize: 12, color: "#999", width: 14, flexShrink: 0, fontFamily: F }}>{i + 1}</span>
                  {sub ? (
                    <span style={{
                      fontSize: 13, color: done ? "#888" : "#1565C0", fontFamily: F,
                      textDecoration: done ? "line-through" : "none",
                      fontWeight: 500,
                    }}>
                      {sub.title}
                    </span>
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
  onClose, onCreated, categories,
}: {
  onClose: () => void;
  onCreated: (task: PlanItem & { sprintId: string; position: number; total: number; prevTask?: { title: string; sprintId: string } | null; nextTask?: { title: string; sprintId: string } | null }) => void;
  categories: CategoryWithSubs[];
}) {
  const [form, setForm] = useState({
    title: "", category: "", subcategoryName: "", owner: "", priority: "P1",
    dueDate: "", weekNumber: "", atomicKpi: "", source: "manual", executionTier: "Sprint", workNotes: "",
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
              <label style={labelStyle}>April week</label>
              <select value={form.weekNumber} onChange={e => set("weekNumber", e.target.value)} style={inputStyle}>
                <option value="">None</option>
                {APRIL_WEEKS.map(w => <option key={w.n} value={String(w.n)}>{w.label} ({w.dates})</option>)}
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
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

// ─── Master Task Table ────────────────────────────────────────────────────────

function MasterTaskTab({ onRefreshAll, categories }: { onRefreshAll: () => void; categories: CategoryWithSubs[] }) {
  const [tasks, setTasks] = useState<(PlanItem & { sprintId?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [placementToast, setPlacementToast] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragTaskRef = useRef<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    try {
      const params: string[] = [];
      if (filterCat) params.push(`category=${filterCat}`);
      if (filterOwner) params.push(`owner=${filterOwner}`);
      if (filterStatus) params.push(`status=${filterStatus}`);
      const q = params.length ? `?${params.join("&")}` : "";
      const data = await get(`/plan/tasks${q}`);
      setTasks(data.tasks || []);
    } catch { /**/ }
    finally { setLoading(false); }
  }, [filterCat, filterOwner, filterStatus]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  // Filter by priority client-side
  const displayed = filterPriority ? tasks.filter(t => t.priority === filterPriority) : tasks;

  async function handleToggle(id: string, complete: boolean) {
    try {
      if (complete) await post(`/plan/task/${id}/complete`, {});
      else await post(`/plan/task/${id}/uncomplete`, {});
      await loadTasks();
      onRefreshAll();
    } catch { /**/ }
  }

  // Drag to reorder
  function onDragStart(id: string) { dragTaskRef.current = id; }
  function onDragOver(e: React.DragEvent, id: string) { e.preventDefault(); setDragOverId(id); }
  function onDragLeave() { setDragOverId(null); }

  async function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    setDragOverId(null);
    const fromId = dragTaskRef.current;
    if (!fromId || fromId === targetId) return;

    const fromIdx = tasks.findIndex(t => t.id === fromId);
    const toIdx = tasks.findIndex(t => t.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const newTasks = [...tasks];
    const [moved] = newTasks.splice(fromIdx, 1);
    newTasks.splice(toIdx, 0, moved);
    setTasks(newTasks);

    const updates = newTasks.map((t, i) => ({ id: t.id, priorityOrder: i }));
    try { await post("/plan/reorder", { items: updates }); } catch { await loadTasks(); }
  }

  function handleAddCreated(result: any) {
    setShowAdd(false);
    loadTasks();
    onRefreshAll();
    setPlacementToast(`✓ ${result.sprintId} added · position ${result.position}/${result.total}${result.prevTask ? ` · after "${result.prevTask.title.split(":")[0].trim()}"` : ""}`);
  }

  const selStyle: React.CSSProperties = { fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, background: C.card };

  return (
    <div>
      {/* Header row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={selStyle}>
          <option value="">All categories</option>
          {CAT_KEYS.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
        </select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)} style={selStyle}>
          <option value="">All owners</option>
          {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={selStyle}>
          <option value="">All priorities</option>
          <option value="P0">P0 — Critical</option>
          <option value="P1">P1 — High</option>
          <option value="P2">P2 — Standard</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selStyle}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
        </select>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.mut }}>{loading ? "Loading…" : `${displayed.length} tasks`}</span>
        <button onClick={() => setShowAdd(true)} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>+ Add task</button>
      </div>

      <div style={{ fontSize: 11, color: C.mut, fontFamily: F, marginBottom: 10 }}>
        ⠿ drag rows to reorder · sprint ID = category code + position (e.g. ADP-01)
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.brd}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ background: C.card, borderBottom: `2px solid ${C.brd}` }}>
              {["","Sprint ID","Tier","Category","Sub-Category","Task","Atomic KPI","Owner","Priority","Status","Due Date","Notes","Linear"].map((h, i) => (
                <th key={i} style={{ fontSize: 10, fontWeight: 700, color: C.sub, textAlign: "left", padding: "8px 10px", whiteSpace: "nowrap", borderRight: `1px solid ${C.brd}` }}>{h}</th>
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
                  style={{ background: rowBg, borderBottom: `1px solid ${C.brd}`, borderTop: isDraggingOver ? `2px solid ${C.blu}` : undefined, transition: "background 0.1s" }}
                >
                  {/* Drag + checkbox combined */}
                  <td style={{ padding: "6px 8px", textAlign: "center", cursor: "grab", color: C.mut, fontSize: 14, whiteSpace: "nowrap" }}>
                    <span style={{ marginRight: 4, opacity: 0.4 }}>⠿</span>
                    <button
                      onClick={() => handleToggle(task.id, !done)}
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
                  {/* Priority */}
                  <td style={{ padding: "8px 10px" }}>{task.priority && <PriorityBadge p={task.priority} />}</td>
                  {/* Status */}
                  <td style={{ padding: "8px 10px" }}>{task.status && <StatusPill s={isLate ? "late" : task.status} />}</td>
                  {/* Due date */}
                  <td style={{ padding: "8px 10px", fontSize: 11, color: isLate ? C.red : C.mut, whiteSpace: "nowrap" }}>{task.dueDate || "—"}</td>
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
          onClose={() => setShowAdd(false)}
          onCreated={handleAddCreated}
          categories={categories}
        />
      )}
      {placementToast && <Toast msg={placementToast} onDismiss={() => setPlacementToast(null)} />}
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

const BUSINESS_PLAN = `FLIPIQ, INC. — BUSINESS PLAN
April 2026 | Confidential | Tony Diaz, CEO

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 1 — COMPANY OVERVIEW

FlipIQ, Inc. builds the operating system for real estate acquisition. The platform gives investor-operators the data, workflows, and automation tools their Acquisition Associates need to reliably close 2 deals per month — per AA. The business is in revenue, has a paying customer base, and is executing against a structured 90-day plan to reach $50K/month break-even.

The product has two commercial surfaces: FlipIQ Command (the primary AA operations platform) and the USale Marketplace (under development). Command is the product driving current revenue. Marketplace is the scale vehicle for 2027+.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 2 — THE PROBLEM

The real estate investment business is built on Acquisition Associates — the people who find, contact, and close off-market deals. The top 1% of real estate investors close 8–10 deals per month per associate. The average closes 0.3.

The gap is entirely operational. AAs waste time on bad leads, incomplete data, and broken follow-up systems. Operators (the businesses that employ AAs) have no real-time visibility into AA activity, no way to know who is actually working, and no automated system to surface the best opportunities at the right time.

There is no purpose-built operating platform for this market. FlipIQ is building it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 3 — THE SOLUTION

FlipIQ Command is a real-time intelligence and workflow platform for real estate acquisition teams. It is not a CRM. It is not a dialer. It is the system of record for every AA action, every property opportunity, and every operator decision.

Core capabilities (current):
• MLS-integrated property intelligence — real-time data sync, agent pipeline, property scoring
• Template Health — outreach quality monitoring across all AA campaigns
• MyStats — individual AA performance dashboards (deals, activity, pipeline velocity)
• COO Dashboard — executive visibility into every operator, AA, and deal in the system
• OMS (Operator Management System) — three-level onboarding and activation tracking
• Autotracker — AA activity logging and accountability

Under development:
• AAA (Acquisition Agent Automation) — AI agent layer that scores every property the moment data changes. Runs continuously. Surfaces only high-probability opportunities. Target: 20+ offers/day per AA with no manual triage.
• USale Marketplace — the off-market property network connecting operators, AAs, buyers, and title companies at scale.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 4 — REVENUE MODEL

FlipIQ earns revenue across four streams:

1. Platform subscription — operators pay a monthly fee per seat. Subsidized early-adopter pricing of $10K setup + monthly seat fees during the current growth phase. Target: $5K–$10K/month per operator at scale.

2. Success fees — FlipIQ earns a percentage of each deal closed through the platform. Target: $500–$2,000 per deal at volume.

3. Loan brokerage — via the Kiavi broker partnership, FlipIQ earns origination fees on investor loans placed through the platform. Each loan = $2K–$10K brokerage fee. Two acquisitions per week happening now. $0 currently tracked in P&L — immediate priority.

4. DBTM (Deal by the Month) acquisitions — structured acquisition program generating consistent deal flow. Revenue not yet recognized in financial model.

Revenue milestones:
• Break even: ~$50K/month — March/April 2026 (Tony-led sales)
• Phase 1: $100K/month — April/May 2026 (Tony + Ethan)
• Scale: $250K+/month — Q3 2026 (full team)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 5 — GO-TO-MARKET STRATEGY

FlipIQ sells to investor-operators — businesses that employ real estate Acquisition Associates. The ICP is a real estate investing business with 2–10 AAs, active in at least one metro, and generating at least $50K/year in deal revenue.

Sales tiers:

Tier 1 — Investor-Friendly Agents: Agents who actively sell deals to investors. Entry: free early marketplace access. Close: agent network feeds AA deal pipeline.

Tier 2 — Investor-Brokers: Owner-operators with their own agent teams. Entry: investor + agent playbook bundle, title company warm intro. Close: $25K–$100K setup fee + monthly success fees.

Tier 3 — Brokerages: Offices with 10+ investor-friendly agents. Entry: agent adoption first, then broker-level Command pitch. Close: setup fee once agents are active in system.

Tony leads all sales personally for the next 90 days. Target: 5 demos/week, 15+ active prospects, 3 new operators/month closed. At $10K average setup fee, 3 operators = $30K/month in new recurring. Combined with existing base, break-even is achievable by end of April.

Bondilyn Jolly supports with sales materials, outreach databases, pitch decks, and content. Affiliate playbook is the scale mechanism — once proven, third-party networks recruit operators on commission.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 6 — PRODUCT ROADMAP

Q1 2026 (current — April):
• Command 1.5 close-out: zero open Critical/High bugs
• Foundation stability: MLS accuracy, agent pipeline, DispoPro integration
• COO Dashboard: MyStats, Template Health, SMS compliance
• Operator adaptation: contact all operators, classify, activate
• Loan brokerage: Kiavi agreement signed, first deal submitted

Q2 2026 (May–June):
• AAA (Acquisition Agent Automation): 30-day build starting end of April
  — Week 1: Infrastructure (Event Engine, PropertyRadar sync, real-time scorer)
  — Week 2: Intelligence (Continuous Priority Engine, auto-script injection)
  — Week 3: Phase 2 Intelligence (Comps Matrix, Investment Analysis, My Stats enhanced)
  — Week 4: Integration + Deploy (end-to-end test, UAT with live AAs)
  — Target: 20+ offers/day per AA
• PM/Engineer hired and operational — removes Tony from all engineering overhead
• Three hiring roles filled: PM/Engineer, Onboarding Manager, Adaptation Manager

Q3 2026 (July–September):
• USale Marketplace v1 launch — off-market property network, agent + buyer connection
• Scale to 30+ operators across 10 metros
• $250K+/month revenue run rate
• Series A preparation

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 7 — TEAM

Tony Diaz — CEO. Owns sales, capital, and product vision. 60%+ of time on revenue-generating activities during the 90-day sprint. Author of this plan.

Ethan Jolly — COO/CFO. Owns internal accountability, P&L, hiring, and engineering management. Tony never discovers a missed commitment on his own — if he does, Ethan's system has failed.

Ramy — CS Manager. Owns user adaptation, OMS onboarding, and operator health. Single source of truth for what's working and what isn't on the operator side.

Faisal Nazik — Command Engineer. Owns the Command dashboard sprint delivery. Zero Critical/High bugs at sprint close. 40+ story points per cycle minimum.

Haris Aqeel — Foundation Engineer. Owns MLS accuracy, agent pipeline, data sync, and DispoPro integration.

Nate Worcester — CTO Advisory (SLA). Part-time strategic capacity. All scopes estimate-first, approve-first, bill-after. Hard dates only — Ethan enforces.

Bondilyn Jolly — Marketing/Sales Support. Owns all sales materials, scripts, outreach databases, content, and the affiliate playbook.

Hiring (April–May): PM/Engineer ($6K/mo), Onboarding Manager ($2.5K/mo), Adaptation Manager ($2.5K/mo).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SECTION 8 — FINANCIAL SUMMARY

Current monthly burn: ~$36K/month (team compensation only)
Current MRR: Ramping (break-even pursuit in progress)
Break-even target: ~$50K/month (April 2026)

Capital strategy:
• Bridge loan vs. growth loan decision — April 14 deadline (Tony + Ethan)
• Kiavi broker agreement — revenue from loan origination on every investor deal placed
• DBTM revenue recognition — 2 acquisitions/week, $0 in current P&L (immediate fix)
• Nema partnership — additional revenue per deal closed
• Investor meetings: 2 booked by April 30, pitch deck updated

Long-term: $1B exit via USale Marketplace at 375 operators × 5 users × 75 metros.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

const OAP_NARRATIVE = `FLIPIQ OPERATIONAL ALIGNMENT PLAN — 90-DAY NARRATIVE
Q1 2026 (April–June) | v4 | Confidential

This is not a task list. The tasks live in the 411 Master Task table. This is a description of what we are doing, why we are doing it, and what winning looks like across each of the five strategic pillars over the next 90 days.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PILLAR 1 — ADAPTATION: MAKING EVERY OPERATOR SUCCESSFUL

The most important thing FlipIQ can do right now is make every current operator successful. Successful means their AAs are logging in, using the system, and closing deals. Any operator not moving toward that standard is either a priority rescue or a candidate for suspension.

Ramy owns operator adaptation. His job for the next 90 days is to personally contact every operator, understand their current usage level, classify them (active / struggling / dead weight), and drive each one to a defined success threshold. The three-level classification maps to the OMS Client Status Checklist: Level 1 (Onboarding Started), Level 2 (System Usable), Level 3 (System Optimized). Ramy reports operator health to Ethan every Friday. Tony uses that report to make decisions — he does not contact operators about adaptation directly.

The CS Dashboard gives Tony and Ethan visibility into every operator without needing to ask Ramy. Faisal builds the MyStats tab so Tony can see AA deal velocity per operator at a glance. Disengagement alerts trigger automatically at 3+ consecutive zero-activity days. Feature adoption dashboards trigger at 14 days of non-use. Ramy acts on both.

Dead weight is real. Not every operator will make it. The suspension criteria — developed jointly by Tony and Ethan — set clear bars. Operators who cannot reach Level 2 (System Usable) within a defined window are suspended. This is not punitive. It protects platform quality. Every suspended operator frees bandwidth for a better-fit replacement.

Autotracker training is Ramy's responsibility after a single Tony training session. Ramy records step-by-step video walkthroughs. Future operators onboard without Tony's involvement.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PILLAR 2 — SALES: CLOSING THE REVENUE GAP

Tony's job for the next 90 days is sales. At least 60% of his calendar must be on revenue-generating activities. Ethan audits Tony's calendar every Monday. If the percentage drops below 60%, it is flagged immediately — not at the end of the week.

The target is 3 new operators closed per month. At subsidized early-adopter pricing, that is approximately $30K in new monthly recurring revenue per month. Combined with success fees, loan brokerage revenue, and DBTM acquisitions, break-even is achievable by end of April.

Bondilyn Jolly is Tony's force multiplier. She builds the pitch decks, outreach databases, sales scripts, and content — but Tony closes. There is no ambiguity here. The affiliate playbook, once operational, is the long-term scale mechanism: third-party networks recruit operators on commission without Tony's direct involvement.

The pricing model is subsidized during the current growth phase. New operators pay a setup fee plus monthly seat fees calibrated to what their AA business can support. The standard price point is $10K setup plus monthly. Tony finalizes the model by April 11 and trains the team on it.

The sales funnel is straightforward: Tony does 10 outbound calls per day, books 5 demos per week, converts to 3 signed operators per month. HubSpot tracks the pipeline. Ethan has visibility every Friday. No manual status updates required.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PILLAR 3 — TECHNOLOGY: BUILDING THE SYSTEM THAT CLOSES DEALS

Engineering has three distinct lanes during this 90-day period. There is zero overlap between them. Ethan owns accountability for all three on Monday check-ins and the Friday Tech Report.

Faisal owns the Command dashboard: completing the MyStats tab, shipping the Template Health tab, clearing all Critical and High bugs, and registering SMS compliance features. His output metric is simple: 40+ story points per sprint, zero Critical/High bugs at close. No new features until the PM is hired. Bugs and adaptation-related fixes only.

Haris owns Foundation: MLS accuracy, agent pipeline stability, DispoPro integration (first week of April milestone), agent contact matching (closing the 15% gap), and cross-platform infrastructure. Foundation is the data layer that everything else depends on. If the foundation is unreliable, AAA cannot work. Haris's work this quarter makes AAA possible.

Nate Worcester owns architecture decisions and the AWS cost reduction. The current AWS bill of $5K/month is unacceptable for a company at break-even stage. Nate delivers a cost reduction plan with a hard start date and hard end date — Ethan will not accept open-ended timelines. Nate also reviews the AAA architecture spec and integrates Tony's design into Command Light v2.0. All of Nate's work follows estimate-first, approve-first, bill-after structure. Tony approves all scopes in writing before work begins.

The AAA (Acquisition Agent Automation) system is the most important technology build of the year. It starts 30 days after the PM is hired (end of April) and completes end of May. Build order is non-negotiable: Infrastructure → Intelligence → Bots → Integration. Week 1 delivers the Event Engine and real-time scorer (scorer fires within 3 seconds of any property event). Week 4 delivers a live AA using the system generating 20+ offers per day. This is the product that scales FlipIQ from 10 operators to 375.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PILLAR 4 — CAPITAL: FUNDING THE 90-DAY SPRINT

FlipIQ needs capital clarity to execute this plan. Two decisions must be made by April 14: whether to pursue a bridge loan or a growth loan, and how to structure the Nema partnership.

Ethan models both loan scenarios for Tony. Tony makes the call with Ethan's analysis in hand. The decision is not about what sounds best strategically — it is about what path gets to $50K/month with the lowest dilution and the most execution flexibility.

The Kiavi broker agreement is a near-term revenue activation. Two DBTM acquisitions per week are already happening. Zero dollars are currently tracked in the P&L. This is an immediate fix with immediate revenue impact. The first Kiavi deal should be submitted by end of April.

Investor meetings are support infrastructure, not the primary capital strategy. Tony books two meetings by April 30. Ethan drafts the investor update report. The pitch deck is updated to reflect the current plan and traction. Investor capital extends the runway if needed — but the primary goal is to reach break-even through revenue before drawing on outside capital.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PILLAR 5 — TEAM: FILLING THE GAPS

The single biggest operational risk at FlipIQ today is the absence of a PM. Tony loses 20–30% of his sales time to engineering overhead every week. At $100K/month revenue target, that gap costs approximately $20–30K in lost capacity. The PM hire is non-negotiable. Ethan drives the process: job spec by April 14, candidates by April 21, interviews by April 28, offer by April 30. The PM starts and immediately owns Linear, sprint planning, standups, and the AAA build.

Ramy is a single point of failure. The Onboarding Manager and Adaptation Manager hires eliminate that risk. Both roles are scoped, posted, and filled before end of Q2. In the interim, Ramy is the system — but only Tony and Ethan know that. Operators do not feel the gap.

Nate's transition from day-to-day engineering leadership to pure SLA advisory is the structural change that makes the rest of this plan possible. Nate hands off foundation context to Haris and engineering context to the incoming PM. The 29 orphaned issues from March are triaged with Ethan by April 14. No P0 issues remain orphaned.

The SOW for every team member is locked for 90 days. No role changes, no scope drift, no new systems built outside this document. Ethan checks every Friday. Any role confusion is surfaced and resolved in the weekly report — it does not reach Tony as a surprise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WINNING LOOKS LIKE AT DAY 90

By the end of June 2026, FlipIQ has:
• Reached or exceeded $100K/month in revenue
• Closed 6–9 new operators (3/month × 3 months)
• Shipped AAA with at least 1 live AA generating 20+ offers/day
• PM/Engineer hired and operating independently (no daily Tony involvement)
• Onboarding Manager and Adaptation Manager hired and ramping
• AWS costs reduced to under $2K/month
• Kiavi broker generating consistent loan origination revenue
• USale Marketplace architecture completed and Q3 launch scheduled
• Zero Critical/High bugs in Command
• Every current operator at Level 2 (System Usable) or higher — or suspended

This is not aspirational. This is the plan.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

function BusinessPlanTab() {
  const [activeDoc, setActiveDoc] = useState<"bp" | "oap">("bp");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        <button onClick={() => setActiveDoc("bp")} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.brd}`, background: activeDoc === "bp" ? "#F97316" : C.card, color: activeDoc === "bp" ? "#fff" : C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>📋 Business Plan</button>
        <button onClick={() => setActiveDoc("oap")} style={{ padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.brd}`, background: activeDoc === "oap" ? "#F97316" : C.card, color: activeDoc === "oap" ? "#fff" : C.sub, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>🗓 90-Day OAP — Narrative</button>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "24px 28px" }}>
        <pre style={{ fontSize: 12, color: C.tx, fontFamily: "ui-monospace, monospace", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
          {activeDoc === "bp" ? BUSINESS_PLAN : OAP_NARRATIVE}
        </pre>
      </div>
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

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get("/plan/categories");
      setCategories(data.categories || []);
    } catch { setErr("Failed to load 411 plan"); }
    finally { setLoading(false); }
  }, []);

  const loadWeekly = useCallback(async () => {
    try {
      const data = await get("/plan/weekly/2026-04");
      setByOwner(data.byOwner || {});
    } catch { /**/ }
  }, []);

  useEffect(() => { loadPlan(); loadWeekly(); loadTop3(); }, [loadPlan, loadWeekly, loadTop3]);

  async function handleToggleTask(id: string, complete: boolean) {
    loadTop3();
    try {
      if (complete) await post(`/plan/task/${id}/complete`, {});
      else await post(`/plan/task/${id}/uncomplete`, {});
      await Promise.all([loadPlan(), loadWeekly()]);
    } catch (e: any) {
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
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 32px" }}>
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
