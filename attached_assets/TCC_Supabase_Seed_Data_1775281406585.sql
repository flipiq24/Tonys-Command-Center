-- ═══════════════════════════════════════════════════════════════
-- TONY'S COMMAND CENTER — Complete Supabase Seed Data
-- Run AFTER creating all tables from the Build Spec schema
-- Generated: April 4, 2026
-- ═══════════════════════════════════════════════════════════════


-- ─── SAMPLE CHECK-IN (Today's data) ──────────────────────────

INSERT INTO checkins (date, bedtime, waketime, sleep_hours, bible, workout, journal, nutrition, unplug)
VALUES ('2026-04-04', '11:30 PM', '6:00 AM', 6.5, TRUE, FALSE, FALSE, 'OK', FALSE);

INSERT INTO checkins (date, bedtime, waketime, sleep_hours, bible, workout, journal, nutrition, unplug)
VALUES ('2026-04-03', '10:30 PM', '6:00 AM', 7.5, TRUE, TRUE, TRUE, 'Good', FALSE);

INSERT INTO checkins (date, bedtime, waketime, sleep_hours, bible, workout, journal, nutrition, unplug)
VALUES ('2026-04-02', '10:30 PM', '6:00 AM', 7.5, TRUE, TRUE, FALSE, 'Good', FALSE);

INSERT INTO checkins (date, bedtime, waketime, sleep_hours, bible, workout, journal, nutrition, unplug)
VALUES ('2026-04-01', '12:00 AM', '6:30 AM', 6.5, TRUE, FALSE, TRUE, 'Good', TRUE);

INSERT INTO checkins (date, bedtime, waketime, sleep_hours, bible, workout, journal, nutrition, unplug)
VALUES ('2026-03-31', '12:00 AM', '8:30 AM', 8.5, TRUE, TRUE, FALSE, 'Good', FALSE);


-- ─── SAMPLE DAILY BRIEF (What Cowork builds at 5 AM) ────────

INSERT INTO daily_briefs (date, calendar_data, emails_important, emails_fyi, slack_items, linear_items, tasks)
VALUES ('2026-04-04',
  '[
    {"time":"8:00 AM","title":"Claremont Imaging Check-in","location":"Bldg 3A, 255 E Bonita Ave, Pomona","note":"Call 909-450-0393","real":true},
    {"time":"9:30 AM","title":"Jedi Kids","real":false},
    {"time":"10:30 AM","title":"2K house payment + Martha","real":false},
    {"time":"10:30 AM","title":"Review Chat — James 3:13","note":"Like 12:31","real":false},
    {"time":"10:30 AM","title":"B12 + City of Hope + cancer + specialist + holistic","real":false},
    {"time":"11:30 AM","title":"LinkedIn: mormilo","real":false},
    {"time":"12:00 PM","title":"MP — luma.com","real":false},
    {"time":"1:00 PM","title":"Gas Town — Steve Yegge AI orchestrator","real":false},
    {"time":"1:00 PM","title":"Stitch + Remotion + Blender MCP","real":false},
    {"time":"1:00 PM","title":"NEXUS — Network of Experts","real":false},
    {"time":"2:00 PM","title":"What Tony STOPS Doing → Who Owns It","note":"Discuss on 3/23 meeting","real":false},
    {"time":"3:00 PM","title":"Trojan Horse — in-house agent approach","real":false},
    {"time":"5:30 PM","title":"High volume texting + social media + Usale","real":false},
    {"time":"8:00 PM","title":"Compliance — close out notes, update Erwins docs","real":false},
    {"time":"8:30 PM","title":"Chris Craddock EXP Realty — great partner","real":false},
    {"time":"9:30 PM","title":"House AMP — important!","real":false},
    {"time":"10:30 PM","title":"Title Company Pitch — MP gives seller choice of services","real":false},
    {"time":"11:30 PM","title":"LinkedIn: shellycofini","real":false}
  ]'::jsonb,
  '[
    {"id":1,"from":"Ethan Jolly","subject":"My Amended Contract","why":"Equity stake decision — needs a call, not email reply","time":"Yesterday","priority":"high"},
    {"id":2,"from":"Chris Wesser","subject":"FlipIQ Lightning Docs Brief","why":"Capital raise — revisions with commentary coming tonight","time":"Today 8:38 AM","priority":"high"},
    {"id":3,"from":"Claude Team","subject":"$200 team credit","why":"Expires April 17 — Ethan asked if you redeemed","time":"Today 3:58 PM","priority":"medium"},
    {"id":4,"from":"Fernando Perez","subject":"Off-market Chino fix/flip","why":"Deal opportunity — he asked for a call","time":"Today","priority":"medium"},
    {"id":5,"from":"Sebastian Calder","subject":"Video sales letters — cost?","why":"Sales tool pricing inquiry","time":"Yesterday","priority":"low"}
  ]'::jsonb,
  '[
    {"id":10,"from":"Dr. Fakhoury","subject":"Mom''s medication update","why":"B12 shipping tomorrow, arrives Monday"},
    {"id":11,"from":"David Breneman","subject":"Consultation Request","why":"Responded to Ethan — Got it, have a good weekend"},
    {"id":12,"from":"Marisol Diaz","subject":"Physician referral","why":"Family medical coordination"}
  ]'::jsonb,
  '[
    {"from":"Faisal","message":"Fixes deployed, live in 10-15 min","level":"low","channel":"#engineering"},
    {"from":"Ethan","message":"My top 2 goals today. You?","level":"mid","channel":"#leadership"}
  ]'::jsonb,
  '[
    {"who":"Faisal","task":"Comps Map — full screen button","id":"COM-294","level":"low"},
    {"who":"Haris","task":"CSM Emails — HTML compose","id":"COM-323","level":"mid"}
  ]'::jsonb
);


