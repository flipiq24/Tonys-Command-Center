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
  isFolder?: boolean;
  webViewLink?: string;
  modifiedTime?: string;
}

interface FolderCrumb { id: string; name: string; }

function driveIcon(f: DriveFile) {
  if (f.isFolder || f.mimeType === "application/vnd.google-apps.folder") return "📁";
  if (f.mimeType?.includes("spreadsheet")) return "📊";
  if (f.mimeType?.includes("document") || f.mimeType?.includes("word")) return "📝";
  if (f.mimeType?.includes("presentation") || f.mimeType?.includes("powerpoint")) return "📋";
  if (f.mimeType?.includes("pdf")) return "📕";
  if (f.mimeType?.includes("image")) return "🖼";
  return "📄";
}

function DriveRow({ item, onFolder, onFile }: { item: DriveFile; onFolder: (f: DriveFile) => void; onFile: (f: DriveFile) => void }) {
  const isFolder = item.isFolder || item.mimeType === "application/vnd.google-apps.folder";
  return (
    <div
      onClick={() => isFolder ? onFolder(item) : onFile(item)}
      style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 8 }}
      onMouseEnter={e => (e.currentTarget.style.background = "#F8F8F8")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{ fontSize: 15, flexShrink: 0 }}>{driveIcon(item)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: isFolder ? 600 : 400, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
        {!isFolder && item.modifiedTime && (
          <div style={{ fontSize: 11, color: "#999" }}>
            {new Date(item.modifiedTime).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>
      {isFolder && <span style={{ fontSize: 13, color: "#BBB" }}>›</span>}
    </div>
  );
}

interface LocalTask {
  id: string;
  text: string;
  dueDate?: string | null;
  priority?: number | null;
  status?: string;
  overrideWarning?: string | null;
  googleTaskId?: string | null;
  taskType?: string | null;
  size?: string | null;
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

interface TaskAlert {
  id: string;
  identifier: string;
  title: string;
  state: string;
  priority: number;
}

interface TaskAlerts {
  outOfSequence: TaskAlert[];
  missingDueDates: TaskAlert[];
}

export function TasksView({ tasks, tDone, calSide, onComplete, onSwitchToSales, onBackToSchedule, onPrint }: Props) {
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [localTasks, setLocalTasks] = useState<LocalTask[]>([]);
  const [localDone, setLocalDone] = useState<Set<string>>(new Set());
  const [alerts, setAlerts] = useState<TaskAlerts>({ outOfSequence: [], missingDueDates: [] });
  const [workNoteTask, setWorkNoteTask] = useState<TaskItem | null>(null);
  const [workNoteText, setWorkNoteText] = useState("");
  const [workNextSteps, setWorkNextSteps] = useState("");
  const [workNotePct, setWorkNotePct] = useState("25");
  const [nextSessionDate, setNextSessionDate] = useState(nextWeekdayDate());
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [todayNotes, setTodayNotes] = useState<Record<string, WorkNote>>({});
  const [refreshing, setRefreshing] = useState(false);

  // Drive picker
  const [driveQuery, setDriveQuery] = useState("");
  const [driveSearchResults, setDriveSearchResults] = useState<DriveFile[]>([]);
  const [driveSearchLoading, setDriveSearchLoading] = useState(false);
  const [selectedDriveFile, setSelectedDriveFile] = useState<DriveFile | null>(null);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const [driveFolderStack, setDriveFolderStack] = useState<FolderCrumb[]>([]);
  const [driveFolderItems, setDriveFolderItems] = useState<DriveFile[]>([]);
  const [driveFolderLoading, setDriveFolderLoading] = useState(false);
  const driveRef = useRef<HTMLDivElement>(null);
  const driveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadLocalTasks = useCallback(async (sync = false) => {
    try {
      if (sync) {
        setRefreshing(true);
        const fresh = await get<LocalTask[]>("/tasks/refresh");
        setLocalTasks(fresh);
      } else {
        const tasks = await get<LocalTask[]>("/tasks/local");
        setLocalTasks(tasks);
      }
    } catch { /* ignore */ } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLocalTasks(false);
    get<WorkNote[]>("/tasks/work-notes-today").then(notes => {
      const map: Record<string, WorkNote> = {};
      for (const n of notes) map[n.taskId] = n;
      setTodayNotes(map);
    }).catch(() => {});
    get<TaskAlerts>("/tasks/alerts").then(setAlerts).catch(() => {});
  }, [loadLocalTasks]);

  // Close drive picker on outside click
  useEffect(() => {
    function onClickOut(e: MouseEvent) {
      if (driveRef.current && !driveRef.current.contains(e.target as Node))
        setDrivePickerOpen(false);
    }
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, []);

  const loadFolder = useCallback(async (folderId: string) => {
    setDriveFolderLoading(true);
    try {
      const res = await get<{ folderId: string; folderName: string; items: DriveFile[] }>(
        `/drive/folder?folderId=${encodeURIComponent(folderId)}`
      );
      setDriveFolderItems(res.items);
    } catch {
      setDriveFolderItems([]);
    } finally {
      setDriveFolderLoading(false);
    }
  }, []);

  const handleDriveSearch = useCallback((val: string) => {
    setDriveQuery(val);
    if (driveTimer.current) clearTimeout(driveTimer.current);
    if (!val.trim()) { setDriveSearchResults([]); return; }
    driveTimer.current = setTimeout(async () => {
      setDriveSearchLoading(true);
      try {
        const results = await get<DriveFile[]>(`/drive/search?q=${encodeURIComponent(val)}`);
        setDriveSearchResults(results);
      } catch { setDriveSearchResults([]); }
      finally { setDriveSearchLoading(false); }
    }, 350);
  }, []);

  const selectDriveFile = (f: DriveFile) => {
    setSelectedDriveFile(f);
    setDrivePickerOpen(false);
    setDriveQuery("");
    setDriveSearchResults([]);
  };

  const navigateFolder = useCallback((item: DriveFile) => {
    setDriveFolderStack(prev => [...prev, { id: item.id, name: item.name }]);
    setDriveQuery("");
    setDriveSearchResults([]);
    loadFolder(item.id);
  }, [loadFolder]);

  const navigateBreadcrumb = useCallback((idx: number) => {
    if (idx < 0) {
      setDriveFolderStack([]);
      loadFolder("root");
    } else {
      const target = driveFolderStack[idx];
      setDriveFolderStack(prev => prev.slice(0, idx + 1));
      loadFolder(target.id);
    }
  }, [driveFolderStack, loadFolder]);

  const openWork = (task: TaskItem) => {
    setWorkNoteTask(task);
    setWorkNoteText("");
    setWorkNextSteps("");
    setNoteError("");
    setWorkNotePct("25");
    setNextSessionDate(nextWeekdayDate());
    setSelectedDriveFile(null);
    setDriveQuery("");
    setDriveSearchResults([]);
    setDrivePickerOpen(false);
    setDriveFolderStack([]);
    setDriveFolderItems([]);
    const prev = todayNotes[task.id];
    if (prev) setWorkNotePct(String(prev.progress ?? 25));
  };

  const completeLocalTask = async (id: string) => {
    setLocalDone(prev => new Set([...prev, id]));
    await patch(`/tasks/local/${id}`, { status: "done" }).catch(() => {});
    // Refresh list so Google-completed tasks also update
    setTimeout(() => loadLocalTasks(false), 300);
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
        nextSteps: workNextSteps.trim() || undefined,
        driveFileId: selectedDriveFile?.id || undefined,
        driveFileName: selectedDriveFile?.name || undefined,
        driveLinkUrl: selectedDriveFile?.webViewLink || undefined,
      });
      setTodayNotes(prev => ({ ...prev, [workNoteTask.id]: note }));
      setWorkNoteTask(null);
      setWorkNoteText("");
      setWorkNextSteps("");
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

        {/* Alert Cards */}
        {alerts.outOfSequence.length > 0 && (
          <div style={{ background: C.redBg, border: `1px solid ${C.red}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 12, marginTop: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.red, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              ⚠ Out-of-Sequence: Higher-Priority Items Blocked
            </div>
            {alerts.outOfSequence.map(item => (
              <div key={item.id} style={{ fontSize: 13, color: C.tx, padding: "3px 0", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.red, background: `${C.red}22`, padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>{item.identifier}</span>
                <span>{item.title}</span>
                <span style={{ fontSize: 11, color: C.mut, marginLeft: "auto", flexShrink: 0 }}>{item.state}</span>
              </div>
            ))}
          </div>
        )}

        {alerts.missingDueDates.length > 0 && (
          <div style={{ background: C.ambBg, border: `1px solid ${C.amb}44`, borderRadius: 10, padding: "12px 16px", marginBottom: 12, marginTop: alerts.outOfSequence.length > 0 ? 0 : 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amb, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 }}>
              📅 Linear Items Missing Due Dates ({alerts.missingDueDates.length})
            </div>
            {alerts.missingDueDates.slice(0, 5).map(item => (
              <div key={item.id} style={{ fontSize: 13, color: C.tx, padding: "3px 0", display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: C.amb, background: `${C.amb}22`, padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>{item.identifier}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</span>
              </div>
            ))}
            {alerts.missingDueDates.length > 5 && (
              <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>+{alerts.missingDueDates.length - 5} more</div>
            )}
          </div>
        )}

        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "baseline",
          padding: "20px 0 16px", borderBottom: `2px solid ${C.tx}`,
        }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FS }}>Tasks</span>
            <span style={{ fontSize: 14, color: "#999", marginLeft: 10 }}>{totalDone} of {totalTasks} done</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={() => loadLocalTasks(true)}
              disabled={refreshing}
              title="Sync with Google Tasks"
              style={{
                background: "none", border: `1px solid ${C.brd}`, color: C.sub,
                borderRadius: 6, padding: "5px 10px", fontSize: 14, cursor: refreshing ? "not-allowed" : "pointer",
                fontFamily: F, lineHeight: 1, opacity: refreshing ? 0.5 : 1,
                display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span style={{ display: "inline-block", animation: refreshing ? "spin 1s linear infinite" : "none" }}>↻</span>
            </button>
            <button onClick={() => setShowCreateTask(true)} style={{
              background: "none", border: `1px solid ${C.brd}`, color: C.tx,
              borderRadius: 6, padding: "5px 12px", fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: F,
            }}>+ New</button>
          </div>
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
                  <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, flexWrap: "wrap" }}>
                    {t.size && (
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.5,
                        padding: "2px 7px", borderRadius: 4,
                        background: t.size === "XL" ? "#2a1a1a" : t.size === "L" ? "#1a1a2a" : t.size === "M" ? "#1a2a1a" : "#2a2a2a",
                        color: t.size === "XL" ? C.red : t.size === "L" ? C.blu : t.size === "M" ? C.grn : C.sub,
                        border: `1px solid ${t.size === "XL" ? C.red + "40" : t.size === "L" ? C.blu + "40" : t.size === "M" ? C.grn + "40" : C.brd}`,
                      }}>{t.size}</span>
                    )}
                    {t.taskType === "ongoing" && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                        background: "#1a2a2a", color: C.blu, border: `1px solid ${C.blu}40`,
                      }}>↻ Ongoing</span>
                    )}
                    {t.dueDate && (
                      <span style={{ fontSize: 11, color: "#999" }}>
                        Due {new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
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
                        {(worked as any).nextSteps && (
                          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                            Next: {(worked as any).nextSteps}
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
        onSave={task => {
          setLocalTasks(prev => [...prev, task as LocalTask]);
          setShowCreateTask(false);
          setTimeout(() => loadLocalTasks(false), 500);
        }} />

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

            {/* What you worked on */}
            <div>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>What did you work on?</label>
              <VoiceField
                as="textarea"
                value={workNoteText}
                onChange={setWorkNoteText}
                placeholder="Describe what you did…"
                autoFocus
                style={{ ...inp, minHeight: 80, resize: "vertical", fontSize: 14 }}
              />
            </div>

            {/* Next Steps */}
            <div>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>Next steps</label>
              <VoiceField
                as="textarea"
                value={workNextSteps}
                onChange={setWorkNextSteps}
                placeholder="What's the next action when you pick this up?"
                style={{ ...inp, minHeight: 60, resize: "vertical", fontSize: 14 }}
              />
            </div>

            {/* Google Drive file */}
            <div ref={driveRef}>
              <label style={{ fontSize: 13, color: "#666", display: "block", marginBottom: 6 }}>Attach Google Drive file (optional)</label>

              {selectedDriveFile ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#F5F5F5", borderRadius: 8, border: `1px solid ${C.brd}` }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{driveIcon(selectedDriveFile)}</span>
                  <span style={{ fontSize: 13, flex: 1, minWidth: 0, color: C.tx, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedDriveFile.name}</span>
                  {selectedDriveFile.webViewLink && (
                    <a href={selectedDriveFile.webViewLink} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 11, color: C.blu, textDecoration: "none", flexShrink: 0 }}>Open ↗</a>
                  )}
                  <button onClick={() => setSelectedDriveFile(null)} style={{ background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <>
                  {/* Search / browse input */}
                  <div style={{ position: "relative" }}>
                    <input
                      value={driveQuery}
                      onChange={e => handleDriveSearch(e.target.value)}
                      onFocus={() => {
                        setDrivePickerOpen(true);
                        if (!driveFolderItems.length && !driveFolderLoading) loadFolder("root");
                      }}
                      placeholder="Search or browse Drive…"
                      style={{ ...inp, fontSize: 14, borderRadius: drivePickerOpen ? "8px 8px 0 0" : 8, paddingRight: (driveSearchLoading || driveFolderLoading) ? 36 : 14 }}
                    />
                    {(driveSearchLoading || driveFolderLoading) && (
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: "#999" }}>…</span>
                    )}
                  </div>

                  {drivePickerOpen && (
                    <div style={{ border: `1px solid ${C.brd}`, borderTop: "none", borderRadius: "0 0 8px 8px", background: "#fff", maxHeight: 260, overflowY: "auto" }}>

                      {/* Breadcrumb (folder mode only) */}
                      {!driveQuery.trim() && (
                        <div style={{ padding: "7px 12px", borderBottom: `1px solid ${C.brd}`, display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", background: "#FAFAFA" }}>
                          <span
                            onClick={() => navigateBreadcrumb(-1)}
                            style={{ fontSize: 11, fontWeight: 700, color: driveFolderStack.length ? C.blu : "#444", cursor: driveFolderStack.length ? "pointer" : "default" }}
                          >My Drive</span>
                          {driveFolderStack.map((crumb, i) => (
                            <span key={crumb.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ fontSize: 11, color: "#CCC" }}>/</span>
                              <span
                                onClick={() => navigateBreadcrumb(i)}
                                style={{ fontSize: 11, color: i === driveFolderStack.length - 1 ? "#444" : C.blu, fontWeight: i === driveFolderStack.length - 1 ? 600 : 400, cursor: i === driveFolderStack.length - 1 ? "default" : "pointer" }}
                              >{crumb.name}</span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Items */}
                      {driveQuery.trim() ? (
                        driveSearchResults.length === 0 && !driveSearchLoading
                          ? <div style={{ padding: "16px", fontSize: 12, color: "#999", textAlign: "center" }}>No results</div>
                          : driveSearchResults.map(f => <DriveRow key={f.id} item={f} onFolder={navigateFolder} onFile={selectDriveFile} />)
                      ) : (
                        driveFolderItems.length === 0 && !driveFolderLoading
                          ? <div style={{ padding: "16px", fontSize: 12, color: "#999", textAlign: "center" }}>Empty folder</div>
                          : driveFolderItems.map(f => <DriveRow key={f.id} item={f} onFolder={navigateFolder} onFile={selectDriveFile} />)
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {noteError && <div style={{ color: C.red, fontSize: 12 }}>{noteError}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { setWorkNoteTask(null); setWorkNoteText(""); setWorkNextSteps(""); }} style={{ ...btn2, flex: 1 }}>Cancel</button>
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
