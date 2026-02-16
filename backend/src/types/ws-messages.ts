// ---- Client -> Server messages ----

export interface ClientMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
}

export type ClientMessageType =
  | { type: "auth"; payload: { token: string } }
  | { type: "chat:send"; payload: { conversationId: string; content: string; contentType?: string; replyToMessageId?: string } }
  | { type: "chat:typing"; payload: { conversationId: string; isTyping: boolean } }
  | { type: "chat:read"; payload: { conversationId: string; messageId: string } }
  | { type: "presence:update"; payload: { status: "online" | "away" } };

// ---- Server -> Client messages ----

export interface ServerMessage {
  id: string;
  type: string;
  payload: unknown;
  timestamp: number;
  replyTo?: string | undefined;
  error?: { code: string; message: string } | undefined;
}

export type ServerMessageType =
  | { type: "auth:success"; payload: { userId: string } }
  | { type: "auth:error"; payload: { message: string } }
  | { type: "chat:receive"; payload: { messageId: string; senderId: string; senderName: string; conversationId: string; content: string; contentType: string; timestamp: number; replyTo?: { id: string; content: string; senderId: string } } }
  | { type: "chat:sent"; payload: { clientMessageId: string; messageId: string; timestamp: number } }
  | { type: "chat:delivered"; payload: { messageId: string; conversationId: string } }
  | { type: "chat:read"; payload: { messageId: string; conversationId: string; readBy: string } }
  | { type: "chat:typing"; payload: { conversationId: string; userId: string; isTyping: boolean } }
  | { type: "chat:deleted"; payload: { messageId: string; conversationId: string } }
  | { type: "chat:edited"; payload: { messageId: string; conversationId: string; newContent: string; editedAt: number } }
  | { type: "presence:update"; payload: { userId: string; status: "online" | "offline"; lastSeen?: number } }
  | { type: "notification:unread"; payload: { conversationId: string; unreadCount: number; lastMessage: { preview: string; senderName: string; timestamp: number } } }
  | { type: "error"; payload: { code: string; message: string; replyTo?: string } };