-- ─── TASKS (From OAP v4) ─────────────────────────────────────

-- These are the current priority tasks per OAP v4
-- Task #1 is ALWAYS "10 Sales Calls" and routes to Sales Mode

-- No tasks table in schema — tasks come from OAP v4 priorities
-- Stored in daily_briefs.tasks or loaded from system_instructions
-- Here's the reference data the app should display:

INSERT INTO daily_briefs (date, tasks)
VALUES ('2026-04-04', '[
  {"id":"t1","text":"10 Sales Calls","category":"SALES","locked":true,"routes_to":"sales"},
  {"id":"t2","text":"Reply to Ethan re: equity contract","category":"OPS"},
  {"id":"t3","text":"Follow up Chris Wesser — capital raise docs","category":"SALES"},
  {"id":"t4","text":"Sales demo website build","category":"SALES"},
  {"id":"t5","text":"HubSpot pipeline setup","category":"OPS"},
  {"id":"t6","text":"OMS Expectation Doc → Ramy","category":"OPS"},
  {"id":"t7","text":"Recruiter playbook + call — James","category":"SALES"},
  {"id":"t8","text":"Recruiter playbook + call — Jesse","category":"SALES"},
  {"id":"t9","text":"Podcast / intro video — Bondelin + Jessica","category":"SALES"},
  {"id":"t10","text":"AAA spec document","category":"BUILD"}
]'::jsonb)
ON CONFLICT (date) DO UPDATE SET tasks = EXCLUDED.tasks;


-- ─── SYSTEM INSTRUCTIONS (Tooltips + Behavior Rules) ─────────
-- These power EVERY tooltip and can be edited via ✏️ Edit or ⚙️ Gear

