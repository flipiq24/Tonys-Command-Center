import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { get, post, del, API_BASE as _API_BASE } from "@/lib/api";
import { C, F, FS, card, btn1, btn2, inp } from "./constants";
import { VoiceInput } from "./VoiceInput";

interface Thread {
  id: string;
  title: string | null;
  contextType: string;
  contextId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  role: string;
  content: string;
  toolCalls?: { name: string; result: string }[] | null;
  createdAt: string;
}

interface StreamEvent {
  type: "text" | "tool_start" | "tool_result" | "done" | "error";
  text?: string;
  tool?: string;
  result?: string;
  error?: string;
}

function renderMessage(text: string): ReactNode {
  const processed = text
    .replace(/```[\s\S]*?```/g, m => m.replace(/```[^\n]*\n?/g, "").trim())
    .replace(/#{1,6}\s+(.+)/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^[-_*]{3,}$/gm, "─────────────")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const parts: React.ReactNode[] = [];
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/\S+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let k = 0;

  while ((match = linkRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) parts.push(processed.slice(lastIndex, match.index));
    if (match[1] && match[2]) {
      parts.push(<a key={k++} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: C.blu, textDecoration: "underline" }}>{match[1]}</a>);
    } else if (match[3]) {
      const url = match[3].replace(/[.,;:!?'")\]]+$/, "");
      const trail = match[3].slice(url.length);
      parts.push(<a key={k++} href={url} target="_blank" rel="noopener noreferrer" style={{ color: C.blu, textDecoration: "underline", wordBreak: "break-all" }}>{url}</a>);
      if (trail) parts.push(trail);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < processed.length) parts.push(processed.slice(lastIndex));
  return <>{parts}</>;
}

interface Props {
  onBack: () => void;
  initialContextType?: string;
  initialContextId?: string;
  initialContextLabel?: string;
}

export function ClaudeChatView({ onBack, initialContextType, initialContextId, initialContextLabel }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const API_BASE = _API_BASE;

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, streamingText, scrollToBottom]);

  useEffect(() => {
    loadThreads();
  }, []);

  async function loadThreads() {
    try {
      const data = await get<Thread[]>("/chat/threads");
      setThreads(data);
      if (data.length > 0 && !activeThread) {
        if (initialContextId) {
          await startNewThread();
        } else {
          await selectThread(data[0]);
        }
      } else if (data.length === 0) {
        await startNewThread();
      }
    } catch {
      setError("Failed to load threads");
    }
  }

  async function startNewThread() {
    try {
      const thread = await post<Thread>("/chat/threads", {
        contextType: initialContextType || "general",
        contextId: initialContextId || undefined,
        contextLabel: initialContextLabel || undefined,
      });
      setActiveThread(thread);
      setMessages([]);
      setThreads(prev => [thread, ...prev.filter(t => t.id !== thread.id)]);
    } catch {
      setError("Failed to create thread");
    }
  }

  async function selectThread(thread: Thread) {
    setActiveThread(thread);
    setStreamingText("");
    setToolActivity(null);
    try {
      const msgs = await get<Message[]>(`/chat/threads/${thread.id}/messages`);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }

  async function deleteThread(threadId: string, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await del(`/chat/threads/${threadId}`);
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThread?.id === threadId) {
        setActiveThread(null);
        setMessages([]);
        await startNewThread();
      }
    } catch { /* fail silently */ }
  }

  async function sendMessage() {
    if (!input.trim() || !activeThread || streaming) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim(), createdAt: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setStreaming(true);
    setStreamingText("");
    setToolActivity(null);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/chat/threads/${activeThread.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tcc-token": sessionStorage.getItem("tcc_auth_token") || "" },
        body: JSON.stringify({ content: userMsg.content }),
      });

      if (!response.ok) throw new Error("Send failed");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No reader");

      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as StreamEvent;
            if (event.type === "text" && event.text) {
              fullText += event.text;
              setStreamingText(fullText);
            } else if (event.type === "tool_start" && event.tool) {
              setToolActivity(`Using: ${event.tool.replace(/_/g, " ")}`);
            } else if (event.type === "tool_result") {
              setToolActivity(null);
            } else if (event.type === "done") {
              setStreamingText("");
              setToolActivity(null);
              if (fullText) {
                setMessages(prev => [...prev, {
                  id: Date.now().toString(),
                  role: "assistant",
                  content: fullText,
                  createdAt: new Date().toISOString(),
                }]);
              }
              setThreads(prev => prev.map(t => t.id === activeThread.id ? { ...t, updatedAt: new Date().toISOString() } : t));
            } else if (event.type === "error") {
              setError(event.error || "Claude error");
            }
          } catch { /* skip malformed events */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setStreaming(false);
      setStreamingText("");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }

  const panelLeft: React.CSSProperties = {
    width: 240, minWidth: 240, maxWidth: 240,
    background: C.card, borderRight: `1px solid ${C.brd}`,
    display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden",
  };

  const panelRight: React.CSSProperties = {
    flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
    background: C.bg,
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: F, overflow: "hidden" }}>
      {/* Thread list sidebar */}
      <div style={panelLeft}>
        <div style={{ padding: "12px 12px 8px", borderBottom: `1px solid ${C.brd}`, display: "flex", gap: 8, alignItems: "center" }}>
          <button onClick={onBack} style={{ ...btn2, fontSize: 13, padding: "4px 8px" }}>← Back</button>
          <button onClick={startNewThread} style={{ ...btn1, fontSize: 13, padding: "4px 8px", flex: 1 }}>+ New</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {threads.map(thread => (
            <div
              key={thread.id}
              onClick={() => selectThread(thread)}
              style={{
                padding: "8px 10px",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 4,
                background: activeThread?.id === thread.id ? C.blu + "22" : "transparent",
                border: activeThread?.id === thread.id ? `1px solid ${C.blu}44` : `1px solid transparent`,
                display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: activeThread?.id === thread.id ? 600 : 400, color: C.tx, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {thread.title || "New conversation"}
                </div>
                <div style={{ fontSize: 10, color: C.mut, marginTop: 2 }}>
                  {thread.contextType !== "general" ? `[${thread.contextType}] ` : ""}
                  {new Date(thread.updatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </div>
              </div>
              <button
                onClick={e => deleteThread(thread.id, e)}
                style={{ background: "none", border: "none", cursor: "pointer", color: C.mut, fontSize: 14, padding: 2, flexShrink: 0 }}
              >×</button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div style={panelRight}>
        {/* Header */}
        <div style={{ padding: "10px 16px", borderBottom: `1px solid ${C.brd}`, background: C.card, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: FS, fontSize: 16, color: C.tx }}>
            {activeThread?.title || "Claude — Tony's AI"}
          </span>
          {activeThread?.contextType && activeThread.contextType !== "general" && (
            <span style={{ fontSize: 11, color: C.mut, background: C.brd + "44", borderRadius: 4, padding: "2px 6px" }}>
              {activeThread.contextType}
            </span>
          )}
          {initialContextId && (
            <button onClick={startNewThread} style={{ ...btn2, fontSize: 11, padding: "2px 8px", marginLeft: "auto" }}>
              Start fresh
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map(msg => (
            <div key={msg.id} style={{ display: "flex", flexDirection: msg.role === "user" ? "row-reverse" : "row", gap: 8 }}>
              <div style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "12px 12px 0 12px" : "12px 12px 12px 0",
                background: msg.role === "user" ? C.blu : C.card,
                color: msg.role === "user" ? "#fff" : C.tx,
                fontSize: 14,
                lineHeight: 1.6,
                border: msg.role === "user" ? "none" : `1px solid ${C.brd}`,
                whiteSpace: "pre-wrap",
              }}>
                {msg.role === "assistant" ? renderMessage(msg.content) : msg.content}
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${C.brd}44`, fontSize: 11, color: C.mut }}>
                    Used: {msg.toolCalls.map(t => t.name.replace(/_/g, " ")).join(", ")}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Streaming assistant message */}
          {(streamingText || toolActivity) && (
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{
                maxWidth: "75%",
                padding: "10px 14px",
                borderRadius: "12px 12px 12px 0",
                background: C.card,
                border: `1px solid ${C.brd}`,
                fontSize: 14,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                color: C.tx,
              }}>
                {toolActivity && (
                  <div style={{ color: C.mut, fontSize: 12, marginBottom: streamingText ? 8 : 0, fontStyle: "italic" }}>
                    ⚙ {toolActivity}
                  </div>
                )}
                {renderMessage(streamingText)}
                <span style={{ display: "inline-block", width: 8, height: 14, background: C.blu, marginLeft: 2, animation: "pulse 1s infinite", verticalAlign: "middle" }} />
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: "8px 12px", background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, fontSize: 13, color: "#dc2626" }}>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.brd}`, background: C.card }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <div style={{ flex: 1, position: "relative" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={streaming ? "Claude is thinking..." : "Ask Claude anything... (Enter to send, Shift+Enter for new line)"}
                disabled={streaming || !activeThread}
                rows={2}
                style={{
                  ...inp,
                  width: "100%",
                  resize: "none",
                  minHeight: 44,
                  maxHeight: 120,
                  fontSize: 14,
                  lineHeight: 1.5,
                  opacity: streaming ? 0.6 : 1,
                  paddingRight: 36,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ position: "absolute", right: 7, top: 8 }}>
                <VoiceInput
                  onTranscript={t => setInput(prev => prev ? prev + " " + t : t)}
                  size={24}
                />
              </div>
            </div>
            <button
              onClick={sendMessage}
              disabled={streaming || !input.trim() || !activeThread}
              style={{
                ...btn1,
                padding: "10px 16px",
                fontSize: 14,
                opacity: streaming || !input.trim() || !activeThread ? 0.5 : 1,
                cursor: streaming || !input.trim() || !activeThread ? "not-allowed" : "pointer",
                alignSelf: "flex-end",
              }}
            >
              {streaming ? "..." : "Send"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: C.mut, marginTop: 6 }}>
            Enter to send · Shift+Enter for new line · Claude can send Slack messages, search contacts, draft emails, and more
          </div>
        </div>
      </div>
    </div>
  );
}
