import type { WebSocket } from "ws";
import { z } from "zod";
import { connectionManager } from "./connectionManager.js";
import { handleWsAuth } from "../middleware/wsAuth.js";
import { handleChatSend } from "./handlers/chat.handler.js";
import { handleChatRead } from "./handlers/receipt.handler.js";
import { handleTyping } from "./handlers/typing.handler.js";
import type { ServerMessage } from "../types/ws-messages.js";

const clientMessageSchema = z.object({
  id: z.string(),
  type: z.string(),
  payload: z.unknown(),
  timestamp: z.number(),
});

const chatSendPayloadSchema = z.object({
  conversationId: z.string(),
  content: z.string().min(1),
  contentType: z.string().optional(),
  replyToMessageId: z.string().optional(),
});

const authPayloadSchema = z.object({
  token: z.string(),
});

const chatReadPayloadSchema = z.object({
  conversationId: z.string(),
  messageId: z.string(),
});

const typingPayloadSchema = z.object({
  conversationId: z.string(),
  isTyping: z.boolean(),
});

export function dispatch(connectionId: string, socket: WebSocket, raw: string): void {
  let parsed: z.infer<typeof clientMessageSchema>;

  try {
    const json: unknown = JSON.parse(raw);
    parsed = clientMessageSchema.parse(json);
  } catch {
    sendError(socket, "INVALID_MESSAGE", "Invalid message format");
    return;
  }

  const { type, payload, id: clientMessageId } = parsed;

  // Auth must be the first message for unauthenticated connections
  if (type !== "auth" && !connectionManager.getConnection(connectionId)?.userId) {
    sendError(socket, "NOT_AUTHENTICATED", "Must authenticate first", clientMessageId);
    return;
  }

  switch (type) {
    case "auth": {
      const result = authPayloadSchema.safeParse(payload);
      if (!result.success) {
        sendError(socket, "INVALID_PAYLOAD", "Invalid auth payload", clientMessageId);
        return;
      }
      handleWsAuth(connectionId, socket, result.data.token);
      break;
    }

    case "chat:send": {
      const result = chatSendPayloadSchema.safeParse(payload);
      if (!result.success) {
        sendError(socket, "INVALID_PAYLOAD", "Invalid chat payload", clientMessageId);
        return;
      }
      handleChatSend(connectionId, result.data, clientMessageId);
      break;
    }

    case "chat:read": {
      const result = chatReadPayloadSchema.safeParse(payload);
      if (!result.success) {
        sendError(socket, "INVALID_PAYLOAD", "Invalid read receipt payload", clientMessageId);
        return;
      }
      handleChatRead(connectionId, result.data);
      break;
    }

    case "chat:typing": {
      const result = typingPayloadSchema.safeParse(payload);
      if (!result.success) {
        sendError(socket, "INVALID_PAYLOAD", "Invalid typing payload", clientMessageId);
        return;
      }
      handleTyping(connectionId, result.data);
      break;
    }

    default:
      sendError(socket, "UNKNOWN_TYPE", `Unknown message type: ${type}`, clientMessageId);
  }
}

function sendError(socket: WebSocket, code: string, message: string, replyTo?: string): void {
  const error: ServerMessage = {
    id: crypto.randomUUID(),
    type: "error",
    payload: { code, message, replyTo },
    timestamp: Date.now(),
    replyTo,
  };
  socket.send(JSON.stringify(error));
}