INSERT INTO system_instructions (section, element, instructions, tooltip) VALUES
('Header', 'Check-in Button', 'Morning gate. System locked until done.', 'Morning gate. System locked until done. Asks bedtime, wake time, Bible, workout, journal, nutrition, unplug. Saved via Cowork to Google Sheet. Disappears completely once submitted.'),
('Header', 'Ideas Button', 'Capture ideas without derailing the day.', 'Capture ideas. Auto-categorizes, asks urgency, prioritizes against business plan and 90-day plan. If you try to work out of sequence, system pushes back. If you override, Ethan gets notified. Tech ideas auto-post to Slack. Shows count of total parked ideas.'),
('Header', 'Gmail Button', 'Opens full-screen email view.', 'Red badge shows count of Important Emails you haven''t responded to or snoozed. Click for full-screen email view with Important (reply enabled) and FYI (no reply) sections. Badge clears as you respond or snooze.'),
('Header', 'Calendar Button', 'Toggle calendar sidebar on/off.', 'Opens/closes the calendar sidebar panel. Shows all calendar items in compact form. Available after entering Sales or Task Mode. Calendar auto-collapses to sidebar when you leave the Schedule view.'),
('Header', 'Slack Dot', 'Shows when someone needs you.', 'Colored dot only when someone in Slack needs your attention — DMs, @mentions, questions waiting on you. Hidden when nothing needs you. 🟢=low priority, 🟡=medium (should address today), 🔴=urgent (someone waiting 2+ days). Click for details, reply from here.'),
('Header', 'Linear Dot', 'Shows when Linear issues need you.', 'Shows due/overdue issues assigned to you, blockers where team is waiting, mentions in comments. Hidden when nothing needs attention. Cross-references priorities and due dates for smart escalation.'),
('Header', 'EOD Button', 'Generate end-of-day reports.', 'Generates two reports via AgentMail: yours (calls, emails, demos, tasks, meetings, ideas, check-in stats, patterns, tomorrow priorities) and Ethan''s (your activity, overrides, missed items, framework alerts, drift alerts, mutual accountability score). Button turns green ✓ after sent.'),
('Header', 'Chat Button', 'Full Claude conversation.', 'Switches entire screen to full Claude conversation with ALL context loaded: contacts, calendar, emails, tasks, journal, business plan, OAP v4. Can talk about anything as if using Claude directly.'),

('Emails', 'Suggest Reply', 'System drafts reply based on context.', 'System drafts a reply based on email context and your communication style. You review, edit if needed, then approve. Draft goes to Gmail. Reply preserves threading (correct To, Subject with Re:).'),
('Emails', 'Snooze', 'Remove email temporarily.', 'Removes this email from your view until the time you choose. Options: 1 hour, 2 hours, tomorrow morning, next week, or custom time. When snooze expires, email returns to Important. If you never deal with it, stays in badge count on Gmail button.'),
('Emails', 'Thumbs Up', 'Confirm correctly flagged.', 'Tells the system this email was correctly flagged as important. Logged to Training Log. System learns to keep flagging similar emails from this sender/with these keywords.'),
('Emails', 'Thumbs Down', 'Mark as not important.', 'Tells the system this email was incorrectly flagged as important. You''ll be asked WHY so the system learns. Reason saved to Training Log. Future emails like this filtered differently.'),
('Emails', 'Importance Rules', 'Keywords + sender combo determines importance.', 'Emails sorted by: sender (team@flipiq.com always important, newsletters never important) + keywords (urgent, contract, payment, demo = important). System learns from your thumbs up/down feedback. Rules update automatically after 20+ data points.'),

('Sales', 'Attempt Made', 'Log a call attempt.', 'Click after dialing a contact. Popup opens where you give voice instructions: "No answer, send email saying..." System drafts follow-up email based on instructions, sends to Gmail drafts, updates contact record with attempt + timestamp, and moves to next contact.'),
('Sales', 'Connected', 'Log a connected call.', 'Log call outcome: notes from conversation, next step agreed, schedule follow-up. All interactions auto-logged to contact record. System checks script compliance if Bondelin''s script is loaded.'),
('Sales', 'Morning Protection', 'Mornings for calls only.', 'Mornings are protected for sales calls per OAP v4. If you try to schedule a meeting before noon, system pushes back: "Put this in the afternoon." System suggests afternoon time slots instead. Your highest-energy call window.'),
('Sales', 'Contact Priority', 'How contacts are sorted.', 'Priority order: 1) Broker-Investors (brokers who invest), 2) Wholesalers/Independent teams, 3) Independent Realtors, 4) Affiliates (lenders, escrow, title). Within each: Hot → Warm → New → Cold. Longest since last contact surfaces higher.'),

