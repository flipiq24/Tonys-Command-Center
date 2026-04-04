import { C, FS, card, btn1, btn2 } from "./constants";
import type { CalItem } from "./types";

interface Props {
  items: CalItem[];
  onEnterSales: () => void;
  onEnterTasks: () => void;
}

export function ScheduleView({ items, onEnterSales, onEnterTasks }: Props) {
  return (
    <div style={{ maxWidth: 760, margin: "24px auto", padding: "0 20px" }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Today's Schedule</h3>
          <span style={{ fontSize: 12, color: C.mut }}>{items.length} items</span>
        </div>
        {items.map((c, i) => (
          <div key={i} style={{ display: "flex", gap: 12, padding: "12px 14px", marginBottom: 4, background: c.real ? C.bluBg : "#FAFAF8", borderRadius: 10, borderLeft: `4px solid ${c.real ? C.blu : C.brd}` }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: c.real ? C.blu : C.mut, minWidth: 75, flexShrink: 0 }}>{c.t}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: c.real ? 700 : 500 }}>{c.n}</div>
              {c.loc && <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>📍 {c.loc}</div>}
              {c.note && <div style={{ fontSize: 12, color: C.amb, marginTop: 2 }}>⚡ {c.note}</div>}
            </div>
            {c.real
              ? <span style={{ fontSize: 10, fontWeight: 700, color: C.blu, background: "#fff", padding: "2px 8px", borderRadius: 4, alignSelf: "center" }}>MEETING</span>
              : <span style={{ fontSize: 10, color: C.mut, alignSelf: "center" }}>note</span>
            }
          </div>
        ))}
      </div>
      <button onClick={onEnterSales} style={{ ...btn1, width: "100%", padding: 18, fontSize: 17, marginBottom: 10 }}>
        📞 Enter Sales Mode →
      </button>
      <button onClick={onEnterTasks} style={{ ...btn2, width: "100%", padding: 14, marginBottom: 40 }}>
        ✅ Enter Task Mode
      </button>
    </div>
  );
}
