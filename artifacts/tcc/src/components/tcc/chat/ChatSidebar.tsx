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
  onToggleCollapse: () => void;
}

interface DateGroup {
  label: string;
  threads: Thread[];
}

function groupThreadsByDate(threads: Thread[]): DateGroup[] {
  const pinned: Thread[] = [];
  const today: Thread[] = [];
  const yesterday: Thread[] = [];
  const earlier: Thread[] = [];

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;

  for (const t of threads) {
    if (t.pinned) {
      pinned.push(t);
    } else {
      const ts = new Date(t.updatedAt).getTime();
      if (ts >= startOfToday) today.push(t);
      else if (ts >= startOfYesterday) yesterday.push(t);
      else earlier.push(t);
    }
  }

  return [
    pinned.length > 0 ? { label: "Pinned", threads: pinned } : null,
    today.length > 0 ? { label: "Today", threads: today } : null,
    yesterday.length > 0 ? { label: "Yesterday", threads: yesterday } : null,
    earlier.length > 0 ? { label: "Earlier", threads: earlier } : null,
  ].filter(Boolean) as DateGroup[];
}

export function ChatSidebar({
  threads, activeThreadId, collapsed,
  onSelectThread, onNewChat, onRenameThread, onPinThread, onDeleteThread,
  onBack, onToggleCollapse,
}: Props) {
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpenFor(null);
      }
    };
    if (menuOpenFor) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpenFor]);

  const groups = groupThreadsByDate(threads);

  if (collapsed) {
    return (
      <div style={{
        width: 56, height: "100vh",
        background: "#FFFFFF",
        borderRight: `1px solid ${C.brd}`,
        display: "flex", flexDirection: "column",
        alignItems: "center", padding: "12px 0", gap: 8,
        flexShrink: 0,
      }}>
        <button
          onClick={onToggleCollapse}
          title="Expand sidebar"
          style={iconBtn}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >»</button>
        <button
          onClick={onNewChat}
          title="New chat"
          style={iconBtn}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >✎</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={onBack}
          title="Back to app"
          style={iconBtn}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >←</button>
      </div>
    );
  }

  return (
    <div style={{
      width: 260, height: "100vh",
      background: "#FFFFFF",
      borderRight: `1px solid ${C.brd}`,
      display: "flex", flexDirection: "column",
      flexShrink: 0,
    }}>
      {/* Header: Brand + collapse */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 14px 8px",
      }}>
        <button
          onClick={onBack}
          title="Back to app"
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "6px 8px", borderRadius: 8,
            border: "none", background: "transparent", cursor: "pointer",
            fontSize: 14, fontWeight: 700, color: C.tx, fontFamily: F,
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          <span style={{
            width: 24, height: 24, borderRadius: 6,
            background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
            color: "#fff", fontSize: 13, fontWeight: 800,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>C</span>
          <span>Command Brain</span>
        </button>
        <button
          onClick={onToggleCollapse}
          title="Collapse sidebar"
          style={iconBtn}
          onMouseEnter={hover}
          onMouseLeave={unhover}
        >«</button>
      </div>

      {/* New chat button */}
      <div style={{ padding: "4px 12px 10px" }}>
        <button
          onClick={onNewChat}
          style={{
            width: "100%", display: "flex", alignItems: "center", gap: 10,
            padding: "10px 12px", borderRadius: 10,
            border: `1px solid ${C.brd}`, background: "#FFFFFF",
            cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.tx, fontFamily: F,
            transition: "background 0.1s ease, border-color 0.1s ease",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F9FAFB"; e.currentTarget.style.borderColor = "#D1D5DB"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "#FFFFFF"; e.currentTarget.style.borderColor = C.brd; }}
        >
          <span style={{ fontSize: 16 }}>✎</span>
          <span>New chat</span>
        </button>
      </div>

      {/* History */}
      <div style={{
        flex: 1, overflowY: "auto", padding: "0 8px 12px",
      }}>
        {groups.length === 0 && (
          <div style={{ padding: "24px 12px", fontSize: 12, color: C.mut, textAlign: "center", fontFamily: F }}>
            No conversations yet
          </div>
        )}
        {groups.map(group => (
          <div key={group.label} style={{ marginTop: 12 }}>
            <div style={{
              padding: "4px 10px 6px", fontSize: 11, fontWeight: 600,
              color: C.mut, fontFamily: F,
            }}>
              {group.label}
            </div>
            {group.threads.map(t => {
              const isActive = t.id === activeThreadId;
              const isRenaming = renamingId === t.id;
              const menuOpen = menuOpenFor === t.id;
              return (
                <div key={t.id} style={{ position: "relative" }}>
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => {
                        if (renameValue.trim() && renameValue.trim() !== t.title) {
                          onRenameThread(t.id, renameValue.trim());
                        }
                        setRenamingId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === "Enter") {
                          if (renameValue.trim() && renameValue.trim() !== t.title) {
                            onRenameThread(t.id, renameValue.trim());
                          }
                          setRenamingId(null);
                        } else if (e.key === "Escape") {
                          setRenamingId(null);
                        }
                      }}
                      style={{
                        width: "100%", padding: "8px 10px", boxSizing: "border-box",
                        border: `1.5px solid ${C.blu}`, borderRadius: 8,
                        fontSize: 13, fontFamily: F, outline: "none",
                      }}
                    />
                  ) : (
                    <div
                      onClick={() => onSelectThread(t)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                        background: isActive ? "#F3F4F6" : "transparent",
                        transition: "background 0.1s ease",
                      }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "#F9FAFB"; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}
                    >
                      <span style={{
                        flex: 1, fontSize: 13, color: C.tx, fontFamily: F,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {t.pinned && <span style={{ marginRight: 6, fontSize: 10 }}>📌</span>}
                        {t.title || "New conversation"}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOpenFor(menuOpen ? null : t.id); }}
                        style={{
                          flexShrink: 0, width: 22, height: 22,
                          border: "none", background: "transparent",
                          borderRadius: 4, cursor: "pointer",
                          fontSize: 14, color: C.mut,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: isActive || menuOpen ? 1 : 0.0,
                          transition: "opacity 0.1s ease",
                        }}
                        className="thread-menu-btn"
                        title="More"
                      >⋯</button>
                    </div>
                  )}

                  {menuOpen && (
                    <div
                      ref={menuRef}
                      style={{
                        position: "absolute", right: 6, top: "calc(100% - 4px)",
                        background: "#FFFFFF", border: `1px solid ${C.brd}`,
                        borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                        padding: 4, minWidth: 140, zIndex: 50,
                      }}
                    >
                      <button
                        onClick={() => {
                          setRenameValue(t.title || "");
                          setRenamingId(t.id);
                          setMenuOpenFor(null);
                        }}
                        style={menuItem}
                        onMouseEnter={menuItemHover}
                        onMouseLeave={menuItemUnhover}
                      >✏️ Rename</button>
                      <button
                        onClick={() => {
                          onPinThread(t.id, !t.pinned);
                          setMenuOpenFor(null);
                        }}
                        style={menuItem}
                        onMouseEnter={menuItemHover}
                        onMouseLeave={menuItemUnhover}
                      >{t.pinned ? "📌 Unpin" : "📌 Pin"}</button>
                      <div style={{ height: 1, background: C.brd, margin: "4px 0" }} />
                      <button
                        onClick={() => {
                          if (confirm(`Delete "${t.title || "New conversation"}"?`)) {
                            onDeleteThread(t.id);
                          }
                          setMenuOpenFor(null);
                        }}
                        style={{ ...menuItem, color: C.red }}
                        onMouseEnter={menuItemHover}
                        onMouseLeave={menuItemUnhover}
                      >🗑️ Delete</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Always-visible 3-dot button on hover via inline CSS isn't trivial; the button shows on active row only.
          For simplicity it's hidden until hover/active — implemented via opacity inline above. */}
      <style>{`
        .thread-menu-btn { opacity: 0; }
        div:hover > .thread-menu-btn { opacity: 1; }
      `}</style>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  width: 32, height: 32,
  display: "flex", alignItems: "center", justifyContent: "center",
  border: "none", background: "transparent",
  borderRadius: 8, cursor: "pointer",
  fontSize: 16, color: "#4B5563",
  transition: "background 0.1s ease, color 0.1s ease",
};

function hover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "#F3F4F6";
  e.currentTarget.style.color = "#1A1A1A";
}
function unhover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "transparent";
  e.currentTarget.style.color = "#4B5563";
}

const menuItem: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left",
  padding: "8px 10px", borderRadius: 6,
  border: "none", background: "transparent", cursor: "pointer",
  fontSize: 13, fontFamily: "'Inter', sans-serif", color: "#1A1A1A",
};

function menuItemHover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "#F3F4F6";
}
function menuItemUnhover(e: React.MouseEvent<HTMLButtonElement>) {
  e.currentTarget.style.background = "transparent";
}
