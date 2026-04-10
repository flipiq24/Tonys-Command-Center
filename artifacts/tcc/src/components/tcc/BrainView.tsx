import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { get, post, put, patch } from "@/lib/api";
import { C, F } from "@/components/tcc/constants";

// ─── Types ────────────────────────────────────────────────────────────────────

type BrainTask = {
  id: string;
  title: string;
  category: string;
  subcategory?: string | null;
  owner?: string | null;
  coOwner?: string | null;
  priority?: string | null;
  status?: string | null;
  dueDate?: string | null;
  source?: string | null;
  priorityOrder?: number;
  sprintId?: string;
};

type TrainingModalData = {
  movedTask: BrainTask;
  fromPos: number;
  toPos: number;
  displacedTasks: BrainTask[];
};

type AiPreviewItem = { id: string; title: string; category: string; oldPos: number; newPos: number };

// ─── Constants ────────────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  sales: "#3b82f6",
  adaptation: "#8b5cf6",
  tech: "#06b6d4",
  capital: "#f59e0b",
  team: "#10b981",
};

const CAT_LABEL: Record<string, string> = {
  sales: "Sales", adaptation: "Adaptation", tech: "Tech", capital: "Capital", team: "Team",
};

const STA_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "#dbeafe", color: "#3b82f6" },
  pending:   { bg: "#fef3c7", color: "#d97706" },
  completed: { bg: "#dcfce7", color: "#16a34a" },
};

const PRI_COLOR: Record<string, string> = {
  P0: "#ef4444", P1: "#f59e0b", P2: "#22c55e",
};

// ─── Inline text edit cell ────────────────────────────────────────────────────

function InlineEdit({ value, placeholder, onSave, minWidth = 70 }: {
  value: string;
  placeholder?: string;
  onSave: (v: string) => void;
  minWidth?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  return editing ? (
    <input
      ref={inputRef}
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft); }}
      onKeyDown={e => { if (e.key === "Enter") { setEditing(false); if (draft !== value) onSave(draft); } if (e.key === "Escape") { setEditing(false); setDraft(value); } }}
      onClick={e => e.stopPropagation()}
      style={{ width: minWidth, fontSize: 11, border: `1px solid ${C.brd ?? "#e2e8f0"}`, borderRadius: 5, padding: "2px 5px", outline: "none", background: "#fff", color: C.tx ?? "#1e293b", fontFamily: F }}
    />
  ) : (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true); setDraft(value); }}
      style={{ fontSize: 11, color: value ? (C.sub ?? "#64748b") : (C.mut ?? "#94a3b8"), cursor: "text", padding: "2px 5px", borderRadius: 5, minWidth, display: "inline-block" }}
      title="Click to edit"
    >
      {value || placeholder || "—"}
    </span>
  );
}

// ─── Sortable Row ─────────────────────────────────────────────────────────────

