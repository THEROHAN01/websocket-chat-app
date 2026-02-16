import { prisma } from "../config/database.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";
import { isParticipant } from "./conversation.service.js";

export async function sendMessage(
  senderId: string,
  conversationId: string,
  content: string,
  contentType: string = "TEXT",
  replyToId?: string,
) {
  // Verify sender is a participant
  if (!(await isParticipant(conversationId, senderId))) {
    throw new ForbiddenError("Not a participant of this conversation");
  }

  // Validate replyToId if provided
  if (replyToId) {
    const replyMsg = await prisma.message.findUnique({ where: { id: replyToId } });
    if (!replyMsg || replyMsg.conversationId !== conversationId) {
      throw new NotFoundError("Reply-to message not found in this conversation");
    }
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId,
      content,
      contentType: contentType.toUpperCase() as "TEXT" | "IMAGE" | "FILE" | "AUDIO" | "VIDEO" | "SYSTEM",
      ...(replyToId ? { replyToId } : {}),
    },
    include: {
      sender: { select: { id: true, username: true, displayName: true } },
      replyTo: {
        select: { id: true, content: true, senderId: true, sender: { select: { displayName: true } } },
      },
    },
  });

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return message;
}

export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit: number = 50,
) {
  if (!(await isParticipant(conversationId, userId))) {
    throw new ForbiddenError("Not a participant of this conversation");
  }

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
    },
    include: {
      sender: { select: { id: true, username: true, displayName: true } },
      replyTo: {
        select: { id: true, content: true, senderId: true, sender: { select: { displayName: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1, // Fetch one extra to detect hasMore
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = messages.length > limit;
  if (hasMore) messages.pop();

  return {
    messages: messages.reverse(),
    hasMore,
    nextCursor: hasMore ? messages[0]?.id : null,
  };
}

export async function getMessageById(messageId: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      sender: { select: { id: true, username: true, displayName: true } },
    },
  });
  if (!message) throw new NotFoundError("Message not found");
  return message;
}
