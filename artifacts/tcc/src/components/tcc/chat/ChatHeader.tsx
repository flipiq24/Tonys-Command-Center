import { C, F } from "../constants";

interface Props {
  title: string;
  contextType?: string;
  onNewChat: () => void;
  showTitle: boolean;
}

export function ChatHeader({ title, contextType, onNewChat, showTitle }: Props) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 20px",
      borderBottom: `1px solid ${C.brd}`,
      background: "#FFFFFF",
      flexShrink: 0,
      minHeight: 52, boxSizing: "border-box",
    }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
        {showTitle && (
          <>
            <div style={{
              fontSize: 14, fontWeight: 600, color: C.tx, fontFamily: F,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>{title}</div>
            {contextType && contextType !== "general" && (
              <span style={{
                fontSize: 10, fontWeight: 600, color: C.blu, fontFamily: F,
                background: "#EFF6FF", padding: "2px 8px", borderRadius: 12,
                textTransform: "uppercase", letterSpacing: "0.06em",
              }}>{contextType}</span>
            )}
          </>
        )}
      </div>

      <button
        onClick={onNewChat}
        title="New chat"
        style={{
          width: 32, height: 32, borderRadius: 8,
          border: "none", background: "transparent", cursor: "pointer",
          fontSize: 16, color: C.sub,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
          transition: "background 0.1s ease, color 0.1s ease",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#F3F4F6"; e.currentTarget.style.color = C.tx; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = C.sub; }}
      >✎</button>
    </div>
  );
}
