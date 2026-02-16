import type { WebSocket } from "ws";
import { logger } from "../utils/logger.js";

export interface Connection {
  socket: WebSocket;
  userId?: string;
}

class ConnectionManager {
  private connections = new Map<string, Connection>();
  // userId -> Set of connectionIds (supports multi-device)
  private userConnections = new Map<string, Set<string>>();

  add(connectionId: string, socket: WebSocket): void {
    this.connections.set(connectionId, { socket });
    logger.debug("Connection added", { connectionId });
  }

  remove(connectionId: string): string | undefined {
    const conn = this.connections.get(connectionId);
    if (!conn) return undefined;

    const userId = conn.userId;
    if (userId) {
      const userConns = this.userConnections.get(userId);
      if (userConns) {
        userConns.delete(connectionId);
        if (userConns.size === 0) {
          this.userConnections.delete(userId);
        }
      }
    }

    this.connections.delete(connectionId);
    logger.debug("Connection removed", { connectionId, userId });
    return userId;
  }

  authenticate(connectionId: string, userId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.userId = userId;

    let userConns = this.userConnections.get(userId);
    if (!userConns) {
      userConns = new Set();
      this.userConnections.set(userId, userConns);
    }
    userConns.add(connectionId);

    logger.debug("Connection authenticated", { connectionId, userId });
  }

  getConnection(connectionId: string): Connection | undefined {
    return this.connections.get(connectionId);
  }

  getSocketsForUser(userId: string): WebSocket[] {
    const connIds = this.userConnections.get(userId);
    if (!connIds) return [];

    const sockets: WebSocket[] = [];
    for (const id of connIds) {
      const conn = this.connections.get(id);
      if (conn) sockets.push(conn.socket);
    }
    return sockets;
  }

  isUserOnline(userId: string): boolean {
    return this.userConnections.has(userId);
  }

  sendToUser(userId: string, data: string): boolean {
    let sent = false;
    for (const socket of this.getSocketsForUser(userId)) {
      if (socket.readyState === socket.OPEN) {
        socket.send(data);
        sent = true;
      }
    }
    return sent;
  }

  broadcast(data: string, excludeConnectionId?: string): void {
    for (const [id, conn] of this.connections) {
      if (id !== excludeConnectionId && conn.socket.readyState === conn.socket.OPEN) {
        conn.socket.send(data);
      }
    }
  }

  get totalConnections(): number {
    return this.connections.size;
  }

  get onlineUserCount(): number {
    return this.userConnections.size;
  }
}

export const connectionManager = new ConnectionManager();
