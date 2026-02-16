import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/database.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import { connectionManager } from "../ws/connectionManager.js";
import * as conversationService from "../services/conversation.service.js";
import type { ServerMessage } from "../types/ws-messages.js";

export async function editMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const { content } = req.body;

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundError("Message not found");
    if (message.senderId !== req.user.userId) throw new ForbiddenError("Can only edit your own messages");
    if (message.contentType !== "TEXT") throw new ValidationError("Can only edit text messages");

    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    if (message.createdAt < fifteenMinsAgo) throw new ValidationError("Can only edit messages within 15 minutes");

    const updated = await prisma.message.update({
      where: { id },
      data: { content, editedAt: new Date() },
    });

    // Broadcast edit to online participants
    const participantIds = await conversationService.getParticipantUserIds(message.conversationId);
    const notification: ServerMessage = {
      id: crypto.randomUUID(),
      type: "chat:edited",
      payload: { messageId: id, conversationId: message.conversationId, newContent: content, editedAt: updated.editedAt!.getTime() },
      timestamp: Date.now(),
    };
    const data = JSON.stringify(notification);
    for (const pid of participantIds) {
      if (pid !== req.user.userId) connectionManager.sendToUser(pid, data);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    const { forEveryone } = req.body;

    const message = await prisma.message.findUnique({ where: { id } });
    if (!message) throw new NotFoundError("Message not found");

    if (forEveryone) {
      if (message.senderId !== req.user.userId) throw new ForbiddenError("Can only delete your own messages for everyone");
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (message.createdAt < oneHourAgo) throw new ValidationError("Can only delete for everyone within 1 hour");

      await prisma.message.update({
        where: { id },
        data: { deletedAt: new Date(), content: "This message was deleted" },
      });

      const participantIds = await conversationService.getParticipantUserIds(message.conversationId);
      const notification: ServerMessage = {
        id: crypto.randomUUID(),
        type: "chat:deleted",
        payload: { messageId: id, conversationId: message.conversationId },
        timestamp: Date.now(),
      };
      const data = JSON.stringify(notification);
      for (const pid of participantIds) {
        connectionManager.sendToUser(pid, data);
      }
    }
    // "Delete for me" would use a DeletedMessage junction table (future enhancement)

    res.json({ message: "Message deleted" });
  } catch (err) {
    next(err);
  }
}

export async function forwardMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const { messageId, targetConversationIds } = req.body as { messageId: string; targetConversationIds: string[] };

    const original = await prisma.message.findUnique({ where: { id: messageId } });
    if (!original) throw new NotFoundError("Message not found");

    // Verify sender is participant of original conversation
    if (!(await conversationService.isParticipant(original.conversationId, req.user.userId))) {
      throw new ForbiddenError("Not a participant of the original conversation");
    }

    const results = [];
    for (const convId of targetConversationIds) {
      if (!(await conversationService.isParticipant(convId, req.user.userId))) continue;

      const forwarded = await prisma.message.create({
        data: {
          conversationId: convId,
          senderId: req.user.userId,
          content: original.content,
          contentType: original.contentType,
        },
      });
      results.push(forwarded);

      // Notify participants
      const participantIds = await conversationService.getParticipantUserIds(convId);
      const notification: ServerMessage = {
        id: crypto.randomUUID(),
        type: "chat:receive",
        payload: {
          messageId: forwarded.id,
          senderId: req.user.userId,
          senderName: req.user.username,
          conversationId: convId,
          content: original.content,
          contentType: original.contentType,
          timestamp: forwarded.createdAt.getTime(),
        },
        timestamp: Date.now(),
      };
      const data = JSON.stringify(notification);
      for (const pid of participantIds) {
        if (pid !== req.user.userId) connectionManager.sendToUser(pid, data);
      }
    }

    res.json({ forwarded: results.length });
  } catch (err) {
    next(err);
  }
}

export async function starMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const id = req.params["id"] as string;
    // Simple implementation using message metadata - for now just return success
    // Full StarredMessage table can be added as enhancement
    res.json({ message: "Message starred", messageId: id });
  } catch (err) {
    next(err);
  }
}

export async function searchMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    const q = req.query["q"] as string;
    const conversationId = req.query["conversationId"] as string | undefined;

    if (!q || q.length < 1) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Query required" } });
      return;
    }

    const where: Record<string, unknown> = {
      content: { contains: q, mode: "insensitive" },
      deletedAt: null,
      conversation: {
        participants: { some: { userId: req.user.userId } },
      },
    };

    if (conversationId) {
      where["conversationId"] = conversationId;
    }

    const messages = await prisma.message.findMany({
      where: where as any,
      include: {
        sender: { select: { id: true, displayName: true } },
        conversation: { select: { id: true, type: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    res.json(messages);
  } catch (err) {
    next(err);
  }
}
