import { Router, type IRouter } from "express";
import { getDrive } from "../../lib/google-auth.js";

const router: IRouter = Router();

// ── Folder browse ─────────────────────────────────────────────────────────────
router.get("/drive/folder", async (req, res): Promise<void> => {
  const folderId = String(req.query.folderId || "root");

  try {
    const drive = getDrive();

    const [listRes, metaRes] = await Promise.allSettled([
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: "files(id, name, mimeType, webViewLink, modifiedTime)",
        pageSize: 100,
        orderBy: "folder,name",
      }),
      folderId !== "root"
        ? drive.files.get({ fileId: folderId, fields: "id, name" })
        : Promise.resolve(null),
    ]);

    const files = listRes.status === "fulfilled"
      ? (listRes.value.data.files || [])
      : [];

    const folderName = metaRes.status === "fulfilled" && metaRes.value
      ? (metaRes.value as any)?.data?.name ?? "My Drive"
      : "My Drive";

    const items = files.map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      webViewLink: f.webViewLink,
      modifiedTime: f.modifiedTime,
    }));

    res.json({ folderId, folderName, items });
  } catch (err) {
    console.warn("[drive/folder] failed:", err instanceof Error ? err.message : err);
    res.json({ folderId, folderName: "My Drive", items: [] });
  }
});

// ── Search ────────────────────────────────────────────────────────────────────
router.get("/drive/search", async (req, res): Promise<void> => {
  const q = String(req.query.q || "").trim();
  if (!q || q.length < 2) {
    res.json([]);
    return;
  }

  try {
    const drive = getDrive();
    const response = await drive.files.list({
      q: `name contains '${q.replace(/'/g, "\\'")}' and trashed = false`,
      fields: "files(id, name, mimeType, webViewLink, modifiedTime)",
      pageSize: 20,
      orderBy: "modifiedTime desc",
    });

    const files = (response.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      isFolder: f.mimeType === "application/vnd.google-apps.folder",
      webViewLink: f.webViewLink,
      modifiedTime: f.modifiedTime,
    }));

    res.json(files);
  } catch (err) {
    console.warn("[drive/search] failed:", err instanceof Error ? err.message : err);
    res.json([]);
  }
});

export default router;
