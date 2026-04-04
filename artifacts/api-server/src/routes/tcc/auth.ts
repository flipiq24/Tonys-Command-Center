import { Router, type IRouter } from "express";

const router: IRouter = Router();

const TOKEN = process.env.TCC_AUTH_TOKEN;

// POST /api/auth/verify — check if a token is valid; exempt from auth middleware
router.post("/auth/verify", (req, res): void => {
  if (!TOKEN) {
    // Not configured — accept any token so the app stays usable
    res.json({ ok: true, unprotected: true });
    return;
  }

  const { token } = req.body as { token?: string };
  if (!token || token !== TOKEN) {
    res.status(401).json({ ok: false, error: "Invalid token" });
    return;
  }

  res.json({ ok: true });
});

export default router;
