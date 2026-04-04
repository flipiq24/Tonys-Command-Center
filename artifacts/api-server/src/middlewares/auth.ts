import type { Request, Response, NextFunction } from "express";

const TOKEN = process.env.TCC_AUTH_TOKEN;

if (!TOKEN) {
  console.warn(
    "[auth] WARNING: TCC_AUTH_TOKEN secret is not set. API is publicly accessible! " +
    "Add TCC_AUTH_TOKEN to your Replit secrets to enable authentication."
  );
}

// Paths (relative to /api mount) that do NOT require the bearer token
// phone-log uses ?key=MACRODROID_SECRET query param auth instead
const EXEMPT_PREFIXES = ["/phone-log", "/auth/verify"];

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If token is not configured, run in unprotected mode (warn logged at startup)
  if (!TOKEN) {
    next();
    return;
  }

  // Exempt MacroDroid webhook and the verify endpoint itself
  const path = req.path;
  if (EXEMPT_PREFIXES.some(p => path.startsWith(p))) {
    next();
    return;
  }

  const provided =
    (req.headers["x-tcc-token"] as string | undefined) ||
    req.headers.authorization?.replace(/^Bearer\s+/i, "");

  if (provided && provided === TOKEN) {
    next();
    return;
  }

  res.status(401).json({ error: "Unauthorized" });
}
