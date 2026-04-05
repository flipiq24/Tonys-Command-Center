import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import { VoiceInput } from "./VoiceInput";
import type { CallEntry } from "./types";

interface Props {
  contact: { id: string | number; name: string; email?: string } | null;
  onClose: () => void;
  onLog: (call: CallEntry) => void;
  onCompose?: (opts: { to: string; subject: string; body: string; contactName: string; contactId?: string }) => void;
}

export function AttemptModal({ contact, onClose, onLog, onCompose }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState<string | null>(null);

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    setError("");
    try {
      const call = await post<CallEntry & { followUpText?: string }>("/calls", {
        contactName: contact.name, type: "attempt", notes: note || undefined, instructions: note || undefined
      });
      onLog(call);
      if (call.followUpText) {
        setFollowUpDraft(call.followUpText);
      } else {
        setNote("");
        onClose();
      }
    } catch {
      setError("Failed to log call. Try again.");
    }
    setSaving(false);
  };

  const handleSendFollowUp = () => {
    if (!contact || !followUpDraft) return;
    if (onCompose) {
      onCompose({
        to: contact.email || "",
        subject: `Follow-up: ${contact.name}`,
        body: followUpDraft,
        contactName: contact.name,
        contactId: String(contact.id),
      });
    }
    setFollowUpDraft(null);
    setNote("");
    onClose();
  };

  const handleSkipFollowUp = () => {
    setFollowUpDraft(null);
    setNote("");
    onClose();
  };

  if (!contact) return null;

  if (followUpDraft) {
    return (
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ background: C.card, borderRadius: 14, padding: 24, width: 480, maxWidth: "92vw" }}>
          <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Follow-up Draft — {contact.name}</h3>
          <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>AI drafted this based on your instructions. Review and send?</p>
          <div style={{ background: C.bg, border: `1px solid ${C.brd}`, borderRadius: 10, padding: "12px 14px", fontSize: 13, color: C.tx, lineHeight: 1.65, whiteSpace: "pre-wrap", marginBottom: 14, maxHeight: 220, overflowY: "auto", fontFamily: F }}>
            {followUpDraft}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleSkipFollowUp} style={{ ...btn2, flex: 1 }}>Skip</button>
            <button onClick={handleSendFollowUp} style={{ ...btn1, flex: 2 }}>
              {onCompose ? "Send Follow-up →" : "Done"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Attempt — {contact.name}</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>Instructions for follow-up email:</p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder='"No answer, send email about demo..."'
            style={{ ...inp, minHeight: 80, resize: "vertical", flex: 1 }}
          />
          <VoiceInput onTranscript={t => setNote(prev => prev ? prev + " " + t : t)} size={34} />
        </div>
        {error && <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={btn2}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn1, opacity: saving ? 0.5 : 1 }}>{saving ? "Logging..." : "Log & Follow-up"}</button>
        </div>
      </div>
    </div>
  );
}
