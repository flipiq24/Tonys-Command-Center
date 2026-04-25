import { useState } from "react";
import { C, F, FS, card, btn2 } from "./constants";

export type ReclassifyMode = "new" | "unread" | "last_24h" | "custom";

interface Props {
  open: boolean;
  newEmailCount: number;       // 0 if none pending — disables the "new" option
  onClose: () => void;
  onSubmit: (args: { mode: ReclassifyMode; sinceUnixSeconds?: number }) => void | Promise<void>;
  busy?: boolean;
}

export function ReclassifyModal({ open, newEmailCount, onClose, onSubmit, busy = false }: Props) {
  const defaultMode: ReclassifyMode = newEmailCount > 0 ? "new" : "last_24h";
  const [mode, setMode] = useState<ReclassifyMode>(defaultMode);
  const [customSince, setCustomSince] = useState<string>(() => {
    // datetime-local default = 24 hours ago in local time
    const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });

  if (!open) return null;

  const submit = () => {
    if (mode === "custom") {
      const t = new Date(customSince);
      if (isNaN(t.getTime())) { alert("Pick a valid date/time"); return; }
      onSubmit({ mode, sinceUnixSeconds: Math.floor(t.getTime() / 1000) });
    } else {
      onSubmit({ mode });
    }
  };

  const Option = ({ value, label, hint, disabled }: { value: ReclassifyMode; label: string; hint?: string; disabled?: boolean }) => (
    <label
      style={{
        display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
        border: `1px solid ${mode === value ? C.blu : C.brd}`,
        background: mode === value ? "#EFF6FF" : disabled ? "#F9FAFB" : "#fff",
        borderRadius: 8, marginBottom: 8, cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        type="radio"
        name="reclassify-mode"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        disabled={disabled}
        style={{ marginTop: 3 }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>{hint}</div>}
      </div>
    </label>
  );

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "#00000066", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, fontFamily: F }}
      onClick={onClose}
    >
      <div
        style={{ ...card, maxWidth: 520, width: "92%", maxHeight: "85vh", overflowY: "auto", padding: 20 }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontFamily: FS, fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Reclassify emails</div>
        <div style={{ fontSize: 12, color: C.mut, marginBottom: 14 }}>Pick which emails to send to the AI for classification.</div>

        <Option
          value="new"
          label={newEmailCount > 0 ? `Only new emails (${newEmailCount} pending)` : "Only new emails"}
          hint="Emails that arrived since the last poll. Appended to existing classifications."
          disabled={newEmailCount === 0}
        />
        <Option
          value="unread"
          label="All unread emails"
          hint="Every unread email currently in inbox. Replaces the existing list."
        />
        <Option
          value="last_24h"
          label="All emails from last 24 hours"
          hint="Read + unread, time-bounded. Replaces the existing list."
        />
        <Option
          value="custom"
          label="Custom time range"
          hint="Reclassify everything since a specific timestamp. Replaces the existing list."
        />

        {mode === "custom" && (
          <div style={{ margin: "10px 0 14px", padding: "10px 12px", background: "#F9FAFB", borderRadius: 8, border: `1px solid ${C.brd}` }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.5 }}>Since</label>
            <input
              type="datetime-local"
              value={customSince}
              onChange={e => setCustomSince(e.target.value)}
              style={{ display: "block", width: "100%", marginTop: 6, padding: "6px 10px", fontSize: 13, border: `1px solid ${C.brd}`, borderRadius: 6, fontFamily: F, background: "#fff" }}
            />
          </div>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
          <button
            onClick={onClose}
            disabled={busy}
            style={{ ...btn2, fontSize: 12, padding: "6px 14px", opacity: busy ? 0.6 : 1 }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              background: busy ? "#93C5FD" : "#2563EB",
              color: "#fff", border: "none", borderRadius: 6,
              padding: "6px 16px", fontSize: 13, fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              fontFamily: F,
            }}
          >
            {busy ? "Classifying…" : "Reclassify"}
          </button>
        </div>
      </div>
    </div>
  );
}
