import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import type { CallEntry } from "./types";

interface Props {
  contact: { id: string | number; name: string } | null;
  onClose: () => void;
  onLog: (call: CallEntry) => void;
}

export function AttemptModal({ contact, onClose, onLog }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      const call = await post<CallEntry>("/calls", {
        contactName: contact.name, type: "attempt", notes: note || undefined, instructions: note || undefined
      });
      onLog(call);
      setNote("");
      onClose();
    } catch {
      onLog({ contactName: contact.name, type: "attempt", notes: note, createdAt: new Date().toISOString() });
      setNote("");
      onClose();
    }
    setSaving(false);
  };

  if (!contact) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 420, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Attempt — {contact.name}</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>Instructions for follow-up email:</p>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder='"No answer, send email about demo..."' style={{ ...inp, minHeight: 80, resize: "vertical" }} />
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={btn2}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn1, opacity: saving ? 0.5 : 1 }}>{saving ? "Logging..." : "Log & Follow-up"}</button>
        </div>
      </div>
    </div>
  );
}
