import { ReplitConnectors } from "@replit/connectors-sdk";

const PARENT_FOLDER_NAME = "FlipIQ Command Center";

function getConnectors() {
  return new ReplitConnectors();
}

async function driveRequest(path: string, options: { method?: string; params?: Record<string, string>; body?: unknown } = {}) {
  const connectors = getConnectors();
  const { method = "GET", params, body } = options;

  let url = path;
  if (params && Object.keys(params).length > 0) {
    url += "?" + new URLSearchParams(params).toString();
  }

  const fetchOpts: RequestInit = { method };
  if (body) {
    fetchOpts.body = JSON.stringify(body);
    (fetchOpts as any).headers = { "Content-Type": "application/json" };
  }

  const res = await connectors.proxy("google-drive", url, fetchOpts as any);
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Drive API ${method} ${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

export async function createFolderIfNotExists(name: string, parentId?: string): Promise<string> {
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const existing = await driveRequest("/drive/v3/files", {
    params: { q: query, fields: "files(id,name)", spaces: "drive" },
  });

  if (existing.files && existing.files.length > 0) {
    return existing.files[0].id as string;
  }

  const folder = await driveRequest("/drive/v3/files", {
    method: "POST",
    params: { fields: "id" },
    body: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
  });

  console.log(`[Drive] Created folder: ${name} (${folder.id})`);
  return folder.id as string;
}

export async function searchFiles(params: {
  folderId: string;
  nameContains?: string;
  mimeType?: string;
  maxResults?: number;
}): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  const { folderId, nameContains, mimeType, maxResults = 50 } = params;

  let query = `'${folderId}' in parents and trashed=false`;
  if (nameContains) query += ` and name contains '${nameContains.replace(/'/g, "\\'")}'`;
  if (mimeType) query += ` and mimeType='${mimeType}'`;

  const result = await driveRequest("/drive/v3/files", {
    params: { q: query, fields: "files(id,name,modifiedTime)", pageSize: String(maxResults), orderBy: "modifiedTime desc" },
  });

  return (result.files || []).map((f: any) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime }));
}

export async function readGoogleDoc(documentId: string): Promise<string> {
  const connectors = getConnectors();
  const res = await connectors.proxy("google-drive", `/drive/v3/files/${documentId}/export?mimeType=text%2Fplain`, { method: "GET" } as any);
  if (!res.ok) throw new Error(`Doc export ${res.status}`);
  return res.text();
}

export async function listDriveFiles(query: string, maxResults = 20): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }[]> {
  const result = await driveRequest("/drive/v3/files", {
    params: { q: query, pageSize: String(maxResults), fields: "files(id,name,mimeType,modifiedTime)", orderBy: "modifiedTime desc" },
  });
  return result.files || [];
}

export async function searchDrive(name: string): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }[]> {
  return listDriveFiles(`name contains '${name.replace(/'/g, "\\'")}' and trashed = false`);
}

export { PARENT_FOLDER_NAME };
