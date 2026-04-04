import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
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
  nextSessionDate?: string | null;
  driveFileId?: string | null;
  driveFileName?: string | null;
  driveLinkUrl?: string | null;
  createdAt: string;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink?: string;
  modifiedTime?: string;
}

interface LocalTask {
  id: string;
  text: string;
  dueDate?: string | null;
  priority?: number | null;
  status?: string;
  overrideWarning?: string | null;
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

function nextWeekdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1);
  if (day === 6) d.setDate(d.getDate() + 2);
  return d.toISOString().split("T")[0];
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

const ROW: React.CSSProperties = {
  display: "flex", alignItems: "flex-start", gap: 12,
  padding: "14px 0",
  borderBottom: `1px solid ${C.brd}`,
};

const CIRCLE: React.CSSProperties = {
  width: 20, height: 20, borderRadius: "50%",
  border: "1.5px solid #999", background: "transparent",
  flexShrink: 0, marginTop: 2, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 11, color: "#fff", padding: 0,
};

export function TasksView({ tasks, tDone, calSide, onComplete, onSwitchToSales, onBackToSchedule, onPrint }: Props) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());
  const [workNoteTask, setWorkNoteTask] = useState<TaskItem | null>(null);
  const [workNoteText, setWorkNoteText] = useState("");
  const [workNotePct, setWorkNotePct] = useState("25");
  const [nextSessionDate, setNextSessionDate] = useState(nextWeekdayDate());
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [todayNotes, setTodayNotes] = useState<Record<string, WorkNote>>({});

  // Drive search
  const [driveQuery, setDriveQuery] = useState("");
  const [driveResults, setDriveResults] = useState<DriveFile[]>([]);
  const [driveLoading, setDriveLoading] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFile | null>(null);
  const [showDriveResults, setShowDriveResults] = useState(false);
  const driveRef = useRef<HTMLDivElement>(null);
  const driveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    get<LocalTask[]>("/tasks/local").then(setLocalTasks).catch(() => {});
    get<WorkNote[]>("/tasks/work-notes-today").then(notes => {
      const map: Record<string, WorkNote> = {};
      for (const n of notes) map[n.taskId] = n;
      setTodayNotes(map);
    }).catch(() => {});
  }, []);

  // Close drive dropdown on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (driveRef.current && !driveRef.current.contains(e.target as Node))
        setShowDriveResults(false);
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  const handleDriveSearch = useCallback((val: string) => {
    setDriveQuery(val);
    setSelectedDriveFile(null);
    if (driveTimer.current) clearTimeout(driveTimer.current);
    if (val.length < 2) { setDriveResults([]); setShowDriveResults(false); return; }
    driveTimer.current = setTimeout(async () => {
      setDriveLoading(true);
      try {
        const results = await get<DriveFile[]>(`/drive/search?q=${encodeURIComponent(val)}`);
        setDriveResults(results);
        setShowDriveResults(results.length > 0);
      } catch { setDriveResults([]); setShowDriveResults(false); }
      finally { setDriveLoading(false); }
    }, 350);
  }, []);

  const selectDriveFile = (f: DriveFile) => {
    setSelectedDriveFile(f);
    setDriveQuery("");
    setDriveResults([]);
    setShowDriveResults(false);
  };

  const openWork = (task: TaskItem) => {
    setWorkNoteTask(task);
    setWorkNoteText("");
    setNoteError("");
    setWorkNotePct("25");
    setNextSessionDate(nextWeekdayDate());
    setSelectedDriveFile(null);
    setDriveQuery("");
    const prev = todayNotes[task.id];
    if (prev) setWorkNotePct(String(prev.progress ?? 25));
  };

  const completeLocalTask = async (id: string) => {
    setLocalDone(prev => new Set([...prev, id]));
    await patch(`/tasks/local/${id}`, { status: "done" }).catch(() => {});
  };

  const saveWorkNote = async () => {
    if (!workNoteTask || !workNoteText.trim()) return;
    const pct = Math.min(100, Math.max(0, parseInt(workNotePct) || 0));
    if (pct < 100 && !nextSessionDate) {
      setNoteError("Set a date to continue this task.");
      return;
    }
    setSavingNote(true);
    setNoteError("");
    try {
      const note = await post<WorkNote>("/tasks/work-note", {
        taskId: workNoteTask.id,
        note: workNoteText.trim(),
        progress: pct,
        nextSessionDate: pct < 100 ? nextSessionDate : undefined,
        driveFileId: selectedDriveFile?.id || undefined,
        driveFileName: selectedDriveFile?.name || undefined,
        driveLinkUrl: selectedDriveFile?.webViewLink || undefined,
      });
      setTodayNotes(prev => ({ ...prev, [workNoteTask.id]: note }));
      setWorkNoteTask(null);
    } catch (err) {
      setNoteError(String(err).replace("Error: POST /tasks/work-note failed: 400", "").trim() || "Failed to save — try again.");
    }
    setSavingNote(false);
  };

  const pct = parseInt(workNotePct) || 0;
  const activeTasks   = tasks.filter(t => !tDone[t.id]);
  const doneTasks     = tasks.filter(t => tDone[t.id]);
  const activeLocals  = localTasks.filter(t => t.status !== "done" && !localDone.has(t.id));
  const totalTasks    = tasks.length + activeLocals.length;
  const totalDone     = Object.values(tDone).filter(Boolean).length + (localTasks.length - activeLocals.length);

  return (
    <>
      <div style={{
        maxWidth: 560, margin: "0 auto", padding: "0 20px 60px",
        marginRight: calSide ? 320 : undefined, transition: "margin 0.2s", fontFamily: F,
      }}>
        <TimeRoutingBanner />

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "20px 0 16px", borderBottom: `2px solid ${C.tx}`,
        }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FS }}>Tasks</span>
            <span style={{ fontSize: 14, color: "#999", marginLeft: 10 }}>{totalDone} of {totalTasks} done</span>
          </div>
          <button onClick={() => setShowCreateTask(true)} style={{
            background: "none", border: `1px solid ${C.brd}`, color: C.tx,
            borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: F,
          }}>+ New</button>
        </div>

        {/* My Tasks (local) */}
        {activeLocals.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "16px 0 4px" }}>My Tasks</div>
            {activeLocals.map(t => (
              <div key={t.id} style={ROW}>
                <button onClick={() => completeLocalTask(t.id)} style={CIRCLE} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, lineHeight: 1.45 }}>{t.text}</div>
                  {t.dueDate && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>Due {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                  {t.overrideWarning && <div style={{ fontSize: 11, color: C.red, marginTop: 2 }}>{t.overrideWarning}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active Tasks */}
        {activeTasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "16px 0 4px" }}>Today</div>
            {activeTasks.map(t => {
              const worked = todayNotes[t.id];
              const progress = worked?.progress ?? 0;
              const isUrgent = t.cat === "SALES" || (t as any).urgent;
              return (
                <div key={t.id} style={ROW}>
                  <button
                    onClick={() => t.sales ? onSwitchToSales() : onComplete(t)}
                    style={{ ...CIRCLE, borderColor: isUrgent ? C.red : "#999" }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45, color: isUrgent ? C.red : C.tx }}>
                      {t.text}
                    </div>

                    {worked && (
                      <div style={{ marginTop: 5 }}>
                        <div style={{ fontSize: 11, color: "#888" }}>
                          In progress ({progress}%)
                          {worked.nextSessionDate ? ` — continuing ${fmtDate(worked.nextSessionDate)}` : ""}
                        </div>
                        {worked.note && (
                          <div style={{
                            fontSize: 12, color: "#555", marginTop: 3,
                            padding: "5px 8px", background: "#F5F5F5",
                            borderRadius: 6, borderLeft: "2px solid #CCC",
                          }}>
                            {worked.note.length > 80 ? worked.note.slice(0, 80) + "…" : worked.note}
                          </div>
                        )}
                        {worked.driveLinkUrl && (
                          <a
                            href={worked.driveLinkUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 4, fontSize: 11, color: C.blu, textDecoration: "none" }}
                          >
                            📄 {worked.driveFileName || "Drive file"}
                          </a>
                        )}
                      </div>
                    )}

                    {progress > 0 && (
                      <div style={{ height: 2, background: "#E5E5E5", borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: progress === 100 ? "#2E7D32" : "#111", borderRadius: 99 }} />
                      </div>
                    )}
                  </div>

                  {!t.sales && (
                    <button onClick={() => openWork(t)} style={{
                      background: "none", border: "none", color: "#999", fontSize: 12,
                      fontWeight: 600, cursor: "pointer", fontFamily: F, padding: "0 4px",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>Log</button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {activeTasks.length === 0 && activeLocals.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#999", fontSize: 14 }}>
            All done for today.
          </div>
        )}

        {/* Done */}
        {doneTasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "20px 0 4px" }}>Done</div>
            {doneTasks.map(t => (
              <div key={t.id} style={{ ...ROW, opacity: 0.45 }}>
                <button style={{ ...CIRCLE, borderColor: "#999", background: "#111" }} onClick={() => onComplete(t)}>✓</button>
                <div style={{ fontSize: 14, color: "#999", textDecoration: "line-through", flex: 1, lineHeight: 1.45 }}>{t.text}</div>
                <button onClick={() => onComplete(t)} style={{ background: "none", border: "none", color: "#BBB", fontSize: 11, cursor: "pointer", fontFamily: F, flexShrink: 0 }}>undo</button>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: 12, paddingTop: 32, borderTop: `1px solid ${C.brd}`, marginTop: 24 }}>
          <button onClick={onBackToSchedule} style={{ ...btn2, flex: 1 }}>← Schedule</button>
          <button onClick={onSwitchToSales} style={{ ...btn2, flex: 1 }}>Sales</button>
          {onPrint && <button onClick={onPrint} style={{ ...btn2, flex: 1 }}>Print</button>}
        </div>
      </div>

      <CreateTaskModal open={showCreateTask} onClose={() => setShowCreateTask(false)}
        onSave={task => { setLocalTasks(prev => [...prev, task as LocalTask]); setShowCreateTask(false); }} />

      {/* Log Progress Modal */}
      {workNoteTask && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setWorkNoteTask(null)}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 14, padding: "28px 24px",
            width: "100%", maxWidth: 480,
            boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
            display: "flex", flexDirection: "column", gap: 14,
          }}>
            <div>
              <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Log Progress</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, lineHeight: 1.4 }}>{workNoteTask.text}</div>
            </div>

            {/* % */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 13, color: "#666", flexShrink: 0 }}>How far along?</label>
              <input
                type="number" min={0} max={100}
                value={workNotePct}
                onChange={e => setWorkNotePct(e.target.value)}
                style={{ ...inp, width: 70, textAlign: "center", fontSize: 16, fontWeight: 700 }}
              />
              <span style={{ fontSize: 13, color: "#666" }}>%</span>
            </div>

            {/* Next session date — required when pct < 100 */}
            {pct < 100 && (
              <div>
                <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>
                  Continue this task on <span style={{ color: C.red }}>*</span>
                </label>
                <input
                  type="date"
                  value={nextSessionDate}
                  onChange={e => setNextSessionDate(e.target.value)}
                  required
                  style={{ ...inp, fontSize: 14 }}
                />
              </div>
            )}

            {/* Notes */}
            <div>
              <VoiceField
                as="textarea"
                value={workNoteText}
                onChange={setWorkNoteText}
                placeholder="What did you work on?"
                autoFocus
                style={{ ...inp, minHeight: 80, resize: "vertical", fontSize: 14 }}
              />
            </div>

            {/* Google Drive file */}
            <div ref={driveRef} style={{ position: "relative" }}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>Attach Google Drive file (optional)</label>

              {selectedDriveFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F5F5F5", borderRadius: 8, border: `1px solid ${C.brd}` }}>
                  <span style={{ fontSize: 13, flex: 1, color: C.tx, fontWeight: 600 }}>📄 {selectedDriveFile.name}</span>
                  <a href={selectedDriveFile.webViewLink} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 11, color: C.blu, textDecoration: "none" }}>Open ↗</a>
                  <button onClick={() => setSelectedDriveFile(null)} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <>
                  <div style={{ position: "relative" }}>
                    <input
                      value={driveQuery}
                      onChange={e => handleDriveSearch(e.target.value)}
                      onFocus={() => driveResults.length > 0 && setShowDriveResults(true)}
                      placeholder="Search Drive files…"
                      style={{ ...inp, fontSize: 14, paddingRight: driveLoading ? 36 : 14 }}
                    />
                    {driveLoading && (
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#999" }}>…</span>
                    )}
                  </div>
                  {showDriveResults && driveResults.length > 0 && (
                    <div style={{
                      position: "absolute", top: "100%", left: 0, right: 0, zIndex: 10,
                      background: "#fff", border: `1px solid ${C.brd}`, borderRadius: 10,
                      boxShadow: "0 4px 20px rgba(0,0,0,0.1)", maxHeight: 200, overflowY: "auto",
                    }}>
                      {driveResults.map(f => (
                        <div key={f.id}
                          onClick={() => selectDriveFile(f)}
                          style={{
                            padding: "10px 14px", cursor: "pointer", fontSize: 13,
                            borderBottom: `1px solid ${C.brd}`,
                            display: "flex", flexDirection: "column", gap: 2,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#F5F5F5")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                        >
                          <div style={{ fontWeight: 600, color: C.tx }}>📄 {f.name}</div>
                          {f.modifiedTime && (
                            <div style={{ fontSize: 11, color: "#999" }}>
                              Modified {new Date(f.modifiedTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {noteError && <div style={{ color: C.red, fontSize: 12 }}>{noteError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setWorkNoteTask(null)} style={{ ...btn2, flex: 1 }}>Cancel</button>
              <button
                onClick={saveWorkNote}
                disabled={savingNote || !workNoteText.trim() || (pct < 100 && !nextSessionDate)}
                style={{ ...btn1, flex: 2, opacity: (savingNote || !workNoteText.trim() || (pct < 100 && !nextSessionDate)) ? 0.5 : 1 }}
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
