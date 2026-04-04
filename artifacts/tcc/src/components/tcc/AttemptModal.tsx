import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import { VoiceInput } from "./VoiceInput";
import type { CallEntry } from "./types";

interface Props {
  contact: { id: string | number; name: string } | null;
  onClose: () => void;
  onLog: (call: CallEntry) => void;
}

export function AttemptModal({ contact, onClose, onLog }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    setError("");
    try {
      const call = await post<CallEntry>("/calls", {
        contactName: contact.name, type: "attempt", notes: note || undefined, instructions: note || undefined
      });
      onLog(call);
      setNote("");
      onClose();
    } catch {
      setError("Failed to log call. Try again.");
    }
    setSaving(false);
  };

  if (!contact) return null;
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
