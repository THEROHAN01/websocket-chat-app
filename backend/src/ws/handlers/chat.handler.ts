import { connectionManager } from "../connectionManager.js";
import { logger } from "../../utils/logger.js";
import * as messageService from "../../services/message.service.js";
import * as conversationService from "../../services/conversation.service.js";
import { createDeliveryReceipt } from "./receipt.handler.js";
import type { ServerMessage } from "../../types/ws-messages.js";

export async function handleChatSend(
  connectionId: string,
  payload: { conversationId: string; content: string; contentType?: string | undefined; replyToMessageId?: string | undefined },
  clientMessageId: string,
): Promise<void> {
  const conn = connectionManager.getConnection(connectionId);
  if (!conn?.userId) {
    logger.warn("Unauthenticated chat attempt", { connectionId });
    return;
  }

  try {
    // Persist message to DB
    const message = await messageService.sendMessage(
      conn.userId,
      payload.conversationId,
      payload.content,
      payload.contentType ?? "TEXT",
      payload.replyToMessageId,
    );

    // Ack to sender
    const ack: ServerMessage = {
      id: crypto.randomUUID(),
      type: "chat:sent",
      payload: { clientMessageId, messageId: message.id, timestamp: message.createdAt.getTime() },
      timestamp: Date.now(),
      replyTo: clientMessageId,
    };
    conn.socket.send(JSON.stringify(ack));

    // Get all participants in the conversation
    const participantIds = await conversationService.getParticipantUserIds(payload.conversationId);

    // Build outgoing payload
    const replyTo = message.replyTo
      ? { id: message.replyTo.id, content: message.replyTo.content, senderId: message.replyTo.senderId }
      : undefined;

    const outgoing: ServerMessage = {
      id: crypto.randomUUID(),
      type: "chat:receive",
      payload: {
        messageId: message.id,
        senderId: conn.userId,
        senderName: message.sender.displayName,
        conversationId: payload.conversationId,
        content: payload.content,
        contentType: message.contentType,
        timestamp: message.createdAt.getTime(),
        replyTo,
      },
      timestamp: Date.now(),
    };

    const outgoingStr = JSON.stringify(outgoing);

    // Send to all online participants except sender, and create delivery receipts
    for (const participantId of participantIds) {
      if (participantId !== conn.userId) {
        const sent = connectionManager.sendToUser(participantId, outgoingStr);
        if (sent) {
          // Auto-create delivery receipt for online recipients
          createDeliveryReceipt(message.id, conn.userId, participantId);
        }
      }
    }

    logger.info("Message persisted and delivered", {
      messageId: message.id,
      senderId: conn.userId,
      conversationId: payload.conversationId,
      recipientCount: participantIds.length - 1,
    });
  } catch (err) {
    logger.error("Failed to send message", {
      connectionId,
      error: err instanceof Error ? err.message : String(err),
    });

    const errorMsg: ServerMessage = {
      id: crypto.randomUUID(),
      type: "error",
      payload: {
        code: "SEND_FAILED",
        message: err instanceof Error ? err.message : "Failed to send message",
        replyTo: clientMessageId,
      },
      timestamp: Date.now(),
      replyTo: clientMessageId,
    };
    conn.socket.send(JSON.stringify(errorMsg));
  }
}
