import { useState, useEffect } from "react";
import { get, post, patch, del } from "@/lib/api";
import { C, F, FS, btn1, btn2 } from "./constants";
import type { Idea } from "./types";

interface Props {
  ideas: Idea[];
  onIdeasChange: (ideas: Idea[]) => void;
  onCreateTask?: (ideaText: string, category: string, urgency: string, techType?: string) => void;
  onNavigate: (view: string) => void;
  onNewIdea?: () => void;
}

const CAT_COLOR: Record<string, string> = {
  Tech: "#DC2626", Sales: "#16A34A", Marketing: "#9333EA", "Strategic Partners": "#2563EB",
  Operations: "#D97706", Product: "#0891B2", Personal: "#6B7280",
};
const URG_COLOR: Record<string, string> = {
  Now: "#DC2626", "This Week": "#D97706", "This Month": "#2563EB", Someday: "#6B7280",
};

export function IdeasView({ ideas, onIdeasChange, onCreateTask, onNavigate, onNewIdea }: Props) {
  const [allIdeas, setAllIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ text: "", category: "", urgency: "", techType: "" });
  const [rethinkingId, setRethinkingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "parked" | "override">("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    get<any[]>("/ideas").then(d => { setAllIdeas(d || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? allIdeas : allIdeas.filter(i => i.status === filter);

  const handleDelete = async (id: string) => {
    try {
      await del(`/ideas/${id}`);
      const updated = allIdeas.filter(i => i.id !== id);
      setAllIdeas(updated);
      onIdeasChange(updated);
      setConfirmDelete(null);
    } catch { /* ignore */ }
  };

  const handleEdit = async (id: string) => {
    try {
      const updated = await patch<any>(`/ideas/${id}`, editForm);
      setAllIdeas(prev => prev.map(i => i.id === id ? { ...i, ...updated } : i));
      setEditingId(null);
    } catch { /* ignore */ }
  };

  const handleRethink = async (id: string) => {
    setRethinkingId(id);
    try {
      const res = await post<{ ok: boolean; idea: any; classification: any }>(`/ideas/${id}/rethink`, {});
      if (res?.ok && res.idea) {
        setAllIdeas(prev => prev.map(i => i.id === id ? { ...i, ...res.idea } : i));
      }
    } catch { /* AI unavailable */ }
    setRethinkingId(null);
  };

  const handleConvertToTask = (idea: any) => {
    if (onCreateTask) onCreateTask(idea.text, idea.category, idea.urgency, idea.techType);
  };

  const inp: React.CSSProperties = { width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${C.brd}`, fontFamily: F, fontSize: 12 };
  const sel: React.CSSProperties = { ...inp, background: "#fff" };

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontFamily: FS, fontSize: 22, margin: 0 }}>Ideas Parking Lot</h2>
          <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>{allIdeas.length} ideas total — {allIdeas.filter(i => i.status === "parked").length} parked</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {onNewIdea && <button onClick={onNewIdea} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#F97316", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>+ New Idea</button>}
          {(["all", "parked", "override"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
              background: filter === f ? "#111" : "#F3F4F6", color: filter === f ? "#fff" : "#374151",
              border: `1px solid ${filter === f ? "#111" : "#D1D5DB"}`,
            }}>{f === "all" ? "All" : f === "parked" ? "Parked" : "Overrides"}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.mut }}>Loading ideas...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.mut }}>No ideas found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map(idea => (
            <div key={idea.id} style={{ background: C.card, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "14px 18px" }}>
              {editingId === idea.id ? (
                /* ── Edit Mode ── */
                <div>
                  <input value={editForm.text} onChange={e => setEditForm(f => ({ ...f, text: e.target.value }))} style={{ ...inp, marginBottom: 8, fontSize: 14, fontWeight: 600 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <select value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={sel}>
                      {["Tech", "Sales", "Marketing", "Strategic Partners", "Operations", "Product", "Personal"].map(c => <option key={c}>{c}</option>)}
                    </select>
                    <select value={editForm.urgency} onChange={e => setEditForm(f => ({ ...f, urgency: e.target.value }))} style={sel}>
                      {["Now", "This Week", "This Month", "Someday"].map(u => <option key={u}>{u}</option>)}
                    </select>
                    <select value={editForm.techType || ""} onChange={e => setEditForm(f => ({ ...f, techType: e.target.value }))} style={sel}>
                      <option value="">No type</option>
                      {["Bug", "Feature", "Note", "Task", "Strategic"].map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => setEditingId(null)} style={btn2}>Cancel</button>
                    <button onClick={() => handleEdit(idea.id)} style={btn1}>Save</button>
                  </div>
                </div>
              ) : (
                /* ── Display Mode ── */
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 6 }}>{idea.text}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: CAT_COLOR[idea.category] || "#888", color: "#fff" }}>{idea.category}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: URG_COLOR[idea.urgency] || "#888", color: "#fff" }}>{idea.urgency}</span>
                        {idea.techType && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#E5E7EB", color: "#374151" }}>{idea.techType}</span>}
                        {idea.status && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: idea.status === "override" ? "#FEE2E2" : "#F3F4F6", color: idea.status === "override" ? "#DC2626" : "#6B7280" }}>{idea.status}</span>}
                        {idea.linearIdentifier && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#EBF5FF", color: "#2563EB" }}>{idea.linearIdentifier}</span>}
                      </div>
                      {idea.assigneeName && <div style={{ fontSize: 11, color: C.mut, marginTop: 4 }}>Assigned to: {idea.assigneeName} {idea.dueDate ? `— due ${idea.dueDate}` : ""}</div>}
                      <div style={{ fontSize: 10, color: C.mut, marginTop: 4 }}>{idea.createdAt ? new Date(idea.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" }) : ""}</div>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                      <button onClick={() => { setEditingId(idea.id); setEditForm({ text: idea.text, category: idea.category, urgency: idea.urgency, techType: idea.techType || "" }); }}
                        style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.brd}`, background: "#fff", fontSize: 11, cursor: "pointer", color: C.tx }}>Edit</button>
                      <button onClick={() => handleRethink(idea.id)} disabled={rethinkingId === idea.id}
                        style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.brd}`, background: rethinkingId === idea.id ? "#FEF9C3" : "#fff", fontSize: 11, cursor: "pointer", color: "#D97706" }}>
                        {rethinkingId === idea.id ? "Thinking..." : "AI Rethink"}
                      </button>
                      <button onClick={() => handleConvertToTask(idea)}
                        style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid #16A34A`, background: "#DCFCE7", fontSize: 11, cursor: "pointer", color: "#166534", fontWeight: 600 }}>Task</button>
                      {confirmDelete === idea.id ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => handleDelete(idea.id)} style={{ padding: "4px 8px", borderRadius: 5, border: "none", background: "#DC2626", fontSize: 11, cursor: "pointer", color: "#fff" }}>Confirm</button>
                          <button onClick={() => setConfirmDelete(null)} style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid ${C.brd}`, background: "#fff", fontSize: 11, cursor: "pointer" }}>No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(idea.id)}
                          style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid #FECACA`, background: "#FEF2F2", fontSize: 11, cursor: "pointer", color: "#DC2626" }}>Del</button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
