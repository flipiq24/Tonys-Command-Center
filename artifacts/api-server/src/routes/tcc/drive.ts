import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { createFolderIfNotExists } from "../../lib/google-drive.js";

const router: IRouter = Router();

function getConnectors() {
  return new ReplitConnectors();
}

async function driveList(q: string, fields: string, pageSize = 20, orderBy = "modifiedTime desc") {
  const connectors = getConnectors();
  const params = new URLSearchParams({ q, fields, pageSize: String(pageSize), orderBy });
  const res = await connectors.proxy("google-drive", `/drive/v3/files?${params}`, { method: "GET" } as any);
  if (!res.ok) throw new Error(`Drive list ${res.status}`);
  return res.json();
}

async function driveGet(fileId: string, fields: string) {
  const connectors = getConnectors();
  const res = await connectors.proxy("google-drive", `/drive/v3/files/${fileId}?fields=${encodeURIComponent(fields)}`, { method: "GET" } as any);
  if (!res.ok) throw new Error(`Drive get ${res.status}`);
  return res.json();
}

// ── Sanitize Drive IDs ─────────────────────────────────────────────────────────
function sanitizeDriveId(id: string): string {
  if (id === "root") return "root";
  return id.replace(/[^a-zA-Z0-9_\-]/g, "");
}

// ── Folder browse ─────────────────────────────────────────────────────────────
router.get("/drive/folder", async (req, res): Promise<void> => {
  const rawId = String(req.query.folderId || "root");
  const folderId = sanitizeDriveId(rawId);

  try {
    const [listData, metaData] = await Promise.allSettled([
      driveList(
        `'${folderId}' in parents and trashed = false`,
        "files(id,name,mimeType,webViewLink,modifiedTime)",
        100,
        "folder,name"
      ),
      folderId !== "root" ? driveGet(folderId, "id,name") : Promise.resolve(null),
    ]);

    const files = listData.status === "fulfilled" ? (listData.value.files || []) : [];
    const folderName = metaData.status === "fulfilled" && metaData.value
      ? (metaData.value as any)?.name ?? "My Drive"
      : "My Drive";

    const items = files.map((f: any) => ({
      id: f.id, name: f.name, mimeType: f.mimeType,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      webViewLink: f.webViewLink, modifiedTime: f.modifiedTime,
    }));

    res.json({ folderId, folderName, items });
  } catch (err) {
    console.warn("[drive/folder] failed:", err instanceof Error ? err.message : err);
    res.json({ folderId, folderName: "My Drive", items: [], error: "Drive access error — re-authorize in settings" });
  }
});

// ── Search ────────────────────────────────────────────────────────────────────
router.get("/drive/search", async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  try {
    const data = await driveList(
      `name contains '${q.replace(/'/g, "\\'")}' and trashed = false`,
      "files(id,name,mimeType,webViewLink,modifiedTime)",
      20
    );

    const files = (data.files || []).map((f: any) => ({
      id: f.id, name: f.name, mimeType: f.mimeType,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      webViewLink: f.webViewLink, modifiedTime: f.modifiedTime,
    }));

    res.json(files);
  } catch (err) {
    console.warn("[drive/search] failed:", err instanceof Error ? err.message : err);
    res.json([]);
  }
});

// ── Setup Drive Folder Hierarchy ─────────────────────────────────────────────
router.post("/drive/setup-folders", async (req, res): Promise<void> => {
  try {
    const folderIds: Record<string, string> = {};

    const rootId = await createFolderIfNotExists("FlipIQ Command Center");
    folderIds["FlipIQ Command Center"] = rootId;

    const transcriptsId = await createFolderIfNotExists("Transcripts", rootId);
    folderIds["Transcripts"] = transcriptsId;
    folderIds["Transcripts/Meetings"] = await createFolderIfNotExists("Meetings", transcriptsId);
    folderIds["Transcripts/Calls"] = await createFolderIfNotExists("Calls", transcriptsId);
    folderIds["Transcripts/General"] = await createFolderIfNotExists("General", transcriptsId);

    const contactFilesId = await createFolderIfNotExists("Contact Files", rootId);
    folderIds["Contact Files"] = contactFilesId;
    folderIds["Contact Files/Team"] = await createFolderIfNotExists("Team", contactFilesId);
    folderIds["Contact Files/Clients"] = await createFolderIfNotExists("Clients", contactFilesId);
    folderIds["Contact Files/Prospects"] = await createFolderIfNotExists("Prospects", contactFilesId);
    folderIds["Contact Files/Consultants"] = await createFolderIfNotExists("Consultants", contactFilesId);

    folderIds["Meeting Notes"] = await createFolderIfNotExists("Meeting Notes", rootId);
    folderIds["Documents"] = await createFolderIfNotExists("Documents", rootId);

    res.json({ ok: true, folderIds });
  } catch (err) {
    console.error("[drive/setup-folders] Failed:", err instanceof Error ? err.message : err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

export default router;
