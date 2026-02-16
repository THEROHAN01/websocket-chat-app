import type { WebSocket } from "ws";
import { verifyAccessToken, type JwtPayload } from "../services/auth.service.js";
import { connectionManager } from "../ws/connectionManager.js";
import { updatePresence } from "../services/user.service.js";
import { broadcastPresence } from "../ws/handlers/presence.handler.js";
import { logger } from "../utils/logger.js";
import type { ServerMessage } from "../types/ws-messages.js";

const AUTH_TIMEOUT_MS = 5000;

export function setupWsAuth(connectionId: string, socket: WebSocket): void {
  const timeout = setTimeout(() => {
    if (!connectionManager.getConnection(connectionId)?.userId) {
      logger.warn("WebSocket auth timeout", { connectionId });
      const msg: ServerMessage = {
        id: crypto.randomUUID(),
        type: "auth:error",
        payload: { message: "Authentication timeout" },
        timestamp: Date.now(),
      };
      socket.send(JSON.stringify(msg));
      socket.close(4001, "Authentication timeout");
    }
  }, AUTH_TIMEOUT_MS);

  // Store timeout so we can clear it on successful auth
  (socket as WebSocket & { __authTimeout?: ReturnType<typeof setTimeout> }).__authTimeout = timeout;
}

export function handleWsAuth(
  connectionId: string,
  socket: WebSocket,
  token: string,
): JwtPayload | null {
  try {
    const payload = verifyAccessToken(token);
    connectionManager.authenticate(connectionId, payload.userId);

    // Clear auth timeout
    const s = socket as WebSocket & { __authTimeout?: ReturnType<typeof setTimeout> };
    if (s.__authTimeout) {
      clearTimeout(s.__authTimeout);
      delete s.__authTimeout;
    }

    const response: ServerMessage = {
      id: crypto.randomUUID(),
      type: "auth:success",
      payload: { userId: payload.userId },
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(response));

    logger.info("WebSocket authenticated", { connectionId, userId: payload.userId });

    // Update presence to online and broadcast
    updatePresence(payload.userId, true)
      .then(() => broadcastPresence(payload.userId, "online"))
      .catch((err) => {
        logger.error("Failed to update presence on auth", {
          userId: payload.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return payload;
  } catch {
    const errorMsg: ServerMessage = {
      id: crypto.randomUUID(),
      type: "auth:error",
      payload: { message: "Invalid token" },
      timestamp: Date.now(),
    };
    socket.send(JSON.stringify(errorMsg));
    socket.close(4001, "Invalid token");
    return null;
  }
}
