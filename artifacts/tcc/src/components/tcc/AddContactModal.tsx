import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, PIPELINE_STAGES, STATUS_OPTIONS, CONTACT_TYPES, CONTACT_CATEGORIES, LEAD_SOURCES } from "./constants";
import type { Contact } from "./types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (contact: Contact) => void;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${C.brd}`,
  fontSize: 14, fontFamily: F, boxSizing: "border-box", outline: "none", background: "#FAFAF8",
};
const lbl: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: C.mut,
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5,
};

export function AddContactModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: "", company: "", title: "", phone: "", email: "",
    status: "New", pipelineStage: "Lead", leadSource: "", type: "", category: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const contact = await post<Contact>("/contacts", {
        name: form.name.trim(),
        company: form.company || undefined,
        title: form.title || undefined,
        phone: form.phone || undefined,
        email: form.email || undefined,
        status: form.status,
        pipelineStage: form.pipelineStage,
        leadSource: form.leadSource || undefined,
        type: form.type || undefined,
        category: form.category || undefined,
      });
      onCreated(contact);
      setForm({ name: "", company: "", title: "", phone: "", email: "", status: "New", pipelineStage: "Lead", leadSource: "", type: "", category: "" });
      onClose();
    } catch {
      setError("Failed to create contact");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.22)", zIndex: 1100, backdropFilter: "blur(2px)" }} />
      <div style={{
        position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        width: 480, background: "#FFF", borderRadius: 16, padding: "28px 28px 24px",
        zIndex: 1101, boxShadow: "0 20px 60px rgba(0,0,0,0.15)", border: `1px solid ${C.brd}`,
        maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ fontFamily: FS, fontSize: 20, margin: 0, color: C.tx }}>Add Contact</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.mut, fontSize: 20 }}>✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={lbl}>Full Name *</label>
            <input value={form.name} onChange={set("name")} style={inp} placeholder="Jane Smith" autoFocus />
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Company</label>
              <input value={form.company} onChange={set("company")} style={inp} placeholder="Acme Corp" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Title / Role</label>
              <input value={form.title} onChange={set("title")} style={inp} placeholder="CEO" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Phone</label>
              <input value={form.phone} onChange={set("phone")} style={inp} type="tel" placeholder="(555) 123-4567" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Email</label>
              <input value={form.email} onChange={set("email")} style={inp} type="email" placeholder="jane@acme.com" />
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Status</label>
              <select value={form.status} onChange={set("status")} style={{ ...inp, cursor: "pointer" }}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Pipeline Stage</label>
              <select value={form.pipelineStage} onChange={set("pipelineStage")} style={{ ...inp, cursor: "pointer" }}>
                {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Contact Type</label>
              <select value={form.type} onChange={set("type")} style={{ ...inp, cursor: "pointer" }}>
                <option value="">— Select —</option>
                {CONTACT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Category</label>
              <select value={form.category} onChange={set("category")} style={{ ...inp, cursor: "pointer" }}>
                <option value="">— Select —</option>
                {CONTACT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={lbl}>Lead Source</label>
            <select value={form.leadSource} onChange={set("leadSource")} style={{ ...inp, cursor: "pointer" }}>
              <option value="">— Select —</option>
              {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onClose} style={{ flex: 1, padding: "12px 0", background: "none", color: C.mut, border: `1px solid ${C.brd}`, borderRadius: 10, fontSize: 14, cursor: "pointer", fontFamily: F }}>Cancel</button>
            <button type="submit" disabled={saving} style={{ flex: 2, padding: "12px 0", background: C.tx, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: F, opacity: saving ? 0.7 : 1 }}>
              {saving ? "Creating…" : "Create Contact"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
