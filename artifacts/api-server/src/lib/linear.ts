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

export async function getLinearIssues(teamId?: string): Promise<{ id: string; title: string; state: { name: string }; priority: number; identifier: string }[]> {
  try {
    const data = await linearGraphQL<{ issues?: { nodes: { id: string; title: string; state: { name: string }; priority: number; identifier: string }[] } }>(
      `query Issues($teamId: ID) {
        issues(filter: { team: { id: { eq: $teamId } }, state: { name: { nin: ["Done", "Cancelled"] } } }, first: 50) {
          nodes { id title identifier priority state { name } }
        }
      }`,
      teamId ? { teamId } : {}
    );
    return data?.issues?.nodes ?? [];
  } catch {
    return [];
  }
}

export async function createLinearIssue(params: {
  title: string;
  description: string;
  priority?: number;
  teamId?: string;
}): Promise<{ id?: string; identifier?: string; ok: boolean }> {
  try {
    const data = await linearGraphQL<{ issueCreate?: { success: boolean; issue: { id: string; identifier: string } } }>(
      `mutation CreateIssue($title: String!, $description: String, $priority: Int, $teamId: String!) {
        issueCreate(input: { title: $title, description: $description, priority: $priority, teamId: $teamId }) {
          success issue { id identifier }
        }
      }`,
      { title: params.title, description: params.description, priority: params.priority ?? 3, teamId: params.teamId ?? "" }
    );
    const issue = data?.issueCreate?.issue;
    return { id: issue?.id, identifier: issue?.identifier, ok: !!issue?.id };
  } catch (err) {
    console.error("Linear create issue error:", err);
    return { ok: false };
  }
}
