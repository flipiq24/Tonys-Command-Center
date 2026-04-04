import { useState, useEffect } from "react";
import { post, get } from "@/lib/api";
import { C, F, FS, card, inp, btn1, btn2 } from "./constants";
import { VoiceInput } from "./VoiceInput";
import { TimeRoutingBanner } from "./TimeRoutingBanner";
import type { TaskItem } from "./types";

interface WorkNote {
  id: string;
  taskId: string;
  date: string;
  note: string;
  createdAt: string;
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

export function TasksView({ tasks, tDone, calSide, onComplete, onSwitchToSales, onBackToSchedule, onPrint }: Props) {
  const [workNoteTask, setWorkNoteTask] = useState<TaskItem | null>(null);
  const [workNoteText, setWorkNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteHistory, setNoteHistory] = useState<Record<string, WorkNote[]>>({});
  const [noteError, setNoteError] = useState("");
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const doneCount = Object.values(tDone).filter(Boolean).length;
  const activeTasks = tasks.filter(t => !tDone[t.id]);
  const doneTasks = tasks.filter(t => tDone[t.id]);

  const focusTasks = activeTasks.slice(0, 3);
  const queueTasks = activeTasks.slice(3);

  const catColor = (cat: string) =>
    cat === "SALES" ? C.grn : cat === "OPS" ? C.amb : cat === "TECH" ? "#7B1FA2" : C.blu;

  const openWorkNote = async (task: TaskItem) => {
    setWorkNoteTask(task);
    setWorkNoteText("");
    setNoteError("");
    if (!noteHistory[task.id]) {
      try {
        const notes = await get<WorkNote[]>(`/tasks/work-notes/${encodeURIComponent(task.id)}`);
        setNoteHistory(prev => ({ ...prev, [task.id]: notes }));
      } catch { /* ok */ }
    }
  };

  const saveWorkNote = async () => {
    if (!workNoteTask || !workNoteText.trim()) return;
    setSavingNote(true);
    setNoteError("");
    try {
      const note = await post<WorkNote>("/tasks/work-note", {
        taskId: workNoteTask.id,
        note: workNoteText.trim(),
      });
      setNoteHistory(prev => ({
        ...prev,
        [workNoteTask.id]: [...(prev[workNoteTask.id] || []), note],
      }));
      setWorkNoteText("");
      setWorkNoteTask(null);
    } catch {
      setNoteError("Failed to save note. Try again.");
    }
    setSavingNote(false);
  };

  const historyCount = (taskId: string) => (noteHistory[taskId] || []).length;

  return (
    <>
      <div style={{ maxWidth: 580, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
        <TimeRoutingBanner />

        {/* ── Focus Zone (Top 3) ─────────────────────────── */}
        <div style={{ ...card, marginBottom: 16, border: `2px solid ${C.grn}22`, background: C.grnBg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <h3 style={{ fontFamily: FS, fontSize: 18, margin: 0 }}>Focus Zone</h3>
              <div style={{ fontSize: 12, color: C.grn, fontWeight: 700, marginTop: 2 }}>Your next 3 — execute in order</div>
            </div>
            <span style={{ fontSize: 13, color: C.mut }}>{doneCount}/{tasks.length} done</span>
          </div>

          {focusTasks.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: C.grn, fontWeight: 700, fontSize: 15 }}>
              🎉 All tasks complete!
            </div>
          )}

          {focusTasks.map((t, idx) => (
            <div key={t.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "14px 16px", background: C.card, borderRadius: 12, borderLeft: `4px solid ${catColor(t.cat)}` }}>
                <div style={{ width: 26, height: 26, borderRadius: 8, background: catColor(t.cat), color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1 }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: catColor(t.cat), textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{t.cat}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, lineHeight: 1.4 }}>{t.text}</div>
                  {historyCount(t.id) > 0 && (
                    <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>
                      📝 Last worked: {noteHistory[t.id]?.[noteHistory[t.id].length - 1]?.date}
                      <span style={{ marginLeft: 6, cursor: "pointer", color: C.blu, textDecoration: "underline" }}
                        onClick={() => setExpandedHistory(p => ({ ...p, [t.id]: !p[t.id] }))}>
                        {expandedHistory[t.id] ? "hide" : `${historyCount(t.id)} note${historyCount(t.id) > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  )}
                  {expandedHistory[t.id] && (noteHistory[t.id] || []).map(n => (
                    <div key={n.id} style={{ fontSize: 11, color: C.sub, marginTop: 4, paddingLeft: 8, borderLeft: `2px solid ${C.brd}` }}>
                      <span style={{ fontWeight: 700 }}>{n.date}:</span> {n.note}
                    </div>
                  ))}
                </div>
                {t.sales && <span style={{ fontSize: 11, color: C.red, fontWeight: 700, flexShrink: 0 }}>→ Sales</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 5, paddingLeft: 4 }}>
                <button
                  onClick={() => t.sales ? onSwitchToSales() : onComplete(t)}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `2px solid ${C.grn}`, background: C.grnBg, color: C.grn, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: F }}>
                  ✅ {t.sales ? "Go to Sales" : "Completed"}
                </button>
                {!t.sales && (
                  <button
                    onClick={() => openWorkNote(t)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `2px solid ${C.brd}`, background: C.card, color: C.tx, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: F }}>
                    📝 Worked on it
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── Queue (tasks 4+) ───────────────────────────── */}
        {queueTasks.length > 0 && (
          <div style={{ ...card, marginBottom: 16 }}>
            <h4 style={{ fontFamily: FS, fontSize: 15, margin: "0 0 12px", color: C.sub }}>Up Next ({queueTasks.length})</h4>
            {queueTasks.map(t => (
              <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "11px 14px", marginBottom: 6, background: "#FAFAF8", borderRadius: 10, borderLeft: `3px solid ${catColor(t.cat)}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: catColor(t.cat), textTransform: "uppercase", letterSpacing: 1 }}>{t.cat}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.sub }}>{t.text}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Done ──────────────────────────────────────── */}
        {doneTasks.length > 0 && (
          <div style={{ ...card, marginBottom: 16, opacity: 0.7 }}>
            <h4 style={{ fontFamily: FS, fontSize: 15, margin: "0 0 10px", color: C.mut }}>Done Today ({doneTasks.length})</h4>
            {doneTasks.map(t => (
              <div key={t.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "9px 12px", marginBottom: 4, background: C.grnBg, borderRadius: 8, opacity: 0.7 }}>
                <span style={{ color: C.grn, fontSize: 14 }}>✓</span>
                <div style={{ fontSize: 13, color: C.sub, textDecoration: "line-through", flex: 1 }}>{t.text}</div>
                <button onClick={() => onComplete(t)} style={{ fontSize: 10, color: C.mut, background: "none", border: "none", cursor: "pointer", fontFamily: F }}>undo</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={onSwitchToSales} style={{ ...btn2, width: "100%", marginBottom: 10 }}>📞 Sales Mode</button>
        <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
          <button onClick={onBackToSchedule} style={{ ...btn2, flex: 1, color: C.mut }}>← Schedule</button>
          {onPrint && <button onClick={onPrint} style={{ ...btn2, flex: 1 }}>🖨 Print Sheet</button>}
        </div>
      </div>

      {/* ── Work Note Modal ──────────────────────────────── */}
      {workNoteTask && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setWorkNoteTask(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 16, padding: 28, width: 460, maxWidth: "92vw" }}>
            <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>📝 Worked on it</h3>
            <div style={{ fontSize: 12, color: C.mut, marginBottom: 4 }}>{workNoteTask.text}</div>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 16 }}>Task stays active. Note logged with today's date.</div>

            {(noteHistory[workNoteTask.id] || []).length > 0 && (
              <div style={{ background: "#FAFAF8", borderRadius: 10, padding: "10px 14px", marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Previous notes</div>
                {noteHistory[workNoteTask.id].slice(-3).map(n => (
                  <div key={n.id} style={{ fontSize: 12, color: C.sub, marginBottom: 6, paddingBottom: 6, borderBottom: `1px solid ${C.brd}` }}>
                    <span style={{ fontWeight: 700, color: C.tx }}>{n.date}: </span>{n.note}
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
              <textarea
                value={workNoteText}
                onChange={e => setWorkNoteText(e.target.value)}
                placeholder="What did you do today? e.g. Called Fernando, he's reviewing the contract..."
                autoFocus
                style={{ ...inp, minHeight: 80, resize: "vertical", flex: 1 }}
              />
              <VoiceInput onTranscript={t => setWorkNoteText(prev => prev ? prev + " " + t : t)} size={36} />
            </div>

            {noteError && <div style={{ marginBottom: 10, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{noteError}</div>}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setWorkNoteTask(null)} style={{ ...btn2, flex: 1 }}>Cancel</button>
              <button onClick={saveWorkNote} disabled={savingNote || !workNoteText.trim()}
                style={{ ...btn1, flex: 2, opacity: savingNote || !workNoteText.trim() ? 0.5 : 1 }}>
                {savingNote ? "Saving..." : "Log Progress"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
