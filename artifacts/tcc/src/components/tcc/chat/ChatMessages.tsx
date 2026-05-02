import { useRef, useEffect, useCallback, useState } from "react";
import { C, F } from "../constants";
import { showToast } from "../Toast";
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
  streaming?: boolean;
  threadLoading?: boolean;
  onQuickAction?: (prompt: string) => void;
  onRetry?: () => void;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });
  } catch { return ""; }
}

function MessageBubble({ msg, isUser }: { msg: Message; isUser: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyContent = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast({ title: "Copy failed", variant: "error" });
    }
  }, [msg.content]);

  return (
    <div
      style={{ display: "flex", flexDirection: isUser ? "row-reverse" : "row", gap: 8 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start", gap: 4 }}>
        <div style={{
          padding: "12px 16px",
          borderRadius: isUser ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isUser ? "#F97316" : C.card,
          color: isUser ? "#fff" : C.tx,
          fontSize: 14,
          lineHeight: 1.65,
          border: isUser ? "none" : `1px solid ${C.brd}`,
          whiteSpace: "pre-wrap",
          boxShadow: isUser ? "0 2px 8px rgba(249,115,22,0.2)" : "0 1px 4px rgba(0,0,0,0.04)",
          position: "relative",
        }}>
          {!isUser ? renderMarkdown(msg.content) : msg.content}
          {msg.toolCalls && msg.toolCalls.length > 0 && (
            <div style={{
              marginTop: 10, paddingTop: 8,
              borderTop: `1px solid ${C.brd}22`,
              fontSize: 11, color: isUser ? "rgba(255,255,255,0.7)" : C.mut,
              display: "flex", flexWrap: "wrap", gap: 4,
            }}>
              {msg.toolCalls.map((t, i) => (
                <span key={i} style={{
                  padding: "2px 6px", borderRadius: 4,
                  background: isUser ? "rgba(255,255,255,0.15)" : C.bg,
                  fontSize: 10, fontWeight: 500,
                }}>
                  {t.name.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "0 4px", minHeight: 14 }}>
          <span style={{ fontSize: 10, color: C.mut, fontVariantNumeric: "tabular-nums" }}>
            {formatTime(msg.createdAt)}
          </span>
          {!isUser && hovered && (
            <button
              onClick={copyContent}
              title="Copy message"
              style={{
                background: "none", border: "none", padding: "1px 4px",
                fontSize: 10, color: copied ? C.grn : C.mut, cursor: "pointer",
                borderRadius: 3, fontFamily: F,
              }}
            >
              {copied ? "✓ Copied" : "📋 Copy"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatMessages({ messages, streamingText, toolActivities, error, isEmpty, streaming = false, threadLoading = false, onQuickAction, onRetry }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingText, scrollToBottom]);

  if (threadLoading) {
    return (
      <div style={{ flex: 1, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12, fontFamily: F }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            alignSelf: i % 2 === 0 ? "flex-start" : "flex-end",
            width: i % 2 === 0 ? "60%" : "45%",
            padding: 14,
            borderRadius: i % 2 === 0 ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
            background: i % 2 === 0 ? C.card : "#FFEDD5",
            border: i % 2 === 0 ? `1px solid ${C.brd}` : "none",
          }}>
            <div style={{ height: 10, background: i % 2 === 0 ? "#EEE" : "#FED7AA", borderRadius: 3, marginBottom: 6, width: "85%" }} />
            <div style={{ height: 10, background: i % 2 === 0 ? "#F2F2F2" : "#FDBA74", borderRadius: 3, width: "60%" }} />
          </div>
        ))}
        <div style={{ textAlign: "center", color: C.mut, fontSize: 11, fontStyle: "italic", padding: 8 }}>Loading thread…</div>
      </div>
    );
  }

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
        <MessageBubble key={msg.id} msg={msg} isUser={msg.role === "user"} />
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

      {/* Thinking indicator — shows when streaming has started but no text yet */}
      {streaming && !streamingText && toolActivities.length === 0 && (
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{
            padding: "12px 16px",
            borderRadius: "16px 16px 16px 4px",
            background: C.card,
            border: `1px solid ${C.brd}`,
            fontSize: 13,
            color: C.mut,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontStyle: "italic",
          }}>
            <span>Thinking</span>
            <span style={{ display: "inline-flex", gap: 2 }}>
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.mut, animation: "cbDot 1.2s infinite", animationDelay: "0s" }} />
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.mut, animation: "cbDot 1.2s infinite", animationDelay: "0.2s" }} />
              <span style={{ width: 4, height: 4, borderRadius: "50%", background: C.mut, animation: "cbDot 1.2s infinite", animationDelay: "0.4s" }} />
            </span>
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
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}>
          <span>{error}</span>
          {onRetry && (
            <button
              onClick={onRetry}
              style={{
                padding: "5px 12px", border: `1px solid ${C.red}`, background: "#fff",
                color: C.red, borderRadius: 6, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: F, whiteSpace: "nowrap",
              }}
            >
              ↻ Retry
            </button>
          )}
        </div>
      )}

      <div ref={endRef} />

      <style>{`
        @keyframes cbBlink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        @keyframes cbDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.7); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
