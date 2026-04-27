import { useState, useRef, useCallback, useEffect } from "react";
import { C, F } from "../constants";
import { VoiceInput } from "../VoiceInput";
import { AgentMentionDropdown } from "./AgentMentionDropdown";
import type { AgentInfo } from "./types";

interface Props {
  streaming: boolean;
  disabled: boolean;
  onSend: (text: string, mentionedAgent?: string) => void;
  autoFocus?: boolean;
}

export function ChatInput({ streaming, disabled, onSend, autoFocus }: Props) {
  const [text, setText] = useState("");
  const [mention, setMention] = useState<AgentInfo | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [text]);

  useEffect(() => {
    if (autoFocus && textareaRef.current) textareaRef.current.focus();
  }, [autoFocus]);

  const send = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || streaming || disabled) return;
    onSend(trimmed, mention?.id);
    setText("");
    setMention(null);
    setMentionOpen(false);
  }, [text, streaming, disabled, mention, onSend]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value;
    setText(v);
    // Detect @ followed by non-space token at the end (or as the trailing word)
    const trailingAt = v.match(/(?:^|\s)@(\w*)$/);
    if (trailingAt) {
      setMentionFilter(trailingAt[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // While dropdown is open, let it handle navigation/select via document listener
    if (mentionOpen && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter" || e.key === "Escape")) {
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleMentionSelect = (item: AgentInfo) => {
    setMention(item);
    // Strip the trailing @token from text
    const stripped = text.replace(/(?:^|\s)@(\w*)$/, m => m.replace(/@\w*$/, "").trimEnd());
    setText(stripped + (stripped && !stripped.endsWith(" ") ? " " : ""));
    setMentionOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const insertAt = () => {
    const v = text.endsWith(" ") || !text ? text + "@" : text + " @";
    setText(v);
    setMentionFilter("");
    setMentionOpen(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const onVoiceTranscript = (t: string) => {
    setText(prev => (prev ? prev + " " : "") + t);
  };

  return (
    <div style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "0 16px 20px", boxSizing: "border-box" }}>
      <div style={{ position: "relative" }}>
        <AgentMentionDropdown
          visible={mentionOpen}
          filter={mentionFilter}
          onSelect={handleMentionSelect}
          onClose={() => setMentionOpen(false)}
        />

        <div style={{
          background: "#FFFFFF",
          border: `1px solid ${C.brd}`,
          borderRadius: 24,
          boxShadow: "0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.04)",
          display: "flex",
          alignItems: "flex-end",
          padding: "8px 8px 8px 14px",
          gap: 8,
          transition: "border-color 0.15s ease, box-shadow 0.15s ease",
        }}>
          {/* @ button */}
          <button
            onClick={insertAt}
            disabled={disabled || streaming}
            title="Mention a specialist or integration"
            style={{
              flexShrink: 0,
              width: 34, height: 34,
              border: "none", background: "transparent",
              borderRadius: 10, cursor: "pointer",
              fontSize: 18, color: C.mut,
              display: "flex", alignItems: "center", justifyContent: "center",
              alignSelf: "center",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = C.tx; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.mut; }}
          >@</button>

          {/* Mention chip */}
          {mention && (
            <div style={{
              flexShrink: 0, alignSelf: "center",
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 16,
              background: "#EFF6FF", border: `1px solid ${C.blu}33`,
              fontSize: 12, fontWeight: 600, color: C.blu, fontFamily: F,
            }}>
              <span>{mention.icon}</span>
              <span>{mention.label}</span>
              <button
                onClick={() => setMention(null)}
                style={{ marginLeft: 2, border: "none", background: "transparent", color: C.blu, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}
                title="Remove mention"
              >×</button>
            </div>
          )}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder="How can I help you today?"
            rows={1}
            disabled={disabled}
            style={{
              flex: 1, minWidth: 0,
              border: "none", outline: "none",
              resize: "none", padding: "8px 4px",
              fontSize: 15, fontFamily: F, color: C.tx,
              background: "transparent",
              lineHeight: 1.5,
              maxHeight: 200,
            }}
          />

          {/* Voice */}
          <div style={{ alignSelf: "center", flexShrink: 0 }}>
            <VoiceInput onTranscript={onVoiceTranscript} size={36} />
          </div>

          {/* Send */}
          <button
            onClick={send}
            disabled={!text.trim() || streaming || disabled}
            title="Send"
            style={{
              flexShrink: 0, alignSelf: "center",
              width: 36, height: 36,
              border: "none",
              background: text.trim() && !streaming && !disabled ? "#1A1A1A" : "#E5E7EB",
              color: text.trim() && !streaming && !disabled ? "#FFFFFF" : "#9CA3AF",
              borderRadius: "50%",
              cursor: text.trim() && !streaming && !disabled ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s ease",
              fontSize: 16,
            }}
          >
            {streaming ? (
              <span style={{ width: 10, height: 10, background: "#FFFFFF", borderRadius: 2, display: "inline-block" }} />
            ) : (
              <span style={{ display: "inline-block", transform: "translateY(-1px)" }}>↑</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
