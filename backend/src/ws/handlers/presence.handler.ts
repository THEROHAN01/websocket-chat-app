import { prisma } from "../../config/database.js";
import { connectionManager } from "../connectionManager.js";
import { logger } from "../../utils/logger.js";
import type { ServerMessage } from "../../types/ws-messages.js";

export async function broadcastPresence(userId: string, status: "online" | "offline"): Promise<void> {
  try {
    // Find all users who share a conversation with this user
    const conversations = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    const conversationIds = conversations.map((c) => c.conversationId);

    const relatedParticipants = await prisma.conversationParticipant.findMany({
      where: {
        conversationId: { in: conversationIds },
        userId: { not: userId },
      },
      select: { userId: true },
    });

    const uniqueUserIds = [...new Set(relatedParticipants.map((p) => p.userId))];

    const notification: ServerMessage = {
      id: crypto.randomUUID(),
      type: "presence:update",
      payload: {
        userId,
        status,
        ...(status === "offline" ? { lastSeen: Date.now() } : {}),
      },
      timestamp: Date.now(),
    };
    const data = JSON.stringify(notification);

    for (const uid of uniqueUserIds) {
      connectionManager.sendToUser(uid, data);
    }

    logger.debug("Presence broadcast", { userId, status, recipientCount: uniqueUserIds.length });
  } catch (err) {
    logger.error("Failed to broadcast presence", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
