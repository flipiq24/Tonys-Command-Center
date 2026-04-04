import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, dailyBriefsTable } from "@workspace/db";

const DEFAULT_CAL = [
  { t: "8:00 AM", n: "Claremont Imaging Check-in", loc: "Bldg 3A, 255 E Bonita Ave, Pomona", note: "Call 909-450-0393", real: true },
  { t: "9:30 AM", n: "Jedi Kids", real: false },
  { t: "10:30 AM", n: "2K house payment + Martha", real: false },
  { t: "10:30 AM", n: "Review Chat — James 3:13", note: "Like 12:31", real: false },
  { t: "10:30 AM", n: "B12 + City of Hope + specialist + holistic", real: false },
  { t: "11:30 AM", n: "LinkedIn: mormilo", real: false },
  { t: "12:00 PM", n: "MP — luma.com", real: false },
  { t: "1:00 PM", n: "Gas Town — Yegge AI orchestrator", real: false },
  { t: "1:00 PM", n: "Stitch + Remotion + Blender MCP", real: false },
  { t: "1:00 PM", n: "NEXUS — Network of Experts", real: false },
  { t: "2:00 PM", n: "What Tony STOPS Doing → Who Owns It", note: "Discuss 3/23", real: false },
  { t: "3:00 PM", n: "Trojan Horse — in-house agent approach", real: false },
  { t: "5:30 PM", n: "High volume texting + social media + Usale", real: false },
  { t: "8:00 PM", n: "Compliance — close out notes", real: false },
  { t: "8:30 PM", n: "Chris Craddock EXP Realty — partner", real: false },
  { t: "9:30 PM", n: "House AMP — important!", real: false },
  { t: "10:30 PM", n: "Title Company Pitch", real: false },
  { t: "11:30 PM", n: "LinkedIn: shellycofini", real: false },
];

const DEFAULT_EMAILS_IMPORTANT = [
  { id: 1, from: "Ethan Jolly", subj: "My Amended Contract", why: "Equity stake — needs a call", time: "Yesterday", p: "high" },
  { id: 2, from: "Chris Wesser", subj: "FlipIQ Lightning Docs", why: "Capital raise — revisions tonight", time: "Today", p: "high" },
  { id: 3, from: "Claude Team", subj: "$200 team credit", why: "Expires Apr 17", time: "Today", p: "med" },
  { id: 4, from: "Fernando Perez", subj: "Off-market Chino", why: "Deal — asked for call", time: "Today", p: "med" },
  { id: 5, from: "Sebastian Calder", subj: "Video sales letters", why: "Pricing inquiry", time: "Yesterday", p: "low" },
];

const DEFAULT_EMAILS_FYI = [
  { id: 10, from: "Dr. Fakhoury", subj: "Mom's medication", why: "B12 shipping tomorrow" },
  { id: 11, from: "David Breneman", subj: "Consultation Request", why: "Responded to Ethan" },
  { id: 12, from: "Marisol Diaz", subj: "Physician referral", why: "Family medical" },
];

const DEFAULT_TASKS = [
  { id: "t1", text: "10 Sales Calls", cat: "SALES", sales: true },
  { id: "t2", text: "Reply Ethan re: equity", cat: "OPS" },
  { id: "t3", text: "Follow up Chris Wesser", cat: "SALES" },
  { id: "t4", text: "Sales demo website", cat: "SALES" },
];

const router: IRouter = Router();

async function briefTodayHandler(req: Parameters<Parameters<typeof router.get>[1]>[0], res: Parameters<Parameters<typeof router.get>[1]>[1]): Promise<void> {
  const today = new Date().toISOString().split("T")[0];
  const [brief] = await db
    .select()
    .from(dailyBriefsTable)
    .where(eq(dailyBriefsTable.date, today));

  if (brief) {
    res.json({
      date: today,
      calendarData: brief.calendarData || DEFAULT_CAL,
      emailsImportant: brief.emailsImportant || DEFAULT_EMAILS_IMPORTANT,
      emailsFyi: brief.emailsFyi || DEFAULT_EMAILS_FYI,
      slackItems: brief.slackItems || [],
      linearItems: brief.linearItems || [],
      tasks: brief.tasks || DEFAULT_TASKS,
    });
    return;
  }

  res.json({
    date: today,
    calendarData: DEFAULT_CAL,
    emailsImportant: DEFAULT_EMAILS_IMPORTANT,
    emailsFyi: DEFAULT_EMAILS_FYI,
    slackItems: [],
    linearItems: [],
    tasks: DEFAULT_TASKS,
  });
}

router.get("/brief/today", briefTodayHandler);
router.get("/morning-brief", briefTodayHandler);

export default router;
