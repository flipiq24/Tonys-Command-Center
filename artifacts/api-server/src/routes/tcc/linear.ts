import { Router } from "express";
import { linear } from "@workspace/integrations-linear";

const router = Router();

function priorityToLevel(p: number): "high" | "mid" | "low" {
  if (p === 1 || p === 2) return "high";
  if (p === 3) return "mid";
  return "low";
}

router.get("/linear/live", async (_req, res) => {
  try {
    const issues = await linear.issues({
      filter: {
        state: { type: { in: ["started"] } },
      },
      first: 100,
    });

    const nodes = await Promise.all(
      issues.nodes.map(async (issue) => {
        const [state, assignee, labelsConn, cycle, team, project] = await Promise.all([
          issue.state,
          issue.assignee,
          issue.labels(),
          issue.cycle,
          issue.team,
          issue.project,
        ]);
        const labelNodes = labelsConn?.nodes ?? [];
        // Cycle = the FlipIQ team's deadline mechanism. Tasks rarely have a due date
        // but almost always belong to a cycle (Linear sprint). Surface it so the
        // dashboard can show "Cycle 14 · 8 weekdays left" instead of fake "No date".
        const endsAtRaw = (cycle as any)?.endsAt;
        const startsAtRaw = (cycle as any)?.startsAt;
        return {
          id: issue.id,
          identifier: issue.identifier,
          who: assignee?.name ?? "Unassigned",
          task: issue.title,
          level: priorityToLevel(issue.priority ?? 4),
          dueDate: issue.dueDate ?? null,
          size: issue.estimate != null ? String(issue.estimate) : null,
          state: state?.name ?? null,
          stateType: state?.type ?? null,
          description: issue.description ?? null,
          labels: labelNodes.map((l: any) => l.name),
          url: issue.url,
          // Cycle (sprint) info — used by the dashboard's Cycle column.
          cycleNumber: cycle?.number ?? null,
          cycleName: (cycle as any)?.name ?? null,
          cycleStartsAt: startsAtRaw instanceof Date ? startsAtRaw.toISOString() : (startsAtRaw ?? null),
          cycleEndsAt: endsAtRaw instanceof Date ? endsAtRaw.toISOString() : (endsAtRaw ?? null),
          cycleProgress: typeof cycle?.progress === "number" ? cycle.progress : null,
          // Team + project — feed the dashboard filter bar (Phase B).
          teamKey: team?.key ?? null,
          teamName: team?.name ?? null,
          projectId: project?.id ?? null,
          projectName: project?.name ?? null,
        };
      }),
    );

    nodes.sort((a, b) => {
      const order = { high: 0, mid: 1, low: 2 };
      return (order[a.level] ?? 2) - (order[b.level] ?? 2);
    });

    res.json(nodes);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch live issues" });
  }
});

router.get("/linear/me", async (_req, res) => {
  try {
    const me = await linear.viewer;
    res.json({
      id: me.id,
      name: me.name,
      email: me.email,
      displayName: me.displayName,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch user" });
  }
});

router.get("/linear/teams", async (_req, res) => {
  try {
    const teams = await linear.teams();
    const nodes = await teams.nodes;
    res.json(
      nodes.map((t) => ({
        id: t.id,
        name: t.name,
        key: t.key,
        description: t.description ?? null,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch teams" });
  }
});

router.get("/linear/projects", async (_req, res) => {
  try {
    const projects = await linear.projects();
    const nodes = await projects.nodes;
    res.json(
      nodes.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description ?? null,
        state: p.state,
        progress: p.progress,
      })),
    );
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch projects" });
  }
});

router.get("/linear/issues", async (req, res) => {
  try {
    const { teamId, assigneeId, state, first } = req.query as Record<string, string | undefined>;
    const filter: Record<string, any> = {};
    if (teamId) filter.team = { id: { eq: teamId } };
    if (assigneeId) filter.assignee = { id: { eq: assigneeId } };
    if (state) filter.state = { name: { eq: state } };

    const issues = await linear.issues({
      filter: Object.keys(filter).length ? filter : undefined,
      first: first ? parseInt(first, 10) : 50,
      orderBy: "updatedAt" as any,
    });

    const nodes = await Promise.all(
      issues.nodes.map(async (issue) => {
        const state = await issue.state;
        const assignee = await issue.assignee;
        const team = await issue.team;
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description ?? null,
          priority: issue.priority,
          priorityLabel: issue.priorityLabel,
          url: issue.url,
          state: state ? { id: state.id, name: state.name, color: state.color, type: state.type } : null,
          assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
          team: team ? { id: team.id, name: team.name, key: team.key } : null,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          dueDate: issue.dueDate ?? null,
        };
      }),
    );

    res.json(nodes);
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch issues" });
  }
});

router.get("/linear/issues/:id", async (req, res) => {
  try {
    const issue = await linear.issue(req.params.id);
    const state = await issue.state;
    const assignee = await issue.assignee;
    const team = await issue.team;
    res.json({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? null,
      priority: issue.priority,
      priorityLabel: issue.priorityLabel,
      url: issue.url,
      state: state ? { id: state.id, name: state.name, color: state.color, type: state.type } : null,
      assignee: assignee ? { id: assignee.id, name: assignee.name, email: assignee.email } : null,
      team: team ? { id: team.id, name: team.name, key: team.key } : null,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      dueDate: issue.dueDate ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to fetch issue" });
  }
});

router.post("/linear/issues", async (req, res) => {
  try {
    const { teamId, title, description, priority, assigneeId, dueDate } = req.body as {
      teamId: string;
      title: string;
      description?: string;
      priority?: number;
      assigneeId?: string;
      dueDate?: string;
    };

    if (!teamId || !title) {
      res.status(400).json({ error: "teamId and title are required" });
      return;
    }

    const result = await linear.createIssue({
      teamId,
      title,
      description,
      priority,
      assigneeId,
      dueDate,
    });

    const issue = await result.issue;
    if (!issue) {
      res.status(500).json({ error: "Issue creation failed" });
      return;
    }

    res.status(201).json({ id: issue.id, identifier: issue.identifier, url: issue.url, title: issue.title });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to create issue" });
  }
});

router.patch("/linear/issues/:id", async (req, res) => {
  try {
    const { title, description, priority, assigneeId, stateId, dueDate } = req.body as {
      title?: string;
      description?: string;
      priority?: number;
      assigneeId?: string;
      stateId?: string;
      dueDate?: string;
    };

    const result = await linear.updateIssue(req.params.id, {
      title,
      description,
      priority,
      assigneeId,
      stateId,
      dueDate,
    });

    const issue = await result.issue;
    if (!issue) {
      res.status(500).json({ error: "Issue update failed" });
      return;
    }

    res.json({ id: issue.id, identifier: issue.identifier, url: issue.url, title: issue.title });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "Failed to update issue" });
  }
});

export default router;
