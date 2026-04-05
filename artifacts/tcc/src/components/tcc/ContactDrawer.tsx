import { useState, useEffect, useCallback, useRef } from "react";
import { get, patch, post, del } from "@/lib/api";
import { C, F, PC, PCBg, SC, PIPELINE_STAGES, LEAD_SOURCES, STATUS_OPTIONS, CONTACT_TYPES, CONTACT_CATEGORIES } from "./constants";
import { VoiceField } from "./VoiceField";
import type { Contact, ContactNote, CallEntry } from "./types";

interface FilterState {
  status: string;
  stage: string;
  type: string;
  category: string;
  search: string;
}

interface Props {
  contactId: string | null;
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
  onDeleted: (id: string) => void;
  onAttempt: (contact: { id: string | number; name: string }) => void;
  onConnected: (contactName: string) => void;
  onSmsOpen: (contact: Contact) => void;
  onCompose?: (contact: Contact) => void;
  contacts?: Contact[];
  onNavigate?: (id: string) => void;
  filters?: FilterState;
  onFiltersChange?: (partial: Partial<FilterState>) => void;
}

const inp: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8, border: `1px solid ${C.brd}`,
  fontSize: 13, fontFamily: F, boxSizing: "border-box", outline: "none", background: "#FAFAF8",
};
const sel: React.CSSProperties = { ...inp, cursor: "pointer" };
const lbl: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700, color: C.mut,
  textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4,
};
const fieldRow: React.CSSProperties = { marginBottom: 12 };


