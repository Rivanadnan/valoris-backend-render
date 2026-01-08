import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type UserRole = "user" | "creator" | "admin";

export type JwtPayload = {
  userId: string;
  role: UserRole;
  email?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization; // "Bearer TOKEN"
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ ok: false, error: "Missing token" });
  }

  const token = header.slice("Bearer ".length);
  const secret = process.env.JWT_SECRET;
  if (!secret) return res.status(500).json({ ok: false, error: "JWT_SECRET missing" });

  try {
    const payload = jwt.verify(token, secret) as JwtPayload;
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

/**
 * ✅ Använd så här:
 * requireRole("admin")
 * requireRole("creator", "admin")
 *
 * ❌ Undvik:
 * requireRole(["admin"])  // kan bli string[] och ge TS-error i vissa sammanhang
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "Missing user" });

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    return next();
  };
}
