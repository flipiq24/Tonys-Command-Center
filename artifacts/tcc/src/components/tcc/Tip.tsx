import { useState } from "react";
import { C, F } from "./constants";

export function Tip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)", width: 240,
          background: C.card, color: C.sub,
          border: `1px solid ${C.brd}`, borderRadius: 8,
          padding: "8px 11px", zIndex: 9999,
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          fontSize: 11, lineHeight: 1.55, pointerEvents: "none", fontFamily: F,
        }}>
          {tip}
          <div style={{
            position: "absolute", bottom: -5, left: "50%",
            transform: "translateX(-50%) rotate(45deg)",
            width: 9, height: 9,
            background: C.card,
            border: `1px solid ${C.brd}`,
            borderTop: "none", borderLeft: "none",
          }} />
        </div>
      )}
    </div>
  );
}