('Ideas', 'Auto-Prioritize', 'System ranks ideas against business plan.', 'Every idea is evaluated against the business plan document and 90-day plan. System tells you: "This is [category]. It fits at position #[X] because [reason]." You can push back but system will warn you. Override = email to Ethan.'),
('Ideas', 'Override Warning', 'You''re going out of sequence.', 'You''re trying to work on something out of sequence. The system compared your idea against the business plan and placed it at position #[X]. If you override, system emails Ethan (ethan@flipiq.com) saying you moved this ahead of current priorities. Accountability feature you requested.'),
('Ideas', 'Tech → Slack', 'Tech ideas auto-post to Slack.', 'When you park an idea with category "Tech", it automatically posts to the correct Slack channel (#engineering for bugs, #product for features, #ideas for general ideas). Includes: category, description, urgency, and bug/feature/idea label.'),

('Schedule', 'Smart Routing', 'System evaluates your available time.', 'After you review the schedule, system looks at time gaps between meetings. Under 15 min = "Prep for next meeting." 15-30 min = "Quick calls only." 30+ min = "Sales mode time." No meetings = "This is call time. Let''s go."'),
('Schedule', 'Meeting Context', 'Full context for each meeting.', 'Real meetings show: who is attending, context from LAST interaction ("This is your 2nd meeting with this person. Last time you discussed [X]. You said you would [Y]."), meeting notes history, location if any, flags like "Stop attending" or "Hand to Ramy."'),

('Accountability', 'Framework Detection', 'Flags when Tony builds instead of executes.', 'If Tony starts describing a new system, framework, dashboard, or process instead of executing existing plans: "Tony, you''re building a framework. You have [X] tasks due. The system is already built. Execute." If Tony persists → email Ethan.'),
('Accountability', 'Sales Protection', 'Sales calls always come first.', 'If Tony hasn''t completed sales calls and tries to: schedule non-sales morning meetings → block + redirect. Work on tech/ops/training → warn. Build ideas or systems → warn: "That''s idea #[X]. You have [Y] calls to make first."'),
('Accountability', 'Drift Detection', 'Flags time spent off-task.', 'If Tony spends more than 30 minutes in Ideas, Chat, or Task mode without making calls: "You''ve been in [mode] for 30 minutes. Your morning call block is running out." Logs drift time for EOD report.');


-- ─── EMAIL TRAINING LOG (Initial — empty, populated through use) ──

-- No initial data — this gets populated when Tony clicks 👍 or 👎
-- Example of what a row looks like:
-- INSERT INTO email_training (sender, subject, action, reason)
-- VALUES ('newsletter@company.com', 'Weekly Update', 'thumbs_down', 'Newsletter — never important');


-- ─── PRIORITY CONTACTS (From app sample data) ────────────────

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Mike Oyoque', 'MR EXCELLENCE', '(555) 123-4567', '', 'Broker-Investor', 'Warm', 'Follow up on demo request', 'Priority Outreach', '2026-03-25');

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Xander Clemens', 'Family Office Club', '(555) 234-5678', '', 'Broker-Investor', 'Hot', 'Schedule intro call — 10K investors', 'Priority Outreach', '2026-03-30');

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Fernando Perez', 'Park Ave Capital', '(555) 345-6789', '', 'Broker-Investor', 'New', 'Call about Chino off-market deal', 'Priority Outreach', '2026-04-03');

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Tony Fletcher', 'LPT/FairClose', '(555) 456-7890', '', 'Broker-Investor', 'Warm', 'Broker Playbook follow-up', 'Priority Outreach', '2026-04-01');

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Kyle Draper', '', '(555) 567-8901', '', 'Wholesaler', 'New', 'Demo scheduled?', 'Priority Outreach', '2026-03-28');

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Chris Craddock', 'EXP Realty', '(555) 678-9012', '', 'Broker-Investor', 'New', '#1 EXP recruiter — potential partner', 'Strategic Leads', NULL);

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Rod Wilson', 'Anchor Loans', '', '', 'Affiliate', 'Warm', 'Institutional validation — follow up on $15K deal', 'Priority Outreach', '2026-03-15');

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, last_contact_date)
VALUES ('Chris Wesser', '', '', 'chris.wesser@gmail.com', 'Affiliate', 'Hot', 'Capital raise advisor — docs in progress', 'Strategic Leads', '2026-04-03');


