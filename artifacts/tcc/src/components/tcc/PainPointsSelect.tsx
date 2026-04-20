import { useState, useMemo } from "react";
import { C, F } from "./constants";

export const PRESET_PAIN_POINTS = [
  "Too many disconnected tools",
  "Can't find investor-friendly agents",
  "High dispo costs (InvestorLift)",
  "No pipeline visibility",
  "SMS deliverability issues",
  "Email deliverability issues",
  "Slow acquisition rep ramp-up",
  "No call performance tracking",
  "Deal analysis in separate tools",
  "No team KPI visibility",
] as const;

function parsePainPoints(v: string | undefined | null): string[] {
  if (!v) return [];
  return v.split(",").map(s => s.trim()).filter(Boolean);
}

function serializePainPoints(list: string[]): string {
  return list.join(", ");
}

interface Props {
  value: string | undefined | null;
  onChange: (next: string) => void;
  compact?: boolean;
}

export function PainPointsSelect({ value, onChange, compact }: Props) {
  const selected = useMemo(() => parsePainPoints(value), [value]);
  const [custom, setCustom] = useState("");

  const isSelected = (opt: string) => selected.includes(opt);
  const toggle = (opt: string) => {
    const next = isSelected(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
    onChange(serializePainPoints(next));
  };
  const addCustom = () => {
    const v = custom.trim();
    if (!v || selected.includes(v)) { setCustom(""); return; }
    onChange(serializePainPoints([...selected, v]));
    setCustom("");
  };
  const remove = (opt: string) => onChange(serializePainPoints(selected.filter(s => s !== opt)));

  const customOnes = selected.filter(s => !PRESET_PAIN_POINTS.includes(s as typeof PRESET_PAIN_POINTS[number]));

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {PRESET_PAIN_POINTS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => toggle(p)}
            style={{
              padding: compact ? "4px 9px" : "5px 11px",
              borderRadius: 999,
              border: `1px solid ${isSelected(p) ? C.red : C.brd}`,
              background: isSelected(p) ? C.redBg : "#FAFAF8",
              color: isSelected(p) ? C.red : C.sub,
              fontSize: compact ? 11 : 12,
              fontWeight: isSelected(p) ? 600 : 400,
              fontFamily: F,
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {isSelected(p) ? "✓ " : ""}{p}
          </button>
        ))}
      </div>

      {customOnes.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {customOnes.map(p => (
            <span
              key={p}
              style={{
                padding: compact ? "4px 9px" : "5px 11px",
                borderRadius: 999,
                border: `1px dashed ${C.amb}`,
                background: C.ambBg,
                color: C.amb,
                fontSize: compact ? 11 : 12,
                fontWeight: 600,
                fontFamily: F,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {p}
              <button type="button" onClick={() => remove(p)} style={{ background: "none", border: "none", color: C.amb, cursor: "pointer", padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6 }}>
        <input
          type="text"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          placeholder="Add custom pain point…"
          style={{
            flex: 1,
            padding: compact ? "6px 10px" : "7px 11px",
            borderRadius: 8,
            border: `1px solid ${C.brd}`,
            background: "#FAFAF8",
            fontFamily: F,
            fontSize: compact ? 12 : 13,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!custom.trim()}
          style={{
            padding: compact ? "6px 12px" : "7px 14px",
            borderRadius: 8,
            border: `1px solid ${C.brd}`,
            background: custom.trim() ? C.tx : "#FAFAF8",
            color: custom.trim() ? "#fff" : C.mut,
            fontSize: compact ? 12 : 13,
            fontWeight: 600,
            fontFamily: F,
            cursor: custom.trim() ? "pointer" : "not-allowed",
          }}
        >
          + Add
        </button>
      </div>
    </div>
  );
}
