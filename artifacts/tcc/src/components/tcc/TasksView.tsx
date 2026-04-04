import { useState, useEffect } from "react";
import { post, get, patch } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
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

function nextWeekdayLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1); // Sunday → Monday
  if (day === 6) d.setDate(d.getDate() + 2); // Saturday → Monday
  return d.toLocaleDateString("en-US", { weekday: "long" });
}

const ROW: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  padding: "14px 0",
  borderBottom: `1px solid ${C.brd}`,
};

const CIRCLE_BTN: React.CSSProperties = {
  width: 20, height: 20, borderRadius: "50%",
  border: `1.5px solid #999`,
  background: "transparent", flexShrink: 0, marginTop: 2,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 11, color: "#fff", padding: 0,
};

export function TasksView({ tasks, tDone, calSide, onComplete, onSwitchToSales, onBackToSchedule, onPrint }: Props) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());
  const [workNoteTask, setWorkNoteTask] = useState<TaskItem | null>(null);
  const [workNoteText, setWorkNoteText] = useState("");
  const [workNotePct, setWorkNotePct] = useState<string>("25");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  // taskId → latest work note from today
  const [todayNotes, setTodayNotes] = useState<Record<string, WorkNote>>({});

  useEffect(() => {
    get<LocalTask[]>("/tasks/local").then(setLocalTasks).catch(() => {});
    get<WorkNote[]>("/tasks/work-notes-today").then(notes => {
      const map: Record<string, WorkNote> = {};
      for (const n of notes) map[n.taskId] = n; // last one wins
      setTodayNotes(map);
    }).catch(() => {});
  }, []);

  const completeLocalTask = async (id: string) => {
    setLocalDone(prev => new Set([...prev, id]));
    await patch(`/tasks/local/${id}`, { status: "done" }).catch(() => {});
  };

  const openWork = (task: TaskItem) => {
    setWorkNoteTask(task);
    setWorkNoteText("");
    setNoteError("");
    const prev = todayNotes[task.id];
    setWorkNotePct(String(prev?.progress ?? 25));
  };

  const saveWorkNote = async () => {
    if (!workNoteTask || !workNoteText.trim()) return;
    setSavingNote(true);
    setNoteError("");
    const pct = Math.min(100, Math.max(0, parseInt(workNotePct) || 0));
    try {
      const note = await post<WorkNote>("/tasks/work-note", {
        taskId: workNoteTask.id,
        note: workNoteText.trim(),
        progress: pct,
      });
      setTodayNotes(prev => ({ ...prev, [workNoteTask.id]: note }));
      setWorkNoteTask(null);
    } catch {
      setNoteError("Failed to save — try again.");
    }
    setSavingNote(false);
  };

  const activeTasks = tasks.filter(t => !tDone[t.id]);
  const doneTasks   = tasks.filter(t => tDone[t.id]);
  const activeLocalTasks = localTasks.filter(t => t.status !== "done" && !localDone.has(t.id));
  const doneCount = Object.values(tDone).filter(Boolean).length;
  const totalTasks = tasks.length + activeLocalTasks.length;
  const totalDone  = doneCount + (localTasks.length - activeLocalTasks.length);

  return (
    <>
      <div style={{
        maxWidth: 560, margin: "0 auto", padding: "0 20px 60px",
        marginRight: calSide ? 320 : undefined, transition: "margin 0.2s",
        fontFamily: F,
      }}>
        <TimeRoutingBanner />

        {/* ── Header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "20px 0 16px",
          borderBottom: `2px solid ${C.tx}`,
          marginBottom: 0,
        }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FS, color: C.tx }}>Tasks</span>
            <span style={{ fontSize: 14, color: "#999", marginLeft: 10 }}>
              {totalDone} of {totalTasks} done
            </span>
          </div>
          <button
            onClick={() => setShowCreateTask(true)}
            style={{
              background: "none", border: `1px solid ${C.brd}`, color: C.tx,
              borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: F,
            }}
          >+ New</button>
        </div>

        {/* ── My Tasks (local) ── */}
        {activeLocalTasks.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "16px 0 4px" }}>
              My Tasks
            </div>
            {activeLocalTasks.map(t => (
              <div key={t.id} style={ROW}>
                <button
                  onClick={() => completeLocalTask(t.id)}
                  style={CIRCLE_BTN}
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, lineHeight: 1.45 }}>{t.text}</div>
                  {t.dueDate && (
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                      Due {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  )}
                  {t.overrideWarning && (
                    <div style={{ fontSize: 11, color: C.red, marginTop: 2 }}>{t.overrideWarning}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Active Tasks ── */}
        {activeTasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "16px 0 4px" }}>
              Today
            </div>
            {activeTasks.map(t => {
              const workedOnToday = todayNotes[t.id];
              const pct = workedOnToday?.progress ?? 0;
              const isUrgent = t.cat === "SALES" || (t as any).urgent;

              return (
                <div key={t.id} style={{ ...ROW, opacity: 1 }}>
                  <button
                    onClick={() => t.sales ? onSwitchToSales() : onComplete(t)}
                    style={{
                      ...CIRCLE_BTN,
                      borderColor: isUrgent ? C.red : "#999",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 14, fontWeight: 600, lineHeight: 1.45,
                      color: isUrgent ? C.red : C.tx,
                    }}>
                      {t.text}
                    </div>

                    {/* Worked on today indicator */}
                    {workedOnToday && (
                      <div style={{ marginTop: 5 }}>
                        <div style={{ fontSize: 11, color: "#999" }}>
                          In progress ({pct}%) — continuing {nextWeekdayLabel()}
                        </div>
                        {workedOnToday.note && (
                          <div style={{
                            fontSize: 12, color: "#555", marginTop: 3,
                            padding: "5px 8px",
                            background: "#F5F5F5",
                            borderRadius: 6,
                            borderLeft: `2px solid #CCC`,
                          }}>
                            {workedOnToday.note.length > 80
                              ? workedOnToday.note.slice(0, 80) + "…"
                              : workedOnToday.note}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Progress bar — only if has progress */}
                    {pct > 0 && (
                      <div style={{
                        height: 2, background: "#E5E5E5", borderRadius: 99,
                        marginTop: 8, overflow: "hidden",
                      }}>
                        <div style={{
                          height: "100%", width: `${pct}%`,
                          background: pct === 100 ? "#2E7D32" : "#111",
                          borderRadius: 99,
                        }} />
                      </div>
                    )}
                  </div>

                  {/* Single action: Log progress */}
                  {!t.sales && (
                    <button
                      onClick={() => openWork(t)}
                      style={{
                        background: "none", border: "none",
                        color: "#999", fontSize: 12, fontWeight: 600,
                        cursor: "pointer", fontFamily: F,
                        padding: "0 4px", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >Log</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTasks.length === 0 && activeLocalTasks.length === 0 && (
          <div style={{
            padding: "48px 0", textAlign: "center", color: "#999", fontSize: 14,
          }}>
            All done for today.
          </div>
        )}

        {/* ── Done ── */}
        {doneTasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "20px 0 4px" }}>
              Done
            </div>
            {doneTasks.map(t => (
              <div key={t.id} style={{ ...ROW, opacity: 0.45 }}>
                <button
                  style={{ ...CIRCLE_BTN, borderColor: "#999", background: "#111" }}
                  onClick={() => onComplete(t)}
                >✓</button>
                <div style={{ fontSize: 14, color: "#999", textDecoration: "line-through", flex: 1, lineHeight: 1.45 }}>
                  {t.text}
                </div>
                <button
                  onClick={() => onComplete(t)}
                  style={{ background: "none", border: "none", color: "#BBB", fontSize: 11, cursor: "pointer", fontFamily: F, flexShrink: 0 }}
                >undo</button>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer nav ── */}
        <div style={{ display: "flex", gap: 12, paddingTop: 32, borderTop: `1px solid ${C.brd}`, marginTop: 24 }}>
          <button onClick={onBackToSchedule} style={{ ...btn2, flex: 1 }}>← Schedule</button>
          <button onClick={onSwitchToSales} style={{ ...btn2, flex: 1 }}>Sales</button>
          {onPrint && <button onClick={onPrint} style={{ ...btn2, flex: 1 }}>Print</button>}
        </div>
      </div>

      {/* ── Create Task Modal ── */}
      <CreateTaskModal
        open={showCreateTask}
        onClose={() => setShowCreateTask(false)}
        onSave={task => {
          setLocalTasks(prev => [...prev, task as LocalTask]);
          setShowCreateTask(false);
        }}
      />

      {/* ── Log Progress Modal ── */}
      {workNoteTask && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10000,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
          onClick={() => setWorkNoteTask(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 14, padding: "28px 24px",
              width: "100%", maxWidth: 480,
              boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
            }}
          >
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
              Log Progress
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, lineHeight: 1.4, marginBottom: 20 }}>
              {workNoteTask.text}
            </div>

            {/* Progress % */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <label style={{ fontSize: 13, color: "#666", flexShrink: 0 }}>How far along?</label>
              <input
                type="number"
                min={0}
                max={100}
                value={workNotePct}
                onChange={e => setWorkNotePct(e.target.value)}
                style={{
                  ...inp, width: 70, textAlign: "center", fontSize: 16, fontWeight: 700,
                }}
              />
              <span style={{ fontSize: 13, color: "#666" }}>%</span>
            </div>

            {/* Notes */}
            <VoiceField
              as="textarea"
              value={workNoteText}
              onChange={setWorkNoteText}
              placeholder="What did you work on?"
              autoFocus
              style={{ ...inp, minHeight: 90, resize: "vertical", marginBottom: 14, fontSize: 14 }}
            />

            {/* Continuing tomorrow note */}
            {workNotePct !== "100" && (
              <div style={{
                fontSize: 12, color: "#888", background: "#F5F5F5",
                borderRadius: 8, padding: "8px 12px", marginBottom: 14,
              }}>
                This task will stay on your list — continuing {nextWeekdayLabel()}
              </div>
            )}

            {noteError && (
              <div style={{ color: C.red, fontSize: 12, marginBottom: 12 }}>{noteError}</div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setWorkNoteTask(null)} style={{ ...btn2, flex: 1 }}>
                Cancel
              </button>
              <button
                onClick={saveWorkNote}
                disabled={savingNote || !workNoteText.trim()}
                style={{ ...btn1, flex: 2, opacity: savingNote || !workNoteText.trim() ? 0.5 : 1 }}
              >
                {savingNote ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