function isOverdue(date?: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

export function ContactDrawer({ contactId, onClose, onUpdated, onDeleted, onAttempt, onConnected, onSmsOpen, onCompose, contacts, onNavigate, filters, onFiltersChange }: Props) {
  const [contact, setContact] = useState<Contact | null>(null);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [calls, setCalls] = useState<CallEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [draft, setDraft] = useState<Partial<Contact>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "activity" | "meetings">("details");
  const [meetings, setMeetings] = useState<{ id: string; date: string; contactName: string | null; summary: string | null; nextSteps: string | null; outcome: string | null }[]>([]);
  const [meetingsLoaded, setMeetingsLoaded] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentIndex = contacts && contactId ? contacts.findIndex(c => String(c.id) === contactId) : -1;
  const total = contacts?.length ?? 0;
  const prevId = currentIndex > 0 && contacts ? String(contacts[currentIndex - 1].id) : null;
  const nextId = currentIndex < total - 1 && contacts ? String(contacts[currentIndex + 1].id) : null;

  const hasActiveFilters = filters && (
    filters.status !== "All" || filters.stage !== "All" ||
    filters.type !== "All" || filters.category !== "All" || filters.search.trim() !== ""
  );

  useEffect(() => {
    if (!contactId) { setContact(null); setDraft({}); setHasChanges(false); setMeetings([]); setMeetingsLoaded(false); setInteracted(false); return; }
    setLoading(true);
    setActiveTab("details");
    setMeetings([]);
    setMeetingsLoaded(false);
    setInteracted(false);
    get<Contact & { _notes: ContactNote[]; _calls: CallEntry[] }>(`/contacts/${contactId}`)
      .then(data => {
        const { _notes, _calls, ...c } = data;
        setContact(c);
        setDraft(c);
        setNotes(_notes ?? []);
        setCalls(_calls ?? []);
        setHasChanges(false);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [contactId]);

  useEffect(() => {
    if (activeTab !== "meetings" || meetingsLoaded || !contact?.name) return;
    get<typeof meetings>(`/meeting-history?contactName=${encodeURIComponent(contact.name)}&limit=20`)
      .then(rows => { setMeetings(rows ?? []); setMeetingsLoaded(true); })
      .catch(() => { setMeetingsLoaded(true); });
  }, [activeTab, meetingsLoaded, contact]);

  const updateDraft = useCallback((field: keyof Contact, value: unknown) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
    setInteracted(true);
  }, []);

  useEffect(() => {
    if (!hasChanges || !contactId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setSaveMsg("Unsaved…");
    autoSaveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {};
        const fields: (keyof Contact)[] = [
          "name", "company", "title", "phone", "email", "status", "pipelineStage",
          "type", "category", "dealValue", "dealProbability", "leadSource", "linkedinUrl", "website",
          "nextStep", "notes", "followUpDate", "expectedCloseDate", "lastContactDate", "tags",
        ];
        for (const f of fields) {
          if (f in draft) payload[f] = (draft as Record<string, unknown>)[f];
        }
        const updated = await patch<Contact>(`/contacts/${contactId}`, payload);
        setContact(updated);
        setDraft(updated);
        setHasChanges(false);
        onUpdated(updated);
        setSaveMsg("Saved ✓");
        setTimeout(() => setSaveMsg(""), 2000);
      } catch {
        setSaveMsg("Error saving");
        setTimeout(() => setSaveMsg(""), 2000);
      } finally {
        setSaving(false);
      }
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [draft, hasChanges, contactId, onUpdated]);

  const handleAddNote = useCallback(async () => {
    if (!contactId || !noteText.trim()) return;
    setAddingNote(true);
    try {
      const note = await post<ContactNote>(`/contacts/${contactId}/notes`, { text: noteText.trim() });
      setNotes(prev => [note, ...prev]);
      setNoteText("");
    } catch { /* silent */ }
    finally { setAddingNote(false); }
  }, [contactId, noteText]);

  const handleDelete = useCallback(async () => {
    if (!contactId || !contact) return;
    try {
      await del(`/contacts/${contactId}`);
      onDeleted(contactId);
      onClose();
    } catch { /* silent */ }
  }, [contactId, contact, onDeleted, onClose]);

  if (!contactId) return null;

  const navBtnStyle = (enabled: boolean): React.CSSProperties => ({
    background: "none", border: `1px solid ${enabled ? C.brd : "transparent"}`, borderRadius: 6,
    color: enabled ? C.tx : C.brd, cursor: enabled ? "pointer" : "default",
    fontSize: 14, fontWeight: 700, padding: "2px 8px", fontFamily: F, lineHeight: 1.4,
  });

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.18)", zIndex: 999, backdropFilter: "blur(1px)" }}
      />
      <div style={{
        position: "fixed", top: 0, right: 0, width: 440, height: "100vh",
        background: "#FFF", borderLeft: `1px solid ${C.brd}`, zIndex: 1000,
        display: "flex", flexDirection: "column", boxShadow: "-4px 0 20px rgba(0,0,0,0.08)",
        overflowY: "auto",
      }}>

        {/* ── Navigation + Filter bar ── */}
        {onNavigate && contacts && contacts.length > 0 && (
          <div style={{ borderBottom: `1px solid ${C.brd}`, background: "#F5F3EE", flexShrink: 0 }}>
            {/* Row 1: prev/next nav */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px" }}>
              <button onClick={() => prevId && onNavigate(prevId)} style={navBtnStyle(!!prevId)}>‹</button>
              <span style={{ flex: 1, textAlign: "center", fontSize: 12, color: C.sub, fontWeight: 600, fontFamily: F }}>
                {currentIndex >= 0 ? `${currentIndex + 1} of ${total}` : `${total} contacts`}
                {hasActiveFilters && <span style={{ color: C.blu, marginLeft: 4 }}>· filtered</span>}
              </span>
              <button onClick={() => nextId && onNavigate(nextId)} style={navBtnStyle(!!nextId)}>›</button>
              {onFiltersChange && (
                <button
                  onClick={() => setShowFilters(f => !f)}
                  style={{ marginLeft: 4, padding: "3px 10px", borderRadius: 6, border: `1px solid ${hasActiveFilters ? C.blu : C.brd}`, background: hasActiveFilters ? C.bluBg : "none", color: hasActiveFilters ? C.blu : C.sub, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: F }}
                >
                  {showFilters ? "Hide Filters" : `Filters${hasActiveFilters ? " ●" : ""}`}
                </button>
              )}
              <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.mut, fontSize: 18, padding: "0 2px", lineHeight: 1, marginLeft: 2 }}>✕</button>
            </div>

            {/* Row 2: filter dropdowns (collapsible) */}
            {showFilters && onFiltersChange && filters && (
              <div style={{ padding: "8px 14px 10px", display: "flex", flexWrap: "wrap", gap: 6, borderTop: `1px solid ${C.brd}` }}>
                <input
                  type="text"
                  value={filters.search}
                  onChange={e => onFiltersChange({ search: e.target.value })}
                  placeholder="Search…"
                  style={{ flex: "1 1 100%", padding: "5px 8px", borderRadius: 7, border: `1px solid ${filters.search ? C.blu : C.brd}`, fontSize: 12, fontFamily: F, outline: "none", background: "#FAFAF8" }}
                />
                <select value={filters.status} onChange={e => onFiltersChange({ status: e.target.value })}
                  style={{ flex: 1, minWidth: 90, padding: "5px 6px", borderRadius: 7, border: `1px solid ${filters.status !== "All" ? C.red : C.brd}`, fontSize: 11, fontFamily: F, background: "#FAFAF8", color: filters.status !== "All" ? C.red : C.sub, fontWeight: filters.status !== "All" ? 700 : 400 }}>
                  <option value="All">All Statuses</option>
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={filters.stage} onChange={e => onFiltersChange({ stage: e.target.value })}
                  style={{ flex: 1, minWidth: 90, padding: "5px 6px", borderRadius: 7, border: `1px solid ${filters.stage !== "All" ? C.blu : C.brd}`, fontSize: 11, fontFamily: F, background: "#FAFAF8", color: filters.stage !== "All" ? C.blu : C.sub, fontWeight: filters.stage !== "All" ? 700 : 400 }}>
                  <option value="All">All Stages</option>
                  {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={filters.type} onChange={e => onFiltersChange({ type: e.target.value })}
                  style={{ flex: 1, minWidth: 90, padding: "5px 6px", borderRadius: 7, border: `1px solid ${filters.type !== "All" ? C.amb : C.brd}`, fontSize: 11, fontFamily: F, background: "#FAFAF8", color: filters.type !== "All" ? C.amb : C.sub, fontWeight: filters.type !== "All" ? 700 : 400 }}>
                  <option value="All">All Types</option>
                  {CONTACT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
                <select value={filters.category} onChange={e => onFiltersChange({ category: e.target.value })}
                  style={{ flex: 1, minWidth: 90, padding: "5px 6px", borderRadius: 7, border: `1px solid ${filters.category !== "All" ? "#7B1FA2" : C.brd}`, fontSize: 11, fontFamily: F, background: "#FAFAF8", color: filters.category !== "All" ? "#7B1FA2" : C.sub, fontWeight: filters.category !== "All" ? 700 : 400 }}>
                  <option value="All">All Categories</option>
                  {CONTACT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                {hasActiveFilters && (
                  <button onClick={() => onFiltersChange({ status: "All", stage: "All", type: "All", category: "All", search: "" })}
                    style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${C.brd}`, background: "#FAFAF8", color: C.mut, fontSize: 11, cursor: "pointer", fontFamily: F }}>
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: C.mut, fontSize: 14 }}>
            Loading…
          </div>
        ) : contact ? (
          <>
            <div style={{ padding: "20px 20px 0", borderBottom: `1px solid ${C.brd}`, background: "#FAFAF8" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, color: C.tx, lineHeight: 1.2 }}>{contact.name}</div>
                  {contact.phone && (
                    <div style={{ fontSize: 15, color: C.sub, marginTop: 4, fontWeight: 600, letterSpacing: 0.2 }}>{contact.phone}</div>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: contact.status === "Hot" ? C.redBg : contact.status === "Warm" ? C.ambBg : C.bluBg, color: SC[contact.status || "New"] || C.mut }}>{contact.status || "New"}</span>
                    {contact.pipelineStage && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: PCBg[contact.pipelineStage] || "#F5F5F5", color: PC[contact.pipelineStage] || C.mut }}>{contact.pipelineStage}</span>}
                    {contact.dealValue && <span style={{ fontSize: 11, fontWeight: 700, color: C.grn }}>${Number(contact.dealValue).toLocaleString()}</span>}
                    {contact.followUpDate && <span style={{ fontSize: 11, fontWeight: 700, color: isOverdue(contact.followUpDate) ? C.red : C.mut }}>{contact.followUpDate}</span>}
                  </div>
                </div>
                <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.mut, fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 5, paddingBottom: 12, flexWrap: "wrap" }}>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} onClick={() => onAttempt({ id: contact.id, name: contact.name })} style={{ flex: 1, minWidth: 60, padding: "8px 4px", background: C.tx, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F, textAlign: "center", textDecoration: "none", display: "block" }}>Call</a>
                )}
                {contact.phone && (
                  <button onClick={() => { setInteracted(true); onSmsOpen(contact); }} style={{ flex: 1, minWidth: 60, padding: "8px 4px", background: C.bluBg, color: C.blu, border: `1px solid ${C.blu}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Text</button>
                )}
                {onCompose && (
                  <button onClick={() => { setInteracted(true); onCompose(contact); onClose(); }} style={{ flex: 1, minWidth: 60, padding: "8px 4px", background: C.bluBg, color: C.blu, border: `1px solid ${C.blu}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Email</button>
                )}
                <button
                  onClick={() => { if (interacted) onConnected(contact.name); }}
                  disabled={!interacted}
                  title={interacted ? "Log as done" : "Send a text, email, or make an update first"}
                  style={{ flex: 1, minWidth: 60, padding: "8px 4px", background: interacted ? C.grnBg : "#F0F0EE", color: interacted ? C.grn : C.mut, border: `1px solid ${interacted ? C.grn : C.brd}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: interacted ? "pointer" : "not-allowed", fontFamily: F, transition: "all 0.2s" }}>Done</button>
                <button onClick={() => setConfirmDelete(!confirmDelete)} style={{ padding: "8px 10px", background: C.redBg, color: C.red, border: `1px solid ${C.redBg}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>🗑</button>
              </div>
              {confirmDelete && (
                <div style={{ background: C.redBg, borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 13 }}>
                  Delete {contact.name}? <button onClick={handleDelete} style={{ marginLeft: 8, padding: "3px 10px", background: C.red, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ marginLeft: 6, padding: "3px 10px", background: C.card, color: C.tx, border: `1px solid ${C.brd}`, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${C.brd}`, marginTop: 4 }}>
                {(["details", "notes", "activity", "meetings"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: "10px 2px", background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${C.tx}` : "2px solid transparent", fontFamily: F, fontSize: 11, fontWeight: 700, color: activeTab === tab ? C.tx : C.mut, cursor: "pointer", textTransform: "capitalize", letterSpacing: 0.4 }}>
                    {tab === "notes" ? `Notes (${notes.length})` : tab === "activity" ? `Activity (${calls.length})` : tab === "meetings" ? `Meetings${meetingsLoaded ? ` (${meetings.length})` : ""}` : "Details"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
              {activeTab === "details" && (
                <>
                  {/* Quick Note */}
                  <div style={{ marginBottom: 16, padding: "12px 14px", background: "#FAFAF8", borderRadius: 10, border: `1px solid ${C.brd}` }}>
                    <label style={lbl}>Quick Note</label>
                    <VoiceField
                      as="textarea"
                      value={noteText}
                      onChange={setNoteText}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                      rows={2}
                      placeholder="Jot a note… (⌘↵ to save)"
                      style={{ ...inp, resize: "none", marginBottom: 6, fontSize: 12 }}
                    />
                    <button
                      onClick={handleAddNote}
                      disabled={addingNote || !noteText.trim()}
                      style={{ padding: "6px 14px", background: noteText.trim() ? C.tx : "#E8E6E1", color: noteText.trim() ? "#fff" : C.mut, border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: noteText.trim() ? "pointer" : "not-allowed", fontFamily: F }}
                    >
                      {addingNote ? "Saving…" : "Save Note"}
                    </button>
                    {notes.length > 0 && (
                      <span style={{ fontSize: 11, color: C.mut, marginLeft: 8 }}>{notes.length} note{notes.length !== 1 ? "s" : ""} · see Notes tab</span>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Status</label>
                      <select value={draft.status || "New"} onChange={e => updateDraft("status", e.target.value)} style={sel}>
                        {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Pipeline Stage</label>
                      <select value={draft.pipelineStage || "Lead"} onChange={e => updateDraft("pipelineStage", e.target.value)} style={sel}>
                        {PIPELINE_STAGES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Deal Value ($)</label>
                      <input type="number" value={draft.dealValue ?? ""} onChange={e => updateDraft("dealValue", e.target.value)} style={inp} placeholder="0" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Probability (%)</label>
                      <input type="number" min={0} max={100} value={draft.dealProbability ?? ""} onChange={e => updateDraft("dealProbability", Number(e.target.value))} style={inp} placeholder="0–100" />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Follow-up Date</label>
                      <input type="date" value={draft.followUpDate ?? ""} onChange={e => updateDraft("followUpDate", e.target.value)} style={{ ...inp, color: isOverdue(draft.followUpDate) ? C.red : C.tx }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Expected Close</label>
                      <input type="date" value={draft.expectedCloseDate ?? ""} onChange={e => updateDraft("expectedCloseDate", e.target.value)} style={inp} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Contact Type</label>
                      <select value={draft.type || ""} onChange={e => updateDraft("type", e.target.value)} style={sel}>
                        <option value="">— Select —</option>
                        {CONTACT_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Category</label>
                      <select value={draft.category || ""} onChange={e => updateDraft("category", e.target.value)} style={sel}>
                        <option value="">— Select —</option>
                        {CONTACT_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Lead Source</label>
                    <select value={draft.leadSource || ""} onChange={e => updateDraft("leadSource", e.target.value)} style={sel}>
                      <option value="">— Select —</option>
                      {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Next Step</label>
                    <VoiceField as="textarea" value={draft.nextStep ?? ""} onChange={v => updateDraft("nextStep", v)} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="What's the next action?" />
                  </div>

                  <hr style={{ border: "none", borderTop: `1px solid ${C.brd}`, margin: "14px 0" }} />

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Name</label>
                      <VoiceField value={draft.name ?? ""} onChange={v => updateDraft("name", v)} style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Title / Role</label>
                      <VoiceField value={draft.title ?? ""} onChange={v => updateDraft("title", v)} style={inp} placeholder="CEO, Broker…" />
                    </div>
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Company</label>
                    <VoiceField value={draft.company ?? ""} onChange={v => updateDraft("company", v)} style={inp} />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Phone</label>
                      <input value={draft.phone ?? ""} onChange={e => updateDraft("phone", e.target.value)} style={inp} type="tel" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Email</label>
                      <input value={draft.email ?? ""} onChange={e => updateDraft("email", e.target.value)} style={inp} type="email" />
                    </div>
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>LinkedIn URL</label>
                    <input value={draft.linkedinUrl ?? ""} onChange={e => updateDraft("linkedinUrl", e.target.value)} style={inp} placeholder="https://linkedin.com/in/…" />
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Website</label>
                    <input value={draft.website ?? ""} onChange={e => updateDraft("website", e.target.value)} style={inp} placeholder="https://…" />
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Tags (comma-separated)</label>
                    <VoiceField value={(draft.tags ?? []).join(", ")} onChange={v => updateDraft("tags", v.split(",").map(t => t.trim()).filter(Boolean))} style={inp} placeholder="investor, warm, referral…" />
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Notes</label>
                    <VoiceField as="textarea" value={draft.notes ?? ""} onChange={v => updateDraft("notes", v)} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Internal notes about this contact…" />
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Last Contact Date</label>
                    <input type="date" value={draft.lastContactDate ?? ""} onChange={e => updateDraft("lastContactDate", e.target.value)} style={inp} />
                  </div>

                  {saveMsg && (
                    <div style={{ fontSize: 11, color: saveMsg.includes("Error") ? C.red : saveMsg === "Unsaved…" ? C.mut : C.grn, fontWeight: 600, textAlign: "right", marginTop: 4, transition: "color 0.3s" }}>{saveMsg}</div>
                  )}
                </>
              )}

              {activeTab === "notes" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <VoiceField
                      as="textarea"
                      value={noteText}
                      onChange={setNoteText}
                      onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote(); }}
                      rows={3}
                      placeholder="Add a note… (⌘↵ to save)"
                      style={{ ...inp, resize: "vertical", marginBottom: 8 }}
                    />
                    <button onClick={handleAddNote} disabled={addingNote || !noteText.trim()} style={{ width: "100%", padding: "9px 0", background: C.tx, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: addingNote || !noteText.trim() ? "not-allowed" : "pointer", fontFamily: F, opacity: addingNote || !noteText.trim() ? 0.5 : 1 }}>
                      {addingNote ? "Adding…" : "+ Add Note"}
                    </button>
                  </div>
                  {notes.length === 0 ? (
                    <div style={{ color: C.mut, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No notes yet</div>
                  ) : (
                    notes.map(n => (
                      <div key={n.id} style={{ padding: "10px 12px", background: "#FAFAF8", borderRadius: 10, marginBottom: 8, borderLeft: `3px solid ${C.brd}` }}>
                        <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.text}</div>
                        <div style={{ fontSize: 10, color: C.mut, marginTop: 4 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                      </div>
                    ))
                  )}
                </>
              )}

              {activeTab === "activity" && (() => {
                type ActivityItem =
                  | { kind: "call"; data: CallEntry & { followUpText?: string }; ts: number }
                  | { kind: "note"; data: ContactNote; ts: number };

                const items: ActivityItem[] = [
                  ...calls.map(cl => ({
                    kind: "call" as const,
                    data: cl as CallEntry & { followUpText?: string },
                    ts: cl.createdAt ? new Date(cl.createdAt).getTime() : 0,
                  })),
                  ...notes.map(n => ({
                    kind: "note" as const,
                    data: n,
                    ts: n.createdAt ? new Date(n.createdAt).getTime() : 0,
                  })),
                ].sort((a, b) => b.ts - a.ts);

                if (items.length === 0) {
                  return <div style={{ color: C.mut, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No activity yet</div>;
                }

                return (
                  <>
                    {items.map((item, i) => {
                      if (item.kind === "call") {
                        const cl = item.data;
                        return (
                          <div key={`call-${i}`} style={{ padding: "10px 12px", background: "#FAFAF8", borderRadius: 10, marginBottom: 8, borderLeft: `3px solid ${cl.type === "connected" ? C.grn : C.mut}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>Call</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: cl.type === "connected" ? C.grn : C.tx }}>
                              {cl.type === "connected" ? "✓ Connected" : cl.type === "attempt" ? "Attempt — no answer" : cl.type}
                            </div>
                            {cl.notes && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{cl.notes}</div>}
                            {cl.followUpText && <div style={{ fontSize: 12, color: C.blu, marginTop: 4, fontStyle: "italic" }}>Follow-up draft: {cl.followUpText}</div>}
                            <div style={{ fontSize: 10, color: C.mut, marginTop: 4 }}>{cl.createdAt ? new Date(cl.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                          </div>
                        );
                      } else {
                        const n = item.data;
                        const isSystemEvent = n.kind === "status_change" || n.kind === "stage_change";
                        const accentColor = n.kind === "status_change" ? C.blu : n.kind === "stage_change" ? C.grn : C.brd;
                        const label = n.kind === "status_change" ? "Status Change" : n.kind === "stage_change" ? "Stage Move" : "Note";
                        return (
                          <div key={`note-${n.id}`} style={{ padding: "10px 12px", background: isSystemEvent ? "#F8F8FF" : "#FAFAF8", borderRadius: 10, marginBottom: 8, borderLeft: `3px solid ${accentColor}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: accentColor, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.text}</div>
                            <div style={{ fontSize: 10, color: C.mut, marginTop: 4 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                          </div>
                        );
                      }
                    })}
                  </>
                );
              })()}
              {activeTab === "meetings" && (
                <>
                  {!meetingsLoaded ? (
                    <div style={{ color: C.mut, fontSize: 13, textAlign: "center", padding: "24px 0" }}>Loading…</div>
                  ) : meetings.length === 0 ? (
                    <div style={{ color: C.mut, fontSize: 13, textAlign: "center", padding: "24px 0" }}>
                      No meeting history yet.<br />
                      <span style={{ fontSize: 12 }}>Ask the AI to log a meeting after your next call.</span>
                    </div>
                  ) : (
                    meetings.map(m => (
                      <div key={m.id} style={{ padding: "12px 14px", background: "#FAFAF8", borderRadius: 10, marginBottom: 10, borderLeft: `3px solid ${C.blu}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.blu, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
                          {m.date}
                        </div>
                        {m.summary && <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, marginBottom: 4 }}>{m.summary}</div>}
                        {m.nextSteps && (
                          <div style={{ fontSize: 12, color: C.grn, marginTop: 4 }}>
                            <span style={{ fontWeight: 700 }}>Next Steps: </span>{m.nextSteps}
                          </div>
                        )}
                        {m.outcome && (
                          <div style={{ fontSize: 11, fontWeight: 700, marginTop: 6, padding: "2px 8px", background: C.grnBg, color: C.grn, borderRadius: 4, display: "inline-block" }}>
                            {m.outcome}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: C.red, fontSize: 14 }}>
            Contact not found
          </div>
        )}
      </div>
    </>
  );
}
