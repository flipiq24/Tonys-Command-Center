import { useState, useEffect, useCallback, useRef } from "react";
import { get, post, patch } from "@/lib/api";
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
};

type SubcategoryWithTasks = PlanItem & {
  tasks: PlanItem[];
  totalTasks: number;
  completedTasks: number;
};

type CategoryWithSubs = PlanItem & {
  subcategories: SubcategoryWithTasks[];
  totalTasks: number;
  completedTasks: number;
};

type TeamMember = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  slackId?: string | null;
  currentFocus?: string | null;
  responsibilities?: string[];
  salary?: string;
  hiring?: boolean;
  does?: string[];
  doesNot?: string[];
};

type BusinessDoc = {
  id: string;
  documentType: string;
  summary?: string | null;
  content?: string | null;
  lastUpdated?: string | null;
};

type Tab = "goals" | "team" | "tasks" | "plan";

// ─── Static Data ──────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  adaptation: "#FAEEDA",
  sales:      "#EAF3DE",
  tech:       "#E6F1FB",
  capital:    "#EEEDFE",
  team:       "#F1EFE8",
};

const CAT_BORDER: Record<string, string> = {
  adaptation: "#E8C78A",
  sales:      "#9FC97A",
  tech:       "#7FB3E8",
  capital:    "#A89CE0",
  team:       "#C4B8A8",
};

const PERSON_COLORS: Record<string, string> = {
  tony:    "#A32D2D",
  ethan:   "#185FA5",
  ramy:    "#3B6D11",
  faisal:  "#BA7517",
  haris:   "#534AB7",
  nate:    "#5F5E5A",
  bondilyn:"#7B2D8B",
};

function personColor(name: string): string {
  const key = (name || "").toLowerCase().split(" ")[0];
  return PERSON_COLORS[key] || "#666";
}

const TEAM_SOW: TeamMember[] = [
  {
    id: "tony", name: "Tony Diaz", role: "CEO", salary: "$5K/mo",
    does: ["Sales — 60%+ of time", "Pricing & revenue model decisions", "Capital strategy & investor relations", "AAA product spec", "Support Ramy on operator adaptation"],
    doesNot: ["Engineering standups", "Linear triage", "Production QA", "Customer onboarding", "Building new frameworks"],
  },
  {
    id: "ethan", name: "Ethan Jolly", role: "COO / CFO", salary: "$10K/mo",
    does: ["Accountability — Linear dates, Monday check, Friday report", "Finance & P&L management", "Hiring decisions", "COO Dashboard oversight", "Suspension criteria enforcement"],
    doesNot: ["Engineering execution", "Product decisions", "Sales demos", "User training", "Creating new systems"],
  },
  {
    id: "ramy", name: "Ramy", role: "CS Manager", salary: "$5K/mo",
    does: ["User adaptation — contact all, classify, weekly reports", "Success workflow management", "OMS onboarding for new operators", "Autotracker training", "10DLC compliance"],
    doesNot: ["Engineering tickets", "Sales calls", "Billing & finance", "Changing features", "Suspension decisions alone"],
  },
  {
    id: "faisal", name: "Faisal Nazik", role: "Command Engineer", salary: "$3K/mo",
    does: ["Command dashboard (COO, MyStats, Template Health)", "QA completion each sprint", "Sprint delivery 40+ story points", "SMS compliance UI", "Feature registration in phase matrix"],
    doesNot: ["Foundation/data layer", "User training", "Sprint planning", "Direct operator communication", "AWS infrastructure"],
  },
  {
    id: "haris", name: "Haris Aqeel", role: "Foundation Engineer", salary: "$2K/mo",
    does: ["Foundation — MLS, agent pipeline, data sync", "DispoPro integration", "CSM items", "Agent contact matching (close 15% gap)", "Cross-platform infrastructure"],
    doesNot: ["Command-only UI", "Sprint planning", "Customer communication", "AWS", "New feature design"],
  },
  {
    id: "nate", name: "Nate Worcester", role: "CTO Advisory", salary: "$6K/mo",
    does: ["AWS cost reduction", "Architecture reviews", "Google Cloud migration", "SLA responses (24hr / 4hr / 48hr)", "PM knowledge transfer"],
    doesNot: ["Day-to-day engineering", "Ticket triage", "Code without written approval", "Customer interaction", "Open-ended timelines"],
  },
  {
    id: "bondilyn", name: "Bondilyn Jolly", role: "Marketing / Sales Support", salary: "$5K/mo",
    does: ["Sales presentation & pitch decks", "USale script writing", "Outreach databases", "Podcast & video scripts", "Affiliate playbook"],
    doesNot: ["Direct sales", "Engineering", "Customer success", "Finance", "Operations"],
  },
  {
    id: "tbdpm", name: "TBD — PM/Engineer", role: "PM / Engineer", salary: "$6K/mo", hiring: true,
    does: ["Linear audit & sprint planning", "Daily standups", "COO Dashboard backend features", "AAA build ownership", "Ethan accountability reporting"],
    doesNot: ["CS", "Sales", "Strategy", "Daily Tony check-ins after Week 4", "Priority changes without Ethan"],
  },
  {
    id: "tbdonboard", name: "TBD — Onboarding Manager", role: "Onboarding Manager", salary: "$2.5K/mo", hiring: true,
    does: ["Operator intake & OMS checklist", "First-contact quality control", "Escalate issues to Ramy", "Cross-train with CS team", "Track onboarding completion rates"],
    doesNot: ["Ongoing support", "Sales", "Engineering", "Billing", "Suspension decisions"],
  },
  {
    id: "tbdam", name: "TBD — Adaptation Manager", role: "Adaptation Manager", salary: "$2.5K/mo", hiring: true,
    does: ["Feature adoption tracking", "Disengagement alerts", "Proactive outreach to at-risk operators", "Training sessions", "Weekly adoption data to Ramy"],
    doesNot: ["Onboarding", "Sales", "Engineering", "Suspension decisions", "Direct AM communication"],
  },
];

