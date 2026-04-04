import { C, FS, card, btn2 } from "./constants";
import type { TaskItem } from "./types";

interface Props {
  tasks: TaskItem[];
  tDone: Record<string, boolean>;
  calSide: boolean;
  onToggle: (task: TaskItem) => void;
  onSwitchToSales: () => void;
  onBackToSchedule: () => void;
}

export function TasksView({ tasks, tDone, calSide, onToggle, onSwitchToSales, onBackToSchedule }: Props) {
  const doneCount = Object.values(tDone).filter(Boolean).length;

  return (
    <div style={{ maxWidth: 580, margin: "24px auto", padding: "0 20px", marginRight: calSide ? 320 : undefined, transition: "margin 0.2s" }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Tasks</h3>
          <span style={{ fontSize: 13, color: C.mut }}>{doneCount}/{tasks.length}</span>
        </div>
        {tasks.map(t => (
          <div key={t.id} onClick={() => onToggle(t)}
            style={{ display: "flex", gap: 12, alignItems: "center", padding: 14, marginBottom: 6, background: tDone[t.id] ? C.grnBg : "#FAFAF8", borderRadius: 12, cursor: "pointer", borderLeft: `4px solid ${t.cat === "SALES" ? C.grn : t.cat === "OPS" ? C.amb : C.blu}`, opacity: tDone[t.id] ? 0.6 : 1 }}>
            <div style={{ width: 24, height: 24, borderRadius: 8, border: `2px solid ${tDone[t.id] ? C.grn : C.mut}`, background: tDone[t.id] ? C.grn : C.card, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {tDone[t.id] && <span style={{ color: "#fff", fontSize: 12 }}>✓</span>}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: t.cat === "SALES" ? C.grn : t.cat === "OPS" ? C.amb : C.blu, textTransform: "uppercase", letterSpacing: 1 }}>{t.cat}</div>
              <div style={{ fontSize: 15, fontWeight: 600, textDecoration: tDone[t.id] ? "line-through" : "none" }}>{t.text}</div>
            </div>
            {t.sales && !tDone[t.id] && <span style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>→ Sales</span>}
          </div>
        ))}
      </div>
      <button onClick={onSwitchToSales} style={{ ...btn2, width: "100%", marginBottom: 10 }}>📞 Switch to Sales</button>
      <button onClick={onBackToSchedule} style={{ ...btn2, width: "100%", marginBottom: 40, color: C.mut }}>← Schedule</button>
    </div>
  );
}
