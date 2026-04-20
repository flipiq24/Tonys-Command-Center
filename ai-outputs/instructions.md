# User Instructions & Design Decisions

> Every durable directive Anas/Tony has given during this sprint. Read this whenever you pick the work back up — it tells you HOW they want you to work, not just what to build.

---

## Communication & Process

- **Always push to BOTH remotes** after every commit: `origin` (Tony's repo) **and** `vercel-origin` (Anas's fork that Vercel deploys from). One without the other breaks the Vercel deploy. See `DEPLOYMENT-AND-GIT-GUIDE.md`.
- **Never add `Co-Authored-By: Claude` to commit messages.** User explicitly rejected this.
- **Ask before risky actions.** The user is fine with local, reversible edits, but wants to approve anything that touches production DB, overwrites Sheets, force-pushes, etc. — "just ask me what you are doing, then execute the command."
- **Keep responses tight.** English replies, concrete actions, file paths + line numbers when changing code. Avoid narrating internal thought.
- **When stuck, check existing patterns before inventing new ones.** Search the codebase for how similar things are already done (memory: `feedback_stop_guessing.md`).
- **All generated markdown docs (explanations, roadmaps, plans) go in `ai-outputs/`** — never the project root (memory: `feedback_ai_outputs_folder.md`).

---

## Sheets Sync — Hard Rules

1. **Auto-sync is DISABLED.** The 5-min scheduler (`startAutoSync`) and the fire-and-forget `triggerSheetsSync()` / `triggerContactSync()` hooks are all no-ops. They were overwriting Tony's hand-maintained Sheet data.
2. Bidirectional sync will later use **webhook triggers** — do NOT re-enable polling-based unidirectional push.
3. Any sync must be user-triggered via the `Refresh ▾` dropdown (From DB / From Sheets).
4. **Reverse sync (`syncTasksFromSheet`)** flushes + reimports. Parent-child hierarchy is detected from **Sprint ID decimal pattern** (`ADP-02.1` is a sub of `ADP-02`), NOT from title matching.
5. **Week is derived**, not stored. The `week_number` column was dropped. When writing a task, `month` is computed from `dueDate.slice(0,7)`. When reading the weekly grid, `weekFromDate()` buckets day-of-month (≤11=1, ≤18=2, ≤25=3, else 4).

---

## Task System — Hierarchical Rules

- **Task types**: `master` (top-level), `subtask` (belongs to a master), `note` (informational, attached to a master)
- **Masters only on the weekly board.** Subs/notes live only in the Master Task list.
- **Sort always respects hierarchy.** When user sorts by any column: masters sort among masters, subs sort within their parent's children only. Notes always land last within a parent regardless of sort column.
- **Priority order is scoped per tier.** Masters compete with masters in the same category. Subs compete with siblings under the same parent master. A sub must NEVER jump to a different parent.
- **Notes are pure info** — no status, no due date, no priority. Rendered italic + muted.
- **Master delete confirmation** has 3 options (dialog shown only when master has children):
  - Promote subs to Master (notes deleted — no context without parent)
  - Cascade delete all children
  - Keep as orphans (children stay with dangling parentTaskId, shown in "Orphaned" group)

---

## Weekly Board — Display Rules

- **Show only unfinished** checkbox is at the top, checked by default.
- **Priority-sorted within each cell**: P0 first, then P1, then P2.
- **"✓ All done" pill** (centered, green, pill-shape) appears in a cell when the user originally had masters for that owner/week but all are now complete. Uses `rowSpan=ROWS_PER_PERSON` to fill the full cell height.
- **Column separators consistent** — every cell renders a 1px left border (gray) even when empty.
- **Child progress inline** on masters: `2/6` count + progress bar + `33%`. Bar turns green at 100%, owner-color otherwise.
- **Click task title** on the board → switch to Master Task tab and auto-select that master in the "All parents" filter. The checkbox (to the left) still just toggles completion.

---

## Add Task Modal

- **Type dropdown**: Master / Sub-Task / Note
- **Parent Master Task dropdown**: shown only when Type=Sub or Note. Required.
- **Sidebar visualizer**: 280px right-side panel. Shows preview placement windowed around the new row (6 above + new + 6 below). Drag the highlighted new-task row by its `⠿` handle to change position. `manualPosition` is sent to the backend to override the priority-bucket rule.
- **Source dropdown stays editable** — user explicitly said do NOT delete it (earlier design mistake from my side).
- **Source=Linear conditional flow**:
  - Radio: "Do you already have the Linear ticket ID?" Yes/No
  - Yes → required Linear ID input
  - No → checkbox "Notify `<owner>` via Slack to create the Linear ticket" (checked by default). Backend sends DM + sets `source=Linear` + `linearId=null`.