const GAP_ANALYSIS = [
  { n: 1, text: "No PM. Tony loses 20–30% of sales time to engineering overhead." },
  { n: 2, text: "Ramy is single point of failure. All CS stops when he's sick." },
  { n: 3, text: "Nate's 29 issues orphaned since Mar 6. Some are P0 tech debt." },
  { n: 4, text: "No sales support. Tony does demos, pitches, AND closes alone." },
  { n: 5, text: "DBTM revenue not tracked. 2 acq/week but $0 in April P&L." },
];

const APRIL_WEEKS = [
  { n: 1, label: "Wk 1", dates: "Apr 7–11",  start: "2026-04-07", end: "2026-04-11" },
  { n: 2, label: "Wk 2", dates: "Apr 14–18", start: "2026-04-14", end: "2026-04-18" },
  { n: 3, label: "Wk 3", dates: "Apr 21–25", start: "2026-04-21", end: "2026-04-25" },
  { n: 4, label: "Wk 4", dates: "Apr 28–30", start: "2026-04-28", end: "2026-04-30" },
];

// ─── Small components ──────────────────────────────────────────────────────────

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <div style={{ background: "#e5e7eb", borderRadius: 4, height: 6, width: "100%", marginTop: 4 }}>
      <div style={{ width: `${pct}%`, height: "100%", background: C.grn, borderRadius: 4, transition: "width 0.3s" }} />
    </div>
  );
}

function PriorityBadge({ p }: { p: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    P0: { bg: "#FEE2E2", color: "#B91C1C" },
    P1: { bg: "#FFF3E0", color: "#B45309" },
    P2: { bg: "#FEFCE8", color: "#A16207" },
    High: { bg: "#FFF3E0", color: "#B45309" },
    Low: { bg: "#F3F4F6", color: "#6B7280" },
  };
  const s = map[p] || { bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: s.bg, color: s.color, borderRadius: 4, padding: "1px 6px" }}>{p}</span>
  );
}

function StatusPill({ s }: { s: string }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    active:    { bg: C.bluBg, color: C.blu, label: "active" },
    completed: { bg: C.grnBg, color: C.grn, label: "done ✓" },
    late:      { bg: C.redBg, color: C.red, label: "late" },
    blocked:   { bg: C.ambBg, color: C.amb, label: "blocked" },
  };
  const st = map[s] || { bg: "#F3F4F6", color: "#6B7280", label: s };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, background: st.bg, color: st.color, borderRadius: 10, padding: "1px 8px", whiteSpace: "nowrap" }}>{st.label}</span>
  );
}

function Toast({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div onClick={onDismiss} style={{
      position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
      background: C.amb, color: "#fff", borderRadius: 8, padding: "10px 20px",
      fontSize: 13, fontWeight: 600, fontFamily: F, zIndex: 9999, cursor: "pointer",
      boxShadow: "0 4px 20px rgba(0,0,0,0.2)", maxWidth: 380, textAlign: "center",
    }}>{msg}</div>
  );
}

// ─── GPS Cards (static) ────────────────────────────────────────────────────────

