import { useState, useEffect } from "react";
import { post, get, patch } from "@/lib/api";
import { C, F, FS, card, inp, btn1, btn2 } from "./constants";
import { VoiceField } from "./VoiceField";
import { TimeRoutingBanner } from "./TimeRoutingBanner";
import { CreateTaskModal } from "./CreateTaskModal";
import type { TaskItem } from "./types";

interface WorkNote {
  id: string;
  taskId: string;
  date: string;
  note: string;
  progress: number;
  createdAt: string;
}

interface LocalTask {
  id: string;
  text: string;
  dueDate?: string | null;
  priority?: number | null;
  status?: string;
  overrideWarning?: string | null;
  createdAt?: string;
}

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calSide: boolean;
  onComplete: (task: TaskItem) => void;
  onSwitchToSales: () => void;
  onBackToSchedule: () => void;
  onPrint?: () => void;
}

const PCT_PRESETS = [10, 25, 50, 75, 90, 100];

function pctColor(p: number) {
  if (p >= 75) return C.grn;
  if (p >= 40) return C.amb;
  return C.red;
}
function pctBg(p: number) {
  if (p >= 75) return C.grnBg;
  if (p >= 40) return C.ambBg;
  return C.redBg;
}

const CAT_STYLE: Record<string, { bg: string; color: string }> = {
  SALES: { bg: "#D1FAE5", color: "#059669" },
  OPS:   { bg: "#FEF3C7", color: "#D97706" },
  TECH:  { bg: "#EDE9FE", color: "#7C3AED" },
  ADMIN: { bg: "#DBEAFE", color: "#2563EB" },
};
function catStyle(cat: string) {
  return CAT_STYLE[cat] ?? { bg: "#E0F2FE", color: "#0284C7" };
}

function ProgressBar({ pct, size = "md" }: { pct: number; size?: "sm" | "md" }) {
  const h = size === "sm" ? 5 : 7;
  return (
    <div style={{ background: "#E8E6E1", borderRadius: 99, overflow: "hidden", height: h }}>
      <div style={{
        height: "100%", width: `${Math.min(100, Math.max(0, pct))}%`,
        background: pct >= 75 ? C.grn : pct >= 40 ? C.amb : C.red,
        borderRadius: 99, transition: "width 0.5s ease",
      }} />
    </div>
  );
}

