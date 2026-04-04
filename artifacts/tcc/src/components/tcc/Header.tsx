import { SmartTip } from "./SmartTip";
import { FontLink } from "./FontLink";
import { C, F, FS, TODAY_STR, btn2, TIPS } from "./constants";
import type { Idea } from "./types";

interface Props {
  clock: string;
  ideas: Idea[];
  unresolved: number;
  calSide: boolean;
  eod: boolean;
  customTips: Record<string, string>;
  lastRefresh?: string;
  refreshing?: boolean;
  onSetView: (v: string) => void;
  onToggleCal: () => void;
  onShowIdea: () => void;
  onShowChat: () => void;
  onEod: () => void;
  onTipSaved: (key: string, text: string) => void;
  onRefresh?: () => void;
}

export function Header({ clock, ideas, unresolved, calSide, eod, customTips, lastRefresh, refreshing, onSetView, onToggleCal, onShowIdea, onShowChat, onEod, onTipSaved, onRefresh }: Props) {
  const tip = (key: string) => (customTips ?? {})[key] ?? TIPS[key] ?? "";

  return (
    <div style={{ background: C.card, borderBottom: `1px solid ${C.brd}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
      <FontLink />
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h1 onClick={() => onSetView("schedule")} style={{ fontFamily: FS, fontSize: 18, margin: 0, cursor: "pointer" }}>Tony's Command Center</h1>
        <span style={{ fontSize: 11, color: C.mut }}>{TODAY_STR} · {clock}</span>
        {lastRefresh && (
          <span style={{ fontSize: 10, color: C.mut, marginLeft: 2 }}>· Updated {lastRefresh}</span>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh data now"
            style={{ background: "none", border: "none", cursor: refreshing ? "default" : "pointer", fontSize: 11, color: C.mut, padding: "0 2px", opacity: refreshing ? 0.4 : 0.7, lineHeight: 1 }}
          >
            {refreshing ? "⟳" : "↻"}
          </button>
        )}
      </div>
      <p style={{ fontFamily: FS, fontSize: 12, color: C.sub, fontStyle: "italic", margin: 0, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
        "Follow the plan I gave you!" — God
      </p>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <SmartTip tipKey="ideas" tip={tip("ideas")} onSaved={onTipSaved}>
          <button onClick={onShowIdea} style={{ ...btn2, padding: "5px 10px", fontSize: 11 }}>
            💡{ideas.length > 0 ? ` (${ideas.length})` : ""}
          </button>
        </SmartTip>
        <SmartTip tipKey="gmail" tip={tip("gmail")} onSaved={onTipSaved}>
          <button onClick={() => onSetView("emails")} style={{ ...btn2, padding: "5px 10px", fontSize: 11, position: "relative" }}>
            ✉️{unresolved > 0 && (
              <span style={{ position: "absolute", top: -5, right: -5, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {unresolved}
              </span>
            )}
          </button>
        </SmartTip>
        <button onClick={onToggleCal} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: calSide ? C.bluBg : C.card, color: calSide ? C.blu : C.tx }}>📅</button>
        <SmartTip tipKey="eod" tip={tip("eod")} onSaved={onTipSaved}>
          <button onClick={onEod} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: eod ? C.grnBg : C.card }}>{eod ? "✓" : "📊"}</button>
        </SmartTip>
        <SmartTip tipKey="chat" tip={tip("chat")} onSaved={onTipSaved}>
          <button onClick={onShowChat} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: C.tx, color: "#fff", border: "none" }}>💬</button>
        </SmartTip>
      </div>
      <div style={{ position: "fixed", bottom: 14, right: 14, fontSize: 10, color: C.mut, fontFamily: F, background: C.card, border: `1px solid ${C.brd}`, borderRadius: 8, padding: "4px 10px", pointerEvents: "none", zIndex: 100 }}>
        Hold <kbd style={{ background: "#F0F0F0", borderRadius: 4, padding: "1px 5px", fontFamily: "monospace", border: "1px solid #CCC" }}>Ctrl</kbd> + hover any button to edit its instruction
      </div>
    </div>
  );
}
