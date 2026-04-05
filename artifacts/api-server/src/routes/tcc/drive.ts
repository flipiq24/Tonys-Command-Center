import { Router, type IRouter } from "express";
import { createFolderIfNotExists, listDriveFiles, searchDrive } from "../../lib/google-drive.js";

const router: IRouter = Router();

function sanitizeDriveId(id: string): string {
  if (id === "root") return "root";
  return id.replace(/[^a-zA-Z0-9_\-]/g, "");
}

// ── Folder browse ─────────────────────────────────────────────────────────────
router.get("/drive/folder", async (req, res): Promise<void> => {
  const rawId = String(req.query.folderId || "root");
  const folderId = sanitizeDriveId(rawId);

  try {
    const files = await listDriveFiles(
      `'${folderId}' in parents and trashed = false`,
      100
    );

    const items = files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      modifiedTime: f.modifiedTime,
    }));

    res.json({ folderId, folderName: folderId === "root" ? "My Drive" : folderId, items });
  } catch (err) {
    console.warn("[drive/folder] failed:", err instanceof Error ? err.message : err);
    res.json({ folderId, folderName: "My Drive", items: [], error: "Drive access error" });
  }
});

// ── Search ────────────────────────────────────────────────────────────────────
router.get("/drive/search", async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) { res.json([]); return; }

  try {
    const files = await searchDrive(q);
    const results = files.map((f) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      modifiedTime: f.modifiedTime,
    }));
    res.json(results);
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
