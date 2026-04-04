import { useState, useEffect, useCallback } from "react";
import { get, patch, post, del } from "@/lib/api";
import { C, F, FS, PC, PCBg, SC, PIPELINE_STAGES, LEAD_SOURCES, STATUS_OPTIONS } from "./constants";
import type { Contact, ContactNote, CallEntry } from "./types";

interface Props {
  contactId: string | null;
  onClose: () => void;
  onUpdated: (contact: Contact) => void;
  onDeleted: (id: string) => void;
  onAttempt: (contact: { id: string | number; name: string }) => void;
  onConnected: (contactName: string) => void;
  onSmsOpen: (contact: Contact) => void;
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

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(" ");
  const init = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return (
    <div style={{
      width: 48, height: 48, borderRadius: "50%", background: C.tx, color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: FS, fontSize: 18, fontWeight: 700, flexShrink: 0, letterSpacing: 1,
    }}>
      {init.toUpperCase()}
    </div>
  );
}

function isOverdue(date?: string | null): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

export function ContactDrawer({ contactId, onClose, onUpdated, onDeleted, onAttempt, onConnected, onSmsOpen }: Props) {
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
  const [activeTab, setActiveTab] = useState<"details" | "notes" | "activity">("details");

  useEffect(() => {
    if (!contactId) { setContact(null); setDraft({}); setHasChanges(false); return; }
    setLoading(true);
    setActiveTab("details");
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

  const updateDraft = useCallback((field: keyof Contact, value: unknown) => {
    setDraft(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  }, []);

  const handleQuickUpdate = useCallback(async (field: keyof Contact, value: string) => {
    if (!contactId || !contact) return;
    try {
      const updated = await patch<Contact>(`/contacts/${contactId}`, { [field]: value });
      setContact(updated);
      setDraft(prev => ({ ...prev, [field]: value }));
      onUpdated(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(""), 1500);
    } catch { /* silent */ }
  }, [contactId, contact, onUpdated]);

  const handleSave = useCallback(async () => {
    if (!contactId || !hasChanges) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      const fields: (keyof Contact)[] = [
        "name", "company", "title", "phone", "email", "status", "pipelineStage",
        "dealValue", "dealProbability", "leadSource", "linkedinUrl", "website",
        "nextStep", "notes", "followUpDate", "expectedCloseDate", "lastContactDate", "tags",
      ];
      for (const f of fields) {
        if (f in draft) payload[f] = draft[f as keyof Contact];
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
  }, [contactId, draft, hasChanges, onUpdated]);

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
        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flex: 1, color: C.mut, fontSize: 14 }}>
            Loading…
          </div>
        ) : contact ? (
          <>
            <div style={{ padding: "20px 20px 0", borderBottom: `1px solid ${C.brd}`, background: "#FAFAF8" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 12 }}>
                <Initials name={contact.name} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 700, color: C.tx, lineHeight: 1.2 }}>{contact.name}</div>
                  {contact.company && <div style={{ fontSize: 13, color: C.sub, marginTop: 2 }}>{contact.company}{contact.title ? ` · ${contact.title}` : ""}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: contact.status === "Hot" ? C.redBg : contact.status === "Warm" ? C.ambBg : C.bluBg, color: SC[contact.status || "New"] || C.mut }}>{contact.status || "New"}</span>
                    {contact.pipelineStage && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: PCBg[contact.pipelineStage] || "#F5F5F5", color: PC[contact.pipelineStage] || C.mut }}>{contact.pipelineStage}</span>}
                    {contact.dealValue && <span style={{ fontSize: 11, fontWeight: 700, color: C.grn }}>💰 ${Number(contact.dealValue).toLocaleString()}</span>}
                    {contact.followUpDate && <span style={{ fontSize: 11, fontWeight: 700, color: isOverdue(contact.followUpDate) ? C.red : C.mut }}>📅 {contact.followUpDate}</span>}
                  </div>
                </div>
                <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: C.mut, fontSize: 20, padding: 4, lineHeight: 1, flexShrink: 0 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 6, paddingBottom: 12 }}>
                {contact.phone && (
                  <a href={`tel:${contact.phone}`} onClick={() => onAttempt({ id: contact.id, name: contact.name })} style={{ flex: 1, padding: "8px 4px", background: C.tx, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F, textAlign: "center", textDecoration: "none", display: "block" }}>📞 Call</a>
                )}
                {contact.phone && (
                  <button onClick={() => onSmsOpen(contact)} style={{ flex: 1, padding: "8px 4px", background: C.bluBg, color: C.blu, border: `1px solid ${C.blu}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>💬 Text</button>
                )}
                <button onClick={() => onConnected(contact.name)} style={{ flex: 1, padding: "8px 4px", background: C.grnBg, color: C.grn, border: `1px solid ${C.grn}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>✓ Done</button>
                <button onClick={() => setConfirmDelete(!confirmDelete)} style={{ padding: "8px 10px", background: C.redBg, color: C.red, border: `1px solid ${C.redBg}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>🗑</button>
              </div>
              {confirmDelete && (
                <div style={{ background: C.redBg, borderRadius: 8, padding: "10px 12px", marginBottom: 8, fontSize: 13 }}>
                  Delete {contact.name}? <button onClick={handleDelete} style={{ marginLeft: 8, padding: "3px 10px", background: C.red, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Delete</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ marginLeft: 6, padding: "3px 10px", background: C.card, color: C.tx, border: `1px solid ${C.brd}`, borderRadius: 6, cursor: "pointer", fontSize: 12 }}>Cancel</button>
                </div>
              )}
              <div style={{ display: "flex", gap: 0, borderTop: `1px solid ${C.brd}`, marginTop: 4 }}>
                {(["details", "notes", "activity"] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{ flex: 1, padding: "10px 4px", background: "none", border: "none", borderBottom: activeTab === tab ? `2px solid ${C.tx}` : "2px solid transparent", fontFamily: F, fontSize: 12, fontWeight: 700, color: activeTab === tab ? C.tx : C.mut, cursor: "pointer", textTransform: "capitalize", letterSpacing: 0.5 }}>
                    {tab === "notes" ? `Notes (${notes.length})` : tab === "activity" ? `Activity (${calls.length})` : "Details"}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
              {activeTab === "details" && (
                <>
                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Status</label>
                      <select value={draft.status || "New"} onChange={e => { updateDraft("status", e.target.value); handleQuickUpdate("status", e.target.value); }} style={sel}>
                        {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Pipeline Stage</label>
                      <select value={draft.pipelineStage || "Lead"} onChange={e => { updateDraft("pipelineStage", e.target.value); handleQuickUpdate("pipelineStage", e.target.value); }} style={sel}>
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

                  <div style={fieldRow}>
                    <label style={lbl}>Lead Source</label>
                    <select value={draft.leadSource || ""} onChange={e => updateDraft("leadSource", e.target.value)} style={sel}>
                      <option value="">— Select —</option>
                      {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Next Step</label>
                    <textarea value={draft.nextStep ?? ""} onChange={e => updateDraft("nextStep", e.target.value)} rows={2} style={{ ...inp, resize: "vertical" }} placeholder="What's the next action?" />
                  </div>

                  <hr style={{ border: "none", borderTop: `1px solid ${C.brd}`, margin: "14px 0" }} />

                  <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Name</label>
                      <input value={draft.name ?? ""} onChange={e => updateDraft("name", e.target.value)} style={inp} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={lbl}>Title / Role</label>
                      <input value={draft.title ?? ""} onChange={e => updateDraft("title", e.target.value)} style={inp} placeholder="CEO, Broker…" />
                    </div>
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Company</label>
                    <input value={draft.company ?? ""} onChange={e => updateDraft("company", e.target.value)} style={inp} />
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
                    <input value={(draft.tags ?? []).join(", ")} onChange={e => updateDraft("tags", e.target.value.split(",").map(t => t.trim()).filter(Boolean))} style={inp} placeholder="investor, warm, referral…" />
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Notes</label>
                    <textarea value={draft.notes ?? ""} onChange={e => updateDraft("notes", e.target.value)} rows={3} style={{ ...inp, resize: "vertical" }} placeholder="Internal notes about this contact…" />
                  </div>

                  <div style={fieldRow}>
                    <label style={lbl}>Last Contact Date</label>
                    <input type="date" value={draft.lastContactDate ?? ""} onChange={e => updateDraft("lastContactDate", e.target.value)} style={inp} />
                  </div>

                  {hasChanges && (
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                      <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: "11px 0", background: C.tx, color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer", fontFamily: F, opacity: saving ? 0.7 : 1 }}>
                        {saving ? "Saving…" : "Save Changes"}
                      </button>
                      {saveMsg && <span style={{ fontSize: 12, color: saveMsg.includes("Error") ? C.red : C.grn, fontWeight: 600 }}>{saveMsg}</span>}
                    </div>
                  )}
                  {!hasChanges && saveMsg && (
                    <div style={{ fontSize: 12, color: C.grn, fontWeight: 600, textAlign: "center", marginTop: 4 }}>{saveMsg}</div>
                  )}
                </>
              )}

              {activeTab === "notes" && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
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
                        return (
                          <div key={`note-${n.id}`} style={{ padding: "10px 12px", background: "#FAFAF8", borderRadius: 10, marginBottom: 8, borderLeft: `3px solid ${C.brd}` }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>Note</div>
                            <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{n.text}</div>
                            <div style={{ fontSize: 10, color: C.mut, marginTop: 4 }}>{n.createdAt ? new Date(n.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                          </div>
                        );
                      }
                    })}
                  </>
                );
              })()}
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
