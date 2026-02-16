import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import * as groupService from "../services/group.service.js";

export async function create(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { name, description, memberIds } = req.body;
    const group = await groupService.createGroup(req.user.userId, name, memberIds, description);
    res.status(201).json(group);
  } catch (err) {
    next(err);
  }
}

export async function getInfo(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const group = await groupService.getGroupInfo(id);
    res.json(group);
  } catch (err) {
    next(err);
  }
}

export async function update(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const group = await groupService.updateGroupInfo(req.user.userId, id, req.body);
    res.json(group);
  } catch (err) {
    next(err);
  }
}

export async function addMembers(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const { userIds } = req.body;
    const group = await groupService.addMembers(req.user.userId, id, userIds);
    res.json(group);
  } catch (err) {
    next(err);
  }
}

export async function removeMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const userId = req.params["userId"] as string;
    const group = await groupService.removeMember(req.user.userId, id, userId);
    res.json(group);
  } catch (err) {
    next(err);
  }
}

export async function updateRole(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const userId = req.params["userId"] as string;
    const { role } = req.body;
    const group = await groupService.updateMemberRole(req.user.userId, id, userId, role);
    res.json(group);
  } catch (err) {
    next(err);
  }
}
