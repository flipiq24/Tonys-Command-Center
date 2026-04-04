import { useState } from "react";
import { post } from "@/lib/api";
import { C, F, FS, inp, btn1, btn2 } from "./constants";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ClaudeModal({ open, onClose }: Props) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState("");

  const send = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const r = await post<{ text: string; ok: boolean }>("/claude", { prompt });
      setResponse(r.text);
    } catch {
      setResponse("Claude API unavailable — check your connection.");
    }
    setLoading(false);
  };

  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.card, borderRadius: 18, padding: 28, width: 520, maxWidth: "90vw", maxHeight: "80vh", overflow: "auto" }}>
        <h3 style={{ fontFamily: FS, fontSize: 20, margin: "0 0 4px" }}>Ask Tony's AI</h3>
        <p style={{ fontSize: 12, color: C.mut, margin: "0 0 16px" }}>Draft emails, get accountability, ask anything.</p>
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="What do you need?" style={{ ...inp, minHeight: 80, resize: "vertical", marginBottom: 12 }} />
        {response && (
          <div style={{ padding: 14, background: C.grnBg, borderRadius: 10, fontSize: 13, lineHeight: 1.7, color: C.tx, marginBottom: 12, whiteSpace: "pre-wrap" }}>
            {response}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ ...btn2, flex: 1 }}>Close</button>
          <button onClick={send} disabled={loading || !prompt.trim()} style={{ ...btn1, flex: 2, opacity: loading || !prompt.trim() ? 0.5 : 1 }}>
            {loading ? "Thinking..." : "Send →"}
          </button>
        </div>
      </div>
    </div>
  );
}
