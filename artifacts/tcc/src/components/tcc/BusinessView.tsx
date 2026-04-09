import { useState, useEffect, useCallback } from "react";
import { get, post, patch, del } from "@/lib/api";
import { C, F } from "@/components/tcc/constants";

const HORIZON_ORDER = ["5yr", "1yr", "quarterly", "monthly", "weekly", "daily"] as const;
type Horizon = typeof HORIZON_ORDER[number];

const HORIZON_LABELS: Record<string, string> = {
  "5yr": "5-Year Vision",
  "1yr": "1-Year Goal",
  "quarterly": "Quarterly",
  "monthly": "Monthly",
  "weekly": "Weekly",
  "daily": "Daily",
};

const HORIZON_COLORS: Record<string, string> = {
  "5yr": "#7C3AED",
  "1yr": "#1565C0",
  "quarterly": "#0D7A5F",
  "monthly": "#E65100",
  "weekly": "#C62828",
  "daily": "#4B5563",
};

const STATUS_COLORS: Record<string, string> = {
  active: C.grn,
  done: C.mut,
  paused: C.amb,
};

type Goal = {
  id: string;
  horizon: string;
  title: string;
  description?: string | null;
  owner?: string | null;
  status?: string | null;
  dueDate?: string | null;
  position?: number;
  createdAt?: string;
};

type TeamMember = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  slackId?: string | null;
  currentFocus?: string | null;
  responsibilities?: string[];
  position?: number;
};

type Tab = "goals" | "team" | "tasks" | "plan";

type LocalTask = {
  id: string;
  title: string;
  source?: string | null;
  owner?: string | null;
  priority?: string | null;
  status?: string | null;
  dueDate?: string | null;
  notes?: string | null;
};

type BusinessDoc = {
  id: string;
  documentType: string;
  summary?: string | null;
  content?: string | null;
  lastUpdated?: string | null;
};

type AddGoalForm = {
  horizon: Horizon;
  title: string;
  description: string;
  owner: string;
  dueDate: string;
};

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11,
      fontWeight: 700, background: bg, color, fontFamily: F,
    }}>{label}</span>
  );
}

