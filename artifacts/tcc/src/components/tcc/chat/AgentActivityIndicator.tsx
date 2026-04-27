import { useState } from "react";
import { C, F } from "../constants";
import type { ToolActivity } from "./types";

interface Props {
  activities: ToolActivity[];
}

export function AgentActivityIndicator({ activities }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (activities.length === 0) return null;

  // Group by agent for cleaner display
  const running = activities.filter(a => a.status === "running");
  const done = activities.filter(a => a.status === "done");
  const currentAgent = running.length > 0 ? running[running.length - 1].agentName : null;

  return (
    <div style={{
      background: C.card,
      border: `1px solid ${C.brd}`,
      borderRadius: 12,
      padding: "10px 14px",
      marginBottom: 8,
      fontFamily: F,
      maxWidth: "75%",
    }}>
      {/* Main status line */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        {running.length > 0 && (
          <div style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            border: "2.5px solid transparent",
            borderTopColor: "#F97316",
            borderRightColor: "#F97316",
            animation: "cbSpin 0.8s linear infinite",
            flexShrink: 0,
          }} />
        )}
        {running.length === 0 && (
          <span style={{ fontSize: 14, color: C.grn, flexShrink: 0 }}>{"\u2713"}</span>
        )}

        <span style={{
          fontSize: 13,
          fontWeight: 600,
          color: running.length > 0 ? C.tx : C.mut,
          flex: 1,
        }}>
          {running.length > 0
            ? `Consulting ${currentAgent}...`
            : `Done \u00B7 ${done.length} tool${done.length !== 1 ? "s" : ""} used`
          }
        </span>

        {activities.length > 1 && (
          <span style={{
            fontSize: 11,
            color: C.mut,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}>
            {"\u25BC"}
          </span>
        )}
      </div>

      {/* Expanded tool details */}
      {expanded && activities.length > 0 && (
        <div style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: `1px solid ${C.brd}`,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          {activities.map(activity => (
            <div key={activity.id} style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
              color: activity.status === "running" ? C.sub : C.mut,
            }}>
              {activity.status === "running" ? (
                <span style={{ color: "#F97316" }}>{"\u25CF"}</span>
              ) : (
                <span style={{ color: C.grn }}>{"\u2713"}</span>
              )}
              <span style={{ fontWeight: 500 }}>{activity.agentName}</span>
              <span style={{ color: C.mut }}>{"\u00B7"}</span>
              <span>{activity.toolName}</span>
            </div>
          ))}
        </div>
      )}

      {/* CSS for spinner */}
      <style>{`
        @keyframes cbSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
