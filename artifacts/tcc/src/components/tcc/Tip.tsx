import { useState } from "react";

export function Tip({ tip, children }: { tip: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      {children}
      {show && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", width: 260, background: "#1A1A1A", color: "#fff", borderRadius: 10, padding: "10px 12px", zIndex: 9999, boxShadow: "0 8px 32px rgba(0,0,0,0.3)", fontSize: 11, lineHeight: 1.5, pointerEvents: "none" }}>
          {tip}
          <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)", width: 10, height: 10, background: "#1A1A1A", rotate: "45deg" }} />
        </div>
      )}
    </div>
  );
}
