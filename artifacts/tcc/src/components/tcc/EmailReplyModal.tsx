import { useState, useEffect } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";
import type { EmailItem } from "./types";

interface Props {
  email: EmailItem | null;
  onClose: () => void;
}

export function EmailReplyModal({ email, onClose }: Props) {
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!email) return;
    setDraft("");
    setError("");
    setCopied(false);
    setLoading(true);
    post<{ ok: boolean; draft?: string }>("/emails/action", {
      action: "suggest_reply", sender: email.from, subject: email.subj
    }).then(r => { setDraft(r.draft || ""); setLoading(false); }).catch(() => { setError("Failed to generate reply. You can type one manually."); setLoading(false); });
  }, [email]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => onClose(), 600);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  if (!email) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 14, padding: 24, width: 520, maxWidth: "90vw" }}>
        <h3 style={{ fontFamily: FS, fontSize: 18, margin: "0 0 4px" }}>Suggested Reply</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 12px" }}>To: {email.from} · Re: {email.subj}</p>
        {loading
          ? <div style={{ padding: 20, textAlign: "center", color: C.mut }}>AI is drafting...</div>
          : <textarea value={draft} onChange={e => setDraft(e.target.value)} style={{ ...inp, minHeight: 140, resize: "vertical", marginBottom: 12 }} />
        }
        {error && <div style={{ marginBottom: 8, padding: "8px 12px", borderRadius: 8, background: C.redBg, color: C.red, fontSize: 12 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Cancel</button>
          <button onClick={handleCopy} disabled={!draft} style={{ ...btn1, flex: 2, opacity: draft ? 1 : 0.4 }}>{copied ? "Copied ✓" : "Copy & Close"}</button>
        </div>
      </div>
    </div>
  );
}