-- ─── INVESTORLIFT SOCAL CONTACTS ─────────────────────────────

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source) VALUES
('Drew Wolfe', 'Pinpoint Offers USA', '(909) 244-3237', 'drew@pinpointoffersusa.com', 'Wholesaler', 'New', 'Initial outreach', 'InvestorLift SoCal'),
('Gary Frausto', 'Central Valley Real Estate Investments', '(661) 900-4104', '', 'Wholesaler', 'New', 'Initial outreach', 'InvestorLift SoCal'),
('Mike Proctor', 'Mike Buys Houses', '(951) 547-5751', 'mikeproctorre@gmail.com', 'Wholesaler', 'New', 'Initial outreach', 'InvestorLift SoCal'),
('Omar Beltran', 'Best Deal Home Offer', '(626) 550-5028', 'omar@bestdealhomeoffer.com', 'Wholesaler', 'New', 'Initial outreach', 'InvestorLift SoCal'),
('Jake Del Real', 'JDR Group', '(909) 771-3626', 'jake@jdrgroupsd.com', 'Wholesaler', 'New', 'Initial outreach', 'InvestorLift SoCal');


-- ─── REIBLACKBOOK CONTACTS ───────────────────────────────────

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source) VALUES
('Aaron Chapman', 'CHAPMAN', '(602) 291-3357', 'chapmanaaron8@gmail.com', 'Independent', 'New', 'Initial outreach', 'REIBlackBook'),
('Aaron Peterson', 'PETERSON', '(801) 602-3312', 'aaron@achievetoday.com', 'Independent', 'New', 'Initial outreach', 'REIBlackBook'),
('Aaron Pimpis', 'LaunchControl', '(813) 748-7471', 'aaron@launchcontrol.us', 'Independent', 'New', 'Initial outreach', 'REIBlackBook'),
('Adam Johnson', 'JOHNSON', '(303) 578-4803', 'calltheadamjohnson@gmail.com', 'Independent', 'New', 'Initial outreach', 'REIBlackBook'),
('Adam Zach', 'ZACH', '(920) 215-4201', 'adamzach7@gmail.com', 'Independent', 'New', 'Initial outreach', 'REIBlackBook');


-- ─── HEDGE FUND CONTACTS ─────────────────────────────────────

INSERT INTO contacts (name, company, phone, email, type, status, next_step, source, notes) VALUES
('Jan Sieberts', 'Washington Capital Management', '907 272 5022', 'jan.sieberts@wcmadvisors.com', 'Affiliate', 'New', 'Research before outreach', 'Hedge Funds', 'AUM: US$985.00M. Title: Director. Anchorage, AK'),
('Alan Rosenfield', 'Harmony Asset Management', '480 314 5967', 'arosenfield@harmonyam.com', 'Affiliate', 'New', 'Research before outreach', 'Hedge Funds', 'Title: Founder. Scottsdale, AZ'),
('Rob Bloemaker', '1Sharpe Capital LLC', '5107885000', '', 'Affiliate', 'New', 'Research before outreach', 'Hedge Funds', 'AUM: US$3,984.00M. Title: Co-Founder and CIO. Piedmont, CA');


-- ─── SAMPLE IDEAS (Empty — Tony parks these during use) ──────

-- Example of what populated ideas look like:
-- INSERT INTO ideas (text, category, urgency, tech_type, priority_position, status)
-- VALUES ('MLS accuracy widget needs confidence score', 'Tech', 'This Week', 'Feature', 7, 'parked');


-- ─── SAMPLE CALL LOG (Empty — populated during Sales Mode) ───

-- Example of what a call log entry looks like:
-- INSERT INTO call_log (contact_name, type, notes, follow_up_sent, follow_up_text)
-- VALUES ('Mike Oyoque', 'attempt', 'No answer. Sent follow-up email.', TRUE, 'Hey Mike, tried to reach you about FlipIQ...');


-- ─── MEETING HISTORY (Known contacts) ────────────────────────

