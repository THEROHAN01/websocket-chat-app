import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import * as contactService from "../services/contact.service.js";

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const contacts = await contactService.getContacts(req.user.userId);
    res.json(contacts);
  } catch (err) {
    next(err);
  }
}

export async function add(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { userId, nickname } = req.body;
    const contact = await contactService.addContact(req.user.userId, userId, nickname);
    res.status(201).json(contact);
  } catch (err) {
    next(err);
  }
}

export async function remove(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const contactUserId = req.params["userId"] as string;
    await contactService.removeContact(req.user.userId, contactUserId);
    res.json({ message: "Contact removed" });
  } catch (err) {
    next(err);
  }
}

export async function block(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = req.body;
    await contactService.blockUser(req.user.userId, userId);
    res.json({ message: "User blocked" });
  } catch (err) {
    next(err);
  }
}

export async function unblock(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const blockedUserId = req.params["userId"] as string;
    await contactService.unblockUser(req.user.userId, blockedUserId);
    res.json({ message: "User unblocked" });
  } catch (err) {
    next(err);
  }
}

export async function blockedList(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const blocked = await contactService.getBlockedUsers(req.user.userId);
    res.json(blocked);
  } catch (err) {
    next(err);
  }
}