function GPSCards() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
      <div style={{ background: "#FFF8E7", border: "1px solid #F6C04A", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#B45309", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: F }}>⚡ Atomic KPI</div>
        <div style={{ fontSize: 13, color: "#92400E", fontFamily: F, lineHeight: 1.5 }}>
          Each Acquisition Associate closes <strong>2 deals/month</strong>. Each operator has 4 full-time AAs.<br />
          If it does not move an AA toward 2 deals/month — it is noise.
        </div>
      </div>
      <div style={{ background: "#FFF0F0", border: "1px solid #FCA5A5", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#B91C1C", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: F }}>🎯 5-Year Big Audacious Goal</div>
        <div style={{ fontSize: 13, color: "#7F1D1D", fontFamily: F, lineHeight: 1.6 }}>
          USale Marketplace = largest off-market RE platform — thousands of transactions/month.<br />
          USale Seller Direct = largest "sell as-is to investors" brand nationwide.<br />
          375 operators × 5 users = 1,875 users across 75 metros. 4 deals/month each.<br />
          <strong>$1 BILLION exit.</strong>
        </div>
      </div>
      <div style={{ background: "#F5F0FF", border: "1px solid #C4B5FD", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#6D28D9", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, fontFamily: F }}>📍 3-Year Milestone (50% forecast)</div>
        <div style={{ fontSize: 13, color: "#4C1D95", fontFamily: F, lineHeight: 1.5 }}>
          375 operators | $1.5M/month run rate | $16.2M cumulative | 75 metros<br />
          Command 2.0 + AAA deployed | Self-funding from loan brokerage + success fees
        </div>
      </div>
    </div>
  );
}

// ─── Task row (shared between category view and weekly grid) ──────────────────

function TaskRow({ task, onToggle }: { task: PlanItem; onToggle: (id: string, complete: boolean) => void }) {
  const done = task.status === "completed";
  const isLate = !done && task.dueDate && new Date(task.dueDate) < new Date("2026-04-09");
  const pc = personColor(task.owner || "");

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0",
      borderBottom: `1px solid ${C.brd}`, opacity: done ? 0.6 : 1,
    }}>
      <button
        onClick={() => onToggle(task.id, !done)}
        title={done ? "Mark incomplete" : "Mark complete"}
        style={{
          width: 18, height: 18, borderRadius: 4, border: `2px solid ${done ? C.grn : C.brd}`,
          background: done ? C.grn : "transparent", color: "#fff", fontSize: 10, flexShrink: 0,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          marginTop: 1, transition: "all 0.15s",
        }}
      >{done ? "✓" : ""}</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, color: done ? C.mut : isLate ? C.red : C.tx, fontFamily: F,
          textDecoration: done ? "line-through" : "none", lineHeight: 1.4,
        }}>{task.title}</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 3, alignItems: "center" }}>
          {task.owner && (
            <span style={{ fontSize: 10, fontWeight: 700, color: pc, background: pc + "18", borderRadius: 10, padding: "1px 7px" }}>
              {task.owner}
            </span>
          )}
          {task.dueDate && (
            <span style={{ fontSize: 10, color: isLate ? C.red : C.mut, fontFamily: F }}>
              {isLate ? "⚠ Late — " : "📅 "}{task.dueDate}
            </span>
          )}
          {task.priority && <PriorityBadge p={task.priority} />}
          {done && task.completedAt && (
            <span style={{ fontSize: 10, color: C.grn, fontFamily: F }}>
              ✓ {new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Category Grid (Tab 1 main section) ──────────────────────────────────────

function CategoryGrid({
  categories, expandedCats, expandedSubs,
  onToggleCat, onToggleSub, onToggleTask, toast,
}: {
  categories: CategoryWithSubs[];
  expandedCats: Set<string>;
  expandedSubs: Set<string>;
  onToggleCat: (id: string) => void;
  onToggleSub: (id: string) => void;
  onToggleTask: (id: string, complete: boolean) => void;
  toast: (msg: string) => void;
}) {
  if (categories.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 0", color: C.mut, fontFamily: F, fontSize: 14 }}>
        Loading 411 plan…
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {categories.map((cat, idx) => {
        const isExpanded = expandedCats.has(cat.id);
        const bg = CAT_COLORS[cat.category] || "#F9F9F9";
        const border = CAT_BORDER[cat.category] || C.brd;
        const isDone = cat.status === "completed";
        const pct = cat.totalTasks === 0 ? 0 : Math.round((cat.completedTasks / cat.totalTasks) * 100);

        return (
          <div
            key={cat.id}
            style={{
              gridColumn: idx === 4 ? "1 / -1" : undefined,
              border: `1px solid ${border}`, borderRadius: 12, overflow: "hidden",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
            }}
          >
            {/* Category header */}
            <button
              onClick={() => onToggleCat(cat.id)}
              style={{
                width: "100%", background: bg, border: "none", padding: "14px 16px",
                cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ fontSize: 13, color: C.mut, transition: "transform 0.2s", display: "inline-block", transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F }}>
                    {isDone ? "✅ " : ""}{cat.title}
                  </span>
                  {isDone && <span style={{ fontSize: 10, color: C.grn, fontWeight: 700 }}>Complete</span>}
                </div>
                <div style={{ fontSize: 11, color: C.sub, fontFamily: F, marginTop: 2 }}>
                  {cat.subcategories.length} subcategories · {cat.completedTasks}/{cat.totalTasks} tasks · {pct}%
                </div>
              </div>
            </button>

            {/* Category body */}
            {isExpanded && (
              <div style={{ background: "#fff", padding: "10px 14px 14px" }}>
                {cat.subcategories.map(sub => {
                  const subExpanded = expandedSubs.has(sub.id);
                  const subDone = sub.status === "completed";

                  return (
                    <div key={sub.id} style={{ marginBottom: 10 }}>
                      {/* Subcategory row */}
                      <div
                        style={{
                          display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
                          padding: "6px 8px", borderRadius: 7, background: subExpanded ? bg + "80" : "transparent",
                          border: `1px solid ${subExpanded ? border : "transparent"}`,
                        }}
                        onClick={() => {
                          if (!subDone && sub.tasks.filter(t => t.status !== "completed").length > 0 && !subExpanded) {
                            onToggleSub(sub.id);
                          } else {
                            onToggleSub(sub.id);
                          }
                        }}
                      >
                        <span style={{ fontSize: 11, color: C.mut, flexShrink: 0 }}>{subExpanded ? "▼" : "▶"}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: subDone ? C.grn : C.tx, fontFamily: F, textDecoration: subDone ? "line-through" : "none" }}>
                              {subDone ? "✅ " : ""}{sub.title}
                            </span>
                            <span style={{ fontSize: 11, color: C.mut, fontFamily: F }}>
                              {sub.completedTasks}/{sub.totalTasks} done
                            </span>
                          </div>
                          <ProgressBar done={sub.completedTasks} total={sub.totalTasks} />
                        </div>
                        {/* Try-to-complete subcategory */}
                        {!subDone && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const remaining = sub.tasks.filter(t => t.status !== "completed").length;
                              if (remaining > 0) toast(`${remaining} task${remaining > 1 ? "s" : ""} remaining — complete all tasks first`);
                            }}
                            style={{ padding: "2px 8px", fontSize: 10, border: `1px solid ${C.brd}`, borderRadius: 5, cursor: "pointer", background: "transparent", color: C.mut, fontFamily: F, flexShrink: 0 }}
                          >☐</button>
                        )}
                      </div>

                      {/* Subcategory tasks */}
                      {subExpanded && (
                        <div style={{ marginLeft: 20, marginTop: 6, borderLeft: `3px solid ${border}`, paddingLeft: 12 }}>
                          {sub.tasks.length === 0 ? (
                            <div style={{ fontSize: 12, color: C.mut, fontFamily: F, padding: "6px 0" }}>No tasks yet</div>
                          ) : (
                            sub.tasks.map(task => (
                              <TaskRow key={task.id} task={task} onToggle={onToggleTask} />
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Weekly Grid ──────────────────────────────────────────────────────────────

function WeeklyGrid({ byOwner, onToggleTask }: {
  byOwner: Record<string, Record<number, PlanItem[]>>;
  onToggleTask: (id: string, complete: boolean) => void;
}) {
  const [expandedOwnerWeeks, setExpandedOwnerWeeks] = useState<Set<string>>(new Set());
  const currentWeek = 1; // April 9 = Week 1
  const ORDERED_OWNERS = ["Tony", "Ethan", "Ramy", "Faisal", "Haris", "Nate", "Bondilyn"];
  const owners = ORDERED_OWNERS.filter(o => byOwner[o]);
  const otherOwners = Object.keys(byOwner).filter(o => !ORDERED_OWNERS.includes(o));

  if (owners.length === 0 && otherOwners.length === 0) return null;

  function toggleExpand(key: string) {
    setExpandedOwnerWeeks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function renderOwnerRow(owner: string) {
    const weeks = byOwner[owner] || {};
    const pc = personColor(owner);

    return (
      <div key={owner} style={{ display: "contents" }}>
        {/* Owner cell */}
        <div style={{
          background: pc + "15", borderBottom: `1px solid ${C.brd}`, padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 8, position: "sticky", left: 0, zIndex: 1,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: pc, color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 700, fontFamily: F, flexShrink: 0,
          }}>{owner[0]}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.tx, fontFamily: F }}>{owner}</span>
        </div>

        {APRIL_WEEKS.map(week => {
          const tasks = weeks[week.n] || [];
          const isCurrentWeek = week.n === currentWeek;
          const isPastWeek = week.n < currentWeek;
          const expandKey = `${owner}-${week.n}`;
          const isExpanded = expandedOwnerWeeks.has(expandKey);
          const PREVIEW_COUNT = 3;
          const visibleTasks = isExpanded ? tasks : tasks.slice(0, PREVIEW_COUNT);
          const extraCount = tasks.length - PREVIEW_COUNT;

          return (
            <div key={week.n} style={{
              borderBottom: `1px solid ${C.brd}`, borderLeft: `1px solid ${C.brd}`,
              padding: "10px 12px", background: isCurrentWeek ? "#FFF8F0" : "transparent",
              minWidth: 0,
            }}>
              {tasks.length === 0 ? (
                <div style={{ fontSize: 12, color: C.mut, fontFamily: F, fontStyle: "italic" }}>—</div>
              ) : (
                <>
                  {visibleTasks.map(task => {
                    const done = task.status === "completed";
                    const isLate = isPastWeek && !done;

                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                        {isCurrentWeek ? (
                          <button
                            onClick={() => onToggleTask(task.id, !done)}
                            style={{
                              width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${done ? C.grn : C.brd}`,
                              background: done ? C.grn : "transparent", color: "#fff", fontSize: 8,
                              cursor: "pointer", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center",
                            }}
                          >{done ? "✓" : ""}</button>
                        ) : (
                          <span style={{ fontSize: 11, color: done ? C.grn : isLate ? C.red : C.mut, flexShrink: 0, marginTop: 1 }}>
                            {done ? "✓" : isLate ? "!" : "○"}
                          </span>
                        )}
                        <span style={{
                          fontSize: 11, color: done ? C.mut : isLate ? C.red : C.tx, fontFamily: F,
                          textDecoration: done ? "line-through" : "none", lineHeight: 1.4,
                        }}>{task.title.replace(/^[^:]+:\s*/, "")}</span>
                      </div>
                    );
                  })}
                  {extraCount > 0 && !isExpanded && (
                    <button
                      onClick={() => toggleExpand(expandKey)}
                      style={{ fontSize: 11, color: C.blu, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: F, marginTop: 2 }}
                    >+{extraCount} more ▶</button>
                  )}
                  {isExpanded && tasks.length > PREVIEW_COUNT && (
                    <button
                      onClick={() => toggleExpand(expandKey)}
                      style={{ fontSize: 11, color: C.blu, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: F }}
                    >▲ collapse</button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ borderBottom: `2px solid ${C.brd}`, marginBottom: 16 }} />
      <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F, marginBottom: 14 }}>
        Weekly breakdown — April 2026
      </div>
      <div style={{ overflowX: "auto" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: `160px repeat(4, minmax(180px, 1fr))`,
          border: `1px solid ${C.brd}`, borderRadius: 10, overflow: "hidden",
          minWidth: 760,
        }}>
          {/* Header */}
          <div style={{ background: C.card, borderBottom: `1px solid ${C.brd}`, padding: "8px 12px", fontSize: 11, fontWeight: 700, color: C.sub, fontFamily: F }}>Person</div>
          {APRIL_WEEKS.map(w => (
            <div key={w.n} style={{
              background: w.n === currentWeek ? "#FFF3E0" : C.card,
              borderBottom: `1px solid ${C.brd}`, borderLeft: `1px solid ${C.brd}`,
              padding: "8px 12px",
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.tx, fontFamily: F }}>{w.label}</div>
              <div style={{ fontSize: 10, color: C.mut, fontFamily: F }}>{w.dates}</div>
              {w.n === currentWeek && <div style={{ fontSize: 9, color: "#F97316", fontWeight: 700, fontFamily: F }}>← current</div>}
            </div>
          ))}
          {/* Owner rows */}
          {owners.map(renderOwnerRow)}
          {otherOwners.map(renderOwnerRow)}
        </div>
      </div>
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ teamFromDB }: { teamFromDB: TeamMember[] }) {
  const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());

  // Merge DB data with hardcoded SOW data
  const members = TEAM_SOW.map(sow => {
    const dbEntry = teamFromDB.find(t => t.name.toLowerCase().includes(sow.name.split(" ")[0].toLowerCase()));
    return { ...sow, currentFocus: dbEntry?.currentFocus };
  });

  const activeCount = members.filter(m => !m.hiring).length;
  const hiringCount = members.filter(m => m.hiring).length;
  const burnTotal = members.filter(m => !m.hiring)
    .reduce((sum, m) => sum + parseInt((m.salary || "$0").replace(/\D/g, "")), 0);

  function toggleMember(id: string) {
    setExpandedMembers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div>
      {/* Metric cards */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Active", value: activeCount, bg: C.grnBg, color: C.grn },
          { label: "Hiring", value: hiringCount, bg: C.ambBg, color: C.amb },
          { label: "Monthly burn", value: `$${burnTotal.toLocaleString()}K`, bg: C.redBg, color: C.red },
        ].map(m => (
          <div key={m.label} style={{ flex: 1, background: m.bg, border: `1px solid ${m.color}40`, borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: m.color, fontFamily: F }}>{m.value}</div>
            <div style={{ fontSize: 11, color: m.color, fontFamily: F, opacity: 0.8 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Team cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {members.map(member => {
          const isExpanded = expandedMembers.has(member.id);
          const pc = personColor(member.id);

          return (
            <div key={member.id} style={{
              border: `1px solid ${C.brd}`, borderRadius: 10, overflow: "hidden",
              boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
            }}>
              {/* Header */}
              <button
                onClick={() => toggleMember(member.id)}
                style={{
                  width: "100%", background: C.card, border: "none", padding: "12px 16px",
                  cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: "50%", background: member.hiring ? C.amb : pc,
                  color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700, fontFamily: F, flexShrink: 0,
                }}>
                  {member.hiring ? "?" : member.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F }}>{member.name}</span>
                    {member.hiring && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: C.ambBg, color: C.amb, borderRadius: 10, padding: "2px 8px" }}>HIRING</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                    {member.role} · {member.salary}
                    {member.currentFocus && <span style={{ color: C.blu }}> · {member.currentFocus}</span>}
                  </div>
                </div>
                <span style={{ color: C.mut, fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
              </button>

              {/* Expanded body */}
              {isExpanded && (
                <div style={{ padding: "14px 16px", background: "#fafafa", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {/* DOES */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.grn, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontFamily: F }}>✓ Does</div>
                    {(member.does || []).map((item, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: C.tx, fontFamily: F, lineHeight: 1.5,
                        borderLeft: `3px solid ${C.grn}`, paddingLeft: 10, marginBottom: 6,
                      }}>{item}</div>
                    ))}
                  </div>
                  {/* DOESN'T */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 800, color: C.red, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, fontFamily: F }}>✕ Doesn't touch</div>
                    {(member.doesNot || []).map((item, i) => (
                      <div key={i} style={{
                        fontSize: 12, color: C.tx, fontFamily: F, lineHeight: 1.5,
                        borderLeft: `3px solid ${C.red}`, paddingLeft: 10, marginBottom: 6,
                      }}>{item}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Gap analysis */}
      <div style={{ marginTop: 24, background: C.ambBg, border: `1px solid ${C.amb}`, borderRadius: 12, padding: "16px 18px" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: C.amb, marginBottom: 12, fontFamily: F }}>⚠ AI Gap Analysis — Critical Risks</div>
        {GAP_ANALYSIS.map(g => (
          <div key={g.n} style={{ display: "flex", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.amb, flexShrink: 0, fontFamily: F }}>#{g.n}</span>
            <span style={{ fontSize: 12, color: "#7C3A00", fontFamily: F, lineHeight: 1.5 }}>{g.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Master Task Table ────────────────────────────────────────────────────────

function MasterTaskTab({ onToggleTask }: { onToggleTask: (id: string, complete: boolean) => void }) {
  const [tasks, setTasks] = useState<PlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("");
  const [filterOwner, setFilterOwner] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showCatRef, setShowCatRef] = useState(false);

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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filterCat, filterOwner, filterStatus]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

  const CAT_OPTIONS = ["adaptation", "sales", "tech", "capital", "team"];
  const OWNER_OPTIONS = ["Tony", "Ethan", "Ramy", "Faisal", "Haris", "Nate", "Bondilyn"];

  async function handleToggle(id: string, complete: boolean) {
    try {
      if (complete) await post(`/plan/task/${id}/complete`, {});
      else await post(`/plan/task/${id}/uncomplete`, {});
      await loadTasks();
      onToggleTask(id, complete);
    } catch { /* ignore */ }
  }

  return (
    <div>
      {/* Collapsible category reference */}
      <button
        onClick={() => setShowCatRef(v => !v)}
        style={{ fontSize: 12, color: C.blu, background: "none", border: "none", cursor: "pointer", padding: "0 0 12px", fontFamily: F }}
      >
        {showCatRef ? "▼" : "▶"} Master categories (25 subcategories across 5 categories)
      </button>
      {showCatRef && (
        <div style={{ marginBottom: 16, background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8, padding: "12px 16px" }}>
          {[
            { key: "adaptation", subs: "Operator Assessment, CS Dashboard, User Outreach, Success Playbook, Dead Weight Suspension" },
            { key: "sales", subs: "Pricing & Approach, Commitments Pipeline, Demo Workflow, Sales Materials, Prospect Pipeline" },
            { key: "tech", subs: "CS Dashboard (Tech), Foundation + DispoPro, AWS/Cloud Credits, AAA Build, USale Marketplace" },
            { key: "capital", subs: "Loan Direction Decision, P&L / Financial Plan, Investor Meetings, Kiavi Broker, Nema/Lightning Docs" },
            { key: "team", subs: "PM/Engineer Hire, Onboarding Manager, Adaptation Manager, Nate Transition, SOW Updates" },
          ].map(row => (
            <div key={row.key} style={{ display: "flex", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.tx, textTransform: "capitalize", width: 90, flexShrink: 0, fontFamily: F }}>{row.key}</span>
              <span style={{ fontSize: 11, color: C.sub, fontFamily: F }}>{row.subs}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, background: C.card }}>
          <option value="">All categories</option>
          {CAT_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={filterOwner} onChange={e => setFilterOwner(e.target.value)}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, background: C.card }}>
          <option value="">All owners</option>
          {OWNER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ fontSize: 12, padding: "6px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, background: C.card }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="late">Late</option>
        </select>
        <span style={{ fontSize: 12, color: C.sub, fontFamily: F, marginLeft: "auto" }}>
          {loading ? "Loading…" : `${tasks.length} tasks`}
        </span>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", borderRadius: 10, border: `1px solid ${C.brd}` }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1100 }}>
          <thead>
            <tr style={{ background: C.card, borderBottom: `2px solid ${C.brd}` }}>
              {["Done","#","Tier","Category","Sub-Category","Task","Atomic KPI","Source","Owner","Priority","Status","Due Date","Notes","Linear ID"].map(h => (
                <th key={h} style={{ fontSize: 10, fontWeight: 700, color: C.sub, textAlign: "left", padding: "8px 10px", fontFamily: F, whiteSpace: "nowrap", borderRight: `1px solid ${C.brd}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => {
              const done = task.status === "completed";
              const isLate = !done && task.dueDate && new Date(task.dueDate) < new Date("2026-04-09");
              const rowBg = done ? "#F9FFF9" : isLate ? "#FFF8F8" : "#fff";
              return (
                <tr key={task.id} style={{ background: rowBg, borderBottom: `1px solid ${C.brd}` }}>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <button
                      onClick={() => handleToggle(task.id, !done)}
                      style={{
                        width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${done ? C.grn : C.brd}`,
                        background: done ? C.grn : "transparent", color: "#fff", fontSize: 9,
                        cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                    >{done ? "✓" : ""}</button>
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.mut, fontFamily: F }}>{i + 1}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, fontFamily: F, whiteSpace: "nowrap" }}>{task.executionTier || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: "capitalize", color: C.tx, fontFamily: F }}>{task.category}</span>
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, fontFamily: F }}>{task.subcategory || "—"}</td>
                  <td style={{ padding: "8px 10px", maxWidth: 220, minWidth: 140 }}>
                    <span style={{ fontSize: 12, color: done ? C.mut : C.tx, fontFamily: F, textDecoration: done ? "line-through" : "none", lineHeight: 1.4, display: "block" }}>{task.title}</span>
                  </td>
                  <td style={{ padding: "8px 10px", maxWidth: 160, fontSize: 11, color: C.sub, fontFamily: F }}>{task.atomicKpi || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, fontFamily: F }}>{task.source || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {task.owner && <span style={{ fontSize: 11, fontWeight: 700, color: personColor(task.owner), background: personColor(task.owner) + "18", borderRadius: 10, padding: "1px 7px", whiteSpace: "nowrap" }}>{task.owner}</span>}
                  </td>
                  <td style={{ padding: "8px 10px" }}>{task.priority && <PriorityBadge p={task.priority} />}</td>
                  <td style={{ padding: "8px 10px" }}>{task.status && <StatusPill s={isLate ? "late" : task.status} />}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: isLate ? C.red : C.mut, fontFamily: F, whiteSpace: "nowrap" }}>{task.dueDate || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.sub, fontFamily: F, maxWidth: 120 }}>{task.workNotes || "—"}</td>
                  <td style={{ padding: "8px 10px", fontSize: 11, color: C.blu, fontFamily: F }}>
                    {task.linearId ? <a href={`https://linear.app/issue/${task.linearId}`} target="_blank" rel="noopener noreferrer" style={{ color: C.blu }}>{task.linearId}</a> : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && tasks.length === 0 && (
          <div style={{ padding: "32px", textAlign: "center", color: C.mut, fontFamily: F, fontSize: 14 }}>No tasks found</div>
        )}
      </div>
    </div>
  );
}

// ─── Business Plan Tab ────────────────────────────────────────────────────────

function BusinessPlanTab({
  docs, refreshing, onRefresh,
}: {
  docs: BusinessDoc[];
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const bpDoc = docs.find(d => d.documentType === "business_plan");
  const p90Doc = docs.find(d => d.documentType === "90_day_plan");

  function DocSection({ doc, title }: { doc: BusinessDoc | undefined; title: string }) {
    if (!doc) {
      return (
        <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "20px", marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F, marginBottom: 8 }}>{title}</div>
          <div style={{ fontSize: 13, color: C.mut, fontFamily: F }}>
            Not loaded yet.{" "}
            <button onClick={onRefresh} style={{ color: C.blu, background: "none", border: "none", cursor: "pointer", fontSize: 13, fontFamily: F }}>
              Refresh from Google Drive →
            </button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "20px", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F }}>{title}</div>
          <span style={{ fontSize: 11, color: C.mut, fontFamily: F }}>
            {doc.lastUpdated ? `Updated ${new Date(doc.lastUpdated).toLocaleDateString()}` : ""}
          </span>
        </div>
        {doc.summary && (
          <div style={{ background: C.bluBg, borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: C.blu, fontFamily: F, lineHeight: 1.6 }}>
            <strong>Summary:</strong> {doc.summary}
          </div>
        )}
        <pre style={{
          fontSize: 12, color: C.tx, fontFamily: "monospace", lineHeight: 1.6,
          whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
          maxHeight: 500, overflowY: "auto",
        }}>{doc.content || "No content loaded."}</pre>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={onRefresh} disabled={refreshing}
          style={{
            padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.brd}`,
            background: C.card, color: C.sub, fontSize: 12, cursor: refreshing ? "default" : "pointer", fontFamily: F,
          }}
        >{refreshing ? "Refreshing…" : "↻ Refresh from Drive"}</button>
      </div>
      <DocSection doc={bpDoc} title="📋 Business Plan" />
      <DocSection doc={p90Doc} title="🗓 90-Day Plan (OAP v4)" />
    </div>
  );
}

// ─── Main BusinessView Component ──────────────────────────────────────────────

export function BusinessView({
  onBack,
  defaultTab,
}: {
  onBack: () => void;
  defaultTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab || "goals");
  const [categories, setCategories] = useState<CategoryWithSubs[]>([]);
  const [byOwner, setByOwner] = useState<Record<string, Record<number, PlanItem[]>>>({});
  const [teamFromDB, setTeamFromDB] = useState<TeamMember[]>([]);
  const [docs, setDocs] = useState<BusinessDoc[]>([]);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [refreshingDrive, setRefreshingDrive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // ─── Data loading ─────────────────────────────────────────────────────────

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get("/plan/categories");
      setCategories(data.categories || []);
    } catch (e) {
      setErr("Failed to load 411 plan");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWeekly = useCallback(async () => {
    try {
      const data = await get("/plan/weekly/2026-04");
      setByOwner(data.byOwner || {});
    } catch { /* ignore */ }
  }, []);

  const loadTeam = useCallback(async () => {
    try {
      const data = await get("/business/team");
      setTeamFromDB(data.team || []);
    } catch { /* ignore */ }
  }, []);

  const loadDocs = useCallback(async () => {
    try {
      const data = await get("/business-context");
      setDocs(data.items || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadPlan();
    loadWeekly();
    loadTeam();
    loadDocs();
  }, [loadPlan, loadWeekly, loadTeam, loadDocs]);

  // ─── Expand/collapse ──────────────────────────────────────────────────────

  function toggleCat(id: string) {
    setExpandedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSub(id: string) {
    setExpandedSubs(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ─── Task toggle ──────────────────────────────────────────────────────────

  async function handleToggleTask(id: string, complete: boolean) {
    try {
      if (complete) await post(`/plan/task/${id}/complete`, {});
      else await post(`/plan/task/${id}/uncomplete`, {});
      await Promise.all([loadPlan(), loadWeekly()]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("remaining")) showToast(msg);
    }
  }

  function showToast(msg: string) {
    setToast(msg);
  }

  // ─── Sync handlers ────────────────────────────────────────────────────────

  async function handlePullFromSheet() {
    setSyncing(true);
    try {
      await post("/business/sync-from-sheet", {});
      await loadPlan();
      await loadWeekly();
    } catch { setErr("Pull from Sheet failed"); }
    finally { setSyncing(false); }
  }

  async function handlePushToSheet() {
    setSyncing(true);
    try {
      await post("/business/push-to-sheet", {});
    } catch { setErr("Push to Sheet failed"); }
    finally { setSyncing(false); }
  }

  async function handleRefreshDocs() {
    setRefreshingDrive(true);
    try {
      await post("/sheets/ingest-90-day-plan", {});
      await post("/sheets/ingest-business-plan", {});
      await loadDocs();
    } catch { /* ignore */ }
    finally { setRefreshingDrive(false); }
  }

  // ─── Tab style ───────────────────────────────────────────────────────────

  const tabStyle = (active: boolean) => ({
    padding: "7px 14px", borderRadius: 8, border: "none", fontSize: 12,
    fontWeight: active ? 700 : 500, cursor: "pointer", fontFamily: F,
    background: active ? "#F97316" : C.card, color: active ? "#fff" : C.sub,
    transition: "all 0.15s",
  } as const);

  // ─── Stats for 411 Plan ───────────────────────────────────────────────────

  const totalTasks = categories.reduce((s, c) => s + c.totalTasks, 0);
  const doneTasks = categories.reduce((s, c) => s + c.completedTasks, 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {/* ── Sticky header ─────────────────────────────────────────────────── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50, background: C.bg,
        borderBottom: `1px solid ${C.brd}`, padding: "0 32px",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto", paddingTop: 20, paddingBottom: 0 }}>
          {/* Back + title row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <button
                onClick={onBack}
                style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 13, fontFamily: F, display: "flex", alignItems: "center", gap: 4 }}
              >← Back</button>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: C.tx, fontFamily: F }}>Business Brain</div>
                <div style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                  {tab === "goals" && "411 Goal Cascade — Adaptation → Sales → Tech → Capital → Team"}
                  {tab === "team" && "Team roster — roles, scope, accountability"}
                  {tab === "tasks" && "Master task list — all 411 tasks in one view"}
                  {tab === "plan" && "Business plan + 90-day OAP"}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: "flex", gap: 8 }}>
              {(tab === "goals") && (
                <>
                  <button onClick={handlePullFromSheet} disabled={syncing} style={{
                    padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.brd}`,
                    background: C.card, color: C.sub, fontSize: 12, cursor: syncing ? "default" : "pointer", fontFamily: F,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>↓ Pull from Sheet</button>
                  <button onClick={handlePushToSheet} disabled={syncing} style={{
                    padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.grn}`,
                    background: C.grnBg, color: C.grn, fontSize: 12, cursor: syncing ? "default" : "pointer", fontFamily: F,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>↑ Push to Sheet</button>
                </>
              )}
              {tab === "tasks" && (
                <button onClick={() => { loadPlan(); loadWeekly(); }} style={{
                  padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.brd}`,
                  background: C.card, color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: F,
                }}>↻ Refresh</button>
              )}
            </div>
          </div>

          {/* Stats bar (411 plan only) */}
          {tab === "goals" && !loading && (
            <div style={{ display: "flex", gap: 24, marginBottom: 10 }}>
              <span style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                <span style={{ fontWeight: 700, color: C.tx }}>{doneTasks}</span>/{totalTasks} tasks done
              </span>
              <span style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                <span style={{ fontWeight: 700, color: C.grn }}>{totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0}%</span> complete
              </span>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4, paddingBottom: 14 }}>
            <button style={tabStyle(tab === "goals")} onClick={() => setTab("goals")}>🎯 411 plan</button>
            <button style={tabStyle(tab === "team")} onClick={() => setTab("team")}>👥 Team roster</button>
            <button style={tabStyle(tab === "tasks")} onClick={() => setTab("tasks")}>✅ Master task</button>
            <button style={tabStyle(tab === "plan")} onClick={() => setTab("plan")}>📄 Business plan</button>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 32px" }}>
        {err && (
          <div style={{
            background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 14px",
            color: C.red, fontSize: 13, marginBottom: 16, fontFamily: F, display: "flex", justifyContent: "space-between",
          }}>
            {err}
            <button onClick={() => setErr(null)} style={{ background: "none", border: "none", color: C.red, cursor: "pointer" }}>✕</button>
          </div>
        )}

        {/* ── 411 Plan Tab ────────────────────────────────────────────────── */}
        {tab === "goals" && (
          <>
            <GPSCards />
            {loading ? (
              <div style={{ textAlign: "center", padding: "48px", color: C.mut, fontFamily: F }}>Loading 411 plan…</div>
            ) : (
              <>
                <CategoryGrid
                  categories={categories}
                  expandedCats={expandedCats}
                  expandedSubs={expandedSubs}
                  onToggleCat={toggleCat}
                  onToggleSub={toggleSub}
                  onToggleTask={handleToggleTask}
                  toast={showToast}
                />
                <WeeklyGrid byOwner={byOwner} onToggleTask={handleToggleTask} />
              </>
            )}
          </>
        )}

        {/* ── Team Roster Tab ─────────────────────────────────────────────── */}
        {tab === "team" && <TeamTab teamFromDB={teamFromDB} />}

        {/* ── Master Task Tab ─────────────────────────────────────────────── */}
        {tab === "tasks" && (
          <MasterTaskTab onToggleTask={(_id, _complete) => { loadPlan(); loadWeekly(); }} />
        )}

        {/* ── Business Plan Tab ───────────────────────────────────────────── */}
        {tab === "plan" && (
          <BusinessPlanTab docs={docs} refreshing={refreshingDrive} onRefresh={handleRefreshDocs} />
        )}
      </div>

      {/* Toast */}
      {toast && <Toast msg={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default BusinessView;
