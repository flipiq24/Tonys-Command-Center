import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { planItemsTable } from "../../lib/schema-v2";
import { eq, and, asc, isNull, inArray } from "drizzle-orm";

const router: IRouter = Router();

// ─── Types ──────────────────────────────────────────────────────────────────

type PlanItem = typeof planItemsTable.$inferSelect;

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED_CATEGORIES = [
  { category: "adaptation", title: "01 Adaptation", priorityOrder: 1 },
  { category: "sales",      title: "02 Sales",      priorityOrder: 2 },
  { category: "tech",       title: "03 Tech",        priorityOrder: 3 },
  { category: "capital",    title: "04 Capital",     priorityOrder: 4 },
  { category: "team",       title: "05 Team",        priorityOrder: 5 },
];

const SEED_SUBCATEGORIES: { category: string; title: string; priorityOrder: number }[] = [
  { category: "adaptation", title: "Operator Assessment",    priorityOrder: 1 },
  { category: "adaptation", title: "CS Dashboard",           priorityOrder: 2 },
  { category: "adaptation", title: "User Outreach",          priorityOrder: 3 },
  { category: "adaptation", title: "Success Playbook",       priorityOrder: 4 },
  { category: "adaptation", title: "Dead Weight Suspension", priorityOrder: 5 },

  { category: "sales", title: "Pricing & Approach",    priorityOrder: 1 },
  { category: "sales", title: "Commitments Pipeline",  priorityOrder: 2 },
  { category: "sales", title: "Demo Workflow",          priorityOrder: 3 },
  { category: "sales", title: "Sales Materials",        priorityOrder: 4 },
  { category: "sales", title: "Prospect Pipeline",      priorityOrder: 5 },

  { category: "tech", title: "CS Dashboard (Tech)",     priorityOrder: 1 },
  { category: "tech", title: "Foundation + DispoPro",   priorityOrder: 2 },
  { category: "tech", title: "AWS/Cloud Credits",       priorityOrder: 3 },
  { category: "tech", title: "AAA Build",               priorityOrder: 4 },
  { category: "tech", title: "USale Marketplace",       priorityOrder: 5 },

  { category: "capital", title: "Loan Direction Decision", priorityOrder: 1 },
  { category: "capital", title: "P&L / Financial Plan",   priorityOrder: 2 },
  { category: "capital", title: "Investor Meetings",       priorityOrder: 3 },
  { category: "capital", title: "Kiavi Broker",            priorityOrder: 4 },
  { category: "capital", title: "Nema/Lightning Docs",     priorityOrder: 5 },

  { category: "team", title: "PM/Engineer Hire",       priorityOrder: 1 },
  { category: "team", title: "Onboarding Manager",     priorityOrder: 2 },
  { category: "team", title: "Adaptation Manager",     priorityOrder: 3 },
  { category: "team", title: "Nate Transition",        priorityOrder: 4 },
  { category: "team", title: "SOW Updates",            priorityOrder: 5 },
];