export function TasksView({ tasks, tDone, calSide, onComplete, onSwitchToSales, onBackToSchedule, onPrint }: Props) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());
  const [localRefreshing, setLocalRefreshing] = useState(false);
  const [workNoteTask, setWorkNoteTask] = useState<TaskItem | null>(null);
  const [workNoteText, setWorkNoteText] = useState("");
  const [workNotePct, setWorkNotePct] = useState<number>(25);
  const [customPct, setCustomPct] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteHistory, setNoteHistory] = useState<Record<string, WorkNote[]>>({});
  const [noteError, setNoteError] = useState("");

  const fetchLocalTasks = async () => {
    try {
      const rows = await get<LocalTask[]>("/tasks/local");
      setLocalTasks(rows);
    } catch { /* ok */ }
  };

  useEffect(() => { fetchLocalTasks(); }, []);

  const refreshLocalTasks = async () => {
    setLocalRefreshing(true);
    await fetchLocalTasks();
    setLocalRefreshing(false);
  };

  const completeLocalTask = async (id: string) => {
    setLocalDone(prev => new Set([...prev, id]));
    try {
      await patch(`/tasks/local/${id}`, { status: "done" });
    } catch { /* optimistic, ignore */ }
  };

  const doneCount = Object.values(tDone).filter(Boolean).length;
  const activeTasks = tasks.filter(t => !tDone[t.id]);
  const doneTasks = tasks.filter(t => tDone[t.id]);
  const focusTasks = activeTasks.slice(0, 3);
  const queueTasks = activeTasks.slice(3);

  const latestPct = (taskId: string) => {
    const notes = noteHistory[taskId];
    if (!notes || notes.length === 0) return 0;
    return notes[notes.length - 1].progress ?? 0;
  };

  const openWork = async (task: TaskItem) => {
    setWorkNoteTask(task);
    setWorkNoteText("");
    setNoteError("");
    const cur = latestPct(task.id);
    setWorkNotePct(cur || 25);
    setCustomPct("");
    if (!noteHistory[task.id]) {
      try {
        const notes = await get<WorkNote[]>(`/tasks/work-notes/${encodeURIComponent(task.id)}`);
        setNoteHistory(prev => ({ ...prev, [task.id]: notes }));
        const latest = notes.length ? (notes[notes.length - 1].progress ?? 0) : 25;
        setWorkNotePct(latest || 25);
      } catch { /* ok */ }
    }
  };

  const saveWorkNote = async () => {
    if (!workNoteTask || !workNoteText.trim()) return;
    setSavingNote(true);
    setNoteError("");
    const finalPct = customPct !== "" ? Math.min(100, Math.max(0, parseInt(customPct) || 0)) : workNotePct;
    try {
      const note = await post<WorkNote>("/tasks/work-note", {
        taskId: workNoteTask.id,
        note: workNoteText.trim(),
        progress: finalPct,
      });
      setNoteHistory(prev => ({
        ...prev,
        [workNoteTask.id]: [...(prev[workNoteTask.id] || []), note],
      }));
      setWorkNoteText("");
      setWorkNoteTask(null);
    } catch {
      setNoteError("Failed to save — try again.");
    }
    setSavingNote(false);
  };

  const activeLocalTasks = localTasks.filter(t => !localDone.has(t.id));
  const totalTasks = tasks.length + activeLocalTasks.length;
  const totalDone = doneCount + (localTasks.length - activeLocalTasks.length);
  const overallPct = totalTasks > 0 ? Math.round((totalDone / totalTasks) * 100) : 0;

  return (
    <>
      <div style={{ maxWidth: 580, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
        <TimeRoutingBanner />

        {/* ── Overall header card ─────────────────────────── */}
        <div style={{
          ...card, marginBottom: 18,
          background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)",
          border: "none", color: "#fff",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5, color: "rgba(255,255,255,0.5)", marginBottom: 2 }}>Today's Tasks</div>
              <div style={{ fontFamily: FS, fontSize: 22, fontWeight: 800, color: "#fff" }}>
                {totalDone} of {totalTasks} done
              </div>
            </div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
              <div style={{ fontSize: 32, fontWeight: 900, color: overallPct >= 75 ? "#34D399" : overallPct >= 40 ? "#FBBF24" : "#F87171" }}>
                {overallPct}%
              </div>
              <button
                onClick={() => setShowCreateTask(true)}
                style={{ padding: "5px 12px", borderRadius: 8, border: "2px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 700, fontFamily: F }}
              >
                + New Task
              </button>
            </div>
          </div>
          <ProgressBar pct={overallPct} />
        </div>

        {/* ── My Live Tasks (created via + New Task) ─────── */}
        {(activeLocalTasks.length > 0 || localRefreshing) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, paddingLeft: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.blu }}>
                ⚡ My Tasks — {activeLocalTasks.length} active
              </div>
              <button
                onClick={refreshLocalTasks}
                disabled={localRefreshing}
                style={{ background: "none", border: "none", cursor: localRefreshing ? "default" : "pointer", fontSize: 15, color: C.blu, padding: "0 2px", opacity: localRefreshing ? 0.5 : 1, animation: localRefreshing ? "spin 1s linear infinite" : "none" }}
              >↻</button>
            </div>
            {activeLocalTasks.map(t => {
              const done = localDone.has(t.id);
              return (
                <div key={t.id} style={{
                  display: "flex", alignItems: "flex-start", gap: 12,
                  padding: "14px 16px", marginBottom: 8, borderRadius: 14,
                  background: done ? C.grnBg : "#F0F7FF",
                  border: `1.5px solid ${done ? C.grn : C.blu}33`,
                  borderLeft: `4px solid ${done ? C.grn : C.blu}`,
                  opacity: done ? 0.6 : 1,
                }}>
                  <button
                    onClick={() => !done && completeLocalTask(t.id)}
                    style={{
                      width: 22, height: 22, borderRadius: "50%", border: `2px solid ${done ? C.grn : C.blu}`,
                      background: done ? C.grn : "transparent", color: done ? "#fff" : C.blu,
                      cursor: done ? "default" : "pointer", flexShrink: 0,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 900, padding: 0,
                    }}
                  >{done ? "✓" : ""}</button>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: done ? C.grn : C.tx, textDecoration: done ? "line-through" : "none", lineHeight: 1.4 }}>{t.text}</div>
                    {t.dueDate && (
                      <div style={{ fontSize: 11, color: C.mut, marginTop: 3 }}>
                        Due: {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    )}
                    {t.overrideWarning && <div style={{ fontSize: 11, color: C.amb, marginTop: 2 }}>⚠️ {t.overrideWarning}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Focus Zone ─────────────────────────────────── */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.sub, marginBottom: 10, paddingLeft: 4 }}>
            🎯 Focus Zone — top {Math.min(3, focusTasks.length)}
          </div>

          {focusTasks.length === 0 && (
            <div style={{ ...card, textAlign: "center", padding: "32px 20px", background: C.grnBg, border: `2px solid ${C.grn}33` }}>
              <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
              <div style={{ fontFamily: FS, fontSize: 18, fontWeight: 800, color: C.grn }}>All clear!</div>
              <div style={{ fontSize: 13, color: C.sub, marginTop: 4 }}>Every task is done for today.</div>
            </div>
          )}

          {focusTasks.map((t, idx) => {
            const pct = latestPct(t.id);
            const cs = catStyle(t.cat);
            return (
              <div key={t.id} style={{
                ...card,
                marginBottom: 12,
                border: `1.5px solid ${cs.color}22`,
                padding: "16px 18px",
              }}>
                {/* Top row: category pill + priority number */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 10px", borderRadius: 99,
                    background: cs.bg, color: cs.color,
                    fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1,
                  }}>
                    {t.cat}
                  </span>
                  <div style={{
                    width: 28, height: 28, borderRadius: 99,
                    background: cs.color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 900, flexShrink: 0,
                  }}>
                    {idx + 1}
                  </div>
                </div>

                {/* Task text */}
                <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, lineHeight: 1.4, marginBottom: 12 }}>{t.text}</div>

                {/* Progress bar */}
                <div style={{ marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: C.mut, fontWeight: 600 }}>Progress</span>
                    {pct > 0 && (
                      <span style={{
                        fontSize: 12, fontWeight: 800,
                        color: pctColor(pct),
                        background: pctBg(pct),
                        padding: "1px 8px", borderRadius: 99,
                      }}>
                        {pct}%
                      </span>
                    )}
                    {pct === 0 && <span style={{ fontSize: 11, color: C.mut }}>Not started</span>}
                  </div>
                  <ProgressBar pct={pct} />
                </div>

                {/* Action buttons */}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button
                    onClick={() => t.sales ? onSwitchToSales() : onComplete(t)}
                    style={{
                      flex: 1, padding: "10px 0", borderRadius: 12,
                      border: "none", background: C.grn, color: "#fff",
                      fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: F,
                      boxShadow: `0 4px 12px ${C.grn}44`,
                    }}>
                    {t.sales ? "→ Sales" : "✅ Done"}
                  </button>
                  {!t.sales && (
                    <button
                      onClick={() => openWork(t)}
                      style={{
                        flex: 1, padding: "10px 0", borderRadius: 12,
                        border: `2px solid ${cs.color}`,
                        background: cs.bg, color: cs.color,
                        fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: F,
                      }}>
                      ⚡ Work on it
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Queue ──────────────────────────────────────── */}
        {queueTasks.length > 0 && (
          <div style={{ ...card, marginBottom: 16, padding: "14px 18px" }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.sub, marginBottom: 10 }}>
              ⏳ Up Next ({queueTasks.length})
            </div>
            {queueTasks.map(t => {
              const cs = catStyle(t.cat);
              const pct = latestPct(t.id);
              return (
                <div key={t.id} style={{
                  display: "flex", gap: 10, alignItems: "center",
                  padding: "10px 12px", marginBottom: 6,
                  background: "#FAFAF8", borderRadius: 12,
                  border: `1px solid ${C.brd}`,
                }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 99,
                    background: cs.bg, color: cs.color,
                    fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.8,
                    flexShrink: 0,
                  }}>{t.cat}</span>
                  <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.sub, lineHeight: 1.3 }}>{t.text}</div>
                  {pct > 0 && (
                    <span style={{ fontSize: 11, fontWeight: 800, color: pctColor(pct), flexShrink: 0 }}>{pct}%</span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Done ──────────────────────────────────────── */}
        {doneTasks.length > 0 && (
          <div style={{ ...card, marginBottom: 16, padding: "14px 18px", opacity: 0.75 }}>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.grn, marginBottom: 10 }}>
              ✅ Done Today ({doneTasks.length})
            </div>
            {doneTasks.map(t => (
              <div key={t.id} style={{
                display: "flex", gap: 10, alignItems: "center",
                padding: "9px 12px", marginBottom: 5,
                background: C.grnBg, borderRadius: 10,
              }}>
                <span style={{ color: C.grn, fontSize: 15, flexShrink: 0 }}>✓</span>
                <div style={{ fontSize: 13, color: C.sub, textDecoration: "line-through", flex: 1 }}>{t.text}</div>
                <button onClick={() => onComplete(t)} style={{ fontSize: 11, color: C.mut, background: "none", border: "none", cursor: "pointer", fontFamily: F, flexShrink: 0 }}>undo</button>
              </div>
            ))}
          </div>
        )}


        <button onClick={onSwitchToSales} style={{ ...btn2, width: "100%", marginBottom: 10, borderRadius: 12, padding: "12px 0", fontWeight: 700 }}>📞 Sales Mode</button>
        <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
          <button onClick={onBackToSchedule} style={{ ...btn2, flex: 1, borderRadius: 12, color: C.mut }}>← Schedule</button>
          {onPrint && <button onClick={onPrint} style={{ ...btn2, flex: 1, borderRadius: 12 }}>🖨 Print Sheet</button>}
        </div>
      </div>

      {/* ── Create Task Modal ─────────────────────────────── */}
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        onSave={task => {
          setLocalTasks(prev => [...prev, task as LocalTask]);
          setShowCreateTask(false);
        }}
      />

      {/* ── Work on it Modal ──────────────────────────── */}
      {workNoteTask && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 10000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
          onClick={() => setWorkNoteTask(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: C.card, borderRadius: "24px 24px 0 0",
              padding: "28px 24px 36px", width: "100%", maxWidth: 540,
              maxHeight: "90vh", overflowY: "auto",
            }}
          >
            {/* Handle bar */}
            <div style={{ width: 40, height: 4, borderRadius: 99, background: "#D0CEC8", margin: "0 auto 20px" }} />

            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: C.sub, marginBottom: 4 }}>⚡ Log Progress</div>
            <div style={{ fontFamily: FS, fontSize: 17, fontWeight: 700, color: C.tx, lineHeight: 1.4, marginBottom: 20 }}>
              {workNoteTask.text}
            </div>

            {/* Current progress preview */}
            {(() => {
              const cur = latestPct(workNoteTask.id);
              const finalPct = customPct !== "" ? Math.min(100, Math.max(0, parseInt(customPct) || 0)) : workNotePct;
              return (
                <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: pctBg(finalPct), border: `1.5px solid ${pctColor(finalPct)}33` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: pctColor(finalPct) }}>
                      {cur > 0 ? `Was ${cur}% → now` : "Setting progress to"}
                    </span>
                    <span style={{ fontSize: 28, fontWeight: 900, color: pctColor(finalPct) }}>{finalPct}%</span>
                  </div>
                  <ProgressBar pct={finalPct} />
                </div>
              );
            })()}

            {/* Preset % pills */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 10 }}>How far along?</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
              {PCT_PRESETS.map(p => {
                const selected = customPct === "" && workNotePct === p;
                const cs = catStyle(workNoteTask.cat);
                return (
                  <button
                    key={p}
                    onClick={() => { setWorkNotePct(p); setCustomPct(""); }}
                    style={{
                      padding: "12px 0", borderRadius: 12, fontFamily: F,
                      fontSize: 16, fontWeight: 900,
                      border: selected ? `2.5px solid ${cs.color}` : `2px solid ${C.brd}`,
                      background: selected ? cs.bg : "#FAFAF8",
                      color: selected ? cs.color : C.sub,
                      cursor: "pointer", transition: "all 0.12s",
                    }}>
                    {p}%
                  </button>
                );
              })}
            </div>

            {/* Custom % input */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
              <span style={{ fontSize: 12, color: C.mut, flexShrink: 0 }}>Custom:</span>
              <input
                type="number"
                min={0}
                max={100}
                value={customPct}
                onChange={e => setCustomPct(e.target.value)}
                placeholder="0–100"
                style={{ ...inp, width: 80, textAlign: "center", fontWeight: 700, fontSize: 15 }}
              />
              <span style={{ fontSize: 13, color: C.sub }}>%</span>
            </div>

            {/* Notes */}
            <div style={{ fontSize: 12, fontWeight: 700, color: C.sub, marginBottom: 8 }}>What did you work on?</div>
            <VoiceField
              as="textarea"
              value={workNoteText}
              onChange={setWorkNoteText}
              placeholder="e.g. Called Fernando, he's reviewing the contract…"
              autoFocus
              style={{ ...inp, minHeight: 80, resize: "vertical", marginBottom: 12, fontSize: 14 }}
            />

            {noteError && (
              <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 10, background: C.redBg, color: C.red, fontSize: 12, fontWeight: 600 }}>
                {noteError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setWorkNoteTask(null)}
                style={{ ...btn2, flex: 1, borderRadius: 14, padding: "13px 0", fontWeight: 700 }}>
                Cancel
              </button>
              <button
                onClick={saveWorkNote}
                disabled={savingNote || !workNoteText.trim()}
                style={{
                  ...btn1, flex: 2, borderRadius: 14, padding: "13px 0",
                  fontWeight: 800, fontSize: 15,
                  opacity: savingNote || !workNoteText.trim() ? 0.5 : 1,
                  cursor: savingNote || !workNoteText.trim() ? "not-allowed" : "pointer",
                  boxShadow: workNoteText.trim() ? `0 4px 16px ${C.tx}33` : "none",
                }}>
                {savingNote ? "Saving…" : "Log Progress →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