function GoalCard({ goal, onStatusChange, onDelete }: {
  goal: Goal;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isDone = goal.status === "done";
  const hColor = HORIZON_COLORS[goal.horizon] || C.sub;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      style={{
        background: C.card, border: `1px solid ${hovered ? hColor : C.brd}`,
        borderRadius: 10, padding: "14px 16px", position: "relative",
        transition: "border-color 0.15s, box-shadow 0.15s",
        boxShadow: hovered ? "0 2px 12px rgba(0,0,0,0.07)" : "none",
        opacity: isDone ? 0.6 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: hColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
              {HORIZON_LABELS[goal.horizon] || goal.horizon}
            </span>
            {goal.owner && (
              <span style={{ fontSize: 11, color: C.mut, fontFamily: F }}>— {goal.owner}</span>
            )}
            {goal.dueDate && (
              <span style={{ fontSize: 10, color: C.mut, fontFamily: F }}>📅 {goal.dueDate}</span>
            )}
          </div>
          <div style={{
            fontSize: 14, fontWeight: 600, color: isDone ? C.mut : C.tx,
            textDecoration: isDone ? "line-through" : "none",
            lineHeight: 1.4, fontFamily: F,
          }}>
            {goal.title}
          </div>
          {goal.description && (
            <div style={{ fontSize: 12, color: C.sub, marginTop: 5, lineHeight: 1.5, fontFamily: F }}>
              {goal.description}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {!isDone && (
            <button
              onClick={() => onStatusChange(goal.id, "done")}
              title="Mark done"
              style={{
                background: C.grnBg, border: `1px solid ${C.grn}`, color: C.grn,
                borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700,
                cursor: "pointer", fontFamily: F,
              }}
            >✓ Done</button>
          )}
          {isDone && (
            <button
              onClick={() => onStatusChange(goal.id, "active")}
              title="Reactivate"
              style={{
                background: C.bg, border: `1px solid ${C.brd}`, color: C.sub,
                borderRadius: 6, padding: "4px 10px", fontSize: 11,
                cursor: "pointer", fontFamily: F,
              }}
            >↩ Reopen</button>
          )}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen(o => !o)}
              style={{
                background: "none", border: "none", color: C.mut, cursor: "pointer",
                fontSize: 18, lineHeight: 1, padding: "2px 6px", borderRadius: 4,
                fontFamily: F,
              }}
            >⋯</button>
            {menuOpen && (
              <div style={{
                position: "absolute", right: 0, top: 24, zIndex: 50,
                background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8,
                boxShadow: "0 4px 16px rgba(0,0,0,0.1)", minWidth: 130, padding: "4px 0",
              }}>
                {goal.status !== "paused" && (
                  <div
                    onClick={() => { onStatusChange(goal.id, "paused"); setMenuOpen(false); }}
                    style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", color: C.amb, fontFamily: F }}
                  >⏸ Pause</div>
                )}
                {goal.status === "paused" && (
                  <div
                    onClick={() => { onStatusChange(goal.id, "active"); setMenuOpen(false); }}
                    style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", color: C.grn, fontFamily: F }}
                  >▶ Resume</div>
                )}
                <div
                  onClick={async () => {
                    if (deleting) return;
                    setDeleting(true);
                    await onDelete(goal.id);
                    setMenuOpen(false);
                    setDeleting(false);
                  }}
                  style={{ padding: "8px 14px", fontSize: 13, cursor: "pointer", color: C.red, fontFamily: F }}
                >{deleting ? "Deleting…" : "🗑 Delete"}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function HorizonSection({ horizon, goals, onStatusChange, onDelete }: {
  horizon: string;
  goals: Goal[];
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const color = HORIZON_COLORS[horizon] || C.sub;
  const active = goals.filter(g => g.status !== "done");
  const done = goals.filter(g => g.status === "done");

  if (goals.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: "flex", alignItems: "center", gap: 10, cursor: "pointer",
          marginBottom: 10, userSelect: "none",
        }}
      >
        <div style={{ width: 4, height: 20, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 800, color, fontFamily: F, letterSpacing: 0.3 }}>
          {HORIZON_LABELS[horizon] || horizon}
        </span>
        <span style={{
          fontSize: 11, color: C.mut, background: C.bg,
          border: `1px solid ${C.brd}`, borderRadius: 12, padding: "1px 8px", fontFamily: F,
        }}>
          {active.length} active{done.length > 0 ? ` · ${done.length} done` : ""}
        </span>
        <span style={{ fontSize: 12, color: C.mut, marginLeft: "auto" }}>{collapsed ? "▶" : "▼"}</span>
      </div>
      {!collapsed && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 14 }}>
          {active.map(g => (
            <GoalCard key={g.id} goal={g} onStatusChange={onStatusChange} onDelete={onDelete} />
          ))}
          {done.map(g => (
            <GoalCard key={g.id} goal={g} onStatusChange={onStatusChange} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

function TeamCard({ member }: { member: TeamMember }) {
  const initials = member.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
  const colors = ["#7C3AED", "#1565C0", "#0D7A5F", "#E65100", "#C62828"];
  const colorIdx = member.name.charCodeAt(0) % colors.length;
  const color = colors[colorIdx];

  return (
    <div style={{
      background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "18px 20px",
      display: "flex", flexDirection: "column", gap: 10, minWidth: 200,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 800, fontSize: 16, flexShrink: 0, fontFamily: F,
        }}>
          {initials}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, fontFamily: F }}>{member.name}</div>
          <div style={{ fontSize: 12, color: C.sub, fontFamily: F }}>{member.role}</div>
        </div>
      </div>
      {member.currentFocus && (
        <div style={{
          background: C.ambBg, border: `1px solid ${C.amb}20`, borderRadius: 7,
          padding: "8px 10px", fontSize: 12, color: C.amb, fontFamily: F, lineHeight: 1.4,
        }}>
          <span style={{ fontWeight: 700 }}>Focus: </span>{member.currentFocus}
        </div>
      )}
      {member.responsibilities && member.responsibilities.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.mut, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, fontFamily: F }}>
            Responsibilities
          </div>
          <ul style={{ margin: 0, padding: "0 0 0 16px" }}>
            {member.responsibilities.map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: C.sub, marginBottom: 2, fontFamily: F }}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {(member.email || member.slackId) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {member.email && (
            <div style={{ fontSize: 11, color: C.mut, fontFamily: F }}>✉ {member.email}</div>
          )}
          {member.slackId && (
            <div style={{ fontSize: 11, color: C.mut, fontFamily: F }}>💬 {member.slackId}</div>
          )}
        </div>
      )}
    </div>
  );
}

function AddGoalModal({ onAdd, onClose }: { onAdd: (goal: AddGoalForm) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState<AddGoalForm>({ horizon: "monthly", title: "", description: "", owner: "Tony", dueDate: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    if (!form.title.trim()) { setErr("Goal title is required"); return; }
    setSaving(true);
    try {
      await onAdd(form);
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: C.card, borderRadius: 14, padding: "28px 28px", width: 480, maxWidth: "95vw",
        border: `1px solid ${C.brd}`, boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.tx, marginBottom: 20, fontFamily: F }}>Add Goal</div>

        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5, fontFamily: F }}>HORIZON</div>
          <select
            value={form.horizon}
            onChange={e => setForm(f => ({ ...f, horizon: e.target.value as Horizon }))}
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.brd}`,
              fontFamily: F, fontSize: 14, color: C.tx, background: C.card, outline: "none",
            }}
          >
            {HORIZON_ORDER.map(h => <option key={h} value={h}>{HORIZON_LABELS[h]}</option>)}
          </select>
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5, fontFamily: F }}>GOAL TITLE *</div>
          <input
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="The ONE thing…"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.brd}`,
              fontFamily: F, fontSize: 14, color: C.tx, background: C.card, outline: "none", boxSizing: "border-box",
            }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5, fontFamily: F }}>DESCRIPTION</div>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            rows={3}
            placeholder="More context or success criteria…"
            style={{
              width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.brd}`,
              fontFamily: F, fontSize: 14, color: C.tx, background: C.card, outline: "none", resize: "vertical", boxSizing: "border-box",
            }}
          />
        </label>

        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
          <label style={{ display: "block", flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5, fontFamily: F }}>OWNER</div>
            <input
              value={form.owner}
              onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}
              placeholder="Tony"
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.brd}`,
                fontFamily: F, fontSize: 14, color: C.tx, background: C.card, outline: "none", boxSizing: "border-box",
              }}
            />
          </label>
          <label style={{ display: "block", flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.sub, marginBottom: 5, fontFamily: F }}>DUE DATE</div>
            <input
              type="date"
              value={form.dueDate}
              onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
              style={{
                width: "100%", padding: "9px 12px", borderRadius: 7, border: `1px solid ${C.brd}`,
                fontFamily: F, fontSize: 14, color: C.tx, background: C.card, outline: "none", boxSizing: "border-box",
              }}
            />
          </label>
        </div>

        {err && <div style={{ color: C.red, fontSize: 12, marginBottom: 12, fontFamily: F }}>{err}</div>}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              padding: "9px 20px", borderRadius: 7, border: `1px solid ${C.brd}`,
              background: "none", color: C.sub, fontSize: 13, cursor: "pointer", fontFamily: F,
            }}
          >Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "9px 24px", borderRadius: 7, border: "none",
              background: "#F97316", color: "#fff", fontSize: 13, fontWeight: 700,
              cursor: saving ? "default" : "pointer", fontFamily: F, opacity: saving ? 0.7 : 1,
            }}
          >{saving ? "Saving…" : "Add Goal"}</button>
        </div>
      </div>
    </div>
  );
}

