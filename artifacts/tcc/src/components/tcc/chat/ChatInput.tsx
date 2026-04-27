import { useState, useRef, useCallback } from "react";
import { C, F } from "../constants";
import { VoiceInput } from "../VoiceInput";
import { AgentMentionDropdown } from "./AgentMentionDropdown";
import type { AgentInfo } from "./types";

interface Props {
  streaming: boolean;
  disabled: boolean;
  onSend: (text: string, mentionedAgent?: string) => void;
}

export function ChatInput({ streaming, disabled, onSend }: Props) {
  const [input, setInput] = useState("");
  const [mentionedAgent, setMentionedAgent] = useState<AgentInfo | null>(null);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    if (!input.trim() || streaming || disabled) return;
    // Strip the @mention tag from the message content for clean text
    let cleanText = input.trim();
    if (mentionedAgent) {
      cleanText = cleanText.replace(new RegExp(`@${mentionedAgent.label}\\s*`), "").trim();
    }
    onSend(cleanText || input.trim(), mentionedAgent?.id);
    setInput("");
    setMentionedAgent(null);
  }, [input, streaming, disabled, mentionedAgent, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't send on Enter while mention dropdown is visible
    if (showMentions) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
    } else {
      setShowMentions(false);
      setMentionFilter("");
    }
  };

  const handleMentionSelect = (agent: AgentInfo) => {
    setMentionedAgent(agent);
    setShowMentions(false);

    // Replace the @partial text with the full agent label
    const cursorPos = textareaRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const textAfterCursor = input.slice(cursorPos);
    const beforeAt = textBeforeCursor.replace(/@\w*$/, "");
    const newInput = `${beforeAt}@${agent.label} ${textAfterCursor}`;
    setInput(newInput);

    // Refocus textarea
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const clearMention = () => {
    setMentionedAgent(null);
    if (mentionedAgent) {
      setInput(prev => prev.replace(new RegExp(`@${mentionedAgent.label}\\s*`), ""));
    }
  };

  return (
    <div style={{
      padding: "12px 16px 16px",
      borderTop: `1px solid ${C.brd}`,
      background: C.card,
      fontFamily: F,
    }}>
      {/* Mentioned agent badge */}
      {mentionedAgent && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 8,
        }}>
          <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            borderRadius: 16,
            background: "#FFF7ED",
            border: "1px solid #FDBA74",
            fontSize: 12,
            fontWeight: 500,
            color: "#EA580C",
          }}>
            {mentionedAgent.icon} {mentionedAgent.label}
            <button
              onClick={clearMention}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#EA580C",
                fontSize: 14,
                padding: "0 0 0 4px",
                lineHeight: 1,
              }}
            >
              {"\u00D7"}
            </button>
          </span>
        </div>
      )}

      <div style={{ position: "relative" }}>
        {/* @-mention dropdown */}
        <AgentMentionDropdown
          visible={showMentions}
          filter={mentionFilter}
          onSelect={handleMentionSelect}
          onClose={() => setShowMentions(false)}
        />

        {/* Input row */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 8,
          background: C.bg,
          border: `1px solid ${C.brd}`,
          borderRadius: 12,
          padding: "6px 8px",
          transition: "border-color 0.15s ease",
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? "Command Brain is thinking..." : "Ask Command Brain anything... (@ to mention a specialist)"}
            disabled={streaming || disabled}
            rows={1}
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              resize: "none",
              minHeight: 36,
              maxHeight: 120,
              fontSize: 14,
              lineHeight: 1.5,
              fontFamily: F,
              color: C.tx,
              outline: "none",
              padding: "6px 4px",
              opacity: streaming ? 0.6 : 1,
            }}
            onFocus={() => {
              const parent = textareaRef.current?.parentElement;
              if (parent) parent.style.borderColor = "#F97316";
            }}
            onBlur={() => {
              const parent = textareaRef.current?.parentElement;
              if (parent) parent.style.borderColor = C.brd;
            }}
          />

          {/* Voice input */}
          <div style={{ flexShrink: 0, paddingBottom: 2 }}>
            <VoiceInput
              onTranscript={t => setInput(prev => prev ? prev + " " + t : t)}
              size={28}
            />
          </div>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={streaming || !input.trim() || disabled}
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              border: "none",
              background: !input.trim() || streaming || disabled ? C.brd : "#F97316",
              color: "#fff",
              cursor: !input.trim() || streaming || disabled ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
              transition: "background 0.15s ease",
            }}
          >
            {streaming ? (
              <div style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                border: "2px solid transparent",
                borderTopColor: "#fff",
                animation: "cbSpin 0.8s linear infinite",
              }} />
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 8L14 2L10 14L8 9L2 8Z" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cbSpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
