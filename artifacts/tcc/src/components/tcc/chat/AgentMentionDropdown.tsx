import { useState, useEffect, useRef } from "react";
import { C, F } from "../constants";
import { AGENTS } from "./agentList";
import type { AgentInfo } from "./types";

interface Props {
  visible: boolean;
  filter: string;
  onSelect: (agent: AgentInfo) => void;
  onClose: () => void;
}

export function AgentMentionDropdown({ visible, filter, onSelect, onClose }: Props) {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = AGENTS.filter(agent =>
    agent.label.toLowerCase().includes(filter.toLowerCase()) ||
    agent.id.toLowerCase().includes(filter.toLowerCase())
  );

  // Reset index when filter changes
  useEffect(() => { setActiveIndex(0); }, [filter]);

  // Keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex(prev => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" && filtered.length > 0) {
        e.preventDefault();
        onSelect(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visible, filtered, activeIndex, onSelect, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.children[activeIndex] as HTMLElement | undefined;
    activeEl?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!visible || filtered.length === 0) return null;

  return (
    <div style={{
      position: "absolute",
      bottom: "100%",
      left: 0,
      marginBottom: 4,
      width: 280,
      maxHeight: 300,
      overflowY: "auto",
      background: C.card,
      border: `1px solid ${C.brd}`,
      borderRadius: 12,
      boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
      fontFamily: F,
      zIndex: 100,
    }}>
      <div style={{
        padding: "8px 12px 4px",
        fontSize: 11,
        fontWeight: 600,
        color: C.mut,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
      }}>
        Specialists
      </div>

      <div ref={listRef}>
        {filtered.map((agent, idx) => (
          <div
            key={agent.id}
            onClick={() => onSelect(agent)}
            onMouseEnter={() => setActiveIndex(idx)}
            style={{
              padding: "8px 12px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              background: idx === activeIndex ? "#FFF7ED" : "transparent",
              borderLeft: idx === activeIndex ? "3px solid #F97316" : "3px solid transparent",
              transition: "background 0.1s ease",
            }}
          >
            <span style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: idx === activeIndex ? "#FEF3C7" : C.bg,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}>
              {agent.icon}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: C.tx,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {agent.label}
              </div>
              <div style={{
                fontSize: 11,
                color: C.mut,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {agent.description}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
