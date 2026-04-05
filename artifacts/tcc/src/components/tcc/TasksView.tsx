import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from "react";
import { post, get, patch } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import { VoiceField } from "./VoiceField";
import { TimeRoutingBanner } from "./TimeRoutingBanner";
import { CreateTaskModal } from "./CreateTaskModal";
import { HoverCard } from "./HoverCard";
import type { TaskItem } from "./types";

interface WorkNote {
  id: string;
  taskId: string;
  date: string;
  note: string;
  progress: number;
  nextSteps?: string;
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
  const [focusOnly, setFocusOnly] = useState(false);
  const [pillarFilter, setPillarFilter] = useState<string | null>(null);
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
  const PILLAR_KEYWORDS: Record<string, string[]> = {
    "Adaptation": ["adapt"],
    "Sales": ["sales"],
    "Foundation": ["found", "infra", "core", "data", "flipiq", "db"],
    "COO Dashboard": ["coo", "dashboard", "ethan", "ramy", "accountability"],
  };
  const matchesPillar = (t: TaskItem): boolean => {
    if (!pillarFilter) return true;
    if (pillarFilter === "Sales" && t.sales) return true;
    const kws = PILLAR_KEYWORDS[pillarFilter] ?? [];
    const hay = `${t.cat ?? ""} ${t.text}`.toLowerCase();
    return kws.some(k => hay.includes(k));
  };

  const activeTasks   = tasks.filter(t => !tDone[t.id] && matchesPillar(t));
  const doneTasks     = tasks.filter(t => tDone[t.id] && matchesPillar(t));
  const activeLocals  = localTasks.filter(t => t.status !== "done" && !localDone.has(t.id));
  const totalTasks    = tasks.length + activeLocals.length;
  const totalDone     = Object.values(tDone).filter(Boolean).length + (localTasks.length - activeLocals.length);

