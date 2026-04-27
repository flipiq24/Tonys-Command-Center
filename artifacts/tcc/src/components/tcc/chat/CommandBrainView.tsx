import { useState, useEffect, useCallback } from "react";
import { get, post, del, patch } from "@/lib/api";
import { API_BASE } from "@/lib/api";
import { F } from "../constants";
import { ChatSidebar } from "./ChatSidebar";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { EmptyState } from "./EmptyState";
import { getAgentForTool } from "./toolAgentMap";
import type { Thread, Message, StreamEvent, ToolActivity } from "./types";

interface Props {
  onBack: () => void;
  initialContextType?: string;
  initialContextId?: string;
  initialContextLabel?: string;
}

export function CommandBrainView({ onBack, initialContextType, initialContextId, initialContextLabel }: Props) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [toolActivities, setToolActivities] = useState<ToolActivity[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    loadThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadThreads() {
    try {
      const data = await get<Thread[]>("/chat/threads");
      setThreads(data);
    } catch {
      // Silent — let the user see empty state instead of an error
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
    setActiveThread(null);
    setMessages([]);
    setStreamingText("");
    setToolActivities([]);
    setError(null);
  }, []);

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
        const next = prev.map(t => t.id === threadId ? updated : t);
        return next.sort((a, b) => {
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
      if (activeThread?.id === threadId) startNewChat();
    } catch { /* fail silently */ }
  }

  async function sendMessage(text: string, mentionedAgent?: string) {
    if (!text.trim() || streaming) return;

    let thread = activeThread;

    // Lazy thread creation
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
              setThreads(prev => prev.map(t =>
                t.id === thread!.id ? { ...t, updatedAt: new Date().toISOString() } : t
              ));
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

  const handleQuickAction = useCallback((prompt: string) => {
    sendMessage(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread, streaming]);

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
        onToggleCollapse={() => setSidebarCollapsed(prev => !prev)}
      />

      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "#F9FAFB",
        minWidth: 0,
      }}>
        <ChatHeader
          title={headerTitle}
          contextType={activeThread?.contextType}
          onNewChat={startNewChat}
          showTitle={!isEmpty}
        />

        {isEmpty ? (
          <>
            <EmptyState onQuickAction={handleQuickAction} />
            <ChatInput
              streaming={streaming}
              disabled={false}
              onSend={sendMessage}
              autoFocus
            />
            <div style={{ height: 40 }} />
          </>
        ) : (
          <>
            <ChatMessages
              messages={messages}
              streamingText={streamingText}
              toolActivities={toolActivities}
              error={error}
              isEmpty={false}
              onQuickAction={handleQuickAction}
            />
            <ChatInput
              streaming={streaming}
              disabled={false}
              onSend={sendMessage}
            />
          </>
        )}
      </div>
    </div>
  );
}
