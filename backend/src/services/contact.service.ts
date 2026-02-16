import { prisma } from "../config/database.js";
import { NotFoundError, ValidationError } from "../utils/errors.js";

export async function addContact(userId: string, contactId: string, nickname?: string) {
  if (userId === contactId) throw new ValidationError("Cannot add yourself as a contact");

  const user = await prisma.user.findUnique({ where: { id: contactId } });
  if (!user) throw new NotFoundError("User not found");

  const contact = await prisma.contact.create({
    data: {
      userId,
      contactId,
      nickname: nickname ?? null,
    },
    include: {
      contact: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, lastSeen: true } },
    },
  });
  return contact;
}

export async function removeContact(userId: string, contactId: string) {
  await prisma.contact.deleteMany({ where: { userId, contactId } });
}

export async function getContacts(userId: string) {
  const contacts = await prisma.contact.findMany({
    where: { userId },
    include: {
      contact: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true, lastSeen: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return contacts;
}

export async function updateNickname(userId: string, contactId: string, nickname: string | null) {
  const contact = await prisma.contact.findUnique({
    where: { userId_contactId: { userId, contactId } },
  });
  if (!contact) throw new NotFoundError("Contact not found");

  return prisma.contact.update({
    where: { id: contact.id },
    data: { nickname },
  });
}

export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new ValidationError("Cannot block yourself");

  await prisma.block.create({
    data: { blockerId: userId, blockedId: targetId },
  });

  // Remove from contacts if exists
  await prisma.contact.deleteMany({ where: { userId, contactId: targetId } });
}

export async function unblockUser(userId: string, targetId: string) {
  await prisma.block.deleteMany({ where: { blockerId: userId, blockedId: targetId } });
}

export async function getBlockedUsers(userId: string) {
  const blocks = await prisma.block.findMany({
    where: { blockerId: userId },
    include: {
      blocked: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
    },
  });
  return blocks;
}

export async function isBlocked(userId: string, targetId: string): Promise<boolean> {
  const block = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedId: targetId },
        { blockerId: targetId, blockedId: userId },
      ],
    },
  });
  return block !== null;
}
