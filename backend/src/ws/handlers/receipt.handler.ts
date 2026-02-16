import { prisma } from "../../config/database.js";
import { connectionManager } from "../connectionManager.js";
import { logger } from "../../utils/logger.js";
import type { ServerMessage } from "../../types/ws-messages.js";

export async function handleChatRead(
  connectionId: string,
  payload: { conversationId: string; messageId: string },
): Promise<void> {
  const conn = connectionManager.getConnection(connectionId);
  if (!conn?.userId) return;

  try {
    // Update lastReadAt for this participant
    await prisma.conversationParticipant.updateMany({
      where: { conversationId: payload.conversationId, userId: conn.userId },
      data: { lastReadAt: new Date() },
    });

    // Mark all messages up to messageId as READ for this user
    // Get the message to find its timestamp
    const targetMessage = await prisma.message.findUnique({
      where: { id: payload.messageId },
      select: { createdAt: true, conversationId: true },
    });

    if (!targetMessage || targetMessage.conversationId !== payload.conversationId) return;

    // Find all unread messages in this conversation up to this point
    const unreadMessages = await prisma.message.findMany({
      where: {
        conversationId: payload.conversationId,
        createdAt: { lte: targetMessage.createdAt },
        senderId: { not: conn.userId },
        receipts: { none: { userId: conn.userId, status: "READ" } },
      },
      select: { id: true, senderId: true },
    });

    // Upsert receipts
    for (const msg of unreadMessages) {
      await prisma.messageReceipt.upsert({
        where: { messageId_userId: { messageId: msg.id, userId: conn.userId } },
        update: { status: "READ", timestamp: new Date() },
        create: { messageId: msg.id, userId: conn.userId, status: "READ" },
      });

      // Notify senders
      const readNotification: ServerMessage = {
        id: crypto.randomUUID(),
        type: "chat:read",
        payload: {
          messageId: msg.id,
          conversationId: payload.conversationId,
          readBy: conn.userId,
        },
        timestamp: Date.now(),
      };
      connectionManager.sendToUser(msg.senderId, JSON.stringify(readNotification));
    }

    logger.debug("Read receipts processed", {
      userId: conn.userId,
      conversationId: payload.conversationId,
      count: unreadMessages.length,
    });
  } catch (err) {
    logger.error("Failed to process read receipt", {
      connectionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function createDeliveryReceipt(messageId: string, senderId: string, recipientId: string): Promise<void> {
  try {
    await prisma.messageReceipt.upsert({
      where: { messageId_userId: { messageId, userId: recipientId } },
      update: {},
      create: { messageId, userId: recipientId, status: "DELIVERED" },
    });

    // Notify sender
    const deliveredNotification: ServerMessage = {
      id: crypto.randomUUID(),
      type: "chat:delivered",
      payload: { messageId, conversationId: "" },
      timestamp: Date.now(),
    };
    connectionManager.sendToUser(senderId, JSON.stringify(deliveredNotification));
  } catch (err) {
    logger.error("Failed to create delivery receipt", {
      messageId,
      recipientId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
