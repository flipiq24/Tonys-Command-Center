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

const CATS = ["Tech", "Sales", "Marketing", "Strategic Partners", "Operations", "Product", "Personal"];
const URGS = ["Now", "This Week", "This Month", "Someday"];
const TYPES = ["Bug", "Feature", "Note", "Task", "Strategic"];

const CAT_COLOR: Record<string, string> = {
  Tech: "#DC2626", Sales: "#16A34A", Marketing: "#9333EA", "Strategic Partners": "#2563EB",
  Operations: "#D97706", Product: "#0891B2", Personal: "#6B7280",
};
const URG_COLOR: Record<string, string> = {
  Now: "#DC2626", "This Week": "#D97706", "This Month": "#2563EB", Someday: "#6B7280",
};

// ─── Idea Detail Modal ───────────────────────────────────────────────────────
function IdeaDetailModal({ idea, onClose, onUpdated, onDeleted, onCreateTask }: {
  idea: any;
  onClose: () => void;
  onUpdated: (updated: any) => void;
  onDeleted: (id: string) => void;
  onCreateTask?: (ideaText: string, category: string, urgency: string, techType?: string) => void;
}) {
  const [tab, setTab] = useState<"details" | "ai">("details");
  const [form, setForm] = useState({
    text: idea.text || "", category: idea.category || "", urgency: idea.urgency || "",
    techType: idea.techType || "", assigneeName: idea.assigneeName || "", assigneeEmail: idea.assigneeEmail || "",
    dueDate: idea.dueDate || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [rethinking, setRethinking] = useState(false);
  // Hydrate the AI reflection from the idea row if Coach already produced
  // one for it. Re-clicking "AI Rethink" overwrites this with a fresh
  // classification (and persists the new JSON via the rethink endpoint).
  const [aiReflection, setAiReflection] = useState<any>(() => {
    if (!idea.aiReflection) return null;
    try { return JSON.parse(idea.aiReflection); }
    catch { return null; }
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [parking, setParking] = useState(false);

  const hasChanges = form.text !== (idea.text || "") || form.category !== (idea.category || "") ||
    form.urgency !== (idea.urgency || "") || form.techType !== (idea.techType || "") ||
    form.assigneeName !== (idea.assigneeName || "") || form.assigneeEmail !== (idea.assigneeEmail || "") ||
    form.dueDate !== (idea.dueDate || "");

  const URGENCY_ORDER = ["Now", "This Week", "This Month", "Someday"];

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await patch<any>(`/ideas/${idea.id}`, form);
      onUpdated({ ...idea, ...updated });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      // Notify Ethan if urgency was escalated to something more urgent
      const oldIdx = URGENCY_ORDER.indexOf(idea.urgency);
      const newIdx = URGENCY_ORDER.indexOf(form.urgency);
      if (newIdx < oldIdx && (form.urgency === "Now" || form.urgency === "This Week")) {
        post("/ideas/escalate-to-ethan", {
          text: form.text,
          rank: null,
          reasoning: `Urgency escalated from ${idea.urgency} to ${form.urgency}`,
        }).catch(() => {});
      }
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleRethink = async () => {
    setRethinking(true);
    try {
      const res = await post<{ ok: boolean; idea: any; classification: any; error?: string }>(`/ideas/${idea.id}/rethink`, {});
      if (res?.ok) {
        setAiReflection(res.classification);
        if (res.idea) {
          // Backend persists aiReflection in the rethink endpoint, so the
          // returned idea row already carries the new JSON — propagate it
          // to the parent so the list view also reflects the change.
          onUpdated({ ...idea, ...res.idea });
          setForm(f => ({ ...f, category: res.idea.category || f.category, urgency: res.idea.urgency || f.urgency, techType: res.idea.techType || f.techType }));
        }
      } else {
        setAiReflection({ error: res?.error || "AI returned an unexpected response. Please try again." });
      }
    } catch (err) {
      // Surface the real error message instead of the generic fallback —
      // failures are usually transient (rate limit, JSON parse, network)
      // not depleted credits.
      const msg = err instanceof Error ? err.message : String(err);
      setAiReflection({ error: `AI rethink failed: ${msg}` });
    }
    setRethinking(false);
  };

  const handleDelete = async () => {
    try {
      await del(`/ideas/${idea.id}`);
      onDeleted(idea.id);
      onClose();
    } catch { /* ignore */ }
  };

  const handlePark = async () => {
    if (idea.status === "parked") return; // already parked — no-op
    setParking(true);
    try {
      const updated = await patch<any>(`/ideas/${idea.id}`, { status: "parked", urgency: "Someday" });
      onUpdated({ ...idea, ...updated, status: "parked", urgency: "Someday" });
      // Park only — do NOT auto-open the task creation modal. Users who want
      // a task for the parked idea can click "Convert to Task" explicitly.
      onClose();
    } catch { /* ignore */ }
    setParking(false);
  };

  const isParked = idea.status === "parked";
  const isOverride = idea.status === "override";

  const inp: React.CSSProperties = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, fontFamily: F, fontSize: 13, background: "#fff", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.sub, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", justifyContent: "flex-end" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ width: 520, maxWidth: "95vw", background: C.bg, height: "100vh", overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.brd}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: CAT_COLOR[idea.category] || "#888", color: "#fff" }}>{idea.category}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: URG_COLOR[idea.urgency] || "#888", color: "#fff" }}>{idea.urgency}</span>
              {/* Status pill — override and parked are distinct: override = "Tony forced this through despite AI pushback", parked = "intentionally deferred to Someday". They can also stack (override first, then later parked). */}
              {isOverride && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#FEE2E2", color: "#DC2626" }}>override</span>
              )}
              {isParked && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#F3F4F6", color: "#6B7280" }}>parked</span>
              )}
              {!isOverride && !isParked && (
                <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#DCFCE7", color: "#166534" }}>active</span>
              )}
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: FS }}>{idea.text.substring(0, 60)}{idea.text.length > 60 ? "..." : ""}</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: C.mut }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: `1px solid ${C.brd}` }}>
          {(["details", "ai"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "10px 0", fontSize: 13, fontWeight: 600, fontFamily: F, cursor: "pointer",
              background: "none", border: "none", borderBottom: tab === t ? "2px solid #111" : "2px solid transparent",
              color: tab === t ? "#111" : C.mut,
            }}>{t === "details" ? "Details" : "AI Reflection"}</button>
          ))}
        </div>

        <div style={{ padding: "16px 20px" }}>
          {/* ── Details Tab ── */}
          {tab === "details" && (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={lbl}>Idea Text</label>
                <textarea value={form.text} onChange={e => setForm(f => ({ ...f, text: e.target.value }))} rows={3} style={{ ...inp, resize: "vertical" }} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Category</label>
                  <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={inp}>{CATS.map(c => <option key={c}>{c}</option>)}</select>
                </div>
                <div>
                  <label style={lbl}>Urgency</label>
                  <select value={form.urgency} onChange={e => setForm(f => ({ ...f, urgency: e.target.value }))} style={inp}>{URGS.map(u => <option key={u}>{u}</option>)}</select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={lbl}>Type</label>
                  <select value={form.techType} onChange={e => setForm(f => ({ ...f, techType: e.target.value }))} style={inp}>
                    <option value="">None</option>
                    {TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Due Date</label>
                  <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={lbl}>Assignee Name</label>
                  <input value={form.assigneeName} onChange={e => setForm(f => ({ ...f, assigneeName: e.target.value }))} style={inp} placeholder="e.g. Ethan" />
                </div>
                <div>
                  <label style={lbl}>Assignee Email</label>
                  <input value={form.assigneeEmail} onChange={e => setForm(f => ({ ...f, assigneeEmail: e.target.value }))} style={inp} placeholder="e.g. ethan@flipiq.com" />
                </div>
              </div>

              {/* Save button */}
              {hasChanges && (
                <button onClick={handleSave} disabled={saving} style={{ ...btn1, width: "100%", marginBottom: 12, opacity: saving ? 0.6 : 1 }}>
                  {saving ? "Saving..." : saved ? "Saved!" : "Save Changes"}
                </button>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <button onClick={() => { if (onCreateTask) onCreateTask(form.text, form.category, form.urgency, form.techType || undefined); onClose(); }}
                  style={{ flex: 1, padding: "8px 12px", borderRadius: 7, border: `1px solid #16A34A`, background: "#DCFCE7", color: "#166534", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
                  Convert to Task
                </button>
                <button
                  onClick={handlePark}
                  disabled={isParked || parking}
                  title={isParked ? "Already parked" : "Park this idea (move to Someday)"}
                  style={{
                    flex: 1, padding: "8px 12px", borderRadius: 7,
                    border: `1px solid ${C.brd}`, background: "#F3F4F6",
                    color: isParked ? "#9CA3AF" : "#374151",
                    fontSize: 12, fontWeight: 700, fontFamily: F,
                    cursor: isParked || parking ? "not-allowed" : "pointer",
                    opacity: isParked || parking ? 0.6 : 1,
                  }}
                >
                  {parking ? "Parking..." : isParked ? "✓ Parked" : "Park Idea"}
                </button>
              </div>

              {/* Delete */}
              {confirmDelete ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={handleDelete} style={{ flex: 1, padding: "8px", borderRadius: 7, border: "none", background: "#DC2626", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Confirm Delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ flex: 1, padding: "8px", borderRadius: 7, border: `1px solid ${C.brd}`, background: "#fff", fontSize: 12, cursor: "pointer" }}>Cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} style={{ width: "100%", padding: "8px", borderRadius: 7, border: `1px solid #FECACA`, background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Delete Idea</button>
              )}

              {/* Metadata */}
              <div style={{ marginTop: 16, padding: "12px", background: "#F9FAFB", borderRadius: 8, fontSize: 11, color: C.mut }}>
                <div>Created: {idea.createdAt ? new Date(idea.createdAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : "—"}</div>
                {idea.linearIdentifier && <div>Linear: {idea.linearIdentifier}</div>}
                {idea.assigneeName && <div>Assigned: {idea.assigneeName} ({idea.assigneeEmail || "—"})</div>}
              </div>
            </div>
          )}

          {/* ── AI Reflection Tab ── */}
          {tab === "ai" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: FS }}>AI Analysis</div>
                <button onClick={handleRethink} disabled={rethinking} style={{
                  padding: "6px 14px", borderRadius: 7, border: `1px solid ${C.brd}`, background: rethinking ? "#FEF9C3" : "#fff",
                  fontSize: 12, fontWeight: 600, cursor: rethinking ? "default" : "pointer", color: "#D97706", fontFamily: F,
                }}>{rethinking ? "Rethinking..." : "AI Rethink"}</button>
              </div>

              {aiReflection ? (
                <div style={{ background: "#FFFBEB", border: "1px solid #F59E0B", borderRadius: 8, padding: "14px 16px" }}>
                  {aiReflection.error ? (
                    <div style={{ color: "#DC2626", fontSize: 13 }}>{aiReflection.error}</div>
                  ) : (
                    <>
                      <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Category:</span> <span style={{ fontSize: 13 }}>{aiReflection.category}</span></div>
                      <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Urgency:</span> <span style={{ fontSize: 13 }}>{aiReflection.urgency}</span></div>
                      <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Type:</span> <span style={{ fontSize: 13 }}>{aiReflection.techType || "—"}</span></div>
                      <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Priority:</span> <span style={{ fontSize: 13, color: aiReflection.priority === "high" ? "#DC2626" : aiReflection.priority === "medium" ? "#D97706" : "#16A34A" }}>{aiReflection.priority}</span></div>
                      {aiReflection.reason && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Reason:</span> <span style={{ fontSize: 13 }}>{aiReflection.reason}</span></div>}
                      {aiReflection.businessFit && <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 700, fontSize: 12 }}>Business Fit:</span> <span style={{ fontSize: 13 }}>{aiReflection.businessFit}</span></div>}
                      {aiReflection.warningIfDistraction && <div style={{ padding: 10, background: "#FEE2E2", borderRadius: 6, fontSize: 12, color: "#DC2626", marginTop: 8 }}>{aiReflection.warningIfDistraction}</div>}
                    </>
                  )}
                </div>
              ) : (
                <div style={{ textAlign: "center", padding: "32px 0", color: C.mut }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
                  <div style={{ fontSize: 13 }}>Click "AI Rethink" to get AI analysis on this idea</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>AI will re-evaluate the category, urgency, priority, and business fit</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Ideas View ─────────────────────────────────────────────────────────
export function IdeasView({ ideas, onIdeasChange, onCreateTask, onNavigate, onNewIdea }: Props) {
  const [allIdeas, setAllIdeas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdea, setSelectedIdea] = useState<any | null>(null);
  const [filter, setFilter] = useState<"all" | "parked" | "override">("all");

  useEffect(() => {
    setLoading(true);
    get<any[]>("/ideas").then(d => { setAllIdeas(d || []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const filtered = filter === "all" ? allIdeas : allIdeas.filter(i => i.status === filter);

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
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

      {/* Ideas List */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40, color: C.mut }}>Loading ideas...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: C.mut }}>No ideas found</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(idea => (
            <div key={idea.id} onClick={() => setSelectedIdea(idea)} style={{
              background: C.card, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "12px 18px",
              cursor: "pointer", transition: "box-shadow 0.15s", display: "flex", justifyContent: "space-between", alignItems: "center",
            }} onMouseEnter={e => (e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.08)")} onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 5 }}>{idea.text}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: CAT_COLOR[idea.category] || "#888", color: "#fff" }}>{idea.category}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: URG_COLOR[idea.urgency] || "#888", color: "#fff" }}>{idea.urgency}</span>
                  {idea.techType && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#E5E7EB", color: "#374151" }}>{idea.techType}</span>}
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: idea.status === "override" ? "#FEE2E2" : "#F3F4F6", color: idea.status === "override" ? "#DC2626" : "#6B7280" }}>{idea.status}</span>
                  {idea.linearIdentifier && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: "#EBF5FF", color: "#2563EB" }}>{idea.linearIdentifier}</span>}
                </div>
              </div>
              <div style={{ fontSize: 11, color: C.mut, whiteSpace: "nowrap", marginLeft: 12 }}>
                {idea.createdAt ? new Date(idea.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" }) : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedIdea && (
        <IdeaDetailModal
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onUpdated={(updated) => {
            setAllIdeas(prev => prev.map(i => i.id === updated.id ? updated : i));
            setSelectedIdea(updated);
          }}
          onDeleted={(id) => {
            setAllIdeas(prev => prev.filter(i => i.id !== id));
            onIdeasChange(allIdeas.filter(i => i.id !== id));
          }}
          onCreateTask={onCreateTask}
        />
      )}
    </div>
  );
}
