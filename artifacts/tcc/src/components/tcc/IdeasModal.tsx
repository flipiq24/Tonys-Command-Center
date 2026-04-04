import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2, lbl } from "./constants";
import type { Idea } from "./types";

const CATS = ["Tech", "Sales", "Marketing", "Strategic Partners", "Operations", "Product", "Personal"];
const URG = ["Now", "This Week", "This Month", "Someday"];

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (idea: Idea) => void;
  count: number;
}

export function IdeasModal({ open, onClose, onSave, count }: Props) {
  const [newIdea, setNewIdea] = useState({ text: "", cat: "Tech", urg: "This Week", tt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!newIdea.text.trim()) return;
    setSaving(true);
    setError("");
    try {
      const idea = await post<Idea>("/ideas", {
        text: newIdea.text, category: newIdea.cat, urgency: newIdea.urg, techType: newIdea.tt || undefined
      });
      onSave(idea);
      setNewIdea({ text: "", cat: "Tech", urg: "This Week", tt: "" });
      onClose();
    } catch {
      setError("Failed to save idea. Please try again.");
    }
    setSaving(false);
  };

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, padding: 28, width: 480, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 20, margin: "0 0 4px" }}>What's your brilliant idea?</h3>
        <p style={{ fontSize: 13, color: C.mut, margin: "0 0 16px" }}>That'll be #{count + 1} — {count} ahead of it.</p>
        <textarea value={newIdea.text} onChange={e => setNewIdea({ ...newIdea, text: e.target.value })} placeholder="Speak or type..." style={{ ...inp, minHeight: 70, resize: "vertical", marginBottom: 14 }} />
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Category</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {CATS.map(c => <button key={c} onClick={() => setNewIdea({ ...newIdea, cat: c })} style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${newIdea.cat === c ? C.tx : C.brd}`, background: newIdea.cat === c ? C.tx : C.card, color: newIdea.cat === c ? "#fff" : C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{c}</button>)}
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>Urgency</label>
          <div style={{ display: "flex", gap: 5 }}>
            {URG.map(u => <button key={u} onClick={() => setNewIdea({ ...newIdea, urg: u })} style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${newIdea.urg === u ? (u === "Now" ? C.red : C.tx) : C.brd}`, background: newIdea.urg === u ? (u === "Now" ? C.red : C.tx) : C.card, color: newIdea.urg === u ? "#fff" : C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{u}</button>)}
          </div>
        </div>
        {newIdea.cat === "Tech" && (
          <div style={{ marginBottom: 12 }}>
            <label style={lbl}>Type</label>
            <div style={{ display: "flex", gap: 5 }}>
              {["Bug", "Feature", "Idea"].map(t => <button key={t} onClick={() => setNewIdea({ ...newIdea, tt: t })} style={{ padding: "5px 12px", borderRadius: 8, border: `2px solid ${newIdea.tt === t ? C.blu : C.brd}`, background: newIdea.tt === t ? C.bluBg : C.card, color: newIdea.tt === t ? C.blu : C.sub, fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: F }}>{t}</button>)}
            </div>
          </div>
        )}
        {error && <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Cancel</button>
          <button onClick={save} disabled={saving || !newIdea.text.trim()} style={{ ...btn1, flex: 2, opacity: saving || !newIdea.text.trim() ? 0.5 : 1 }}>
            {saving ? "Parking..." : "Park It — Make Calls"}
          </button>
        </div>
      </div>
    </div>
  );
}
