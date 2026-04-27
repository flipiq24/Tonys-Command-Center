import { useState, useEffect, useCallback } from "react";
import { get, post, del, patch } from "@/lib/api";
import { API_BASE } from "@/lib/api";
import { F } from "../constants";
import { ChatSidebar } from "./ChatSidebar";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { getAgentForTool } from "./toolAgentMap";
import type { Thread, Message, StreamEvent, ToolActivity } from "./types";

interface Props {
  onBack: () => void;
  initialContextType?: string;
  initialContextId?: string;
  initialContextLabel?: string;
}

export function CommandBrainView({ onBack, initialContextType, initialContextId, initialContextLabel }: Props) {
  // Thread state
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);

  // Message state
  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // --- Data loading ---

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThreads() {
    try {
      const data = await get<Thread[]>("/chat/threads");
      setThreads(data);
      // If opening with context, go straight to new chat mode (no auto-create)
      // If no context, just show the empty state — user can pick a thread or start new
    } catch {
      setError("Failed to load threads");
    }
  }

  async function selectThread(thread: Thread) {
    setActiveThread(thread);
    setStreamingText("");
    setToolActivities([]);
    setError(null);
    try {
      const msgs = await get<Message[]>(`/chat/threads/${thread.id}/messages`);
      setMessages(msgs);
    } catch {
      setMessages([]);
    }
  }

  const startNewChat = useCallback(() => {
    // Don't create thread in DB — just reset to empty state
    setActiveThread(null);
    setMessages([]);
    setStreamingText("");
    setToolActivities([]);
    setError(null);
  }, []);

  // --- Thread CRUD ---

  async function renameThread(threadId: string, newTitle: string) {
    try {
      const updated = await patch<Thread>(`/chat/threads/${threadId}`, { title: newTitle });
      setThreads(prev => prev.map(t => t.id === threadId ? updated : t));
      if (activeThread?.id === threadId) setActiveThread(updated);
    } catch { /* fail silently */ }
  }

  async function pinThread(threadId: string, pinned: boolean) {
    try {
      const updated = await patch<Thread>(`/chat/threads/${threadId}`, { pinned });
      setThreads(prev => {
        const updated_ = prev.map(t => t.id === threadId ? updated : t);
        // Re-sort: pinned first, then by updatedAt
        return updated_.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });
      });
      if (activeThread?.id === threadId) setActiveThread(updated);
    } catch { /* fail silently */ }
  }

  async function deleteThread(threadId: string) {
    try {
      await del(`/chat/threads/${threadId}`);
      setThreads(prev => prev.filter(t => t.id !== threadId));
      if (activeThread?.id === threadId) {
        startNewChat();
      }
    } catch { /* fail silently */ }
  }

  // --- Send message (with lazy thread creation) ---

  async function sendMessage(text: string, mentionedAgent?: string) {
    if (!text.trim() || streaming) return;

    let thread = activeThread;

    // Lazy thread creation: create thread on first message if none active
    if (!thread) {
      try {
        thread = await post<Thread>("/chat/threads", {
          contextType: initialContextType || "general",
          contextId: initialContextId || undefined,
          contextLabel: initialContextLabel || undefined,
        });
        setActiveThread(thread);
        setThreads(prev => [thread!, ...prev]);
      } catch {
        setError("Failed to create chat thread");
        return;
      }
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
    setStreamingText("");
    setToolActivities([]);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/chat/threads/${thread.id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tcc-token": sessionStorage.getItem("tcc_auth_token") || "",
        },
        body: JSON.stringify({
          content: text,
          mentionedAgent: mentionedAgent || undefined,
        }),
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
              const agentLabel = getAgentForTool(event.tool);
              setToolActivities(prev => [...prev, {
                id: `${Date.now()}-${event.tool}`,
                agentName: agentLabel,
                toolName: event.tool!.replace(/_/g, " "),
                status: "running",
                startedAt: Date.now(),
              }]);
            } else if (event.type === "tool_result") {
              setToolActivities(prev =>
                prev.map(a => a.status === "running" ? { ...a, status: "done" as const } : a)
              );
            } else if (event.type === "done") {
              setStreamingText("");
              setToolActivities([]);
              if (fullText) {
                setMessages(prev => [...prev, {
                  id: Date.now().toString(),
                  role: "assistant",
                  content: fullText,
                  createdAt: new Date().toISOString(),
                }]);
              }
              // Update thread in sidebar
              setThreads(prev => prev.map(t =>
                t.id === thread!.id ? { ...t, updatedAt: new Date().toISOString() } : t
              ));
              // Reload threads to pick up auto-generated title
              setTimeout(() => loadThreads(), 500);
            } else if (event.type === "error") {
              setError(event.error || "Command Brain error");
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

  // Quick action from empty state
  const handleQuickAction = useCallback((prompt: string) => {
    sendMessage(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread, streaming]);

  // --- Render ---

  const headerTitle = activeThread?.title || "Command Brain";
  const isEmpty = !activeThread && messages.length === 0;

  return (
    <div style={{
      display: "flex",
      height: "100vh",
      fontFamily: F,
      overflow: "hidden",
      background: "#F9FAFB",
    }}>
      {/* Sidebar */}
      <ChatSidebar
        threads={threads}
        activeThreadId={activeThread?.id || null}
        collapsed={sidebarCollapsed}
        onSelectThread={selectThread}
        onNewChat={startNewChat}
        onRenameThread={renameThread}
        onPinThread={pinThread}
        onDeleteThread={deleteThread}
        onBack={onBack}
      />

      {/* Main chat area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#F9FAFB",
      }}>
        <ChatHeader
          title={headerTitle}
          contextType={activeThread?.contextType}
          onNewChat={startNewChat}
          onToggleSidebar={() => setSidebarCollapsed(prev => !prev)}
          sidebarCollapsed={sidebarCollapsed}
        />

        <ChatMessages
          messages={messages}
          streamingText={streamingText}
          toolActivities={toolActivities}
          error={error}
          isEmpty={isEmpty}
          onQuickAction={handleQuickAction}
        />

        <ChatInput
          streaming={streaming}
          disabled={false}
          onSend={sendMessage}
        />
      </div>
    </div>
  );
}
