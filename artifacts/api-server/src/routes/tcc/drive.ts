import { Router, type IRouter } from "express";
import { getDrive } from "../../lib/google-auth.js";

const router: IRouter = Router();

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
      fields: "files(id, name, mimeType, webViewLink, iconLink, modifiedTime)",
      pageSize: 10,
      orderBy: "modifiedTime desc",
    });

    const files = (response.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      webViewLink: f.webViewLink,
      iconLink: f.iconLink,
      modifiedTime: f.modifiedTime,
    }));

    res.json(files);
  } catch (err) {
    console.warn("[drive/search] failed:", err instanceof Error ? err.message : err);
    res.json([]);
  }
});

export default router;
