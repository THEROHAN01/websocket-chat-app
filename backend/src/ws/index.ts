import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import { connectionManager } from "./connectionManager.js";
import { dispatch } from "./dispatcher.js";
import { setupWsAuth } from "../middleware/wsAuth.js";
import { updatePresence } from "../services/user.service.js";
import { broadcastPresence } from "./handlers/presence.handler.js";
import { logger } from "../utils/logger.js";

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server });

  // Heartbeat: ping every 30s, clean up dead connections after 10s no pong
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((socket) => {
      const ws = socket as WebSocket & { isAlive?: boolean };
      if (ws.isAlive === false) {
        logger.debug("Terminating dead connection");
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  wss.on("connection", (socket) => {
    const connectionId = crypto.randomUUID();
    const ws = socket as WebSocket & { isAlive?: boolean };
    ws.isAlive = true;

    connectionManager.add(connectionId, socket);
    setupWsAuth(connectionId, socket);

    logger.info("WebSocket connected", {
      connectionId,
      totalConnections: connectionManager.totalConnections,
    });

    ws.on("pong", () => {
      ws.isAlive = true;
    });

    socket.on("message", (data) => {
      try {
        dispatch(connectionId, socket, data.toString());
      } catch (err) {
        logger.error("Error handling WebSocket message", {
          connectionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    socket.on("close", () => {
      const userId = connectionManager.remove(connectionId);
      logger.info("WebSocket disconnected", {
        connectionId,
        userId,
        totalConnections: connectionManager.totalConnections,
      });

      // Update presence if user was authenticated and has no more connections
      if (userId && !connectionManager.isUserOnline(userId)) {
        updatePresence(userId, false)
          .then(() => broadcastPresence(userId, "offline"))
          .catch((err) => {
            logger.error("Failed to update presence on disconnect", {
              userId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
    });

    socket.on("error", (err) => {
      logger.error("WebSocket error", {
        connectionId,
        error: err.message,
      });
    });
  });

  logger.info("WebSocket server attached to HTTP server");
  return wss;
}
