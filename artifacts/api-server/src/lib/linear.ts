import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export async function linearRequest<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await connectors.proxy("linear", path, {
    method: options.method ?? "GET",
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  return res as T;
}

export async function linearGraphQL<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await connectors.proxy("linear", "/graphql", {
    method: "POST",
    body: JSON.stringify({ query, variables }),
  });
  return (res as unknown as { data: T }).data;
}

export type LinearIssueRaw = {
  id: string;
  title: string;
  identifier: string;
  priority: number;
  dueDate?: string | null;
  description?: string | null;
  url?: string;
  estimate?: number | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  state: { name: string; type: string };
  assignee?: { name: string; displayName: string } | null;
  labels?: { nodes: { name: string }[] };
};

const LINEAR_ISSUE_FIELDS = `
  id title identifier priority dueDate description url estimate completedAt canceledAt
  state { name type }
  assignee { name displayName }
  labels { nodes { name } }
`;

export async function getLinearIssues(teamId?: string): Promise<LinearIssueRaw[]> {
  try {
    const data = await linearGraphQL<{ issues?: { nodes: LinearIssueRaw[] } }>(
      `query Issues($teamId: ID) {
        issues(filter: { team: { id: { eq: $teamId } }, state: { type: { nin: ["completed", "cancelled"] } } }, first: 25) {
          nodes { ${LINEAR_ISSUE_FIELDS} }
        }
      }`,
      teamId ? { teamId } : {}
    );
    return data?.issues?.nodes ?? [];
  } catch {
    return [];
  }
}

export async function getRecentlyCompletedLinearIssues(teamId?: string, sinceDaysAgo = 3): Promise<LinearIssueRaw[]> {
  try {
    const since = new Date(Date.now() - sinceDaysAgo * 86400000).toISOString();
    const data = await linearGraphQL<{ issues?: { nodes: LinearIssueRaw[] } }>(
      `query CompletedIssues($teamId: ID, $since: DateTime) {
        issues(filter: { team: { id: { eq: $teamId } }, state: { type: { in: ["completed", "cancelled"] } }, updatedAt: { gt: $since } }, first: 8) {
          nodes { ${LINEAR_ISSUE_FIELDS} }
        }
      }`,
      { ...(teamId ? { teamId } : {}), since }
    );
    return data?.issues?.nodes ?? [];
  } catch {
    return [];
  }
}

export type LinearMember = {
  id: string;
  name: string;
  displayName: string;
  email: string;
  avatarUrl?: string | null;
};

export async function getLinearMembers(): Promise<LinearMember[]> {
  try {
    const data = await linearGraphQL<{ users?: { nodes: LinearMember[] } }>(
      `query {
        users(filter: { active: { eq: true } }) {
          nodes { id name displayName email avatarUrl }
        }
      }`
    );
    return data?.users?.nodes ?? [];
  } catch {
    return [];
  }
}

export async function createLinearIssue(params: {
  title: string;
  description: string;
  priority?: number;
  teamId?: string;
  assigneeId?: string;
}): Promise<{ id?: string; identifier?: string; assigneeName?: string; ok: boolean }> {
  try {
    const variables: Record<string, unknown> = {
      title: params.title,
      description: params.description,
      priority: params.priority ?? 3,
      teamId: params.teamId || process.env.LINEAR_TEAM_ID || "",
    };
    if (params.assigneeId) variables.assigneeId = params.assigneeId;

    const data = await linearGraphQL<{
      issueCreate?: { success: boolean; issue: { id: string; identifier: string; assignee?: { name: string } | null } }
    }>(
      `mutation CreateIssue($title: String!, $description: String, $priority: Int, $teamId: String!, $assigneeId: String) {
        issueCreate(input: { title: $title, description: $description, priority: $priority, teamId: $teamId, assigneeId: $assigneeId }) {
          success issue { id identifier assignee { name } }
        }
      }`,
      variables
    );
    const issue = data?.issueCreate?.issue;
    return {
      id: issue?.id,
      identifier: issue?.identifier,
      assigneeName: issue?.assignee?.name ?? undefined,
      ok: !!issue?.id,
    };
  } catch (err) {
    console.error("Linear create issue error:", err);
    return { ok: false };
  }
}
