import { C, F } from "../constants";

interface Props {
  onQuickAction?: (prompt: string) => void;
}

const QUICK_ACTIONS = [
  { label: "What's on my calendar?", prompt: "What's on my calendar today?" },
  { label: "Review my emails", prompt: "Show me my recent important emails" },
  { label: "Search my contacts", prompt: "Search my contacts for hot leads" },
  { label: "Today's brief", prompt: "Give me my morning brief" },
];

export function EmptyState({ onQuickAction }: Props) {
  return (
    <div style={{
      flex: 1, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "0 16px", minHeight: 0,
    }}>
      {/* Logo + brand */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 16, marginBottom: 12,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 14,
          background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
          color: "#FFFFFF", fontSize: 26, fontWeight: 800,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: F,
          boxShadow: "0 6px 20px rgba(249,115,22,0.25)",
        }}>C</div>
        <div style={{
          fontSize: 38, fontWeight: 700, color: C.tx, fontFamily: F,
          letterSpacing: "-0.02em",
        }}>Command Brain</div>
      </div>
      <div style={{
        fontSize: 15, color: C.mut, fontFamily: F, marginBottom: 36,
      }}>
        Tony's AI operating system — type @ to call a specialist or integration
      </div>

      {/* Quick actions */}
      {onQuickAction && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center",
          maxWidth: 600,
        }}>
          {QUICK_ACTIONS.map(qa => (
            <button
              key={qa.label}
              onClick={() => onQuickAction(qa.prompt)}
              style={{
                padding: "8px 14px",
                background: "#FFFFFF",
                border: `1px solid ${C.brd}`,
                borderRadius: 20,
                cursor: "pointer",
                fontSize: 13, color: C.sub, fontFamily: F,
                transition: "background 0.1s ease, border-color 0.1s ease, color 0.1s ease",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = "#F3F4F6";
                e.currentTarget.style.borderColor = "#D1D5DB";
                e.currentTarget.style.color = C.tx;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = "#FFFFFF";
                e.currentTarget.style.borderColor = C.brd;
                e.currentTarget.style.color = C.sub;
              }}
            >
              {qa.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
