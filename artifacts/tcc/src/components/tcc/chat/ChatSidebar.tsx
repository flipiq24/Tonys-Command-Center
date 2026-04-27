import { useState, useRef, useEffect } from "react";
import { C, F } from "../constants";
import type { Thread } from "./types";

interface Props {
  threads: Thread[];
  activeThreadId: string | null;
  collapsed: boolean;
  onSelectThread: (thread: Thread) => void;
  onNewChat: () => void;
  onRenameThread: (threadId: string, newTitle: string) => void;
  onPinThread: (threadId: string, pinned: boolean) => void;
  onDeleteThread: (threadId: string) => void;
  onBack: () => void;
}

function groupByDate(threads: Thread[]): { label: string; threads: Thread[] }[] {
  const pinned = threads.filter(t => t.pinned);
  const unpinned = threads.filter(t => !t.pinned);

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;

  const today: Thread[] = [];
  const yesterday: Thread[] = [];
  const earlier: Thread[] = [];

  for (const t of unpinned) {
    const ts = new Date(t.updatedAt).getTime();
    if (ts >= todayStart) today.push(t);
    else if (ts >= yesterdayStart) yesterday.push(t);
    else earlier.push(t);
  }

  const groups: { label: string; threads: Thread[] }[] = [];
  if (pinned.length > 0) groups.push({ label: "Pinned", threads: pinned });
  if (today.length > 0) groups.push({ label: "Today", threads: today });
  if (yesterday.length > 0) groups.push({ label: "Yesterday", threads: yesterday });
  if (earlier.length > 0) groups.push({ label: "Earlier", threads: earlier });
  return groups;
}

