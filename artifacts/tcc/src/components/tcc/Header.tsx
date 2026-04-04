import { Tip } from "./Tip";
import { FontLink } from "./FontLink";
import { C, F, FS, TODAY_STR, btn2, TIPS } from "./constants";
import type { Idea } from "./types";

interface Props {
  clock: string;
  ideas: Idea[];
  unresolved: number;
  calSide: boolean;
  eod: boolean;
  onSetView: (v: string) => void;
  onToggleCal: () => void;
  onShowIdea: () => void;
  onShowChat: () => void;
  onEod: () => void;
}

export function Header({ clock, ideas, unresolved, calSide, eod, onSetView, onToggleCal, onShowIdea, onShowChat, onEod }: Props) {
  return (
    <div style={{ background: C.card, borderBottom: `1px solid ${C.brd}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
      <FontLink />
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <h1 onClick={() => onSetView("schedule")} style={{ fontFamily: FS, fontSize: 18, margin: 0, cursor: "pointer" }}>Tony's Command Center</h1>
        <span style={{ fontSize: 11, color: C.mut }}>{TODAY_STR} · {clock}</span>
      </div>
      <p style={{ fontFamily: FS, fontSize: 12, color: C.sub, fontStyle: "italic", margin: 0, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
        "Follow the plan I gave you!" — God
      </p>
      <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
        <Tip tip={TIPS.ideas}>
          <button onClick={onShowIdea} style={{ ...btn2, padding: "5px 10px", fontSize: 11 }}>
            💡{ideas.length > 0 ? ` (${ideas.length})` : ""}
          </button>
        </Tip>
        <Tip tip={TIPS.gmail}>
          <button onClick={() => onSetView("emails")} style={{ ...btn2, padding: "5px 10px", fontSize: 11, position: "relative" }}>
            ✉️{unresolved > 0 && (
              <span style={{ position: "absolute", top: -5, right: -5, background: C.red, color: "#fff", fontSize: 9, fontWeight: 800, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {unresolved}
              </span>
            )}
          </button>
        </Tip>
        <button onClick={onToggleCal} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: calSide ? C.bluBg : C.card, color: calSide ? C.blu : C.tx }}>📅</button>
        <Tip tip={TIPS.eod}>
          <button onClick={onEod} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: eod ? C.grnBg : C.card }}>{eod ? "✓" : "📊"}</button>
        </Tip>
        <Tip tip={TIPS.chat}>
          <button onClick={onShowChat} style={{ ...btn2, padding: "5px 10px", fontSize: 11, background: C.tx, color: "#fff", border: "none" }}>💬</button>
        </Tip>
      </div>
    </div>
  );
}
