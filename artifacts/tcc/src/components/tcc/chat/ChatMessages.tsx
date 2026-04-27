import { useRef, useEffect, useCallback } from "react";
import { C, F } from "../constants";
import { renderMarkdown } from "./renderMarkdown";
import { AgentActivityIndicator } from "./AgentActivityIndicator";
import { EmptyState } from "./EmptyState";
import type { Message, ToolActivity } from "./types";

interface Props {
  messages: Message[];
  streamingText: string;
  toolActivities: ToolActivity[];
  error: string | null;
  isEmpty: boolean;
  onQuickAction?: (prompt: string) => void;
}

export function ChatMessages({ messages, streamingText, toolActivities, error, isEmpty, onQuickAction }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingText, scrollToBottom]);

  if (isEmpty && messages.length === 0 && !streamingText) {
    return <EmptyState onQuickAction={onQuickAction} />;
  }

  return (
    <div style={{
      flex: 1,
      overflowY: "auto",
      padding: "20px 24px",
      display: "flex",
      flexDirection: "column",
      gap: 16,
      fontFamily: F,
    }}>
      {messages.map(msg => (
        <div
          key={msg.id}
          style={{
            display: "flex",
            flexDirection: msg.role === "user" ? "row-reverse" : "row",
            gap: 8,
          }}
        >
          <div style={{
            maxWidth: "75%",
            padding: "12px 16px",
            borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
            background: msg.role === "user" ? "#F97316" : C.card,
            color: msg.role === "user" ? "#fff" : C.tx,
            fontSize: 14,
            lineHeight: 1.65,
            border: msg.role === "user" ? "none" : `1px solid ${C.brd}`,
            whiteSpace: "pre-wrap",
            boxShadow: msg.role === "user"
              ? "0 2px 8px rgba(249,115,22,0.2)"
              : "0 1px 4px rgba(0,0,0,0.04)",
          }}>
            {msg.role === "assistant" ? renderMarkdown(msg.content) : msg.content}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <div style={{
                marginTop: 10,
                paddingTop: 8,
                borderTop: `1px solid ${C.brd}22`,
                fontSize: 11,
                color: msg.role === "user" ? "rgba(255,255,255,0.7)" : C.mut,
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
              }}>
                {msg.toolCalls.map((t, i) => (
                  <span key={i} style={{
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: msg.role === "user" ? "rgba(255,255,255,0.15)" : C.bg,
                    fontSize: 10,
                    fontWeight: 500,
                  }}>
                    {t.name.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Streaming assistant message */}
      {(streamingText || toolActivities.length > 0) && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            maxWidth: "75%",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}>
            {/* Agent activity indicator */}
            <AgentActivityIndicator activities={toolActivities} />

            {/* Streaming text */}
            {streamingText && (
              <div style={{
                padding: "12px 16px",
                borderRadius: "16px 16px 16px 4px",
                background: C.card,
                border: `1px solid ${C.brd}`,
                fontSize: 14,
                lineHeight: 1.65,
                whiteSpace: "pre-wrap",
                color: C.tx,
                boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
              }}>
                {renderMarkdown(streamingText)}
                <span style={{
                  display: "inline-block",
                  width: 2,
                  height: 16,
                  background: "#F97316",
                  marginLeft: 2,
                  verticalAlign: "middle",
                  animation: "cbBlink 1s infinite",
                  borderRadius: 1,
                }} />
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: "10px 14px",
          background: C.redBg,
          border: `1px solid #fca5a5`,
          borderRadius: 10,
          fontSize: 13,
          color: C.red,
        }}>
          {error}
        </div>
      )}

      <div ref={endRef} />

      <style>{`
        @keyframes cbBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
