import { useState } from "react";
import { post } from "@/lib/api";
import { FontLink } from "./FontLink";
import { C, F, FS, card, inp, btn1, btn2 } from "./constants";

interface Props {
  onComplete: (formatted: string) => void;
}

export function JournalGate({ onComplete }: Props) {
  const [jTxt, setJTxt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (skip = false) => {
    setSaving(true);
    setError("");
    if (skip) {
      onComplete("");
      setSaving(false);
      return;
    }
    try {
      const j = await post<{ formattedText?: string; rawText?: string }>("/journal", { rawText: jTxt });
      onComplete(j.formattedText || j.rawText || jTxt);
    } catch {
      setError("Failed to save journal. Please try again.");
    }
    setSaving(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: F, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <FontLink />
      <div style={{ ...card, padding: "36px 40px", maxWidth: 540, width: "100%" }}>
        <h1 style={{ fontFamily: FS, fontSize: 28, margin: 0 }}>Journal</h1>
        <p style={{ color: C.mut, margin: "6px 0 20px", fontSize: 13 }}>Brain dump — speak or type. AI will format it.</p>
        <textarea
          value={jTxt}
          onChange={e => setJTxt(e.target.value)}
          placeholder="What's on your mind? What happened yesterday? What are you grateful for?"
          style={{ ...inp, minHeight: 180, resize: "vertical", fontSize: 15, lineHeight: 1.7 }}
        />
        {error && <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 10, background: C.redBg, color: C.red, fontSize: 13 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button onClick={() => submit(true)} disabled={saving} style={{ ...btn2, flex: 1 }}>Skip</button>
          <button onClick={() => submit(false)} disabled={saving || !jTxt.trim()}
            style={{ ...btn1, flex: 2, opacity: saving || !jTxt.trim() ? 0.4 : 1 }}>
            {saving ? "AI Formatting..." : "Save & Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
