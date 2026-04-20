# Features Implemented — Hierarchical Task System (April 20, 2026)

## Overview

Implemented client-requested two-tier hierarchical task system (**Master / Sub-Task / Note**) with Google Sheets bidirectional sync, sidebar visualizer on task creation, and hierarchy-aware AI organize.

---

## 1. Hierarchical Task System (Master / Sub-Task / Note)

### Ideal Behavior

**Task Types:**
- **📌 Master Task** — top-level parent task; can have children; competes among other masters for priority
- **↳ Sub-Task** — child task belonging to a Master; competes among siblings (other subs of the same parent) for priority; never jumps parent
- **📝 Note** — pure informational item attached to a Master; no status/due date/priority; always listed after subs of the same parent

**Creation Flow:**
- Add Task modal shows **Task Type** dropdown (Master/Sub/Note)
- If Sub or Note is selected → **Parent Master Task** dropdown appears (populated only with existing masters)
- Validation: Sub/Note cannot be saved without a parent
- Priority placement is scoped to the correct tier (master among masters, sub among siblings)

**Listing (Master Task tab):**
- Flattened tree view: `Master A → its subs (priority-ordered) → its notes → Master B → its subs → ...`
- Subs and notes are visually indented (20px) with a `↳` tree connector
- Notes are rendered italic and muted; no checkbox, no status pill
- Masters are bold, orange-tinted `📌 Master` label
- "Type" column added to the table

**Deletion (of a Master with children):**
- Confirmation dialog with 3 options:
  - **📌 Promote** — sub-tasks become independent masters; notes are deleted (no context without parent)
  - **🗑 Cascade** — all children deleted with the parent
  - **👻 Orphan** — children stay with dangling parent reference; shown in an "Orphaned" group at the bottom
- Deleting a sub, note, or childless master goes straight through (no dialog)

### Files Changed

| File | Change |
|------|--------|
| `lib/db/src/schema/tcc-v2.ts` | Added `taskType` (text, default "master") and `parentTaskId` (uuid) columns to `planItemsTable` + two new indexes |
| DB (direct SQL) | `ALTER TABLE plan_items ADD COLUMN task_type text DEFAULT 'master'; ADD COLUMN parent_task_id uuid;` |
| `artifacts/api-server/src/routes/tcc/plan.ts` | POST /plan/task: accept + validate `taskType` and `parentTaskId`, scope `priorityOrder` per tier. DELETE /plan/task/:id: support `?action=promote\|cascade\|orphan` query param. New GET /plan/task/:id/children endpoint |
| `artifacts/tcc/src/components/tcc/BusinessView.tsx` | `PlanItem` type gains `taskType` and `parentTaskId`. AddTaskModal: new Type dropdown, conditional Parent selector, sidebar visualizer. MasterTaskTab: hierarchical flatten, Type column, indented rows, delete button per row, delete-confirmation dialog |

---

## 2. Sidebar Placement Visualizer (AddTaskModal)

### Ideal Behavior

- Modal width expanded from 680px → 980px to accommodate a **280px right-side panel**
- Panel shows live preview of where the new task will land:
  - **Master** → list of existing masters with new task inserted at priority-matched position
  - **Sub-Task** → parent's sub-tasks with new sub inserted at priority-matched position
  - **Note** → parent's notes with new note appended at the end
- New task row is **highlighted orange** with bold text
- Each row shows: position number, tree indicator for subs/notes, title, priority badge
- Empty state: "No siblings — this will be the first."
- Overflow: "+N more…" if preview list > 20 items
- Panel dynamically re-renders when Type, Parent, or Priority changes

### Files Changed

| File | Change |
|------|--------|
| `artifacts/tcc/src/components/tcc/BusinessView.tsx` | AddTaskModal accepts new `allTasks` prop; computes `previewList` based on form state; renders right-side panel in flex layout |

---

## 3. Google Sheets ⇄ DB Bidirectional Sync

### Ideal Behavior

**Outbound (DB → Sheets):**
- `syncTasksTab()` now writes **Type** and **Sub-Type** (parent master's title) columns to "Master Task List" tab
- Runs automatically every 5 min + on manual trigger

**Inbound (Sheets → DB) — NEW:**
- `syncTasksFromSheet()` reads "Master Task List" tab
- Parses header to find `Type` and `Sub-Type` columns (with tolerance for "SubType", "Parent Task", "Parent" variants)
- Matches rows to DB tasks by `linearId` first, falls back to `title`
- **Two-pass update**: pass 1 sets `taskType` on all rows; pass 2 resolves each Sub-Type value (a parent master's title) → parent's UUID → writes `parentTaskId`
- Returns `{ updated, skipped }` counts

**UI — Refresh dropdown on Business Brain header (when on tasks or goals tab):**
- Single `↻ Refresh ▾` button
- Dropdown with two options:
  - **↑ From DB** — pushes all DB data to Sheets (calls existing `/sheets/sync-master`)
  - **↓ From Sheets** — pulls Type/Sub-Type from Sheets into DB (calls new `/sheets/sync-tasks-from-sheet`)
- Shows toast `✓ Pulled Sheets → DB (N updated, M skipped)` on success
- Shows `⟳ Syncing...` state during operation
- Click outside the dropdown to dismiss

### Files Changed

| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/tcc/sheets-sync.ts` | Updated `syncTasksTab()` to include Type + Sub-Type columns. New `syncTasksFromSheet()` function. New POST `/sheets/sync-tasks-from-sheet` endpoint |
| `artifacts/tcc/src/components/tcc/BusinessView.tsx` | Added `handleRefreshFromDb()` and `handleRefreshFromSheets()`. New refresh dropdown UI beside Push/Pull buttons |

---

## 4. Hierarchy-Aware AI Organize

### Ideal Behavior

The `🧠 AI Organize` button now enforces hierarchy when re-ranking tasks:

- **Masters compete only with other Masters** — ranked by priority/urgency/business impact
- **Sub-tasks ranked only within their parent's scope** — no sub ever jumps to a different parent (hard rule in prompt)
- **Notes always listed AFTER subs** of the same parent (no priority sort among notes)
- Output is a **flattened tree**: `[masterA, masterA_sub1, masterA_sub2, masterA_note1, masterB, masterB_sub1, ...]`
- Each task includes its Parent ID in the prompt context so the AI respects parent references

### Files Changed

| File | Change |
|------|--------|
| `artifacts/api-server/src/routes/tcc/plan.ts` | Updated `/plan/brain/order` prompt with explicit hierarchy rules; task list now includes `MASTER\|SUB\|NOTE` labels and `Parent:<id>` references |

---

## Verification Checklist

- [ ] Open AddTaskModal → verify Type dropdown + sidebar visualizer appear correctly
- [ ] Create a Master Task → verify it lands at the bottom of the master list (filtered by priority)
- [ ] Create a Sub-Task with a selected parent → verify it appears indented under that parent with `↳`
- [ ] Create a Note → verify italic muted rendering + no checkbox + placed after subs of same parent
- [ ] Delete a childless Master → verify immediate delete (no dialog)
- [ ] Delete a Master with children → verify 3-option dialog, test each action
- [ ] Click Refresh ▾ → From Sheets → verify Tony's Type/Sub-Type data populates in DB and UI re-renders with hierarchy
- [ ] Click Refresh ▾ → From DB → verify Type + Sub-Type columns appear in Google Sheets
- [ ] Run AI Organize → verify no sub-task jumps to a different parent, masters reordered among themselves
