import { useState, useEffect, useRef } from "react";
import { C, F, FS, btn1, btn2 } from "./constants";
import type { CalItem } from "./types";
import { DeepLink } from "./DeepLink";

interface Props {
  items: CalItem[];
  onEnterSales: () => void;
  onEnterTasks: () => void;
  onRefresh?: () => Promise<void>;
}

const HOUR_HEIGHT = 72;
const DEFAULT_START_HOUR = 6;
const DEFAULT_END_HOUR = 22;

function parseTimeToMinutes(t: string): number | null {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return null;
  let h = parseInt(m[1]);
  const min = parseInt(m[2]);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && h < 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + min;
}

function formatHour(h: number): string {
  if (h === 0 || h === 12) return `${h === 0 ? 12 : 12} ${h < 12 ? "AM" : "PM"}`;
  return `${h > 12 ? h - 12 : h} ${h >= 12 ? "PM" : "AM"}`;
}

function minutesToTop(minutes: number, startHour: number): number {
  return ((minutes - startHour * 60) / 60) * HOUR_HEIGHT;
}

interface PositionedEvent {
  item: CalItem;
  startMin: number;
  endMin: number;
  col: number;
  totalCols: number;
}

function layoutEvents(items: CalItem[]): PositionedEvent[] {
  const events: PositionedEvent[] = items
    .map(item => {
      const startMin = parseTimeToMinutes(item.t);
      if (startMin === null) return null;
      let endMin = item.tEnd ? parseTimeToMinutes(item.tEnd) : null;
      if (endMin === null || endMin <= startMin) endMin = startMin + 60;
      return { item, startMin, endMin, col: 0, totalCols: 1 };
    })
    .filter((e): e is PositionedEvent => e !== null)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const groups: PositionedEvent[][] = [];
  for (const ev of events) {
    let placed = false;
    for (const group of groups) {
      if (group.some(g => ev.startMin < g.endMin && ev.endMin > g.startMin)) {
        group.push(ev);
        placed = true;
        break;
      }
    }
    if (!placed) groups.push([ev]);
  }

  for (const group of groups) {
    const columns: PositionedEvent[][] = [];
    for (const ev of group) {
      let col = 0;
      while (true) {
        if (!columns[col]) columns[col] = [];
        const fits = !columns[col].some(c => ev.startMin < c.endMin && ev.endMin > c.startMin);
        if (fits) { columns[col].push(ev); ev.col = col; break; }
        col++;
      }
    }
    const totalCols = columns.length;
    for (const ev of group) ev.totalCols = totalCols;
  }

  return events;
}

function getNowMinutes(): number {
  const now = new Date();
  const pst = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  return pst.getHours() * 60 + pst.getMinutes();
}

function getCalendarUrl(ev: CalItem): string {
  if (ev.calendarLink) return ev.calendarLink;
  if (ev.htmlLink) return ev.htmlLink;
  if (ev.calendarEventId) return `https://calendar.google.com/calendar/event?eid=${btoa(ev.calendarEventId)}`;
  return "https://calendar.google.com";
}

