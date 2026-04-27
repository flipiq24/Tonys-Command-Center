import { C, F } from "../constants";

interface Props {
  title: string;
  contextType?: string;
  onNewChat: () => void;
  onToggleSidebar: () => void;
  sidebarCollapsed: boolean;
}

export function ChatHeader({ title, contextType, onNewChat, onToggleSidebar, sidebarCollapsed }: Props) {
  return (
    <div style={{
      padding: "0 16px",
      height: 56,
      borderBottom: `1px solid ${C.brd}`,
      background: C.card,
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexShrink: 0,
      fontFamily: F,
    }}>
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${C.brd}`,
          background: C.card,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 18,
          color: C.sub,
          flexShrink: 0,
          transition: "background 0.1s ease",
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = C.bg; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = C.card; }}
        title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
      >
        {sidebarCollapsed ? "\u2630" : "\u00AB"}
      </button>

      {/* Title */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{
          fontSize: 16,
          fontWeight: 600,
          color: C.tx,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {title}
        </span>
        {contextType && contextType !== "general" && (
          <span style={{
            fontSize: 11,
            color: C.mut,
            background: C.bg,
            borderRadius: 4,
            padding: "2px 6px",
            border: `1px solid ${C.brd}`,
            flexShrink: 0,
          }}>
            {contextType}
          </span>
        )}
      </div>

      {/* New chat button */}
      <button
        onClick={onNewChat}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: `1px solid ${C.brd}`,
          background: C.card,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 16,
          color: C.sub,
          flexShrink: 0,
          transition: "background 0.1s ease",
        }}
        onMouseEnter={e => { (e.target as HTMLElement).style.background = C.bg; }}
        onMouseLeave={e => { (e.target as HTMLElement).style.background = C.card; }}
        title="New chat"
      >
        {"\u270E"}
      </button>
    </div>
  );
}
