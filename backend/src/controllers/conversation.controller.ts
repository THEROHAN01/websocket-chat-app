import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import * as conversationService from "../services/conversation.service.js";
import * as messageService from "../services/message.service.js";

export async function createDirect(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = req.body;
    const conversation = await conversationService.getOrCreateDirectConversation(req.user.userId, userId);
    res.status(201).json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function list(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const conversations = await conversationService.getConversationsForUser(req.user.userId);
    res.json(conversations);
  } catch (err) {
    next(err);
  }
}

export async function getById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const conversation = await conversationService.getConversationById(id, req.user.userId);
    res.json(conversation);
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const cursor = req.query["cursor"] as string | undefined;
    const limit = parseInt(req.query["limit"] as string || "50", 10);
    const result = await messageService.getMessages(id, req.user.userId, cursor, limit);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