INSERT INTO meeting_history (person_name, person_email, meeting_date, notes, action_items) VALUES
('Ethan Jolly', 'ethan@flipiq.com', '2026-04-01T09:00:00-07:00', 'Bi-weekly management meeting. Discussed amended contract, equity stake, COO responsibilities.', 'Tony to review Ethan''s amended contract. Ethan to send updated pitch deck.'),
('Chris Wesser', 'chris.wesser@gmail.com', '2026-03-28T14:00:00-07:00', 'Capital raise discussion. Chris putting hours into Lightning Docs brief. Revisions coming.', 'Chris sends revised docs. Tony reviews and follows up.'),
('Ramy', 'ramy@flipiq.com', '2026-04-02T10:00:00-07:00', 'User adaptability tracking review. Ramy owns Weekly Adaptation Meeting.', 'Ramy to present adaptation metrics by Friday. Tony stays out of daily training calls.');


-- ─── SAMPLE JOURNAL ENTRY ────────────────────────────────────

INSERT INTO journals (date, raw_text, formatted_text, mood, key_events, reflection) VALUES
('2026-04-03',
'Feeling pretty good today. Had a solid morning routine. Bible and workout done. Meeting with the team went well, Ramy is stepping up. Still worried about the capital raise timeline and mom''s medical stuff. Need to stay focused on sales and stop getting pulled into tech. The command center build is exciting but I know I''m using it to avoid making calls. Need to be honest about that.',
'### Daily Journal Entry — April 3, 2026

**Mood:**
Positive, focused, slightly anxious about capital raise

**Key Events:**
- Completed morning routine (Bible + workout)
- Team meeting — Ramy showing initiative
- Capital raise timeline concerns
- Mom''s medical coordination ongoing
- Started building Command Center system

**Physical/Health Notes:**
Good morning routine. Bible and workout both completed.

**Reflection:**
Tony recognizes a familiar pattern — the excitement of building the Command Center is real, but the self-awareness about using it to avoid sales calls shows growth. The tension between the builder instinct and the sales imperative remains the core challenge. Ramy stepping up is a positive sign that delegation is working. The capital raise and mom''s medical situation add background stress that makes the "productive avoidance" pattern even more tempting.

---

**Original Entry (cleaned up):**
Feeling pretty good today. Had a solid morning routine. Bible and workout done. Meeting with the team went well, Ramy is stepping up. Still worried about the capital raise timeline and mom''s medical stuff. Need to stay focused on sales and stop getting pulled into tech. The command center build is exciting but I know I''m using it to avoid making calls. Need to be honest about that.',
'Positive, focused, slightly anxious',
'Morning routine completed. Team meeting — Ramy stepping up. Capital raise timeline concerns. Mom medical ongoing. Command Center build started.',
'Tony recognizes the builder-vs-seller tension. Self-awareness about using tech projects to avoid calls shows growth. Ramy delegating well. Capital raise adds background stress.');


-- ═══════════════════════════════════════════════════════════════
-- FULL CONTACT IMPORT INSTRUCTIONS
-- ═══════════════════════════════════════════════════════════════
-- The above inserts ~30 contacts as seed data.
-- For the FULL 4,363+ contacts:
--
-- 1. Export FlipIQ_Combined_Investor_List.xlsx to CSV
-- 2. Map columns to contacts table:
--    - Master List: FirstName+LastName→name, Company→company,
--      Phone→phone, Email→email, Subcategory→type, 'Master List'→source
--    - InvestorLift: Name→name, Company→company, Number→phone,
--      Email→email, 'Wholesaler'→type, 'InvestorLift SoCal'→source
--    - REIBlackBook: FirstName+LastName→name, Company→company,
--      Phone→phone, Email→email, 'Independent'→type, 'REIBlackBook'→source
--    - Hedge Funds: Primary Contact→name, Company Name→company,
--      Phone→phone, Email→email, 'Affiliate'→type, 'Hedge Funds'→source
-- 3. Set all status='New', next_step='Initial outreach'
-- 4. Use Supabase CSV import or pg COPY command
-- ═══════════════════════════════════════════════════════════════
