import { useState, useEffect, useRef } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import { VoiceField } from "./VoiceField";
import type { EmailItem } from "./types";

interface Props {
  email: EmailItem | null;
  onClose: () => void;
}

export function EmailReplyModal({ email, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!email) return;
    // Abort any in-flight request from a previous email
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setDraft("");
    setLoading(true);
    post<{ ok: boolean; draft?: string }>("/emails/action", {
      action: "suggest_reply", sender: email.from, subject: email.subj
    }).then(r => {
      if (controller.signal.aborted) return;
      setDraft(r.draft || "");
      setLoading(false);
    }).catch(err => {
      if (controller.signal.aborted) return;
      console.error("[EmailReplyModal] Draft fetch failed:", err);
      setLoading(false);
    });

    return () => {
      controller.abort();
    };
  }, [email]);

  if (!email) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 520, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Suggested Reply</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>To: {email.from} · Re: {email.subj}</p>
        {loading
          ? <div style={{ padding: 20, textAlign: "center", color: C.mut }}>AI is drafting...</div>
          : <VoiceField as="textarea" value={draft} onChange={setDraft} style={{ ...inp, minHeight: 140, resize: "vertical", marginBottom: 12 }} />
        }
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Cancel</button>
          <button onClick={() => { navigator.clipboard?.writeText(draft); onClose(); }} style={{ ...btn1, flex: 2 }}>Copy & Close</button>
        </div>
      </div>
    </div>
  );
}
