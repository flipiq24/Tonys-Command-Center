# Features Log — TCC Sprint (April 2026)

> Every feature implemented during the current sprint, from oldest to newest. Commit hashes on `dev-vercel` branch for reference.

**Sibling docs:**
- `context.md` — project layout + integrations + env + deployment
- `instructions.md` — user preferences + design decisions + hard rules
- `DEPLOYMENT-AND-GIT-GUIDE.md` — git + Vercel protocol

---

## 1. Hierarchical Task System (Master / Sub-Task / Note)

**Behavior:** Tasks have a `taskType` field:
- 📌 **Master Task** — top-level, can have children, competes with other masters for priority.
- ↳ **Sub-Task** — child of a master, competes only with siblings under the same parent.
- 📝 **Note** — informational item attached to a master. No status, due date, or priority. Always rendered last within a parent.

**Creation flow:**
- `Task type` dropdown (required) in AddTaskModal
- `Parent Master Task` dropdown appears when type = Sub or Note — required
- Validation blocks saving a Sub/Note without a parent

**Listing (Master Task tab):** flattened tree `Master A → its subs → its notes → Master B → …`. Subs indented 20px with `↳` connector. Notes italic + muted.

**Delete a Master with children:** 3-option confirmation dialog — **Promote** subs to masters (notes always deleted), **Cascade** delete all, **Orphan** (children stay with dangling parentTaskId).

**DB:** new columns `task_type` (default `"master"`) + `parent_task_id` (uuid) on `plan_items`, with indexes. Applied via direct `ALTER TABLE`.

**Files:** `lib/db/src/schema/tcc-v2.ts`, `artifacts/api-server/src/routes/tcc/plan.ts` (POST /plan/task, DELETE /plan/task/:id with `?action=promote|cascade|orphan`, GET /plan/task/:id/children), `artifacts/tcc/src/components/tcc/BusinessView.tsx`.

---

## 2. Sidebar Placement Visualizer + Drag-to-Reorder

**Behavior:** AddTaskModal widened from 680→980px, 280px right-side panel shows live preview of where the new task will land.

- Windowed render (6 rows before + new + 6 after) so the highlighted row is always visible in 150+ task lists.
- New-task row is draggable via `⠿` handle; drop above/below any other row to override the priority-bucket rule.
- Header shows `⚠ Manually placed at #N (auto would put it at #M)` + `↺ reset auto` when nudged.
- Offset resets when Task Type, Parent, or Priority changes.

**Backend:** POST `/plan/task` accepts `manualPosition` (integer). If present, overrides the priority-based insertion.

**Files:** `BusinessView.tsx`, `plan.ts`.

---

## 3. Bidirectional Google Sheets Sync

