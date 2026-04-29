import { Router } from "express";
import { linear } from "@workspace/integrations-linear";

const router = Router();

function priorityToLevel(p: number): "high" | "mid" | "low" {
  if (p === 1 || p === 2) return "high";
  if (p === 3) return "mid";
  return "low";
}

// Single raw GraphQL query so we don't blow Linear's 2500-req/hour limit.
// The SDK's lazy accessors (issue.cycle, issue.team, issue.project) each
// dispatch their own request — at 200 issues that's 600+ extra calls per
// /linear/live invocation. One pre-fetched query keeps it at exactly 1.
const LIVE_ISSUES_QUERY = `
  query LiveIssues($first: Int!, $filter: IssueFilter) {
    issues(first: $first, filter: $filter) {
      nodes {
        id
        identifier
        title
        description
        priority
        estimate
        dueDate
        url
        state { id name type }
        assignee { id name email }
        team { id key name }
        project { id name }
        cycle { id number name startsAt endsAt progress }
        labels { nodes { id name } }
      }
    }
  }
`;

router.get("/linear/live", async (_req, res) => {
  try {
    // Started + unstarted + backlog (i.e. not completed/cancelled). The FE filter
    // bar gates which statuses render; default keeps "In Progress" + "In QA".
    const data = await (linear as any).client.rawRequest(LIVE_ISSUES_QUERY, {
      first: 200,
      filter: { state: { type: { in: ["started", "unstarted", "backlog"] } } },
    });
    const issuesData = data?.data?.issues?.nodes ?? [];

    const nodes = issuesData.map((issue: any) => {
      const cycle = issue.cycle;
      return {
        id: issue.id,
        identifier: issue.identifier,
        who: issue.assignee?.name ?? "Unassigned",
        task: issue.title,
        level: priorityToLevel(issue.priority ?? 4),
        dueDate: issue.dueDate ?? null,
        size: issue.estimate != null ? String(issue.estimate) : null,
        state: issue.state?.name ?? null,
        stateType: issue.state?.type ?? null,
        description: issue.description ?? null,
        labels: (issue.labels?.nodes ?? []).map((l: any) => l.name),
        url: issue.url,
        // Cycle (sprint) info — used by the dashboard's Cycle column.
        cycleNumber: cycle?.number ?? null,
        cycleName: cycle?.name ?? null,
        cycleStartsAt: cycle?.startsAt ?? null,
        cycleEndsAt: cycle?.endsAt ?? null,
        cycleProgress: typeof cycle?.progress === "number" ? cycle.progress : null,
        // Team + project — feed the dashboard filter bar.
        teamKey: issue.team?.key ?? null,
        teamName: issue.team?.name ?? null,
        projectId: issue.project?.id ?? null,
        projectName: issue.project?.name ?? null,
      };
    });

    nodes.sort((a: any, b: any) => {
      const order: Record<string, number> = { high: 0, mid: 1, low: 2 };
      return (order[a.level] ?? 2) - (order[b.level] ?? 2);
    });

    res.json(nodes);
  } catch (err: any) {
    const msg = err?.response?.errors?.[0]?.message || err?.message || "Failed to fetch live issues";
    console.error("[linear/live] error:", msg);
    res.status(500).json({ error: msg });
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
