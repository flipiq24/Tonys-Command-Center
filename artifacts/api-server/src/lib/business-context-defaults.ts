// Default content for the three Business section docs Tony reads + edits in
// the dashboard's "📄 Business plan" tab. These used to be hardcoded JS
// constants in BusinessView.tsx — they live here now so the DB is the single
// source of truth: UI reads them via /business/context/:documentType, AI
// reads them via the same endpoint or via business_context table directly,
// and Tony can edit them through the UI without code changes.
//
// First-read seed only — once a row exists in business_context, these
// defaults are ignored and Tony's edits win.

export const BUSINESS_CONTEXT_DEFAULTS: Record<string, { content: string; summary: string }> = {
  business_plan: {
    summary: "FlipIQ operating brain — north star, priorities, capital strategy, who-does-what",
    content: `FLIPIQ OPERATING BRAIN
The source of truth for every decision. Updated April 9, 2026.

If a task, idea, or meeting cannot be justified by this document — it is noise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO WE ARE

FlipIQ is an AI-powered acquisition intelligence platform for experienced real estate investor-operators. We make operators more efficient by providing transaction intelligence: which agents close, which investors are active, where deals are. We do not teach people to flip. We arm experienced teams with better data and smarter automation.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE BUILD

Command — CRM and deal management. Operator dashboard, pipeline, agent relationships, offers, communication. What operators live in daily.

DispoPro — Disposition tools in Command. List acquired properties, find buyers through agent networks.

USale Marketplace — Free off-market platform. Operators post deals, buyers get notified, transactions happen direct. Launching July 1, 2026.

USale Seller Direct — Co-op brand. Operators pool resources for low-cost 'sell your house as-is' leads. Feeds inventory into Marketplace. Target $100K/mo by Dec 2026.

AAA — Acquisition Intelligence System. AI layer on Command. Continuous scoring, automated matching, offer generation. AA opens app → prioritized opportunities already analyzed → approve and send. End state: fully autonomous.

TCC — CEO operating system. Morning check-in, email triage, sales CRM, task management, accountability. Keeps the CEO on sales, not in engineering.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

NORTH STAR

Atomic KPI: Every AA closes 2 deals per month. Each operator has 4 full-time AAs.

The math: 2 flips + 6 wholesales per operator per month = $10,370 in FlipIQ revenue. At 375 operators = $3.9M/month.

Decision filter: Does this move an AA toward 2 deals/month? If no — it is noise.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHERE WE ARE GOING

This year (2026): Get all 7 current operators to atomic KPI. Prove the model works. Launch Marketplace by July 1. Seller Direct generating $100K/mo by December. Raise $400K for 6-month runway. Hire PM, Onboarding Manager, Adaptation Manager.

3 years: 375 operators across 75 metros. $1.5M/month run rate at 50% forecast. $16.2M cumulative. Command 2.0 + AAA fully deployed. Self-funding from loan brokerage + success fees.

5 years: USale Marketplace = largest off-market RE platform. Seller Direct = largest sell-as-is brand. 1,875 users (375 operators × 5 each). 7,500 deals/month. Revenue stack: Command + loans + title + escrow = $100M ARR. Exit at $1B (10x).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW WE MAKE MONEY

Source                              Amount              Per operator/month
Flip loan brokerage (0.5%)          $1,285 per flip     $2,570 (2 flips)
Wholesale success fee (10%)         $1,300 per deal     $7,800 (6 wholesales)
Setup fee (subsidized by lender)    $10,000 one-time    —
TOTAL                               —                   $10,370/month

Setup fee is $50K. Sponsoring lender subsidizes it to $10K. Cheapest in market. Operator must use our lending partner (Kiavi) — that's how we earn the half-point. If they don't use our lender: full $50K.

Future: loans + title + escrow at scale → $100M ARR.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GROWTH PLAN

Phase     Months    Pace             End operators    Run rate
Setup     1–6       Prove with 7     7                $18K/mo
Crawl     7–12      1 new/week       31               $67K/mo
Walk      13–18     2/week           85               $231K/mo
Jog       19–24     3/week           163              $542K/mo
Run       25–30     4/week           265              $977K/mo
Sprint    31–36     5/week           375              $1.5M/mo

All numbers at 50% forecast (conservative). Even at 25% = $11.7M/year at scale.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE SPEND

Monthly burn: ~$64K. 6-month need (May–Oct): $400K. Revenue forecast ~$200K reduces gap.

Role/cost                Monthly    Notes
CEO                      $5K
COO/CFO                  $10K
CTO (advisory)           $6K        SLA model
Engineers (2)            $5K        Faisal $3K + Haris $2K
CS Manager               $5K        Ramy
Marketing                $5K        Bondilyn
PM/Engineer (hire)       $6K        Target May
2 CX hires               $5K        $2.5K each
AWS                      $5K        Target $2–3K after reduction
Data/MLS/AI              $4.5K
Legal/misc               $2.5K

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CAPITAL STRATEGY

Path A (preferred): Bootstrap. Tony signs as Kiavi broker. Half-point per loan, no dependency. 20 commitments at $10K = $200K. Chris Wesser + advisors fund the $400K gap.

Path B (fallback): Lender partnership. Nema/Lightning Docs or RCN invests $400K–$1M for exclusive lending distribution. Risk: they control the loan relationship.

Decision by: May 15, 2026. Pursue both simultaneously until then.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FIVE PRIORITIES FOR 2026

In order. If #1 and #2 aren't working, nothing else matters.

01 ADAPTATION
1. Assess each of the 7 operators individually
2. Finalize Customer Success Dashboard
3. Contact every user — classify engaged vs dead weight, suspend non-performers
4. Document DBTM success model — replicate to all operators
5. Deploy success workflow to all AAs

02 SALES
1. Lock $10K pricing with sponsoring lender
2. Get 20 commitments at $10K
3. Demo workflow: lender + title company lined up
4. Deliver sales materials: presentation, script, databases
5. Pipeline: 5 demos/week, 15+ prospects, 3 new operators/month

03 TECH
1. Finalize CS Dashboard
2. Finalize Foundation + DispoPro
3. AWS cost reduction + Google Cloud credits/grant
4. Build AAA
5. Deploy USale Marketplace by July 1

04 CAPITAL
1. Decide: Kiavi broker vs lender buy-in
2. Finalize 6-month financial plan ($400K)
3. Present plan to Chris Wesser + Rick Sharga
4. Kiavi broker application signed
5. Nema/Lightning Docs as option B

05 TEAM
1. Hire PM/Engineer at $6K
2. Hire Onboarding Manager at $2.5K
3. Hire Adaptation Manager at $2.5K
4. Clarify CTO advisory role, reassign 29 issues
5. SOW updates for all team members

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHO DOES WHAT

Role                    Does                                                    Does not touch
CEO                     Sales 60%+. Pricing. Capital. AAA spec. CS support.     Standups. Linear. QA. Onboarding. New frameworks.
COO                     Accountability. Finance. Hiring. Dashboard oversight.    Engineering. Product. Sales demos. Training.
CTO (SLA)               AWS cost. Architecture. AAA review. PM transfer.         Day-to-day engineering. Triage. Code without approval.
CS Manager              Adaptation. User contact. Success workflow. Training.    Engineering. Sales. Finance. Feature changes.
Command Engineer        Dashboard. QA. Sprint delivery. SMS UI.                  Foundation. Training. Operators. AWS.
Foundation Engineer     MLS. Agent pipeline. DispoPro. Contact matching.         Command UI. Sprint planning. Customers.
Marketing               Sales presentation. Scripts. Databases. Playbook.        Sales calls. Engineering. CS. Finance.
PM (hire)               Linear audit. Sprints. Standups. Backend. AAA build.     CS. Sales. Strategy. Daily CEO updates after Wk 4.
Onboarding Mgr (hire)   Intake. OMS checklist. First-contact quality.            Ongoing support. Sales. Engineering.
Adaptation Mgr (hire)   Adoption tracking. Alerts. Outreach. Training.          Onboarding. Sales. Engineering.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

90-DAY RULES

One system. 90 days. No modifications.

Every item has an owner and a date. When a date passes, the owner flags it same day. COO surfaces all misses in Friday report. CEO responds same day with a specific correction — not a new plan.

Every task in Linear. If not in Linear, it does not exist. Required fields: Status, Start Date, Due Date, Size, Assignee, Next Step. Sprint target: 80%+ of 40+ committed points.

CEO scope: Sales, then CS support. Everything else pushed back.

If CEO is doing engineering work: COO flags it. Correct that week.
If CEO creates a new framework: Stop. This document is the system.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STOP DOING / DO INSTEAD

Stop                                      Instead
New framework                             Enforce this doc 90 days
Soft accountability                       What, by when, what if missed
Tech work instead of selling              COO flags → correct that week
Delegate discomfort to a document         Say it directly, face to face
New products before Command stable        List does not grow
50 calls but 3 conversations              5 demos/week, tracked, verified

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW THE AI USES THIS DOCUMENT

When evaluating any task, idea, meeting, or decision:

1. Does it move an AA toward 2 deals/month? → If no: noise. Park it.
2. Does it align with one of the 5 priorities? → If no: not this cycle.
3. Is it in the 90-day plan? → If no: it's an idea. Assign a number. Say what's ahead of it.
4. Who owns it? → If nobody: assign or kill.
5. Does it have a date? → If no: it doesn't exist.

Updated April 9, 2026. Next review: July 1, 2026.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  "90_day_plan": {
    summary: "FlipIQ 90-day operating plan — Apr 7 to Jul 4 2026, 5 priorities, accountability rules",
    content: `FLIPIQ 90-DAY PLAN
April 7 — July 4, 2026

This plan does not grow. It does not get modified. It gets executed. Every item has an owner. Every owner has a date. When a date passes without delivery, the owner flags it same day. If a new idea surfaces that isn't in this plan — it gets parked. If someone wants to add scope — the answer is no. 90 days.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHERE WE ARE TODAY

FlipIQ has 7 active operator clients. The platform is live. Operators are using Command for acquisition management. But we have a problem: the operators are not consistently hitting the atomic KPI. Some are performing — DBTM is doing 2 acquisitions per week. Others are not engaging at all. We don't have clear visibility into who is active and who isn't because the Customer Success Dashboard doesn't exist yet.

The sales engine is stalled. The CEO has been building systems instead of selling. The pricing model is confirmed ($50K subsidized to $10K by the sponsoring lender) but zero new commitments have been signed. The sales materials are incomplete — Bondilyn has been waiting since March 31 for the broker presentation and USale script.

The tech stack is functional but unfinished. Command 1.5 has open QA items that need shipping. Foundation (the data layer) is not complete. DispoPro is partially integrated. The admin panel hasn't been deployed to production. AWS costs are running at $5K/month, which is double what they should be.

The team is lean but has critical gaps. There is no PM — the CEO is still attending engineering meetings and doing Linear triage. Ramy is a single point of failure for all customer success. Nate stepped back from CTO on March 6 and left 29 Linear issues without owners. The 3 hiring positions (PM, Onboarding Manager, Adaptation Manager) are not yet posted.

Capital: Ethan completed the 6-month financial analysis on April 9. The company needs $400K to fund operations May through October. Two capital paths exist: bootstrap through Kiavi loan brokerage, or bring in a lending partner. No decision has been made.

This is the starting point. Not where we want to be — where we actually are.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 1: ADAPTATION — MAKE THE CURRENT OPERATORS WORK

Before we sell to new operators, the 7 we have need to be producing. If they're not hitting the atomic KPI (2 deals/month per AA), we can't prove the model to anyone else. This is not optional — it's the foundation everything else sits on.

The plan: Ramy contacts every single user by April 17. Not an email blast — actual conversations. Who is engaged? Who is struggling? Who has checked out? By the end of April, every operator is classified as active, struggling, or dead weight. Dead weight gets suspended — we are not carrying non-performers while we burn cash.

Simultaneously, Faisal ships the Customer Success Dashboard so we have real-time visibility. Tony assesses each operator individually — starting with DBTM (the one that works) and working through all 7 by end of Week 2. We document what DBTM is doing right and turn it into a success playbook that gets distributed to every AA.

End of month 1: Every operator assessed. Engaged users getting support. Dead weight identified. Success workflow in every AA's hands.

End of 90 days: Active operators at 70%+ atomic KPI. All dead weight suspended. Adaptation Manager hired and cross-trained with Ramy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 2: SALES — START CLOSING

The CEO's job is to sell. 60% of his time, minimum. For the past several weeks, that hasn't been happening — system building, engineering oversight, and operational work have consumed the calendar. This plan stops that.

Week 1: Tony is on the phone 10 calls per day. He responds to Bondilyn's requests for the broker presentation and USale script — she's been waiting since March 31. He starts the Kiavi broker application so we have loan revenue flowing without external dependency.

By Week 2: Kiavi broker agreement is signed. 5 demos are completed. The pitch is simple: $50K platform subsidized to $10K by the sponsoring lender. Use our lender for flips, we earn a half-point. Don't want to use our lender? Full $50K. It's the cheapest and most advanced platform in the market.

By end of April: 10+ operators in the pipeline. By end of May: 3 new commitments signed. By end of June: 20 total commitments at $10K each, representing $200K in near-term contracts.

Enforcement: Ethan audits Tony's calendar every Monday. If Tony is in engineering meetings instead of selling, Ethan flags it. If Tony creates a new framework instead of making calls, Claude flags it. No exceptions.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 3: TECH — SHIP WHAT'S BUILT, START WHAT'S NEXT

The engineering team has three lanes with zero overlap. Faisal owns Command 1.5: ship the QA items, deploy the admin panel, build the CS Dashboard. Haris owns Foundation: complete the data layer, integrate DispoPro, close the 15% agent matching gap. Nate (on SLA) owns architecture: AWS cost reduction, AAA spec, and knowledge transfer to the new PM.

The first month is about finishing. Everything in QA ships. The admin panel goes to production. Foundation gets stable. AWS costs start coming down from $5K to the $2–3K target.

The second month is about building. The PM is hired and ramped. AAA (the Acquisition Intelligence System) starts its 30-day build: infrastructure in Week 1, intelligence layer in Week 2, integration in Weeks 3–4. By end of May, AAA is in testing with 1–2 live AAs.

The third month is about preparing for launch. AAA goes to production. The marketplace data layer is designed and development starts. By July 1 — the 91st day — USale Marketplace launches as a free off-market listing platform.

Sprint discipline: 40+ points committed per cycle. 80%+ completion rate. Every ticket in Linear with Status, Start Date, Due Date, Size, Assignee, and Next Step. Ethan enforces on Monday. Reports on Friday.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 4: CAPITAL — SECURE THE RUNWAY

The company needs $400K for the 6-month runway May through October. Two paths are being pursued simultaneously.

Path A is the preferred approach: bootstrap. Tony signs up as Kiavi broker and earns a half-point on every flip loan flowing through our network. Combined with $10K setup fees from 20 operator commitments, this generates $200K+ in near-term revenue. The remaining gap is funded through Chris Wesser and advisor-connected investors at favorable terms.

Path B is the fallback: a lending partner (Nema/Lightning Docs or similar) invests $400K–$1M in exchange for exclusive loan distribution through FlipIQ. This brings capital fast but gives the lender control over the loan relationship.

The sequence: Ethan finalizes the P&L in Week 1. Tony and Ethan confirm the capital strategy (Kiavi broker vs lender) by Week 2. Chris Wesser gets the presentation by Week 3. By May 15, the decision is made and the capital path is locked.

Non-negotiable: No investor conversations without Ethan's approval on the numbers. No commitments to lenders without Tony's written approval on the terms.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PRIORITY 5: TEAM — FILL THE GAPS

Three positions need to be filled: PM/Engineer ($6K/month), Onboarding Manager ($2.5K), and Adaptation Manager ($2.5K). The PM is the most urgent — until this person is hired, Tony is stuck doing engineering oversight and the CEO can't sell full-time.

Ethan owns hiring. PM job spec finalized Week 1, posted Week 3, interviews Week 4, offer by early May. The PM's first deliverable is a Linear workspace audit and sprint plan within 7 days of starting. By Day 30, the PM is fully autonomous — zero CEO involvement in daily engineering.

The two CX hires (Onboarding Manager and Adaptation Manager) go under Ramy. They're posted in May and hired in June. Until then, Ramy handles both onboarding and adaptation alone — which is why he's classified as a single point of failure in the gap analysis.

Nate's 29 orphaned issues from March 6 get reassigned immediately — to Faisal, Haris, or parked for the PM. SOW updates for every team member are completed by the end of April so there is zero ambiguity about who does what.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW THE TEAM IS ORGANIZED

Three engineers. Three lanes. Zero overlap. Every other role has a clear scope.

Role                   Lane                    Owns
CEO                    Sales + Strategy        Demos, pricing, capital, AAA spec, Ramy support
COO                    Accountability+Finance  Linear dates, Friday report, P&L, hiring
CS Manager             Adaptation + OMS        User contact, classification, workflow, reports
Command Engineer       Command 1.5             Dashboard, QA, sprint delivery, SMS UI
Foundation Engineer    Foundation + DispoPro   MLS, agent pipeline, DispoPro, matching
CTO (SLA)              Architecture            AWS, specs, reviews, PM transfer
Marketing              Sales Support           Presentation, scripts, databases, playbooks

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW WE STAY ACCOUNTABLE

Every task is in Linear. If it's not in Linear, it doesn't exist. Required fields: Status, Start Date, Due Date, Size, Assignee, Next Step. Sprint target: 80%+ of 40+ committed points.

The COO never opens Linear to discover a missed commitment. If the CEO has to ask about a deadline, the accountability system has failed.

Monday: COO checks all Linear tasks have dates and assignees.
Friday: COO delivers Tech Report — what shipped, what missed, what's blocked. CEO responds same day with a specific correction.

CTO SLA terms: Architecture questions: 24 hours. Emergencies: 4 hours. Feature specs: 48 hours. All scopes approved in writing before work begins. Estimate first, approve first, bill after.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT WE STOP DOING

Creating a new framework instead of enforcing this plan. This document is the system. No new operating plans, accountability systems, or tracking frameworks. Enforce this one.

Soft accountability with no deliverable. Every conversation ends with: what is being delivered, by when, and what happens if it's missed.

The CEO doing tech work instead of selling. If the COO flags it, correct that week. If Claude flags it, correct that day.

Delegating discomfort to a document. Don't write a doc when a direct conversation is needed. Say it to the person.

Adding scope. This list does not grow. New ideas get parked with a number. The AI says what's ahead of it.

Reporting activity instead of results. 50 calls means nothing if there are 3 real conversations. 5 demos per week, tracked, verified.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT DONE LOOKS LIKE — JULY 4, 2026

Operators: All 7 assessed. Active ones at or near atomic KPI. Dead weight suspended. Success workflow adopted. DBTM model documented and replicated.

Sales: 20+ commitments at $10K. $200K in signed contracts. Active pipeline of 15+ prospects. 5 demos per week sustained. Kiavi broker generating loan revenue.

Revenue: On track for $100K/month. Success fees being collected. DBTM revenue tracked and in the P&L.

Capital: $400K secured through Path A or B. Runway confirmed through October. Decision made, not still being discussed.

Tech: Command 1.5 stable with zero critical bugs. Foundation complete. DispoPro integrated. CS Dashboard live. AAA deployed with 1–2 live AAs. AWS at $2–3K/month.

Team: PM hired, ramped, and running sprints autonomously. Onboarding Manager and Adaptation Manager hired. All SOWs current. Nate's 29 issues resolved.

Marketplace: Data layer designed. Architecture reviewed. Development underway. July 1 launch on track.

If these outcomes are met, the next 90-day plan builds on success. If they're not, the next plan starts with an honest assessment of why — and the same five questions: does it move an AA toward 2 deals/month? Does it align with the priorities? Who owns it? When is it due?

This plan resets July 4, 2026.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
  },
  brain_context: {
    summary: "Tony's brain context for AI sprint prioritization",
    content: "",
  },
};
