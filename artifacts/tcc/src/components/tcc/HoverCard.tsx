import { useState, useRef, useCallback } from "react";
import { C, F } from "./constants";

interface Row { label: string; value: string; color?: string; }

interface Props {
  rows: Row[];
  children: React.ReactNode;
}

export function HoverCard({ rows, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean }>({ top: 0, left: 0, above: false });
  const wrapRef = useRef<HTMLDivElement>(null);

  const show = useCallback((e: React.MouseEvent) => {
    if (!wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    const tooltipH = rows.length * 26 + 24;
    const above = rect.top - tooltipH - 8 > 0;
    setPos({
      top: above ? rect.top - tooltipH - 6 : rect.bottom + 6,
      left: Math.min(rect.left, window.innerWidth - 320),
      above,
    });
    setVisible(true);
  }, [rows.length]);

  const hide = useCallback(() => setVisible(false), []);

  return (
    <div ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} style={{ position: "relative" }}>
      {children}
      {visible && (
        <div style={{
          position: "fixed",
          top: pos.top,
          left: pos.left,
          zIndex: 99999,
          background: "#1A1A1A",
          color: "#F0F0EE",
          borderRadius: 10,
          padding: "10px 14px",
          minWidth: 260,
          maxWidth: 320,
          boxShadow: "0 6px 28px rgba(0,0,0,0.35)",
          pointerEvents: "none",
          fontFamily: F,
        }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              padding: "3px 0",
              borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.07)" : "none",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.6, flexShrink: 0, paddingTop: 2, minWidth: 64 }}>
                {r.label}
              </span>
              <span style={{ fontSize: 12, color: r.color || "rgba(255,255,255,0.88)", lineHeight: 1.45, wordBreak: "break-word" }}>
                {r.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
