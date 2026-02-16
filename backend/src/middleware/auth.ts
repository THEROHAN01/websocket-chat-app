import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../services/auth.service.js";

export interface AuthenticatedRequest extends Request {
  user: { userId: string; username: string };
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "AUTHENTICATION_ERROR", message: "Missing or invalid Authorization header" },
    });
    return;
  }

  const token = authHeader.slice(7);
  try {
    const payload = verifyAccessToken(token);
    (req as AuthenticatedRequest).user = payload;
    next();
  } catch {
    res.status(401).json({
      error: { code: "AUTHENTICATION_ERROR", message: "Invalid or expired token" },
    });
  }
}
