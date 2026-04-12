import { google } from "googleapis";
import { getGoogleAuth } from "./google-auth";

const PARENT_FOLDER_NAME = "FlipIQ Command Center";

function getDrive() {
  return google.drive({ version: "v3", auth: getGoogleAuth() });
}

export async function createFolderIfNotExists(name: string, parentId?: string): Promise<string> {
  const drive = getDrive();
  const query = parentId
    ? `name='${name}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`
    : `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;

  const existing = await drive.files.list({ q: query, fields: "files(id,name)", spaces: "drive" });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", ...(parentId ? { parents: [parentId] } : {}) },
    fields: "id",
  });

  console.log(`[Drive] Created folder: ${name} (${folder.data.id})`);
  return folder.data.id!;
}

export async function searchFiles(params: {
  folderId: string;
  nameContains?: string;
  mimeType?: string;
  maxResults?: number;
}): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  const drive = getDrive();
  const { folderId, nameContains, mimeType, maxResults = 50 } = params;

  let query = `'${folderId}' in parents and trashed=false`;
  if (nameContains) query += ` and name contains '${nameContains.replace(/'/g, "\\'")}'`;
  if (mimeType) query += ` and mimeType='${mimeType}'`;

  const result = await drive.files.list({
    q: query,
    fields: "files(id,name,modifiedTime)",
    pageSize: maxResults,
    orderBy: "modifiedTime desc",
  });

  return (result.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    modifiedTime: f.modifiedTime!,
  }));
}

export async function readGoogleDoc(documentId: string): Promise<string> {
  const drive = getDrive();
  const meta = await drive.files.get({ fileId: documentId, fields: "mimeType,name" });
  const mimeType = meta.data.mimeType || "";
  if (mimeType.startsWith("application/vnd.google-apps.")) {
    const result = await drive.files.export({ fileId: documentId, mimeType: "text/plain" });
    return result.data as string;
  } else {
    const result = await drive.files.get(
      { fileId: documentId, alt: "media" },
      { responseType: "text" }
    );
    return (result.data as string) || "";
  }
}

export async function listDriveFiles(
  query: string,
  maxResults = 20
): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }[]> {
  const drive = getDrive();
  const res = await drive.files.list({
    q: query,
    pageSize: maxResults,
    fields: "files(id,name,mimeType,modifiedTime)",
    orderBy: "modifiedTime desc",
  });
  return (res.data.files || []) as { id: string; name: string; mimeType: string; modifiedTime: string }[];
}

export async function searchDrive(
  name: string
): Promise<{ id: string; name: string; mimeType: string; modifiedTime: string }[]> {
  return listDriveFiles(`name contains '${name.replace(/'/g, "\\'")}' and trashed = false`);
}

export { PARENT_FOLDER_NAME };