**Outbound** `syncTasksTab()` writes 16 columns to `Master Task List` tab, including **Type** and **Sub-Type** (parent master's title).

**Inbound** `syncTasksFromSheet()` — **full flush + reimport**:
- Deletes all `level='task'` rows
- Parses Sprint ID decimal pattern to detect parent-child relationships (`ADP-02.1` = sub of `ADP-02`) — NOT title matching
- Two-pass insert: masters first (build sprintId→uuid map), then subs with `parentTaskId` resolved from the map
- Returns `{ flushed, inserted, masters, subs, skipped }`
- Confirmation dialog on the UI before executing

**UI:** `Refresh ▾` split-button on the Business Brain header (tasks tab):
- `↑ From DB` → `POST /sheets/sync-master`
- `↓ From Sheets` → `POST /sheets/sync-tasks-from-sheet`
- Toasts with counts on success

**Files:** `artifacts/api-server/src/routes/tcc/sheets-sync.ts`, `BusinessView.tsx`.

---

## 4. Auto-Sync Disabled

**Why:** The outbound 5-min scheduler + fire-and-forget triggers on task/contact mutations were overwriting Tony's hand-maintained Google Sheet, destroying the Sprint ID hierarchy.

**Disabled:**
- `startAutoSync()` in `sheets-sync.ts` → no-op (logs "Auto-sync DISABLED")
- `triggerSheetsSync()` in `plan.ts` → no-op
- `triggerContactSync()` in `contacts.ts` → no-op

**Still works:** `POST /sheets/sync-master` and `/sheets/sync-tasks-from-sheet` — **explicit user clicks only**.

**Future:** bidirectional webhook-triggered sync will replace the scheduler.

**Files:** `sheets-sync.ts`, `plan.ts`, `contacts.ts`.

---

## 5. Collapsible Masters + Parent Task Filter

**Collapse/expand:** Masters with children get a `▼/▶` chevron + child count (e.g. `📌 Master · 6`). Click toggles. `▶ Collapse all / ▼ Expand all` bulk button in the filter row. In-memory state (resets on reload).

**Parent filter:** new `All parents` dropdown (after `All weeks`). Lists every master as `{sprintId} — {title}`. When selected, only that master + its children render. Combines with all other filters (AND).

**Files:** `BusinessView.tsx`.

---

## 6. Hierarchy-Aware Sorting

Column-header sort now applies **within each tier**:
- Masters sort among masters
- Subs sort within their parent's children only (never jump parent)
- Notes always land last within a parent, regardless of sort column
- Tiebreaker: `priorityOrder` (preserves manual drag-reorder)
- Orphaned subs (parent filtered out) grouped separately at the bottom, sorted by the same column

**Files:** `BusinessView.tsx` (unified `cmp()` applied at both tiers in the hierarchy flattener).

---

## 7. Weekly Board: Unfinished-Only + Priority Sort + Click-Through

**Display:**
- Only **masters** appear on the board (subs/notes stay in the Master Task list).
- `Show only unfinished tasks` checkbox at the top, checked by default.
- Each cell sorted P0 → P1 → P2 with a colored priority badge inline next to the title.
- Child progress on masters: `2/6` count + progress bar + `33%`.

**All Done UI:**
- When all of an owner's masters for a given week are complete (and the checkbox is on), the cell shows a green italic **"✓ All done"** pill
- Uses `rowSpan={ROWS_PER_PERSON}` so the pill is vertically centered across the full owner-week cell
- Consistent 1px gray column separators even in empty cells

**Click-through:**
- Clicking a task's title on the board → switches to `✅ Master task` tab, pre-selects that master in the `All parents` filter
- Clicking the tiny checkbox to the left still only toggles completion (event propagation stopped)

**Backend:** `/plan/weekly/:month` now:
- Filters to masters only
- Groups by computed week from `dueDate` (not stored)
- Returns `childStats: { masterId: { total, done } }` for progress bars

**Files:** `BusinessView.tsx` (WeeklyGrid), `plan.ts`.

---

## 8. Week Field Removed — Always Derived from Due Date

**Why:** The client's Google Sheet has no Week column — only Due Date. Storing `week_number` separately led to null values on reimport and ambiguity about truth source.

**Changes:**
- `plan_items.week_number` column **dropped** from DB (direct `ALTER TABLE`)
- Removed from `tcc-v2.ts` schema
- Every write path stopped setting it (POST /plan/task, sheets sync, Linear webhook, seed data)
- `/plan/weekly/:month` computes week from `dueDate` on read
- `AddTaskModal` no longer asks for Week — just shows `Due date — week is auto-computed` helper
- `MasterTaskTab` "All weeks" filter computes the week on the fly from `t.dueDate`

**Week formula (bucketing day-of-month):** `≤11 = w1, ≤18 = w2, ≤25 = w3, else w4` — aligns with `APRIL_WEEKS` constant.

**Files:** `tcc-v2.ts`, `plan.ts`, `sheets-sync.ts`, `ideas.ts`, `BusinessView.tsx`.

---

## 9. AI Organize Respects Hierarchy

The `🧠 AI Organize` button's prompt now enforces strict hierarchy rules:
- Masters ranked only among other masters
- Subs ranked only within their parent's scope
- Notes always last within a parent
- A sub MUST NEVER be reassigned to a different parent
- Output format: flattened tree `[masterA, masterA_sub1, masterA_sub2, masterA_note1, masterB, masterB_sub1, ...]`

Task list fed to Claude now includes `MASTER|SUB|NOTE` labels + `Parent:<id>` references per row.

**Files:** `plan.ts` `/plan/brain/order`.

---

## 10. Linear Ticket Conditional Flow + Slack Notification

**AddTaskModal — when Source = Linear:**
- Radio appears: "Do you already have the Linear ticket ID?"
  - **Yes** → shows required Linear ID input
  - **No** → shows checked-by-default checkbox "Notify `<owner>` via Slack to create the Linear ticket"
- Switching Source away from Linear resets the radio + linearId

**Backend:** POST `/plan/task` accepts `requiresLinearTicket` boolean. If true + `owner` is set:
- Looks up `team_roles` by name
- Fetches `slackId`
- Sends DM via `postSlackMessage()`:
  > 🎯 **Tony assigned you a task — please create a Linear ticket**
  > > {title}
  > *Category:* X • *Priority:* P0 • *Due:* 2026-04-25
  > Once created, paste the Linear ID back into TCC.
- Response includes `slackNotified: { ok, owner, slackId?, error? }`

**Files:** `plan.ts`, `BusinessView.tsx`, `lib/slack.ts` (existing helper).

---

## 11. Linear-Only Filter + Multi-Linear-ID Support

**Linear-only filter chip** next to Status chips in the filter row: `◼ Linear only` (Linear brand purple). Shows only tasks where `source === "Linear"` OR `linearId` is set.

**Multi Linear IDs:**
- `linearId` field now accepts comma-separated list: `COM-151, COM-314, COM-126`
- `splitLinearIds()` helper: splits, trims, dedupes
- **Master Task table** column renders each ID as its own link (dotted underline, wraps with gap)
- **Task Detail panel** renders each as a pill-style button (light blue bg, blue border)
- Placeholder + helper text updated: `"e.g. FLI-123 or FLI-123, FLI-456 for multiple"`

**Files:** `BusinessView.tsx`.

---

## 12. Drag-Drop Training Modal Fix

**Bug:** When user dragged a task to reorder in MasterTaskTab, the training modal ("Why is this more/less important?") was set but immediately buried under the Task Detail panel — because the row's `onClick` fires right after a drag-drop in most browsers.

**Fix:** `justDroppedRef` timestamp — any row click within **300ms of a drop** is ignored. Training modal now visible.

**Bonus:** cross-category drops used to silently fail. Now show a toast: `Can't move across categories: "sales" → "adaptation"`.

**Files:** `BusinessView.tsx`.

---

## 13. New-Task Pulse & Auto-Scroll

When a task is successfully created:
1. Modal closes
2. Task list reloads
3. **Scrolls the new task's row into view** (smooth, centered)
4. Row pulses with an orange ripple animation (2 iterations of 1.2s, total ~2.4s)
5. Pulse uses CSS keyframes (`tccRowPulse`) — animates background color and a ripple box-shadow
6. After 3s, highlight clears

**Why:** User explicitly asked for this — they want to instantly see where a new task landed after creating one, especially in a 200-row list.

**Files:** `BusinessView.tsx` (`justCreatedId` state, `rowRefs`, `useEffect` for scroll, `<style>` keyframes).

---

## 14. Team Roster Slack IDs (Data)

Populated `team_roles.slack_id` for:
- Tony Diaz: `U0991BAS0TC` (⚠ name is "Tony Diaz" but tasks use "Tony" — lookup will fail until renamed)
- Ethan: `U0991BD321Y`
- Ramy: `U0AC6GENDTJ` (was null — now set)
- Haris: `U0991B6PZH8` (new row)
- Anas: `U09BKV477PX` (new row)
- Faisal: `U0991B97H50` (new row)
- Nate: `U0991BFNZ7U`

**Still missing** (tasks assigned but no slackId — Linear-ticket notify will fail for these owners): Bondilyn (14 tasks), Chris (1), TBD PM (1).

Test DM sent to Anas successfully — Slack connectivity end-to-end verified.

---

## Verification Checklist (as of 2026-04-20)

- [x] Hierarchical task create flow: Master, Sub-Task, Note all save with correct `taskType` + `parentTaskId`
- [x] Sidebar visualizer shows live preview + drag repositioning
- [x] Sheets → DB reverse sync detects hierarchy from Sprint IDs (199 tasks imported: 158 masters + 41 subs)
- [x] Auto-sync disabled — no more Sheet overwrites
- [x] Masters collapse/expand with child count badge
- [x] Parent filter dropdown lists all masters + filters to selected master's children
- [x] Sort preserves tree (masters among masters, subs within parent)
- [x] Weekly board shows only masters, sorted by priority, with progress bars
- [x] "All Done" pill renders centered when all masters for an owner/week are complete
- [x] Click on weekly board task → navigates to Master Task with parent filter
- [x] Week is purely computed from Due Date — column dropped from DB
- [x] AI Organize keeps subs under their parents
- [x] Linear ticket flow: Yes/No radio, Linear ID input when Yes, Slack notify checkbox when No
- [x] Slack DM to owner verified working (test sent to Anas)
- [x] Linear-only filter chip works
- [x] Multiple comma-separated Linear IDs render as individual links
- [x] Drag-drop training modal opens after reorder (no longer hidden under detail panel)
- [x] New task creation scrolls its row into view and pulses orange
