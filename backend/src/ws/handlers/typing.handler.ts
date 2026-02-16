import { connectionManager } from "../connectionManager.js";
import { logger } from "../../utils/logger.js";
import * as conversationService from "../../services/conversation.service.js";
import type { ServerMessage } from "../../types/ws-messages.js";

// Track typing timeouts to auto-clear stuck indicators
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export async function handleTyping(
  connectionId: string,
  payload: { conversationId: string; isTyping: boolean },
): Promise<void> {
  const conn = connectionManager.getConnection(connectionId);
  if (!conn?.userId) return;

  const timeoutKey = `${conn.userId}:${payload.conversationId}`;

  // Clear existing timeout
  const existing = typingTimeouts.get(timeoutKey);
  if (existing) {
    clearTimeout(existing);
    typingTimeouts.delete(timeoutKey);
  }

  // Set auto-clear timeout if user started typing
  if (payload.isTyping) {
    const timeout = setTimeout(() => {
      broadcastTyping(conn.userId!, payload.conversationId, false);
      typingTimeouts.delete(timeoutKey);
    }, 5000);
    typingTimeouts.set(timeoutKey, timeout);
  }

  await broadcastTyping(conn.userId, payload.conversationId, payload.isTyping);
}

async function broadcastTyping(userId: string, conversationId: string, isTyping: boolean): Promise<void> {
  try {
    const participantIds = await conversationService.getParticipantUserIds(conversationId);

    const notification: ServerMessage = {
      id: crypto.randomUUID(),
      type: "chat:typing",
      payload: { conversationId, userId, isTyping },
      timestamp: Date.now(),
    };
    const data = JSON.stringify(notification);

    for (const pid of participantIds) {
      if (pid !== userId) {
        connectionManager.sendToUser(pid, data);
      }
    }
  } catch (err) {
    logger.error("Failed to broadcast typing", {
      userId,
      conversationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
