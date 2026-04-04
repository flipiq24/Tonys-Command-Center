import { useState, useEffect } from "react";
import { get } from "@/lib/api";
import { C, F } from "./constants";

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
    get("/time-routing").then(d => setData(d as TimeRoutingData)).catch(() => {});
    const iv = setInterval(() => {
      get("/time-routing").then(d => setData(d as TimeRoutingData)).catch(() => {});
    }, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  if (!data || dismissed) return null;

  const { current, next, minutesLeft } = data;
  const isCalls = current.focus === "calls";
  const timeLeftStr = minutesLeft >= 60
    ? `${Math.floor(minutesLeft / 60)}h ${minutesLeft % 60}m`
    : `${minutesLeft}m`;

  return (
    <div style={{
      fontFamily: F,
      borderBottom: `1px solid ${C.brd}`,
      padding: "10px 0 12px",
      marginBottom: 16,
    }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: 1, color: isCalls ? C.red : C.tx,
            }}>
              {current.headline}
            </span>
            <span style={{ fontSize: 12, color: "#999" }}>{current.sub}</span>
          </div>

          {isCalls && (
            <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
              Hot leads first → Warm → New. Log every attempt.
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          {next && (
            <span style={{ fontSize: 11, color: "#999" }}>
              {next.headline} in {timeLeftStr}
            </span>
          )}
          <button
            onClick={() => setDismissed(true)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: 14, color: "#CCC", padding: "0 4px", lineHeight: 1,
            }}
          >✕</button>
        </div>
      </div>
    </div>
  );
}
