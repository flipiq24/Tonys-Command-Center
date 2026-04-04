import { useState, useEffect } from "react";
import { get } from "@/lib/api";
import { C, F, FS } from "./constants";

interface TimeBlock {
  label: string;
  start: number;
  end: number;
  focus: string;
  color: string;
  icon: string;
  headline: string;
  sub: string;
}

interface TimeRoutingData {
  current: TimeBlock;
  next: TimeBlock | null;
  minutesLeft: number;
}

export function TimeRoutingBanner() {
  const [data, setData] = useState<TimeRoutingData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    get("/time-routing")
      .then(d => setData(d as TimeRoutingData))
      .catch(() => {});

    const interval = setInterval(() => {
      get("/time-routing")
        .then(d => setData(d as TimeRoutingData))
        .catch(() => {});
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  if (!data || dismissed) return null;

  const { current, next, minutesLeft } = data;
  const timeLeftStr = minutesLeft >= 60
    ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`
    : `${minutesLeft}m`;

  const isCalls = current.focus === "calls";
  const isRest = current.focus === "rest";

  return (
    <div style={{
      margin: "0 0 16px 0",
      borderRadius: 12,
      overflow: "hidden",
      border: `1.5px solid ${current.color}33`,
      background: `${current.color}0D`,
      fontFamily: F,
    }}>
      <div style={{
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        borderBottom: next ? `1px solid ${current.color}22` : "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: current.color, display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0,
          }}>
            {current.icon}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontFamily: FS, fontSize: 15, fontWeight: 700, color: current.color }}>{current.headline}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 7px",
                borderRadius: 4, background: current.color, color: "#fff",
                textTransform: "uppercase", letterSpacing: 0.5,
              }}>{current.label}</span>
            </div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{current.sub}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {next && !isRest && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: C.mut, textTransform: "uppercase", letterSpacing: 0.6 }}>Next</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{next.icon} {next.label}</div>
              <div style={{ fontSize: 10, color: C.mut }}>in {timeLeftStr}</div>
            </div>
          )}
          <button
            onClick={() => setDismissed(true)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.mut, padding: "4px 8px", borderRadius: 6 }}
            title="Dismiss"
          >✕</button>
        </div>
      </div>

      {isCalls && (
        <div style={{ padding: "8px 16px", background: `${current.color}11`, display: "flex", gap: 16 }}>
          <div style={{ fontSize: 11, color: current.color, fontWeight: 700 }}>📞 DIAL NOW:</div>
          <div style={{ fontSize: 11, color: C.sub }}>Hot leads first → Warm → New. Log every attempt. Every no is progress.</div>
        </div>
      )}
    </div>
  );
}