function ThreadMenu({ thread, onRename, onPin, onDelete, onClose }: {
  thread: Thread;
  onRename: () => void;
  onPin: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const menuItem: React.CSSProperties = {
    padding: "7px 12px",
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: C.tx,
    cursor: "pointer",
    fontFamily: F,
    borderRadius: 6,
  };

  return (
    <div ref={ref} style={{
      position: "absolute",
      right: 4,
      top: "100%",
      marginTop: 2,
      width: 150,
      background: C.card,
      border: `1px solid ${C.brd}`,
      borderRadius: 10,
      boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
      padding: 4,
      zIndex: 50,
    }}>
      <div style={menuItem}
        onClick={(e) => { e.stopPropagation(); onRename(); }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.bg; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>{"\u270F\uFE0F"}</span> Rename
      </div>
      <div style={menuItem}
        onClick={(e) => { e.stopPropagation(); onPin(); }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.bg; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>{thread.pinned ? "\uD83D\uDCCC" : "\uD83D\uDCCC"}</span>
        {thread.pinned ? "Unpin" : "Pin"}
      </div>
      <div style={{ ...menuItem, color: C.red }}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.redBg; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
      >
        <span style={{ fontSize: 14 }}>{"\uD83D\uDDD1\uFE0F"}</span> Delete
      </div>
    </div>
  );
}

export function ChatSidebar({
  threads, activeThreadId, collapsed,
  onSelectThread, onNewChat, onRenameThread, onPinThread, onDeleteThread, onBack,
}: Props) {
  const [menuThreadId, setMenuThreadId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renaming && renameRef.current) renameRef.current.focus();
  }, [renaming]);

  if (collapsed) return null;

  const groups = groupByDate(threads);

  const startRename = (thread: Thread) => {
    setRenaming(thread.id);
    setRenameValue(thread.title || "");
    setMenuThreadId(null);
  };

  const confirmRename = (threadId: string) => {
    if (renameValue.trim()) {
      onRenameThread(threadId, renameValue.trim());
    }
    setRenaming(null);
  };

  return (
    <div style={{
      width: 260,
      minWidth: 260,
      maxWidth: 260,
      background: C.card,
      borderRight: `1px solid ${C.brd}`,
      display: "flex",
      flexDirection: "column",
      flexShrink: 0,
      overflow: "hidden",
      fontFamily: F,
    }}>
      {/* Top bar */}
      <div style={{
        padding: "12px 12px 8px",
        borderBottom: `1px solid ${C.brd}`,
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}>
        <button
          onClick={onBack}
          style={{
            padding: "6px 10px",
            borderRadius: 8,
            border: `1px solid ${C.brd}`,
            background: C.card,
            color: C.sub,
            fontSize: 13,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          {"\u2190"} Back
        </button>
        <button
          onClick={onNewChat}
          style={{
            flex: 1,
            padding: "6px 10px",
            borderRadius: 8,
            border: "none",
            background: "#F97316",
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: F,
          }}
        >
          + New Chat
        </button>
      </div>

      {/* Thread list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 8px" }}>
        {groups.map(group => (
          <div key={group.label}>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.mut,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "12px 8px 4px",
            }}>
              {group.label}
            </div>

            {group.threads.map(thread => (
              <div
                key={thread.id}
                onClick={() => { if (!renaming) onSelectThread(thread); }}
                style={{
                  position: "relative",
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: renaming === thread.id ? "default" : "pointer",
                  marginBottom: 2,
                  background: activeThreadId === thread.id ? "#FFF7ED" : "transparent",
                  border: activeThreadId === thread.id ? "1px solid #FDBA7440" : "1px solid transparent",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  transition: "background 0.1s ease",
                }}
                onMouseEnter={e => {
                  if (activeThreadId !== thread.id) (e.currentTarget as HTMLElement).style.background = C.bg;
                }}
                onMouseLeave={e => {
                  if (activeThreadId !== thread.id) (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {/* Pin indicator */}
                {thread.pinned && (
                  <span style={{ fontSize: 10, color: "#F97316", flexShrink: 0 }}>{"\uD83D\uDCCC"}</span>
                )}

                <div style={{ flex: 1, minWidth: 0 }}>
                  {renaming === thread.id ? (
                    <input
                      ref={renameRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") confirmRename(thread.id);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      onBlur={() => confirmRename(thread.id)}
                      style={{
                        width: "100%",
                        padding: "2px 4px",
                        border: `1px solid #F97316`,
                        borderRadius: 4,
                        fontSize: 12,
                        fontFamily: F,
                        outline: "none",
                        background: C.card,
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <div style={{
                      fontSize: 13,
                      fontWeight: activeThreadId === thread.id ? 600 : 400,
                      color: C.tx,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      lineHeight: 1.4,
                    }}>
                      {thread.title || "New conversation"}
                    </div>
                  )}
                  {!renaming && (
                    <div style={{ fontSize: 11, color: C.mut, marginTop: 1 }}>
                      {thread.contextType !== "general" ? `[${thread.contextType}] ` : ""}
                      {new Date(thread.updatedAt).toLocaleTimeString("en-US", {
                        hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles",
                      })}
                    </div>
                  )}
                </div>

                {/* 3-dot menu trigger */}
                {!renaming && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      setMenuThreadId(menuThreadId === thread.id ? null : thread.id);
                    }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 14,
                      color: C.mut,
                      flexShrink: 0,
                      opacity: activeThreadId === thread.id || menuThreadId === thread.id ? 1 : 0,
                      transition: "opacity 0.1s ease",
                    }}
                    onMouseEnter={e => { (e.target as HTMLElement).style.opacity = "1"; }}
                    onMouseLeave={e => {
                      if (menuThreadId !== thread.id && activeThreadId !== thread.id)
                        (e.target as HTMLElement).style.opacity = "0";
                    }}
                  >
                    {"\u22EF"}
                  </button>
                )}

                {/* Context menu */}
                {menuThreadId === thread.id && (
                  <ThreadMenu
                    thread={thread}
                    onRename={() => startRename(thread)}
                    onPin={() => { onPinThread(thread.id, !thread.pinned); setMenuThreadId(null); }}
                    onDelete={() => { onDeleteThread(thread.id); setMenuThreadId(null); }}
                    onClose={() => setMenuThreadId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        ))}

        {threads.length === 0 && (
          <div style={{
            padding: "24px 12px",
            textAlign: "center",
            fontSize: 13,
            color: C.mut,
          }}>
            No conversations yet
          </div>
        )}
      </div>
    </div>
  );
}
