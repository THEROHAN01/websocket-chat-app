import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import * as userService from "../services/user.service.js";

export async function getMe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const profile = await userService.getProfile(req.user.userId);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const profile = await userService.updateProfile(req.user.userId, req.body);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const user = await userService.getUserById(id);
    res.json(user);
  } catch (err) {
    next(err);
  }
}

export async function searchUsers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const q = req.query["q"] as string;
    const users = await userService.searchUsers(q, req.user.userId);
    res.json(users);
  } catch (err) {
    next(err);
  }
}
