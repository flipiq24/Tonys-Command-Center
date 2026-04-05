import { useState, useRef, useCallback } from "react";
import { C, F } from "./constants";

interface Row { label: string; value: string; color?: string; href?: string; }

interface Props {
  rows: Row[];
  children: React.ReactNode;
}

export function HoverCard({ rows, children }: Props) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean }>({ top: 0, left: 0, above: false });
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasLinks = rows.some(r => !!r.href);

  const show = useCallback((e: React.MouseEvent) => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
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

  const hide = useCallback(() => {
    if (hasLinks) {
      hideTimerRef.current = setTimeout(() => setVisible(false), 200);
    } else {
      setVisible(false);
    }
  }, [hasLinks]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  return (
    <div ref={wrapRef} onMouseEnter={show} onMouseLeave={hide} style={{ position: "relative" }}>
      {children}
      {visible && (
        <div
          onMouseEnter={hasLinks ? cancelHide : undefined}
          onMouseLeave={hasLinks ? hide : undefined}
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            zIndex: 99999,
            background: C.card,
            border: `1px solid ${C.brd}`,
            borderRadius: 8,
            padding: "8px 12px",
            minWidth: 220,
            maxWidth: 300,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            pointerEvents: hasLinks ? "auto" : "none",
            fontFamily: F,
          }}>
          {rows.map((r, i) => (
            <div key={i} style={{
              display: "flex", gap: 8, alignItems: "flex-start",
              padding: "3px 0",
              borderBottom: i < rows.length - 1 ? `1px solid ${C.brd}` : "none",
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: 0.6, flexShrink: 0, paddingTop: 2, minWidth: 56 }}>
                {r.label}
              </span>
              {r.href ? (
                <a
                  href={r.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: r.color || C.blu, lineHeight: 1.5, wordBreak: "break-word", textDecoration: "underline", cursor: "pointer" }}
                >
                  {r.value}
                </a>
              ) : (
                <span style={{ fontSize: 12, color: r.color || C.tx, lineHeight: 1.5, wordBreak: "break-word" }}>
                  {r.value}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