  return (
    <>
      <div style={{
        padding: "0 20px 60px",
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

        {/* ── 90 Day Focus ── */}
        <div style={{ margin: "16px 0 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8 }}>🎯 90-Day Focus</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {[
              { num: "01", label: "Adaptation", desc: "Systems, processes & team alignment" },
              { num: "02", label: "Sales", desc: "Pipeline growth & 10-call daily cadence" },
              { num: "03", label: "Foundation", desc: "Data integrity, infra & FlipIQ core" },
              { num: "04", label: "COO Dashboard", desc: "Ethan & Ramy accountability loop" },
            ].map(({ num, label, desc }) => {
              const active = pillarFilter === label;
              return (
              <div
                key={label}
                onClick={() => setPillarFilter(active ? null : label)}
                style={{
                  border: `${active ? 2 : 1}px solid ${active ? C.tx : C.brd}`,
                  borderRadius: 8, padding: "12px 14px",
                  background: active ? C.tx : C.card,
                  display: "flex", flexDirection: "column", gap: 4,
                  cursor: "pointer", userSelect: "none",
                  transition: "all 0.12s",
                }}
              >
                <div style={{ fontSize: 10, fontWeight: 800, color: active ? "#fff8" : "#bbb", letterSpacing: 1 }}>{num}</div>
                <div style={{ fontSize: 13, fontWeight: 800, color: active ? "#fff" : C.tx, lineHeight: 1.2 }}>{label}</div>
                <div style={{ fontSize: 10, color: active ? "#ffffff99" : C.mut, lineHeight: 1.4, marginTop: 2 }}>{desc}</div>
              </div>
            );})}

          </div>
        </div>

        {/* ── Focus Top-3 (always-visible pinned section) ── */}
        {(() => {
          const GOLD = "#B45309";
          const GOLD_BG = "#FFFBEB";
          const GOLD_BRD = "#FCD34D";
          const briefTop = activeTasks.filter(t => !t.sales).slice(0, 2);
          const salesDone = tasks.some(t => t.sales && tDone[t.id]);
          const top3: Array<{ label: string; done: boolean; onClick?: () => void; sub?: string; isRed?: boolean }> = [
            {
              label: "10 Sales Calls",
              done: salesDone,
              onClick: onSwitchToSales,
              sub: "Tap to open Sales tracker",
              isRed: true,
            },
            briefTop[0]
              ? { label: briefTop[0].text, done: tDone[briefTop[0].id] ?? false, onClick: () => {} }
              : { label: "—", done: false },
            briefTop[1]
              ? { label: briefTop[1].text, done: tDone[briefTop[1].id] ?? false, onClick: () => {} }
              : { label: "—", done: false },
          ];
          const allDone = top3[1]?.done && top3[2]?.done;
          return (
            <div style={{ margin: "16px 0 8px", background: GOLD_BG, border: `1.5px solid ${GOLD_BRD}`, borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: GOLD, textTransform: "uppercase", letterSpacing: 1.2, flex: 1 }}>
                  ★ Focus
                </div>
                {allDone && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: C.grn, background: C.grnBg, borderRadius: 6, padding: "2px 8px" }}>All 3 Done ✓</span>
                )}
                <button
                  onClick={() => setFocusOnly(f => !f)}
                  style={{
                    background: focusOnly ? GOLD : "transparent",
                    border: `1px solid ${GOLD_BRD}`,
                    color: focusOnly ? "#fff" : GOLD,
                    borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
                    cursor: "pointer", fontFamily: F,
                  }}
                >
                  {focusOnly ? "Focus Only ✓" : "Focus Only"}
                </button>
              </div>
              {top3.map((item, idx) => (
                <div
                  key={idx}
                  onClick={item.onClick}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                    background: "#fff",
                    border: `1px solid ${GOLD_BRD}`,
                    borderRadius: 8, marginBottom: idx < 2 ? 6 : 0,
                    cursor: item.onClick ? "pointer" : "default",
                    opacity: item.done ? 0.45 : 1,
                    transition: "opacity 0.15s",
                  }}
                  onMouseEnter={e => { if (item.onClick) e.currentTarget.style.background = "#FEF9EE"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                >
                  <span style={{
                    fontFamily: "Georgia, serif", fontWeight: 800, fontSize: 13,
                    color: idx === 0 ? C.red : GOLD,
                    width: 18, textAlign: "center", flexShrink: 0,
                  }}>{idx + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: item.isRed ? C.red : C.tx,
                      textDecoration: item.done ? "line-through" : "none",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{item.label}</div>
                    {item.sub && <div style={{ fontSize: 11, color: GOLD, marginTop: 1 }}>{item.sub}</div>}
                  </div>
                  {item.done && <span style={{ fontSize: 11, color: C.grn, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                  {!item.done && item.onClick && idx === 0 && <span style={{ fontSize: 14, color: C.red, flexShrink: 0 }}>›</span>}
                </div>
              ))}
            </div>
          );
        })()}

        {/* My Tasks (local) */}
        {!focusOnly && activeLocals.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "16px 0 4px" }}>My Tasks</div>
            {activeLocals.map(t => (
              <HoverCard key={t.id} rows={[
                { label: "Task", value: t.text },
                ...(t.size ? [{ label: "Size", value: t.size, color: t.size === "XL" ? C.red : t.size === "L" ? C.blu : t.size === "M" ? C.grn : undefined }] : []),
                ...(t.taskType ? [{ label: "Type", value: t.taskType === "ongoing" ? "↻ Ongoing" : t.taskType }] : []),
                ...(t.dueDate ? [{ label: "Due", value: new Date(t.dueDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) }] : []),
                ...(t.priority != null ? [{ label: "Priority", value: String(t.priority) }] : []),
                ...(t.overrideWarning ? [{ label: "Warning", value: t.overrideWarning, color: C.red }] : []),
              ]}>
              <div style={ROW}>
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
              </HoverCard>
            ))}
          </div>
        )}

        {/* Pillar filter indicator */}
        {pillarFilter && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0 4px" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.tx, background: C.tx + "12", border: `1px solid ${C.tx}22`, borderRadius: 6, padding: "2px 8px" }}>
              Filtered: {pillarFilter}
            </span>
            <button onClick={() => setPillarFilter(null)} style={{ fontSize: 11, color: C.mut, background: "none", border: "none", cursor: "pointer", padding: 0, fontFamily: F }}>× Clear</button>
          </div>
        )}

        {/* Active Tasks */}
        {!focusOnly && activeTasks.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: "#999", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, padding: "16px 0 4px" }}>Today</div>
            {activeTasks.map(t => {
              const worked = todayNotes[t.id];
              const progress = worked?.progress ?? 0;
              const isUrgent = t.cat === "SALES" || (t as any).urgent;
              return (
                <HoverCard key={t.id} rows={[
                  { label: "Task", value: t.text },
                  { label: "Category", value: t.cat || "—", color: t.cat === "SALES" ? C.red : undefined },
                  ...(t.priority != null ? [{ label: "Priority", value: String(t.priority) }] : []),
                  ...(worked ? [
                    { label: "Progress", value: `${progress}%`, color: progress === 100 ? C.grn : C.blu },
                    ...(worked.note ? [{ label: "Note", value: worked.note }] : []),
                    ...(worked.nextSteps ? [{ label: "Next", value: worked.nextSteps }] : []),
                    ...(worked.nextSessionDate ? [{ label: "Continue", value: fmtDate(worked.nextSessionDate) }] : []),
                    ...(worked.driveFileName ? [{ label: "File", value: worked.driveFileName, color: C.blu }] : []),
                  ] : []),
                ]}>
                <div style={ROW}>
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
                        {worked.nextSteps && (
                          <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>
                            Next: {worked.nextSteps}
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
                </HoverCard>
              );
            })}
          </div>
        )}

        {!focusOnly && activeTasks.length === 0 && activeLocals.length === 0 && (
          <div style={{ padding: "48px 0", textAlign: "center", color: "#999", fontSize: 14 }}>
            All done for today.
          </div>
        )}

        {/* Done */}
        {!focusOnly && doneTasks.length > 0 && (
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