export function BusinessView({ onBack, defaultTab, onTabChange }: {
  onBack?: () => void;
  defaultTab?: Tab;
  onTabChange?: (tab: Tab) => void;
}) {
  const [tab, setTabState] = useState<Tab>(defaultTab || "goals");

  const setTab = (t: Tab) => {
    setTabState(t);
    onTabChange?.(t);
  };

  useEffect(() => {
    if (defaultTab && defaultTab !== tab) {
      setTabState(defaultTab);
    }
  }, [defaultTab]);

  const [goals, setGoals] = useState<Record<string, Goal[]>>({});
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [tasks, setTasks] = useState<LocalTask[]>([]);
  const [docs, setDocs] = useState<BusinessDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [refreshingDrive, setRefreshingDrive] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [taskFilter, setTaskFilter] = useState<"all" | "active" | "done">("active");
  const [err, setErr] = useState("");

  const loadGoals = useCallback(async () => {
    try {
      const data = await get("/business/goals/by-horizon");
      setGoals(data as Record<string, Goal[]>);
    } catch (e) {
      setErr("Failed to load goals");
    }
  }, []);

  const loadTeam = useCallback(async () => {
    try {
      const data = await get("/business/team");
      setTeam(data as TeamMember[]);
      if ((data as TeamMember[]).length === 0) {
        await post("/business/team/seed", {});
        const seeded = await get("/business/team");
        setTeam(seeded as TeamMember[]);
      }
    } catch (e) {
      setErr("Failed to load team");
    }
  }, []);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const data = await get("/tasks") as { tasks?: LocalTask[]; linear?: LocalTask[] } | LocalTask[];
      if (Array.isArray(data)) {
        setTasks(data);
      } else if (data && typeof data === "object") {
        const all: LocalTask[] = [];
        if (Array.isArray((data as { tasks?: LocalTask[] }).tasks)) all.push(...((data as { tasks: LocalTask[] }).tasks));
        if (Array.isArray((data as { linear?: LocalTask[] }).linear)) all.push(...((data as { linear: LocalTask[] }).linear));
        setTasks(all);
      }
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const data = await get("/business/context");
      setDocs(data as BusinessDoc[]);
    } catch {
      setDocs([]);
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.allSettled([loadGoals(), loadTeam()]);
      setLoading(false);
    })();
  }, [loadGoals, loadTeam]);

  useEffect(() => {
    if (tab === "tasks" && tasks.length === 0) loadTasks();
    if (tab === "plan" && docs.length === 0) loadDocs();
  }, [tab]);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await patch(`/business/goals/${id}`, { status });
      await loadGoals();
    } catch (e) {
      setErr("Failed to update goal");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await del(`/business/goals/${id}`);
      await loadGoals();
    } catch (e) {
      setErr("Failed to delete goal");
    }
  };

  const handleAdd = async (form: AddGoalForm) => {
    await post("/business/goals", form);
    await loadGoals();
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await post("/business/sync-from-sheet", {});
      await loadGoals();
      await loadTeam();
    } catch {
      setErr("Sheet sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const allGoals = Object.values(goals).flat();
  const activeCount = allGoals.filter(g => g.status !== "done").length;
  const doneCount = allGoals.filter(g => g.status === "done").length;

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: active ? 700 : 500,
    color: active ? "#F97316" : C.sub, background: active ? "#FFF7ED" : "none",
    border: `1px solid ${active ? "#F97316" : "transparent"}`,
    cursor: "pointer", fontFamily: F, transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F }}>
      {/* Page header */}
      <div style={{
        background: C.card, borderBottom: `1px solid ${C.brd}`,
        padding: "20px 32px 0",
      }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
            {onBack && (
              <button
                onClick={onBack}
                style={{ background: "none", border: "none", color: C.sub, cursor: "pointer", fontSize: 13, fontFamily: F, padding: 0 }}
              >← Back</button>
            )}
            <div>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: C.tx, fontFamily: F }}>
                Business Brain
              </h1>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 2, fontFamily: F }}>
                {tab === "goals" ? "411 Goal Cascade — 5yr → 1yr → Quarterly → Monthly → Weekly"
                  : tab === "team" ? "Team Roster — Roles, Focus & Accountability"
                  : tab === "tasks" ? "Master Task List — All tasks synced from Google Sheet"
                  : "Business Plan & 90-Day Plan — Live from Google Drive"}
              </div>
            </div>

            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              {/* Bilateral sync controls — shown on goals and team tabs */}
              {(tab === "goals" || tab === "team") && (<>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  title="Pull latest data from Google Sheet into database"
                  style={{
                    padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.blu}`,
                    background: C.bluBg, color: C.blu, fontSize: 12, fontWeight: 600,
                    cursor: syncing ? "default" : "pointer", fontFamily: F,
                    opacity: syncing ? 0.6 : 1, display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12m0 0L8 16m4-4l4 4"/><path d="M20 6a8.5 8.5 0 10-16.97 2"/></svg>
                  {syncing ? "Pulling…" : "↓ Pull from Sheet"}
                </button>
                {tab === "goals" && (
                  <button
                    onClick={async () => {
                      setSyncing(true);
                      try { await post("/business/push-to-sheet", {}); }
                      catch { setErr("Push to sheet failed"); }
                      finally { setSyncing(false); }
                    }}
                    disabled={syncing}
                    title="Push your current goals from database up to Google Sheet"
                    style={{
                      padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.grn}`,
                      background: C.grnBg, color: C.grn, fontSize: 12, fontWeight: 600,
                      cursor: syncing ? "default" : "pointer", fontFamily: F,
                      opacity: syncing ? 0.6 : 1, display: "flex", alignItems: "center", gap: 5,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10m0 0l4-4m-4 4L8 8"/><path d="M4 18a8.5 8.5 0 0016.97-2"/></svg>
                    {syncing ? "Pushing…" : "↑ Push to Sheet"}
                  </button>
                )}
              </>)}

              {tab === "goals" && (
                <button
                  onClick={() => setShowAdd(true)}
                  style={{
                    padding: "7px 16px", borderRadius: 7, border: "none",
                    background: "#F97316", color: "#fff", fontSize: 12, fontWeight: 700,
                    cursor: "pointer", fontFamily: F,
                  }}
                >+ Add Goal</button>
              )}

              {tab === "tasks" && (
                <button
                  onClick={loadTasks}
                  disabled={tasksLoading}
                  style={{
                    padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.brd}`,
                    background: C.card, color: C.sub, fontSize: 12,
                    cursor: tasksLoading ? "default" : "pointer", fontFamily: F,
                  }}
                >{tasksLoading ? "Refreshing…" : "↻ Refresh Tasks"}</button>
              )}

              {tab === "plan" && (
                <button
                  onClick={async () => {
                    setRefreshingDrive(true);
                    try { await post("/sheets/ingest-90-day-plan", {}); } catch { /* ignore */ }
                    try { await post("/sheets/ingest-business-plan", {}); } catch { /* ignore */ }
                    await loadDocs();
                    setRefreshingDrive(false);
                  }}
                  disabled={refreshingDrive}
                  style={{
                    padding: "7px 13px", borderRadius: 7, border: `1px solid ${C.brd}`,
                    background: C.card, color: C.sub, fontSize: 12,
                    cursor: refreshingDrive ? "default" : "pointer", fontFamily: F,
                  }}
                >{refreshingDrive ? "Refreshing…" : "↻ Refresh from Drive"}</button>
              )}
            </div>
          </div>

          {/* Stats bar */}
          {tab === "goals" && (
            <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                <span style={{ fontWeight: 700, color: C.tx }}>{activeCount}</span> active goals
              </span>
              <span style={{ fontSize: 12, color: C.sub, fontFamily: F }}>
                <span style={{ fontWeight: 700, color: C.grn }}>{doneCount}</span> completed
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12, color: C.sub, fontFamily: F }}>
                <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
                Show completed
              </label>
            </div>
          )}

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            <button style={tabStyle(tab === "goals")} onClick={() => setTab("goals")}>
              🎯 411 Plan
            </button>
            <button style={tabStyle(tab === "team")} onClick={() => setTab("team")}>
              👥 Team Roster
            </button>
            <button style={tabStyle(tab === "tasks")} onClick={() => setTab("tasks")}>
              ✅ Master Tasks
            </button>
            <button style={tabStyle(tab === "plan")} onClick={() => setTab("plan")}>
              📄 Business Plan
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "28px 32px" }}>
        {err && (
          <div style={{
            background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: "10px 14px",
            color: C.red, fontSize: 13, marginBottom: 16, fontFamily: F,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            {err}
            <button onClick={() => setErr("")} style={{ background: "none", border: "none", color: C.red, cursor: "pointer", fontSize: 16 }}>×</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.mut, fontFamily: F, fontSize: 14 }}>
            Loading Business Brain…
          </div>
        ) : tab === "goals" ? (
          <div>
            {HORIZON_ORDER.map(h => {
              const items = (goals[h] || []).filter(g => showDone || g.status !== "done");
              return (
                <HorizonSection
                  key={h}
                  horizon={h}
                  goals={items}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              );
            })}
            {allGoals.length === 0 && (
              <div style={{
                textAlign: "center", padding: "60px 0", color: C.mut, fontFamily: F,
              }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🎯</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.sub, marginBottom: 8 }}>
                  No goals yet
                </div>
                <div style={{ fontSize: 13, color: C.mut, marginBottom: 20 }}>
                  Add your first goal or sync from the 411 Plan Google Sheet
                </div>
                <button
                  onClick={() => setShowAdd(true)}
                  style={{
                    padding: "10px 22px", borderRadius: 8, border: "none",
                    background: "#F97316", color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: F,
                  }}
                >+ Add First Goal</button>
              </div>
            )}
          </div>
        ) : tab === "team" ? (
          /* Team Tab */
          <div>
            {team.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: C.mut, fontFamily: F }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>👥</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.sub }}>No team members yet</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
                {team.map(m => <TeamCard key={m.id} member={m} />)}
              </div>
            )}
          </div>
        ) : tab === "tasks" ? (
          /* Master Task List Tab */
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <span style={{ fontSize: 13, color: C.sub, fontFamily: F }}>Filter:</span>
              {(["active", "done", "all"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setTaskFilter(f)}
                  style={{
                    padding: "5px 14px", borderRadius: 20, border: `1px solid ${taskFilter === f ? "#F97316" : C.brd}`,
                    background: taskFilter === f ? "#FFF7ED" : "none",
                    color: taskFilter === f ? "#F97316" : C.sub, fontSize: 12, cursor: "pointer",
                    fontWeight: taskFilter === f ? 700 : 400, fontFamily: F,
                  }}
                >{f === "active" ? "Active" : f === "done" ? "Done" : "All"}</button>
              ))}
              <button
                onClick={loadTasks}
                disabled={tasksLoading}
                style={{
                  marginLeft: "auto", padding: "5px 12px", borderRadius: 7, border: `1px solid ${C.brd}`,
                  background: C.card, color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: F,
                }}
              >{tasksLoading ? "Loading…" : "↻ Refresh"}</button>
            </div>

            {tasksLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.mut, fontFamily: F }}>Loading tasks…</div>
            ) : tasks.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: C.mut, fontFamily: F }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.sub }}>No tasks found</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {tasks
                  .filter(t => {
                    if (taskFilter === "active") return t.status !== "done" && t.status !== "completed";
                    if (taskFilter === "done") return t.status === "done" || t.status === "completed";
                    return true;
                  })
                  .map(t => {
                    const isDone = t.status === "done" || t.status === "completed";
                    const priorityColors: Record<string, string> = { high: C.red, medium: C.amb, low: C.grn, critical: "#7C3AED" };
                    const pColor = t.priority ? (priorityColors[t.priority.toLowerCase()] || C.sub) : C.sub;
                    return (
                      <div key={t.id} style={{
                        background: C.card, border: `1px solid ${C.brd}`, borderRadius: 9,
                        padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: 12,
                        opacity: isDone ? 0.6 : 1,
                      }}>
                        <div style={{ width: 3, borderRadius: 2, alignSelf: "stretch", background: pColor, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, color: isDone ? C.mut : C.tx,
                            textDecoration: isDone ? "line-through" : "none", fontFamily: F, lineHeight: 1.4,
                          }}>{t.title}</div>
                          <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                            {t.source && <span style={{ fontSize: 11, color: C.mut, fontFamily: F }}>{t.source}</span>}
                            {t.owner && <span style={{ fontSize: 11, color: C.sub, fontFamily: F }}>→ {t.owner}</span>}
                            {t.dueDate && <span style={{ fontSize: 11, color: C.mut, fontFamily: F }}>📅 {t.dueDate}</span>}
                            {t.priority && <span style={{ fontSize: 11, fontWeight: 600, color: pColor, fontFamily: F }}>{t.priority}</span>}
                          </div>
                          {t.notes && (
                            <div style={{ fontSize: 12, color: C.sub, marginTop: 4, fontFamily: F }}>{t.notes}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : (
          /* Business Plan / Docs Tab */
          <div>

            {docsLoading ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.mut, fontFamily: F }}>Loading…</div>
            ) : docs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "60px 0", color: C.mut, fontFamily: F }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.sub, marginBottom: 8 }}>
                  No business documents loaded yet
                </div>
                <div style={{ fontSize: 13, color: C.mut, marginBottom: 16 }}>
                  Click "Refresh from Drive" to load your 90-day plan and business plan
                </div>
                <button
                  onClick={async () => {
                    setRefreshingDrive(true);
                    try { await post("/sheets/ingest-90-day-plan", {}); } catch { /* ignore */ }
                    await loadDocs();
                    setRefreshingDrive(false);
                  }}
                  disabled={refreshingDrive}
                  style={{
                    padding: "9px 20px", borderRadius: 7, border: "none",
                    background: "#F97316", color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", fontFamily: F,
                  }}
                >{refreshingDrive ? "Loading…" : "↻ Refresh from Drive"}</button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {docs.map(doc => (
                  <div key={doc.id} style={{
                    background: C.card, border: `1px solid ${C.brd}`, borderRadius: 12, padding: "20px 24px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ fontSize: 22 }}>{doc.documentType === "business_plan" ? "🏢" : doc.documentType === "90_day_plan" ? "📅" : "📄"}</span>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, fontFamily: F }}>
                          {doc.documentType === "business_plan" ? "FlipIQ Business Plan" :
                           doc.documentType === "90_day_plan" ? "90-Day Plan" :
                           doc.documentType.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </div>
                        {doc.lastUpdated && (
                          <div style={{ fontSize: 11, color: C.mut, fontFamily: F }}>
                            Last updated: {new Date(doc.lastUpdated).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    {doc.summary && (
                      <div style={{
                        background: C.bg, borderRadius: 8, padding: "12px 14px",
                        fontSize: 13, color: C.sub, fontFamily: F, lineHeight: 1.6,
                        maxHeight: 300, overflowY: "auto",
                        whiteSpace: "pre-wrap",
                      }}>
                        {doc.summary}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <AddGoalModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
}
