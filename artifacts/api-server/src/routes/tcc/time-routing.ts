import { Router, type IRouter } from "express";

const router: IRouter = Router();

interface TimeBlock {
  label: string;
  start: number;
  end: number;
  focus: "calls" | "admin" | "deep-work" | "rest";
  color: string;
  icon: string;
  headline: string;
  sub: string;
}

const BLOCKS: TimeBlock[] = [
  { label: "Morning Calls",    start: 8,  end: 12, focus: "calls",      color: "#2196F3", icon: "📞", headline: "CALLS ONLY",       sub: "Morning is sacred. No meetings. No admin. Dial." },
  { label: "Midday Admin",     start: 12, end: 14, focus: "admin",      color: "#FF9800", icon: "⚡", headline: "ADMIN BLOCK",      sub: "Emails, follow-ups, pipeline updates. Quick wins." },
  { label: "Afternoon Calls",  start: 14, end: 17, focus: "calls",      color: "#2196F3", icon: "📞", headline: "BACK ON PHONES",   sub: "Afternoon contacts are ready to talk. Dial until 5PM." },
  { label: "Evening Wrap",     start: 17, end: 19, focus: "deep-work",  color: "#4CAF50", icon: "🧠", headline: "DEEP WORK",        sub: "Strategy, planning, CEO priorities. Protect this time." },
  { label: "Unplug",           start: 19, end: 24, focus: "rest",       color: "#9C27B0", icon: "🌙", headline: "UNPLUG",           sub: "Shutdown. Rest. Tomorrow starts fresh." },
];

router.get("/time-routing", (req, res) => {
  const now = new Date();
  const pacificTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" }));
  const hour = pacificTime.getHours() + pacificTime.getMinutes() / 60;

  const current = BLOCKS.find(b => hour >= b.start && hour < b.end) ?? BLOCKS[BLOCKS.length - 1];
  const next = BLOCKS.find(b => b.start > hour);
  const hoursLeft = next ? next.start - hour : 0;
  const minutesLeft = Math.round(hoursLeft * 60);

  res.json({
    current,
    next: next ?? null,
    minutesLeft,
    hourPt: Math.round(hour * 10) / 10,
    blocks: BLOCKS,
  });
});

export default router;
