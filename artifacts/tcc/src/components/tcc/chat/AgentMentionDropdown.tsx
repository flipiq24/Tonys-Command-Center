import { useState, useEffect, useRef } from "react";
import { C, F } from "../constants";
import { MENTION_ITEMS } from "./agentList";
import type { AgentInfo } from "./types";

interface Props {
  visible: boolean;
  filter: string;
  onSelect: (item: AgentInfo) => void;
  onClose: () => void;
}

export function AgentMentionDropdown({ visible, filter, onSelect, onClose }: Props) {
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filtered = MENTION_ITEMS.filter(item => {
    const q = filter.toLowerCase();
    return (
      item.label.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
    );
  });

  const specialists = filtered.filter(i => i.category === "specialist");
  const integrations = filtered.filter(i => i.category === "integration");

  useEffect(() => {
    setActiveIdx(0);
  }, [filter]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx(i => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx(i => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[activeIdx]) {
        e.preventDefault();
        onSelect(filtered[activeIdx]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [visible, filtered, activeIdx, onSelect, onClose]);

  if (!visible || filtered.length === 0) return null;

  const renderItem = (item: AgentInfo) => {
    const idxInFiltered = filtered.indexOf(item);
    const isActive = idxInFiltered === activeIdx;
    return (
      <div
        key={item.id}
        onMouseDown={e => { e.preventDefault(); onSelect(item); }}
        onMouseEnter={() => setActiveIdx(idxInFiltered)}
        style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "9px 12px", borderRadius: 10, cursor: "pointer",
          background: isActive ? "#F3F4F6" : "transparent",
          transition: "background 0.08s ease",
        }}
      >
        <span style={{ fontSize: 18, width: 22, textAlign: "center" }}>{item.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, fontFamily: F }}>
            {item.label}
          </div>
          <div style={{ fontSize: 11, color: C.mut, fontFamily: F, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.description}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute", bottom: "calc(100% + 8px)", left: 0,
        width: 360, maxHeight: 380, overflowY: "auto",
        background: "#FFFFFF",
        border: `1px solid ${C.brd}`,
        borderRadius: 14,
        boxShadow: "0 10px 30px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        padding: 6, zIndex: 100,
      }}
    >
      {specialists.length > 0 && (
        <>
          <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F }}>
            Specialists
          </div>
          {specialists.map(renderItem)}
        </>
      )}
      {integrations.length > 0 && (
        <>
          <div style={{ padding: "10px 12px 4px", fontSize: 10, fontWeight: 700, color: C.mut, textTransform: "uppercase", letterSpacing: "0.08em", fontFamily: F, borderTop: specialists.length > 0 ? `1px solid ${C.brd}` : "none", marginTop: specialists.length > 0 ? 4 : 0 }}>
            Integrations
          </div>
          {integrations.map(renderItem)}
        </>
      )}
    </div>
  );
}