export function ScheduleView({ items, onEnterSales, onEnterTasks, onRefresh }: Props) {
  const [nowMin, setNowMin] = useState(getNowMinutes);
  const [refreshing, setRefreshing] = useState(false);
  const nowRef = useRef<HTMLDivElement>(null);

  const handleRefresh = async () => {
    if (refreshing || !onRefresh) return;
    setRefreshing(true);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  useEffect(() => {
    const timer = setInterval(() => setNowMin(getNowMinutes()), 30000);
    return () => clearInterval(timer);
  }, []);

  const positioned = layoutEvents(items);

  const eventMinHour = positioned.length > 0
    ? Math.floor(Math.min(...positioned.map(e => e.startMin)) / 60)
    : DEFAULT_START_HOUR;
  const eventMaxHour = positioned.length > 0
    ? Math.ceil(Math.max(...positioned.map(e => e.endMin)) / 60)
    : DEFAULT_END_HOUR;
  const startHour = Math.min(DEFAULT_START_HOUR, eventMinHour);
  const endHour = Math.max(DEFAULT_END_HOUR, eventMaxHour);
  const hours = Array.from({ length: endHour - startHour }, (_, i) => i + startHour);
  const totalHeight = (endHour - startHour) * HOUR_HEIGHT;
  const nowTop = minutesToTop(nowMin, startHour);
  const nowInRange = nowMin >= startHour * 60 && nowMin <= endHour * 60;

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (nowRef.current) {
        const rect = nowRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;
        if (rect.top < 0 || rect.top > viewportH) {
          window.scrollTo({ top: nowRef.current.offsetTop - viewportH / 3, behavior: "smooth" });
        }
      }
    }, 200);
    return () => clearTimeout(timeout);
  }, [items.length]);

  const currentEvent = positioned.find(e => nowMin >= e.startMin && nowMin < e.endMin);
  const nextEvent = positioned.find(e => e.startMin > nowMin);
  const minutesUntilNext = nextEvent ? nextEvent.startMin - nowMin : null;

  const nowLabel = (() => {
    const h = Math.floor(nowMin / 60);
    const m = nowMin % 60;
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
  })();

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 20px 40px" }}>
      <div style={{
        display: "flex", justifyContent: "space-between", alignItems: "center",
        padding: "16px 0 12px",
      }}>
        <h3 style={{ fontFamily: FS, fontSize: 19, margin: 0 }}>Today's Schedule</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {currentEvent && (
            <span style={{
              fontSize: 11, fontWeight: 700, color: "#fff",
              background: "#2E7D32", padding: "3px 10px", borderRadius: 6,
            }}>
              In: {currentEvent.item.n}
            </span>
          )}
          {minutesUntilNext !== null && !currentEvent && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: C.blu,
              background: C.bluBg, padding: "3px 10px", borderRadius: 6,
            }}>
              Next in {minutesUntilNext}min
            </span>
          )}
          <span style={{ fontSize: 12, color: C.mut }}>{items.length} events</span>
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh schedule"
              style={{
                background: "none", border: "none", cursor: refreshing ? "default" : "pointer",
                fontSize: 16, color: C.blu, padding: "2px 4px", lineHeight: 1,
                opacity: refreshing ? 0.5 : 1,
                animation: refreshing ? "spin 1s linear infinite" : "none",
              }}
            >↻</button>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{
          padding: "60px 0", textAlign: "center", color: C.mut, fontSize: 14,
          background: "#FAFAF8", borderRadius: 8, border: `1px solid ${C.brd}`,
        }}>
          No calendar items loaded. Connect Google Calendar for live schedule.
        </div>
      ) : (
        <div style={{
          position: "relative",
          height: totalHeight,
          borderRadius: 8,
          border: `1px solid ${C.brd}`,
          background: "#FAFAF8",
        }}>
          {hours.map(h => {
            const top = (h - startHour) * HOUR_HEIGHT;
            return (
              <div key={h} style={{ position: "absolute", top, left: 0, right: 0, height: HOUR_HEIGHT, borderBottom: `1px solid ${C.brd}` }}>
                <span style={{
                  position: "absolute", top: -7, left: 8,
                  fontSize: 10, fontWeight: 600, color: C.mut,
                  background: "#FAFAF8", padding: "0 4px",
                  fontFamily: F,
                }}>
                  {formatHour(h)}
                </span>
                <div style={{
                  position: "absolute", top: HOUR_HEIGHT / 2, left: 60, right: 0,
                  borderTop: `1px dashed ${C.brd}44`,
                }} />
              </div>
            );
          })}

          {positioned.map((ev, i) => {
            const top = minutesToTop(ev.startMin, startHour);
            const height = Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_HEIGHT, 28);
            const leftPct = 10 + (ev.col / ev.totalCols) * 85;
            const widthPct = 85 / ev.totalCols;
            const isCurrent = nowMin >= ev.startMin && nowMin < ev.endMin;
            const isPast = ev.endMin <= nowMin;
            const elapsed = isCurrent ? nowMin - ev.startMin : 0;
            const total = ev.endMin - ev.startMin;
            const remaining = isCurrent ? ev.endMin - nowMin : 0;

            const bgColor = isCurrent ? "#E8F5E9" : ev.item.real ? C.bluBg : "#fff";
            const borderColor = isCurrent ? "#2E7D32" : ev.item.real ? C.blu : C.brd;
            const calUrl = getCalendarUrl(ev.item);

            return (
              <a
                key={`${ev.item.t}-${ev.item.n}-${i}`}
                href={calUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  position: "absolute",
                  top,
                  left: `${leftPct}%`,
                  width: `calc(${widthPct}% - 4px)`,
                  height,
                  borderRadius: 8,
                  background: bgColor,
                  border: `2px solid ${borderColor}`,
                  padding: "6px 10px",
                  boxSizing: "border-box",
                  overflow: "hidden",
                  opacity: isPast ? 0.5 : 1,
                  cursor: "pointer",
                  zIndex: isCurrent ? 10 : 5,
                  transition: "opacity 0.2s, box-shadow 0.2s",
                  textDecoration: "none",
                  display: "block",
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 8px rgba(0,0,0,0.12)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = "none"; }}
              >
                {isCurrent && (
                  <div style={{
                    position: "absolute", top: 0, left: 0,
                    width: `${(elapsed / total) * 100}%`,
                    height: "100%",
                    background: "rgba(46,125,50,0.08)",
                    borderRadius: "6px 0 0 6px",
                    pointerEvents: "none",
                  }} />
                )}
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 700,
                    color: isCurrent ? "#2E7D32" : ev.item.real ? C.blu : C.tx,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {ev.item.n}
                  </div>
                  {height > 36 && (
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>
                      {ev.item.t}{ev.item.tEnd ? ` – ${ev.item.tEnd}` : ""}
                      {ev.item.loc && <span> · 📍 {ev.item.loc}</span>}
                    </div>
                  )}
                  {isCurrent && height > 50 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#2E7D32", marginTop: 3 }}>
                      {remaining}min remaining
                    </div>
                  )}
                  {height > 50 && (ev.item.gmailMessageId || ev.item.slackChannelId || ev.item.linearIdentifier) && (
                    <div style={{ display: "flex", gap: 4, marginTop: 3 }} onClick={e => e.stopPropagation()}>
                      {ev.item.gmailMessageId && <DeepLink type="email" id={ev.item.gmailMessageId} />}
                      {ev.item.slackChannelId && ev.item.slackMessageTs && <DeepLink type="slack" id="" channelId={ev.item.slackChannelId} messageTs={ev.item.slackMessageTs} />}
                      {ev.item.linearIdentifier && <DeepLink type="linear" id="" identifier={ev.item.linearIdentifier} />}
                    </div>
                  )}
                </div>
              </a>
            );
          })}

          {nowInRange && (
            <div
              ref={nowRef}
              style={{
                position: "absolute",
                top: nowTop,
                left: 0,
                right: 0,
                height: 2,
                background: "#2E7D32",
                zIndex: 20,
                pointerEvents: "none",
              }}
            >
              <div style={{
                position: "absolute",
                left: 0,
                top: -5,
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: "#2E7D32",
                border: "2px solid #fff",
                boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
              }} />
              <span style={{
                position: "absolute",
                left: 16,
                top: -8,
                fontSize: 10,
                fontWeight: 700,
                color: "#2E7D32",
                background: "#E8F5E9",
                padding: "1px 6px",
                borderRadius: 4,
                fontFamily: F,
                whiteSpace: "nowrap",
              }}>
                {nowLabel}
              </span>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
        <button onClick={onEnterSales} style={{ ...btn1, flex: 1, padding: 16, fontSize: 15 }}>
          📞 Sales Mode →
        </button>
        <button onClick={onEnterTasks} style={{ ...btn2, flex: 1, padding: 14 }}>
          ✅ Task Mode
        </button>
      </div>
    </div>
  );
}