function SortableRow({ task, rank, onCoOwnerSave }: {
  task: BrainTask;
  rank: number;
  onCoOwnerSave: (id: string, val: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    background: isDragging ? (C.bluBg ?? "#eff6ff") : (rank % 2 === 0 ? C.card ?? "#f8fafc" : "#fff"),
    display: "flex",
    alignItems: "center",
    padding: "8px 10px",
    gap: 8,
    borderBottom: `1px solid ${C.brd ?? "#e2e8f0"}`,
    userSelect: "none",
  };

  const catColor = CAT_COLOR[task.category] ?? "#94a3b8";
  const priColor = PRI_COLOR[task.priority ?? "P2"] ?? "#22c55e";
  const sta = STA_STYLE[task.status ?? "pending"] ?? STA_STYLE.pending;

  const today = new Date();
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const isLate = due ? due < today && task.status !== "completed" : false;

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drag handle */}
      <span {...attributes} {...listeners} style={{ fontSize: 15, color: C.mut ?? "#94a3b8", cursor: "grab", lineHeight: 1, flexShrink: 0, padding: "0 2px" }}>⠿</span>

      {/* Rank */}
      <span style={{ fontSize: 11, color: C.mut ?? "#94a3b8", minWidth: 22, textAlign: "right", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>{rank}</span>

      {/* Category dot */}
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: catColor, flexShrink: 0 }} />

      {/* Sprint ID + Title */}
      <span style={{ flex: 1, fontSize: 12, color: C.tx ?? "#1e293b", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {task.sprintId && (
          <span style={{ fontSize: 10, fontWeight: 800, color: catColor, marginRight: 6, background: catColor + "18", padding: "1px 6px", borderRadius: 8 }}>
            {task.sprintId}
          </span>
        )}
        {task.title}
      </span>

      {/* Category */}
      <span style={{ fontSize: 10, color: catColor, background: catColor + "18", borderRadius: 8, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0, minWidth: 64, textAlign: "center" }}>
        {CAT_LABEL[task.category] ?? task.category}
      </span>

      {/* Owner */}
      <span style={{ fontSize: 11, color: C.sub ?? "#64748b", whiteSpace: "nowrap", flexShrink: 0, minWidth: 52, overflow: "hidden", textOverflow: "ellipsis" }}>
        {task.owner ?? "—"}
      </span>

      {/* Co-Owner (inline editable) */}
      <span style={{ flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <InlineEdit
          value={task.coOwner ?? ""}
          placeholder="—"
          minWidth={62}
          onSave={v => onCoOwnerSave(task.id, v)}
        />
      </span>

      {/* Priority */}
      {task.priority ? (
        <span style={{ fontSize: 10, fontWeight: 800, color: priColor, background: priColor + "20", borderRadius: 6, padding: "1px 7px", flexShrink: 0, minWidth: 28, textAlign: "center" }}>
          {task.priority}
        </span>
      ) : <span style={{ minWidth: 28 }} />}

      {/* Due Date */}
      <span style={{ fontSize: 10, color: isLate ? "#ef4444" : (C.mut ?? "#94a3b8"), whiteSpace: "nowrap", flexShrink: 0, minWidth: 62 }}>
        {task.dueDate ? task.dueDate.substring(0, 10) : "—"}
      </span>

      {/* Source */}
      <span style={{ fontSize: 10, color: C.mut ?? "#94a3b8", whiteSpace: "nowrap", flexShrink: 0, minWidth: 38 }}>
        {task.source ?? "—"}
      </span>

      {/* Status */}
      <span style={{ fontSize: 10, fontWeight: 600, color: sta.color, background: sta.bg, borderRadius: 8, padding: "2px 7px", whiteSpace: "nowrap", flexShrink: 0, minWidth: 66, textAlign: "center" }}>
        {task.status === "active" ? "Active" : task.status === "completed" ? "Done" : "Not Started"}
      </span>
    </div>
  );
}

// ─── Training Modal ────────────────────────────────────────────────────────────

function TrainingModal({
  data,
  allTasks,
  onDone,
  onCancel,
}: {
  data: TrainingModalData;
  allTasks: BrainTask[];
  onDone: (aiReflection: string | null) => void;
  onCancel: () => void;
}) {
  const [explanation, setExplanation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [aiReflection, setAiReflection] = useState<string | null>(null);

  const movedUp = data.toPos < data.fromPos;
  const headingEmoji = movedUp ? "⬆️" : "⬇️";
  const headingText = movedUp ? "Why Is This More Important?" : "Why Is This Less Important?";
  const directionLabel = movedUp ? "up" : "down";
  const displacedLabel = movedUp ? "Jumped ahead of:" : "Now ranked below:";
  const placeholderText = movedUp
    ? "Why does this take priority? (e.g. 'This unlocks SLS pipeline — must go before tech tasks')"
    : "Why is this lower priority right now? (e.g. 'Blocked on Ethan — can't start until tech layer is live')";

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const items = allTasks.map((t, i) => ({ id: t.id, priorityOrder: i + 1 }));
      const result = await post<{ aiReflection?: string }>("/plan/reorder", {
        items,
        explanation: explanation.trim() || "Reordered via drag",
        movedItemId: data.movedTask.id,
        movedItemTitle: data.movedTask.title,
        fromPosition: data.fromPos,
        toPosition: data.toPos,
        displacedItemIds: data.displacedTasks.map(t => t.id),
        displacedItemTitles: data.displacedTasks.map(t => t.title),
      });
      const reflection = result?.aiReflection ?? null;
      setAiReflection(reflection);
      if (!reflection) onDone(null);
    } catch (e) {
      console.error("[BrainView] reorder failed:", e);
      onDone(null);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.card ?? "#f8fafc", borderRadius: 16, padding: 28, maxWidth: 520, width: "90vw",
        border: `1px solid ${C.brd ?? "#e2e8f0"}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.tx ?? "#1e293b", marginBottom: 4, fontFamily: F }}>
          {headingEmoji} {headingText}
        </div>
        <div style={{ fontSize: 12, color: C.mut ?? "#94a3b8", marginBottom: 12 }}>
          Moved <strong>{data.movedTask.title}</strong> {directionLabel} — #{data.fromPos} → #{data.toPos}
        </div>
        {data.displacedTasks.length > 0 && (
          <div style={{ fontSize: 11, color: C.sub ?? "#64748b", marginBottom: 12, lineHeight: 1.6 }}>
            <strong>{displacedLabel}</strong>{" "}
            {data.displacedTasks.slice(0, 4).map(t => t.title).join(", ")}
            {data.displacedTasks.length > 4 ? ` +${data.displacedTasks.length - 4} more` : ""}
          </div>
        )}

        <textarea
          value={explanation}
          onChange={e => setExplanation(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSave(); }}
          placeholder={placeholderText}
          autoFocus
          disabled={!!aiReflection}
          style={{
            width: "100%", minHeight: 80, borderRadius: 10,
            border: `1px solid ${C.brd ?? "#e2e8f0"}`,
            background: aiReflection ? (C.bg ?? "#f1f5f9") : "#fff", color: C.tx ?? "#1e293b",
            padding: "10px 12px", fontSize: 13, fontFamily: F, resize: "vertical",
            outline: "none", boxSizing: "border-box",
          }}
        />

        {aiReflection && (
          <div style={{
            marginTop: 12, padding: 12, borderRadius: 10,
            background: C.bluBg ?? "#eff6ff", border: `1px solid #3b82f622`,
            fontSize: 12, color: C.tx ?? "#1e293b", lineHeight: 1.6,
          }}>
            <div style={{ fontWeight: 700, fontSize: 11, color: "#3b82f6", marginBottom: 4 }}>🤖 AI REFLECTION</div>
            {aiReflection}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          {!aiReflection && (
            <button onClick={onCancel} style={{
              padding: "8px 18px", borderRadius: 9, border: `1px solid ${C.brd ?? "#e2e8f0"}`,
              background: "transparent", color: C.sub ?? "#64748b", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: F,
            }}>Cancel (undo)</button>
          )}
          <button
            onClick={aiReflection ? () => onDone(aiReflection) : handleSave}
            disabled={submitting}
            style={{
              padding: "8px 18px", borderRadius: 9, border: "none",
              background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: submitting ? "wait" : "pointer", fontFamily: F,
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "Saving…" : aiReflection ? "Done" : "Save (⌘↩)"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Organize Preview ───────────────────────────────────────────────────────

function AiPreviewOverlay({
  items,
  onConfirm,
  onDiscard,
  confirming,
}: {
  items: AiPreviewItem[];
  onConfirm: () => void;
  onDiscard: () => void;
  confirming: boolean;
}) {
  const changed = items.filter(i => i.oldPos !== i.newPos).length;
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9000,
      background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: C.card ?? "#f8fafc", borderRadius: 16, padding: 28,
        maxWidth: 600, width: "90vw", maxHeight: "80vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        border: `1px solid ${C.brd ?? "#e2e8f0"}`,
        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.tx ?? "#1e293b", marginBottom: 4 }}>🤖 AI Brain Reorder</div>
        <div style={{ fontSize: 12, color: C.mut ?? "#94a3b8", marginBottom: 16 }}>
          {changed} task{changed !== 1 ? "s" : ""} will move. Confirm to apply.
        </div>
        <div style={{ overflowY: "auto", flex: 1, marginBottom: 16 }}>
          {items.slice(0, 40).map(item => {
            const delta = item.oldPos - item.newPos;
            const moved = delta !== 0;
            return (
              <div key={item.id} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "5px 0",
                borderBottom: `1px solid ${C.brd ?? "#e2e8f0"}22`,
              }}>
                <span style={{ fontSize: 11, color: C.mut ?? "#94a3b8", minWidth: 24, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {item.newPos}
                </span>
                {moved ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? "#22c55e" : "#f59e0b", minWidth: 36 }}>
                    {delta > 0 ? `▲${delta}` : `▼${Math.abs(delta)}`}
                  </span>
                ) : (
                  <span style={{ fontSize: 11, color: C.mut ?? "#94a3b8", minWidth: 36 }}>—</span>
                )}
                <span style={{ flex: 1, fontSize: 12, color: C.tx ?? "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.title}
                </span>
                <span style={{ fontSize: 10, color: CAT_COLOR[item.category] ?? "#94a3b8" }}>
                  {CAT_LABEL[item.category] ?? item.category}
                </span>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onDiscard} disabled={confirming} style={{
            padding: "8px 18px", borderRadius: 9, border: `1px solid ${C.brd ?? "#e2e8f0"}`,
            background: "transparent", color: C.sub ?? "#64748b", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: F,
          }}>Discard</button>
          <button onClick={onConfirm} disabled={confirming} style={{
            padding: "8px 18px", borderRadius: 9, border: "none",
            background: "#3b82f6", color: "#fff", fontSize: 12, fontWeight: 700,
            cursor: confirming ? "wait" : "pointer", fontFamily: F,
            opacity: confirming ? 0.7 : 1,
          }}>{confirming ? "Saving…" : "Confirm Order"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Brain Context Panel ───────────────────────────────────────────────────────

function BrainContextPanel() {
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    // Backend GET /plan/brain/context returns { content, lastUpdated }
    get<{ content: string }>("/plan/brain/context").then(d => setContent(d?.content ?? "")).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      // Backend PUT /plan/brain/context expects { content }
      await put("/plan/brain/context", { content });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("[BrainView] save context failed:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: "16px 24px", borderBottom: `1px solid ${C.brd ?? "#e2e8f0"}`, background: C.bluBg ?? "#eff6ff" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.tx ?? "#1e293b", marginBottom: 6 }}>
        🧠 Brain Context Document
      </div>
      <div style={{ fontSize: 11, color: C.sub ?? "#64748b", marginBottom: 10 }}>
        Tony's strategic context guides AI when organizing sprint priorities.
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="E.g. Current Q2 focus is ARR growth. Sales pipeline unlocks tech investment. Ramy's onboarding is top priority for team category…"
        style={{
          width: "100%", minHeight: 90, borderRadius: 10,
          border: `1px solid ${C.brd ?? "#e2e8f0"}`,
          background: "#fff", color: C.tx ?? "#1e293b",
          padding: "10px 12px", fontSize: 12, fontFamily: F, resize: "vertical",
          outline: "none", boxSizing: "border-box",
        }}
      />
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={handleSave} disabled={saving} style={{
          padding: "7px 18px", borderRadius: 9, border: "none",
          background: saved ? "#22c55e" : "#3b82f6",
          color: "#fff", fontSize: 12, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: F,
          opacity: saving ? 0.7 : 1,
        }}>
          {saved ? "✓ Saved" : saving ? "Saving…" : "Save Context"}
        </button>
      </div>
    </div>
  );
}

// ─── Main BrainView ────────────────────────────────────────────────────────────

export function BrainView() {
  const [tasks, setTasks] = useState<BrainTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("");
  const [filterStatus, setFilterStatus] = useState("active");
  const [training, setTraining] = useState<TrainingModalData | null>(null);
  const [pendingBefore, setPendingBefore] = useState<BrainTask[] | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [aiPreview, setAiPreview] = useState<{ items: AiPreviewItem[]; ordered: BrainTask[] } | null>(null);
  const [showContext, setShowContext] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await get<{ tasks: BrainTask[] }>("/plan/tasks");
      setTasks(data?.tasks ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Apply category/status filter on top of global order
  const displayed = tasks.filter(t =>
    (!filterCat || t.category === filterCat) &&
    (!filterStatus || t.status === filterStatus)
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tasks.findIndex(t => t.id === active.id);
    const newIndex = tasks.findIndex(t => t.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const movedTask = tasks[oldIndex];
    const before = [...tasks];
    const reordered = arrayMove(tasks, oldIndex, newIndex);

    const lo = Math.min(oldIndex, newIndex);
    const hi = Math.max(oldIndex, newIndex);
    const displacedTasks = before.slice(lo, hi + 1).filter(t => t.id !== movedTask.id);

    setTasks(reordered);
    setPendingBefore(before);
    setTraining({
      movedTask,
      fromPos: oldIndex + 1,
      toPos: newIndex + 1,
      displacedTasks,
    });
  }

  const handleTrainingDone = (_aiReflection: string | null) => {
    setPendingBefore(null);
    setTraining(null);
  };

  const handleTrainingCancel = () => {
    if (pendingBefore) setTasks(pendingBefore);
    setPendingBefore(null);
    setTraining(null);
  };

  const handleCoOwnerSave = async (taskId: string, value: string) => {
    try {
      await patch(`/plan/item/${taskId}`, { coOwner: value.trim() || null });
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, coOwner: value.trim() || null } : t));
    } catch (e) {
      console.error("[BrainView] coOwner save failed:", e);
    }
  };

  const handleAiOrganize = async () => {
    setOrganizing(true);
    try {
      const data = await get<{ tasks: BrainTask[] }>("/plan/brain/order");
      if (!data?.tasks?.length) return;
      const ordered = data.tasks;
      const preview: AiPreviewItem[] = ordered.map((t, i) => {
        const oldPos = tasks.findIndex(x => x.id === t.id) + 1;
        return { id: t.id, title: t.title, category: t.category, oldPos, newPos: i + 1 };
      });
      setAiPreview({ items: preview, ordered });
    } catch (e) {
      console.error("[BrainView] AI organize failed:", e);
    } finally {
      setOrganizing(false);
    }
  };

  const handleAiConfirm = async () => {
    if (!aiPreview) return;
    setConfirming(true);
    try {
      const ordered = aiPreview.ordered;
      // Update local state optimistically
      setTasks(ordered);
      setAiPreview(null);
      // Persist: send items array with global positions
      const items = ordered.map((t, i) => ({ id: t.id, priorityOrder: i + 1 }));
      await post("/plan/reorder", {
        items,
        explanation: "AI Brain global re-rank confirmed by Tony",
        movedItemId: ordered[0]?.id,
        movedItemTitle: "AI full re-rank",
        fromPosition: 0,
        toPosition: 0,
        displacedItemIds: [],
        displacedItemTitles: [],
      });
      // Reload to get server-assigned sprint IDs
      await load();
    } catch (e) {
      console.error("[BrainView] AI confirm failed:", e);
      await load();
    } finally {
      setConfirming(false);
    }
  };

  const CAT_KEYS = ["sales", "adaptation", "tech", "capital", "team"];

  return (
    <div style={{ minHeight: "100vh", background: C.bg ?? "#f1f5f9", fontFamily: F }}>
      {/* ── Header bar ── */}
      <div style={{
        background: C.card ?? "#f8fafc",
        borderBottom: `1px solid ${C.brd ?? "#e2e8f0"}`,
        padding: "14px 20px",
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.tx ?? "#1e293b" }}>🧠 Master Task Brain</div>
          <div style={{ fontSize: 10, color: C.mut ?? "#94a3b8", marginTop: 2 }}>
            Drag rows to reorder global sprint priority · AI learns from every decision
          </div>
        </div>

        {/* Category filter chips */}
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center" }}>
          {[["", "All"], ...CAT_KEYS.map(k => [k, CAT_LABEL[k]])].map(([val, label]) => (
            <button key={val} onClick={() => setFilterCat(val)} style={{
              padding: "3px 10px", borderRadius: 20,
              border: `1px solid ${filterCat === val ? (CAT_COLOR[val] ?? "#3b82f6") : (C.brd ?? "#e2e8f0")}`,
              background: filterCat === val ? (CAT_COLOR[val] ?? "#3b82f6") + "20" : "transparent",
              color: filterCat === val ? (CAT_COLOR[val] ?? "#3b82f6") : (C.sub ?? "#64748b"),
              fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F,
            }}>{label}</button>
          ))}
        </div>

        {/* Status chips */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {[["", "All"], ["active", "Active"], ["pending", "Not Started"], ["completed", "Done"]].map(([val, label]) => {
            const s = STA_STYLE[val] ?? null;
            const isActive = filterStatus === val;
            return (
              <button key={val} onClick={() => setFilterStatus(val)} style={{
                padding: "3px 10px", borderRadius: 20,
                border: `1px solid ${isActive && s ? s.color : (C.brd ?? "#e2e8f0")}`,
                background: isActive && s ? s.bg : "transparent",
                color: isActive && s ? s.color : (C.sub ?? "#64748b"),
                fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F,
              }}>{label}</button>
            );
          })}
        </div>

        {/* Actions */}
        <button
          onClick={handleAiOrganize}
          disabled={organizing || loading}
          style={{
            padding: "7px 16px", borderRadius: 9, border: "none",
            background: organizing ? (C.brd ?? "#e2e8f0") : "#3b82f6",
            color: organizing ? (C.mut ?? "#94a3b8") : "#fff",
            fontSize: 12, fontWeight: 700, cursor: organizing ? "wait" : "pointer", fontFamily: F,
          }}
        >
          {organizing ? "Thinking…" : "🤖 AI Organize"}
        </button>
        <button
          onClick={() => setShowContext(s => !s)}
          style={{
            padding: "7px 12px", borderRadius: 9,
            border: `1px solid ${C.brd ?? "#e2e8f0"}`,
            background: showContext ? (C.bluBg ?? "#eff6ff") : "transparent",
            color: showContext ? "#3b82f6" : (C.sub ?? "#64748b"),
            fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F,
          }}
        >
          {showContext ? "▲ Context" : "▼ Context"}
        </button>
        <span style={{ fontSize: 11, color: C.mut ?? "#94a3b8" }}>
          {loading ? "Loading…" : `${displayed.length} tasks`}
        </span>
      </div>

      {/* Brain context panel */}
      {showContext && <BrainContextPanel />}

      {/* Column headers */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
        background: C.bg ?? "#f1f5f9",
        borderBottom: `1px solid ${C.brd ?? "#e2e8f0"}`,
        fontSize: 9, fontWeight: 700, color: C.mut ?? "#94a3b8", letterSpacing: 1,
        textTransform: "uppercase",
      }}>
        <span style={{ minWidth: 20 }} />
        <span style={{ minWidth: 22 }}>#</span>
        <span style={{ minWidth: 8 }} />
        <span style={{ flex: 1 }}>Task</span>
        <span style={{ minWidth: 64, textAlign: "center" }}>Category</span>
        <span style={{ minWidth: 52 }}>Owner</span>
        <span style={{ minWidth: 62 }}>Co-Owner</span>
        <span style={{ minWidth: 28, textAlign: "center" }}>Pri</span>
        <span style={{ minWidth: 62 }}>Due</span>
        <span style={{ minWidth: 38 }}>Src</span>
        <span style={{ minWidth: 66, textAlign: "center" }}>Status</span>
      </div>

      {/* Sortable task list */}
      {loading ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: C.mut ?? "#94a3b8" }}>Loading tasks…</div>
      ) : displayed.length === 0 ? (
        <div style={{ padding: "40px 24px", textAlign: "center", color: C.mut ?? "#94a3b8" }}>No tasks match filters.</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={displayed.map(t => t.id)} strategy={verticalListSortingStrategy}>
            {displayed.map((task, i) => (
              <SortableRow
                key={task.id}
                task={task}
                rank={i + 1}
                onCoOwnerSave={handleCoOwnerSave}
              />
            ))}
          </SortableContext>
        </DndContext>
      )}

      {/* Training Modal */}
      {training && (
        <TrainingModal
          data={training}
          allTasks={tasks}
          onDone={handleTrainingDone}
          onCancel={handleTrainingCancel}
        />
      )}

      {/* AI Preview Overlay */}
      {aiPreview && (
        <AiPreviewOverlay
          items={aiPreview.items}
          onConfirm={handleAiConfirm}
          onDiscard={() => setAiPreview(null)}
          confirming={confirming}
        />
      )}
    </div>
  );
}
