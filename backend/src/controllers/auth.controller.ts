import type { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service.js";

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, email, password, displayName } = req.body;
    const result = await authService.register(username, email, password, displayName);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(email, password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refresh(refreshToken);
    res.json(tokens);
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    await authService.logout(refreshToken);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
}
