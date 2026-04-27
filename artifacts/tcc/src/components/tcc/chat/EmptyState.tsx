import { C, F } from "../constants";

interface Props {
  onQuickAction?: (prompt: string) => void;
}

const QUICK_ACTIONS = [
  { label: "Check my calendar", prompt: "What's on my calendar today?" },
  { label: "Review emails", prompt: "Show me my recent important emails" },
  { label: "Search contacts", prompt: "Search my contacts" },
  { label: "Open tasks", prompt: "Show me all open Linear tasks" },
];

export function EmptyState({ onQuickAction }: Props) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 16,
      padding: 40,
      fontFamily: F,
    }}>
      {/* Logo area */}
      <div style={{
        width: 72,
        height: 72,
        borderRadius: 20,
        background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 36,
        boxShadow: "0 8px 24px rgba(249,115,22,0.25)",
      }}>
        <span role="img" aria-label="brain">{"\uD83E\uDDE0"}</span>
      </div>

      <div style={{ textAlign: "center" }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 700,
          color: C.tx,
          margin: "0 0 6px",
          fontFamily: F,
          letterSpacing: "-0.02em",
        }}>
          Command Brain
        </h1>
        <p style={{
          fontSize: 15,
          color: C.mut,
          margin: 0,
          fontFamily: F,
        }}>
          How can I help you today, Tony?
        </p>
      </div>

      {/* Quick action chips */}
      {onQuickAction && (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
          marginTop: 12,
          maxWidth: 480,
        }}>
          {QUICK_ACTIONS.map(action => (
            <button
              key={action.label}
              onClick={() => onQuickAction(action.prompt)}
              style={{
                padding: "8px 16px",
                borderRadius: 20,
                border: `1px solid ${C.brd}`,
                background: C.card,
                color: C.sub,
                fontSize: 13,
                fontFamily: F,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={e => {
                (e.target as HTMLElement).style.borderColor = "#F97316";
                (e.target as HTMLElement).style.color = "#F97316";
                (e.target as HTMLElement).style.background = "#FFF7ED";
              }}
              onMouseLeave={e => {
                (e.target as HTMLElement).style.borderColor = C.brd;
                (e.target as HTMLElement).style.color = C.sub;
                (e.target as HTMLElement).style.background = C.card;
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
