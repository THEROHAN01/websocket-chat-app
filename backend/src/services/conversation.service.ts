import { prisma } from "../config/database.js";
import { NotFoundError, ForbiddenError, ValidationError } from "../utils/errors.js";

export async function getOrCreateDirectConversation(userId1: string, userId2: string) {
  if (userId1 === userId2) {
    throw new ValidationError("Cannot create conversation with yourself");
  }

  // Check if direct conversation already exists between these two users
  const existing = await prisma.conversation.findFirst({
    where: {
      type: "DIRECT",
      AND: [
        { participants: { some: { userId: userId1 } } },
        { participants: { some: { userId: userId2 } } },
      ],
    },
    include: {
      participants: {
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, lastSeen: true } } },
      },
    },
  });

  if (existing) return existing;

  // Verify target user exists
  const targetUser = await prisma.user.findUnique({ where: { id: userId2 } });
  if (!targetUser) throw new NotFoundError("User not found");

  // Create new direct conversation
  const conversation = await prisma.conversation.create({
    data: {
      type: "DIRECT",
      participants: {
        create: [
          { userId: userId1 },
          { userId: userId2 },
        ],
      },
    },
    include: {
      participants: {
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, lastSeen: true } } },
      },
    },
  });

  return conversation;
}

export async function getConversationsForUser(userId: string) {
  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { userId } },
    },
    include: {
      participants: {
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, lastSeen: true } } },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { sender: { select: { id: true, displayName: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Calculate unread counts
  return Promise.all(
    conversations.map(async (conv) => {
      const participant = conv.participants.find((p) => p.userId === userId);
      const unreadCount = participant?.lastReadAt
        ? await prisma.message.count({
            where: {
              conversationId: conv.id,
              createdAt: { gt: participant.lastReadAt },
              senderId: { not: userId },
            },
          })
        : await prisma.message.count({
            where: {
              conversationId: conv.id,
              senderId: { not: userId },
            },
          });

      return {
        ...conv,
        lastMessage: conv.messages[0] ?? null,
        messages: undefined,
        unreadCount,
      };
    }),
  );
}

export async function getConversationById(conversationId: string, userId: string) {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      participants: {
        include: { user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, lastSeen: true } } },
      },
    },
  });

  if (!conversation) throw new NotFoundError("Conversation not found");

  const isParticipant = conversation.participants.some((p) => p.userId === userId);
  if (!isParticipant) throw new ForbiddenError("Not a participant of this conversation");

  return conversation;
}

export async function getParticipantUserIds(conversationId: string): Promise<string[]> {
  const participants = await prisma.conversationParticipant.findMany({
    where: { conversationId },
    select: { userId: true },
  });
  return participants.map((p) => p.userId);
}

export async function isParticipant(conversationId: string, userId: string): Promise<boolean> {
  const p = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return p !== null;
}