// Tasks per subcategory (seeded from spec + reasonable placeholders)
const SEED_TASKS: {
  category: string; subcategory: string; title: string; owner: string;
  priority: string; dueDate: string; weekNumber: number; month: string;
  atomicKpi?: string; source?: string; executionTier?: string;
}[] = [
  // Operator Assessment (5 tasks)
  { category:"adaptation", subcategory:"Operator Assessment", title:"Tony: assess DBTM operator status", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Identify non-performing operators before they drain AA time", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Operator Assessment", title:"Tony: assess Hegemark status", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Identify non-performing operators", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Operator Assessment", title:"Tony: assess STJ/Sergio status", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Identify non-performing operators", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Operator Assessment", title:"Tony: assess Acquire'd status", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:2, month:"2026-04", atomicKpi:"Identify non-performing operators", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Operator Assessment", title:"Tony: assess remaining operators", owner:"Tony", priority:"P1", dueDate:"2026-04-17", weekNumber:2, month:"2026-04", atomicKpi:"Full operator health baseline", source:"OAP", executionTier:"Sprint" },

  // CS Dashboard (4 tasks)
  { category:"adaptation", subcategory:"CS Dashboard", title:"Ramy: build operator health dashboard", owner:"Ramy", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Visibility into AA activity per operator", source:"Linear", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"CS Dashboard", title:"Faisal: COO Dashboard MyStats tab", owner:"Faisal", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Tony sees AAs closing per operator", source:"Linear", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"CS Dashboard", title:"Ramy: weekly status email to operators", owner:"Ramy", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Operator accountability drives AA performance", source:"OAP", executionTier:"Maintenance" },
  { category:"adaptation", subcategory:"CS Dashboard", title:"Ethan: review dashboard KPIs with Tony", owner:"Ethan", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Executive alignment on dashboard metrics", source:"TCC", executionTier:"Strategic" },

  // User Outreach (6 tasks)
  { category:"adaptation", subcategory:"User Outreach", title:"Ramy: contact all operators by Apr 17", owner:"Ramy", priority:"P0", dueDate:"2026-04-17", weekNumber:2, month:"2026-04", atomicKpi:"Every AA account contacted and activated", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"User Outreach", title:"Ramy: classify operators active/struggling/dead", owner:"Ramy", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Know which operators need intervention", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"User Outreach", title:"Ramy: autotracker training for active operators", owner:"Ramy", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"AAs using autotracker = faster deal flow", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"User Outreach", title:"Ramy: 10DLC compliance check for all operators", owner:"Ramy", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"No compliance issues blocking AA outreach", source:"OAP", executionTier:"Maintenance" },
  { category:"adaptation", subcategory:"User Outreach", title:"Ramy: send weekly adaptation report to Ethan", owner:"Ramy", priority:"P1", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Ethan has visibility to enforce accountability", source:"TCC", executionTier:"Maintenance" },
  { category:"adaptation", subcategory:"User Outreach", title:"Ramy: OMS onboarding for new operators", owner:"Ramy", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Smooth onboarding = faster to first deal", source:"OAP", executionTier:"Sprint" },

  // Success Playbook (4 tasks)
  { category:"adaptation", subcategory:"Success Playbook", title:"Tony: define 'success' criteria for operators", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Clear bar for what 2 deals/month requires", source:"OAP", executionTier:"Strategic" },
  { category:"adaptation", subcategory:"Success Playbook", title:"Ramy: document OMS onboarding checklist", owner:"Ramy", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"Repeatable onboarding = consistent AA quality", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Success Playbook", title:"Ramy: create adaptation milestone tracker", owner:"Ramy", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Track which AAs are on path to 2 deals", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Success Playbook", title:"Ethan: publish success playbook v1", owner:"Ethan", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Scalable playbook for every operator", source:"TCC", executionTier:"Strategic" },

  // Dead Weight Suspension (4 tasks)
  { category:"adaptation", subcategory:"Dead Weight Suspension", title:"Tony: suspension criteria decision with Ethan", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Clear criteria protects platform quality", source:"OAP", executionTier:"Strategic" },
  { category:"adaptation", subcategory:"Dead Weight Suspension", title:"Ethan: implement suspension workflow in Linear", owner:"Ethan", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"No bad operators dragging platform metrics", source:"Linear", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Dead Weight Suspension", title:"Ramy: identify and flag dead weight operators", owner:"Ramy", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"Remove dead weight to protect platform quality", source:"OAP", executionTier:"Sprint" },
  { category:"adaptation", subcategory:"Dead Weight Suspension", title:"Tony: execute first suspension wave", owner:"Tony", priority:"P1", dueDate:"2026-04-28", weekNumber:4, month:"2026-04", atomicKpi:"Remove operators not moving toward 2 deals", source:"OAP", executionTier:"Strategic" },

  // Sales: Pricing & Approach (4 tasks)
  { category:"sales", subcategory:"Pricing & Approach", title:"Tony: finalize subsidized pricing model ($10K)", owner:"Tony", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Pricing drives AA onboarding velocity", source:"OAP", executionTier:"Strategic" },
  { category:"sales", subcategory:"Pricing & Approach", title:"Tony: update sales script with new pricing", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"AAs sold faster = more deals in pipeline", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Pricing & Approach", title:"Bondilyn: finalize USale seller direct script", owner:"Bondilyn", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Better script = higher AA conversion rate", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Pricing & Approach", title:"Tony: review P&L impact of new pricing with Ethan", owner:"Tony", priority:"P1", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Pricing sustainable to $50K break-even", source:"TCC", executionTier:"Strategic" },

  // Sales: Commitments Pipeline (3 tasks)
  { category:"sales", subcategory:"Commitments Pipeline", title:"Tony: 10 outbound calls/day (Mon–Fri)", owner:"Tony", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Volume drives pipeline = deals/month", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Commitments Pipeline", title:"Tony: track commitments pipeline in CRM", owner:"Tony", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Committed AAs = predictable deal flow", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Commitments Pipeline", title:"Bondilyn: build outreach database for prospects", owner:"Bondilyn", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"More prospects = more AAs = more deals", source:"OAP", executionTier:"Sprint" },

  // Sales: Demo Workflow (3 tasks)
  { category:"sales", subcategory:"Demo Workflow", title:"Tony: complete 5 demos Week 2", owner:"Tony", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Demos convert to AA onboarding", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Demo Workflow", title:"Bondilyn: create demo slide deck v2", owner:"Bondilyn", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"Better demo = higher AA sign-up rate", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Demo Workflow", title:"Tony: record demo video for async prospects", owner:"Tony", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Scale demos without Tony's time", source:"OAP", executionTier:"Sprint" },

  // Sales: Sales Materials (4 tasks)
  { category:"sales", subcategory:"Sales Materials", title:"Bondilyn: USale sales deck v2", owner:"Bondilyn", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Better materials = faster AA conversion", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Sales Materials", title:"Bondilyn: podcast/video script for AA recruiting", owner:"Bondilyn", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Content drives inbound AA interest", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Sales Materials", title:"Bondilyn: affiliate playbook v1", owner:"Bondilyn", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Affiliates scale AA recruiting beyond Tony", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Sales Materials", title:"Tony: review all materials with Bondilyn", owner:"Tony", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Quality materials drive deal velocity", source:"TCC", executionTier:"Strategic" },

  // Sales: Prospect Pipeline (4 tasks)
  { category:"sales", subcategory:"Prospect Pipeline", title:"Bondilyn: build Wealthwise/KW prospect list", owner:"Bondilyn", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Qualified prospects = faster AA pipeline", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Prospect Pipeline", title:"Tony: Kiavi broker app SIGNED", owner:"Tony", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Kiavi broker = capital access for operators", source:"OAP", executionTier:"Strategic" },
  { category:"sales", subcategory:"Prospect Pipeline", title:"Tony: 3 new operator demos booked", owner:"Tony", priority:"P0", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"More demos = more AAs", source:"OAP", executionTier:"Sprint" },
  { category:"sales", subcategory:"Prospect Pipeline", title:"Tony: close 1 new operator", owner:"Tony", priority:"P0", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"New operator = new AAs = more deals", source:"OAP", executionTier:"Sprint" },

  // Tech: CS Dashboard Tech (4 tasks)
  { category:"tech", subcategory:"CS Dashboard (Tech)", title:"Faisal: MyStats tab — completion sprint", owner:"Faisal", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Tony sees AA deal velocity per operator", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"CS Dashboard (Tech)", title:"Faisal: Template Health tab QA", owner:"Faisal", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Template health = AA outreach quality", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"CS Dashboard (Tech)", title:"Faisal: SMS compliance UI feature registration", owner:"Faisal", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"10DLC compliance enables AA texting", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"CS Dashboard (Tech)", title:"Ethan: Linear review — CS Dashboard sprint", owner:"Ethan", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Sprint delivery = tools for AAs faster", source:"Linear", executionTier:"Maintenance" },

  // Tech: Foundation + DispoPro (4 tasks)
  { category:"tech", subcategory:"Foundation + DispoPro", title:"Haris: agent pipeline MLS sync stability", owner:"Haris", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Reliable MLS data = AAs find deals faster", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"Foundation + DispoPro", title:"Haris: DispoPro integration milestone 1", owner:"Haris", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Dispo access = AAs close deals faster", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"Foundation + DispoPro", title:"Haris: agent contact matching (close 15% gap)", owner:"Haris", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Better contact matching = more AA leads", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"Foundation + DispoPro", title:"Haris: cross-platform infrastructure audit", owner:"Haris", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Stable infra = reliable AA tools", source:"Linear", executionTier:"Maintenance" },

  // Tech: AWS/Cloud Credits (3 tasks)
  { category:"tech", subcategory:"AWS/Cloud Credits", title:"Nate: AWS cost reduction plan", owner:"Nate", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Lower AWS cost extends runway to break-even", source:"TCC", executionTier:"Strategic" },
  { category:"tech", subcategory:"AWS/Cloud Credits", title:"Nate: Google Cloud migration architecture review", owner:"Nate", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Cloud migration reduces infra costs", source:"TCC", executionTier:"Strategic" },
  { category:"tech", subcategory:"AWS/Cloud Credits", title:"Ethan: confirm AWS credit application", owner:"Ethan", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"AWS credits extend runway", source:"TCC", executionTier:"Strategic" },

  // Tech: AAA Build (4 tasks)
  { category:"tech", subcategory:"AAA Build", title:"Nate: AAA architecture spec (PM knowledge transfer)", owner:"Nate", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"AAA automates AA outreach = more deals/month", source:"OAP", executionTier:"Strategic" },
  { category:"tech", subcategory:"AAA Build", title:"TBD PM: AAA Linear sprint setup", owner:"TBD PM", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"AAA = scale AA deals without adding headcount", source:"OAP", executionTier:"Sprint" },
  { category:"tech", subcategory:"AAA Build", title:"Tony: AAA requirements spec", owner:"Tony", priority:"P0", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"Clear spec = faster AAA build", source:"OAP", executionTier:"Strategic" },
  { category:"tech", subcategory:"AAA Build", title:"Ethan: AAA budget approval", owner:"Ethan", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Budget approved = AAA starts faster", source:"TCC", executionTier:"Strategic" },

  // Tech: USale Marketplace (4 tasks)
  { category:"tech", subcategory:"USale Marketplace", title:"Tony: USale Marketplace feature spec", owner:"Tony", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Marketplace = scale beyond 375 operators", source:"OAP", executionTier:"Strategic" },
  { category:"tech", subcategory:"USale Marketplace", title:"Nate: marketplace architecture review", owner:"Nate", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Solid architecture = faster marketplace launch", source:"TCC", executionTier:"Strategic" },
  { category:"tech", subcategory:"USale Marketplace", title:"Haris: marketplace data layer design", owner:"Haris", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Data foundation for marketplace scale", source:"Linear", executionTier:"Sprint" },
  { category:"tech", subcategory:"USale Marketplace", title:"Ethan: marketplace go-to-market with Tony", owner:"Ethan", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"GTM plan ensures marketplace drives deals", source:"TCC", executionTier:"Strategic" },

  // Capital: Loan Direction Decision (3 tasks)
  { category:"capital", subcategory:"Loan Direction Decision", title:"Tony: decide bridge vs growth loan path", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Capital decision enables path to $50K break-even", source:"OAP", executionTier:"Strategic" },
  { category:"capital", subcategory:"Loan Direction Decision", title:"Ethan: model loan scenarios for Tony", owner:"Ethan", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Informed capital decision = lower financial risk", source:"TCC", executionTier:"Strategic" },
  { category:"capital", subcategory:"Loan Direction Decision", title:"Tony: capital decision confirmed with Ethan", owner:"Tony", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Resolved capital direction = execution clarity", source:"OAP", executionTier:"Strategic" },

  // Capital: P&L / Financial Plan (4 tasks)
  { category:"capital", subcategory:"P&L / Financial Plan", title:"Ethan: April P&L review with Tony", owner:"Ethan", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"P&L clarity drives revenue-first decisions", source:"TCC", executionTier:"Strategic" },
  { category:"capital", subcategory:"P&L / Financial Plan", title:"Ethan: DBTM revenue tracking setup", owner:"Ethan", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Track DBTM acq revenue (2/week but $0 in P&L)", source:"TCC", executionTier:"Maintenance" },
  { category:"capital", subcategory:"P&L / Financial Plan", title:"Ethan: monthly burn rate report", owner:"Ethan", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Know burn vs revenue to hit break-even faster", source:"TCC", executionTier:"Maintenance" },
  { category:"capital", subcategory:"P&L / Financial Plan", title:"Ethan: Q2 financial model update", owner:"Ethan", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Q2 model guides capital deployment", source:"TCC", executionTier:"Strategic" },

  // Capital: Investor Meetings (4 tasks)
  { category:"capital", subcategory:"Investor Meetings", title:"Tony: Chris Wesser — legal/capital raise update", owner:"Tony", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Investor capital extends runway to scale", source:"TCC", executionTier:"Strategic" },
  { category:"capital", subcategory:"Investor Meetings", title:"Ethan: investor update report draft", owner:"Ethan", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Regular updates = investor confidence", source:"TCC", executionTier:"Strategic" },
  { category:"capital", subcategory:"Investor Meetings", title:"Tony: 2 investor meetings booked", owner:"Tony", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Investor meetings = capital pipeline", source:"OAP", executionTier:"Strategic" },
  { category:"capital", subcategory:"Investor Meetings", title:"Tony: investor pitch deck update", owner:"Tony", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"Better deck = higher investor conversion", source:"OAP", executionTier:"Strategic" },

  // Capital: Kiavi Broker (3 tasks)
  { category:"capital", subcategory:"Kiavi Broker", title:"Tony: start Kiavi broker application", owner:"Tony", priority:"P0", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Kiavi broker = revenue from loan brokerage", source:"OAP", executionTier:"Strategic" },
  { category:"capital", subcategory:"Kiavi Broker", title:"Tony: Kiavi broker agreement SIGNED", owner:"Tony", priority:"P0", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Signed agreement = loan brokerage revenue stream", source:"OAP", executionTier:"Strategic" },
  { category:"capital", subcategory:"Kiavi Broker", title:"Tony: first Kiavi deal submitted", owner:"Tony", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"First deal = proof of broker revenue model", source:"OAP", executionTier:"Strategic" },

  // Capital: Nema/Lightning Docs (3 tasks)
  { category:"capital", subcategory:"Nema/Lightning Docs", title:"Tony: Nema partnership decision", owner:"Tony", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Nema = additional revenue per deal closed", source:"OAP", executionTier:"Strategic" },
  { category:"capital", subcategory:"Nema/Lightning Docs", title:"Chris Wesser: Lightning Docs legal review", owner:"Chris", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"Legal cleared = revenue from Lightning Docs", source:"TCC", executionTier:"Strategic" },
  { category:"capital", subcategory:"Nema/Lightning Docs", title:"Ethan: model Nema revenue impact on P&L", owner:"Ethan", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Nema revenue modeled = clear ROI", source:"TCC", executionTier:"Strategic" },

  // Team: PM/Engineer Hire (4 tasks)
  { category:"team", subcategory:"PM/Engineer Hire", title:"Ethan: PM/Engineer job spec finalized", owner:"Ethan", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"PM hire frees Tony 20-30% of sales time", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"PM/Engineer Hire", title:"Ethan: PM/Engineer candidates sourced (3+)", owner:"Ethan", priority:"P0", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"PM removes Tony from engineering overhead", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"PM/Engineer Hire", title:"Tony: PM/Engineer interview 2 candidates", owner:"Tony", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Right PM = Tony focused on deals", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"PM/Engineer Hire", title:"Ethan: PM/Engineer offer extended", owner:"Ethan", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"PM hired = Tony back on sales 100%", source:"TCC", executionTier:"Strategic" },

  // Team: Onboarding Manager (3 tasks)
  { category:"team", subcategory:"Onboarding Manager", title:"Ethan: Onboarding Manager JD posted", owner:"Ethan", priority:"P1", dueDate:"2026-04-18", weekNumber:2, month:"2026-04", atomicKpi:"Onboarding Manager = Ramy not single point of failure", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"Onboarding Manager", title:"Ramy: Onboarding Manager process documented", owner:"Ramy", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Documented process = scalable onboarding", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"Onboarding Manager", title:"Ethan: Onboarding Manager hire decision", owner:"Ethan", priority:"P1", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"OM hired = Ramy has backup for CS ops", source:"TCC", executionTier:"Strategic" },

  // Team: Adaptation Manager (3 tasks)
  { category:"team", subcategory:"Adaptation Manager", title:"Ethan: Adaptation Manager JD posted", owner:"Ethan", priority:"P1", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"AM = proactive feature adoption without Ramy", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"Adaptation Manager", title:"Ramy: AM scope defined (does/doesn't)", owner:"Ramy", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Clear scope = effective AM hire", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"Adaptation Manager", title:"Ethan: AM hire decision", owner:"Ethan", priority:"P2", dueDate:"2026-04-30", weekNumber:4, month:"2026-04", atomicKpi:"AM hired = scale adaptation without Ramy alone", source:"TCC", executionTier:"Strategic" },

  // Team: Nate Transition (3 tasks)
  { category:"team", subcategory:"Nate Transition", title:"Nate: resolve 29 orphaned Linear issues (Mar 6)", owner:"Nate", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Orphaned issues resolved = no P0 tech debt blocking AAs", source:"Linear", executionTier:"Sprint" },
  { category:"team", subcategory:"Nate Transition", title:"Nate: PM knowledge transfer document", owner:"Nate", priority:"P0", dueDate:"2026-04-21", weekNumber:3, month:"2026-04", atomicKpi:"Knowledge transfer = PM hire succeeds faster", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"Nate Transition", title:"Ethan: Nate transition plan signed off", owner:"Ethan", priority:"P1", dueDate:"2026-04-25", weekNumber:3, month:"2026-04", atomicKpi:"Smooth transition = no engineering gaps", source:"TCC", executionTier:"Strategic" },

  // Team: SOW Updates (4 tasks)
  { category:"team", subcategory:"SOW Updates", title:"Ethan: all SOWs updated to April scope", owner:"Ethan", priority:"P0", dueDate:"2026-04-14", weekNumber:1, month:"2026-04", atomicKpi:"Clear SOWs = team execution without Tony oversight", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"SOW Updates", title:"Tony: review Ramy SOW with Ethan", owner:"Tony", priority:"P1", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Ramy SOW clarity = CS runs without Tony", source:"TCC", executionTier:"Strategic" },
  { category:"team", subcategory:"SOW Updates", title:"Ethan: weekly SOW accountability check (Fridays)", owner:"Ethan", priority:"P1", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Accountability = team delivers on deals per month", source:"TCC", executionTier:"Maintenance" },
  { category:"team", subcategory:"SOW Updates", title:"Ethan: Friday accountability report to Tony", owner:"Ethan", priority:"P1", dueDate:"2026-04-11", weekNumber:1, month:"2026-04", atomicKpi:"Tony knows team status without daily check-ins", source:"TCC", executionTier:"Maintenance" },
];

// ─── Seed function ────────────────────────────────────────────────────────────

async function seedPlanIfEmpty(): Promise<void> {
  const existing = await db.select({ id: planItemsTable.id })
    .from(planItemsTable).limit(1);
  if (existing.length > 0) return;

  // Insert categories
  const categoryRows = await db.insert(planItemsTable).values(
    SEED_CATEGORIES.map(c => ({
      level: "category" as const,
      category: c.category,
      title: c.title,
      priorityOrder: c.priorityOrder,
      status: "active",
    }))
  ).returning();

  const catByKey = Object.fromEntries(categoryRows.map(r => [r.category, r]));

  // Insert subcategories
  const subcatRows = await db.insert(planItemsTable).values(
    SEED_SUBCATEGORIES.map(s => ({
      level: "subcategory" as const,
      category: s.category,
      subcategory: s.title,
      title: s.title,
      parentId: catByKey[s.category]?.id,
      priorityOrder: s.priorityOrder,
      status: "active",
    }))
  ).returning();

  const subcatByKey = Object.fromEntries(
    subcatRows.map(r => [`${r.category}:${r.title}`, r])
  );

  // Insert tasks
  await db.insert(planItemsTable).values(
    SEED_TASKS.map((t, i) => ({
      level: "task" as const,
      category: t.category,
      subcategory: t.subcategory,
      title: t.title,
      owner: t.owner,
      priority: t.priority,
      dueDate: t.dueDate,
      weekNumber: t.weekNumber,
      month: t.month,
      atomicKpi: t.atomicKpi,
      source: t.source,
      executionTier: t.executionTier,
      parentId: subcatByKey[`${t.category}:${t.subcategory}`]?.id,
      priorityOrder: i,
      status: "active",
    }))
  );

  console.log("[plan] Seeded plan_items: 5 categories, 25 subcategories, %d tasks", SEED_TASKS.length);
}

// Auto-seed on startup
seedPlanIfEmpty().catch(e => console.warn("[plan] Seed failed:", e.message));

// ─── Parent completion check ──────────────────────────────────────────────────

async function checkParentCompletion(taskId: string): Promise<void> {
  const [task] = await db.select().from(planItemsTable).where(eq(planItemsTable.id, taskId));
  if (!task || task.level !== "task" || !task.parentId) return;

  const siblings = await db.select().from(planItemsTable)
    .where(and(eq(planItemsTable.parentId, task.parentId), eq(planItemsTable.level, "task")));
  const allDone = siblings.length > 0 && siblings.every(s => s.status === "completed");

  if (allDone) {
    await db.update(planItemsTable).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(planItemsTable.id, task.parentId));

    // Check grandparent (category)
    const [subcat] = await db.select().from(planItemsTable).where(eq(planItemsTable.id, task.parentId));
    if (subcat?.parentId) {
      const parentSiblings = await db.select().from(planItemsTable)
        .where(and(eq(planItemsTable.parentId, subcat.parentId), eq(planItemsTable.level, "subcategory")));
      const parentAllDone = parentSiblings.length > 0 && parentSiblings.every(s => s.status === "completed");
      if (parentAllDone) {
        await db.update(planItemsTable).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
          .where(eq(planItemsTable.id, subcat.parentId));
      }
    }
  }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /plan/categories — categories with subcategories and task counts
router.get("/plan/categories", async (_req, res): Promise<void> => {
  try {
    const all = await db.select().from(planItemsTable).orderBy(asc(planItemsTable.priorityOrder), asc(planItemsTable.createdAt));

    const categories = all.filter(i => i.level === "category");
    const subcategories = all.filter(i => i.level === "subcategory");
    const tasks = all.filter(i => i.level === "task");

    const result = categories.map(cat => {
      const mySubs = subcategories.filter(s => s.parentId === cat.id);
      const myCatTasks = tasks.filter(t => {
        const sub = subcategories.find(s => s.id === t.parentId);
        return sub?.parentId === cat.id;
      });
      return {
        ...cat,
        subcategories: mySubs.map(sub => {
          const subTasks = tasks.filter(t => t.parentId === sub.id);
          return {
            ...sub,
            tasks: subTasks,
            totalTasks: subTasks.length,
            completedTasks: subTasks.filter(t => t.status === "completed").length,
          };
        }),
        totalTasks: myCatTasks.length,
        completedTasks: myCatTasks.filter(t => t.status === "completed").length,
      };
    });

    res.json({ categories: result });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /plan — same as categories (alias)
router.get("/plan", async (_req, res): Promise<void> => {
  try {
    const all = await db.select().from(planItemsTable).orderBy(asc(planItemsTable.priorityOrder), asc(planItemsTable.createdAt));
    res.json({ items: all });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /plan/weekly/:month — weekly grid data
router.get("/plan/weekly/:month", async (req, res): Promise<void> => {
  try {
    const { month } = req.params;
    const tasks = await db.select().from(planItemsTable)
      .where(and(eq(planItemsTable.level, "task"), eq(planItemsTable.month, month)))
      .orderBy(asc(planItemsTable.weekNumber), asc(planItemsTable.priorityOrder));

    // Group by owner and week
    const byOwner: Record<string, Record<number, PlanItem[]>> = {};
    for (const task of tasks) {
      const owner = task.owner || "Unassigned";
      const week = task.weekNumber || 0;
      if (!byOwner[owner]) byOwner[owner] = {};
      if (!byOwner[owner][week]) byOwner[owner][week] = [];
      byOwner[owner][week].push(task);
    }

    res.json({ month, byOwner });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /plan/task/:id/complete
router.post("/plan/task/:id/complete", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const [item] = await db.select().from(planItemsTable).where(eq(planItemsTable.id, id));
    if (!item) { res.status(404).json({ error: "Not found" }); return; }

    if (item.level !== "task") {
      // Count incomplete tasks under this item
      const subItems = await db.select().from(planItemsTable)
        .where(and(eq(planItemsTable.parentId, id), eq(planItemsTable.status, "active")));
      if (subItems.length > 0) {
        res.status(400).json({ error: `${subItems.length} ${item.level === "category" ? "subcategories" : "tasks"} remaining — complete all first` });
        return;
      }
    }

    const [updated] = await db.update(planItemsTable)
      .set({ status: "completed", completedAt: new Date(), completedBy: "Tony", updatedAt: new Date() })
      .where(eq(planItemsTable.id, id)).returning();

    if (item.level === "task") {
      await checkParentCompletion(id);
    }

    res.json({ ok: true, item: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /plan/task/:id/uncomplete
router.post("/plan/task/:id/uncomplete", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const [updated] = await db.update(planItemsTable)
      .set({ status: "active", completedAt: null, completedBy: null, updatedAt: new Date() })
      .where(eq(planItemsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }

    // Re-open all ancestors
    if (updated.parentId) {
      await db.update(planItemsTable).set({ status: "active", completedAt: null, updatedAt: new Date() })
        .where(eq(planItemsTable.id, updated.parentId));
      const [parent] = await db.select().from(planItemsTable).where(eq(planItemsTable.id, updated.parentId));
      if (parent?.parentId) {
        await db.update(planItemsTable).set({ status: "active", completedAt: null, updatedAt: new Date() })
          .where(eq(planItemsTable.id, parent.parentId));
      }
    }

    res.json({ ok: true, item: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /plan/item/:id — update any plan item
router.patch("/plan/item/:id", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const allowed = ["title","owner","priority","dueDate","weekNumber","status","workNotes","atomicKpi","source","executionTier","linearId"];
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key === "dueDate" ? "dueDate" : key] = req.body[key];
    }
    const [updated] = await db.update(planItemsTable).set(updates).where(eq(planItemsTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Not found" }); return; }
    res.json({ ok: true, item: updated });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /plan/tasks — flat task list for master task view
router.get("/plan/tasks", async (req, res): Promise<void> => {
  try {
    const filters: Parameters<typeof and>[] = [eq(planItemsTable.level, "task")];
    if (req.query.category) filters.push(eq(planItemsTable.category, req.query.category as string) as any);
    if (req.query.owner) filters.push(eq(planItemsTable.owner, req.query.owner as string) as any);
    if (req.query.status) filters.push(eq(planItemsTable.status, req.query.status as string) as any);

    const tasks = await db.select().from(planItemsTable)
      .where(and(...(filters as any[])))
      .orderBy(asc(planItemsTable.category), asc(planItemsTable.priorityOrder));

    res.json({ tasks, total: tasks.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /plan/seed — re-seed (admin)
router.post("/plan/seed", async (_req, res): Promise<void> => {
  try {
    await db.delete(planItemsTable);
    await seedPlanIfEmpty();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