- **Week input REMOVED.** Week is always derived from Due Date. The Due Date field now shows "— week is auto-computed" helper text.
- **Linear ID supports comma-separated values** — `COM-151, COM-314` — each is rendered as its own link in the table + detail panel.

---

## Master Task List

- **"Refresh ▾" split-button** in the Business Brain header (tasks tab), with:
  - `↑ From DB` — push DB → Sheets
  - `↓ From Sheets` — pull Sheets → DB (with confirmation prompt because it flushes the DB)
- **Filters** (in order): search, All categories, All owners, All weeks (computed from dueDate), All parents (new), Priority chips (All/P0/P1/P2), Status chips (All/Not Started/Active/Done), **Linear only** chip.
- **Type column** shows `📌 Master · N` (where N is child count), `↳ Sub`, or `📝 Note`. Masters with children get a `▼ / ▶` chevron that collapses/expands children.
- **"Collapse all / Expand all" toggle** in the filter row.
- **Drag-reorder training modal** opens after drop asking "Why is this more/less important?" — uses `justDroppedRef` timestamp to suppress the row's click handler (which would otherwise open the detail panel on top).
- **Just-created pulse**: when a task is created, its row scrolls into view + pulses (orange `tccRowPulse` keyframe, 2 iterations of 1.2s) so the user sees where it landed.

---

## Ideas Flow

- Each idea has an **AI reflection** saved to DB as a JSON string in `ideas.ai_reflection`.
- Ideas auto-open the Add Task modal **only when urgency is NOT Someday**. `Now`, `This Week`, `This Month` all trigger prefill + task modal.
- **Now** additionally emails Ethan (`ethan@flipiq.com`).
- Ethan gets notified on urgency escalation from the IdeasView page only if new urgency is `Now` or `This Week`.
- Task creation **never calls AI** on the POST `/plan/task` path. AI runs only on:
  - `/ideas/classify` (before the Add Task modal opens for idea-originated tasks)
  - `/ideas/generate-task` (prefills the modal)
  - `/plan/linear-webhook` (auto-imports Linear issues with `brainScoreNewTask`)
  - `/plan/brain/order` (explicit AI Organize button)

---

## Slack Integration — Known Constraints

- Bot `tcc_bot` has `chat:write` and `im:read` scopes — can SEND DMs if given the slackId, CANNOT discover them (`users:read` scope missing).
- **Adding team members requires manually entering their Slack ID.** Copy via Slack app → profile → "..." → "Copy member ID".
- Team-member-to-task lookup happens by **exact string match on `team_roles.name`**. Case-sensitive.
- Known working slackIds (as of 2026-04-20):
  ```
  Tony Diaz  U0991BAS0TC   ⚠ tasks use "Tony" — mismatch; fix by renaming row or loosening lookup
  Ethan      U0991BD321Y
  Ramy       U0AC6GENDTJ
  Haris      U0991B6PZH8
  Anas       U09BKV477PX
  Faisal     U0991B97H50
  Nate       U0991BFNZ7U
  ```
- **Missing** (tasks assigned but no slackId): Bondilyn, Chris, TBD PM.

---

## UI Preferences & Fixes

- **Orange is the brand accent** (`#F97316`). Use for primary actions, pulse animations, highlighted new rows.
- **Dropdowns** use a semi-transparent overlay with click-outside dismissal (pattern in `Header.tsx` hamburger menu). Don't make global backdrops too opaque (user disliked 35% + blur, settled on invisible click-catcher).
- **Modals that scroll**: use flex-column layout with a sticky footer for the primary action button, so the submit button never gets buried (pattern in IdeasModal).
- **Save button visibility** matters more than aesthetic compactness — user got burned by an invisible orange save button (root cause: `background: undefined` in style was overriding the orange from `...btn1`).

---

## Non-Negotiables

- **Never overwrite Tony's Sheet** automatically. Every write must be an explicit user action.
- **Never skip hooks on commit** (`--no-verify`). If a hook fails, fix the underlying issue.
- **Never force-push** without explicit confirmation.
- **Always create new commits** rather than amending — especially if a pre-commit hook failed.
- **Never delete unfamiliar files/branches without investigating.** Tony's work may be in progress.

---

_See also: `ai-outputs/context.md` for project layout and integration details; `ai-outputs/features.md` for the full feature log; `ai-outputs/DEPLOYMENT-AND-GIT-GUIDE.md` for git + Vercel protocol._
