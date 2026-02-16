import { prisma } from "../config/database.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../utils/errors.js";
import * as messageService from "./message.service.js";

const groupInclude = {
  conversation: {
    include: {
      participants: {
        include: {
          user: { select: { id: true, username: true, displayName: true, avatarUrl: true, isOnline: true } },
        },
      },
    },
  },
} as const;

export async function createGroup(
  creatorId: string,
  name: string,
  memberIds: string[],
  description?: string,
) {
  if (memberIds.length < 1) {
    throw new ValidationError("Group must have at least one other member");
  }

  // Ensure creator is not in memberIds, then add them
  const uniqueMembers = [...new Set([creatorId, ...memberIds])];

  // Verify all members exist
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueMembers } },
    select: { id: true },
  });
  if (users.length !== uniqueMembers.length) {
    throw new ValidationError("One or more users not found");
  }

  // Create conversation first, then group
  const conversation = await prisma.conversation.create({
    data: {
      type: "GROUP",
      participants: {
        create: uniqueMembers.map((id) => ({
          user: { connect: { id } },
          role: (id === creatorId ? "ADMIN" : "MEMBER") as "ADMIN" | "MEMBER",
        })),
      },
    },
  });

  const group = await prisma.group.create({
    data: {
      name,
      description: description ?? null,
      createdBy: creatorId,
      conversationId: conversation.id,
    },
    include: groupInclude,
  });

  // System message
  await messageService.sendMessage(
    creatorId,
    group.conversationId,
    `created the group "${name}"`,
    "SYSTEM",
  );

  return group;
}

export async function getGroupInfo(groupId: string) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: groupInclude,
  });
  if (!group) throw new NotFoundError("Group not found");
  return group;
}

export async function getGroupByConversationId(conversationId: string) {
  const group = await prisma.group.findUnique({
    where: { conversationId },
    include: groupInclude,
  });
  if (!group) throw new NotFoundError("Group not found");
  return group;
}

async function requireAdmin(conversationId: string, userId: string) {
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!participant) throw new ForbiddenError("Not a member of this group");
  if (participant.role !== "ADMIN") throw new ForbiddenError("Admin privileges required");
  return participant;
}

export async function updateGroupInfo(
  userId: string,
  groupId: string,
  data: { name?: string; description?: string; iconUrl?: string },
) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new NotFoundError("Group not found");

  await requireAdmin(group.conversationId, userId);

  const updated = await prisma.group.update({
    where: { id: groupId },
    data,
    include: groupInclude,
  });

  if (data.name) {
    await messageService.sendMessage(userId, group.conversationId, `changed the group name to "${data.name}"`, "SYSTEM");
  }

  return updated;
}

export async function addMembers(adminUserId: string, groupId: string, memberIds: string[]) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new NotFoundError("Group not found");

  await requireAdmin(group.conversationId, adminUserId);

  // Filter out already-existing participants
  const existing = await prisma.conversationParticipant.findMany({
    where: { conversationId: group.conversationId, userId: { in: memberIds } },
    select: { userId: true },
  });
  const existingIds = new Set(existing.map((e) => e.userId));
  const newMemberIds = memberIds.filter((id) => !existingIds.has(id));

  if (newMemberIds.length === 0) {
    throw new ValidationError("All users are already members");
  }

  await prisma.conversationParticipant.createMany({
    data: newMemberIds.map((userId) => ({
      conversationId: group.conversationId,
      userId,
      role: "MEMBER" as const,
    })),
  });

  // System messages
  const users = await prisma.user.findMany({ where: { id: { in: newMemberIds } }, select: { displayName: true } });
  const names = users.map((u) => u.displayName).join(", ");
  await messageService.sendMessage(adminUserId, group.conversationId, `added ${names}`, "SYSTEM");

  return getGroupInfo(groupId);
}

export async function removeMember(actorUserId: string, groupId: string, targetUserId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new NotFoundError("Group not found");

  // Either admin removing someone, or user leaving themselves
  if (actorUserId !== targetUserId) {
    await requireAdmin(group.conversationId, actorUserId);
  }

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: group.conversationId, userId: targetUserId } },
  });
  if (!participant) throw new NotFoundError("User is not a member");

  await prisma.conversationParticipant.delete({ where: { id: participant.id } });

  // If admin left, promote oldest member
  if (participant.role === "ADMIN") {
    const nextAdmin = await prisma.conversationParticipant.findFirst({
      where: { conversationId: group.conversationId },
      orderBy: { joinedAt: "asc" },
    });
    if (nextAdmin) {
      await prisma.conversationParticipant.update({
        where: { id: nextAdmin.id },
        data: { role: "ADMIN" },
      });
    }
  }

  const targetUser = await prisma.user.findUnique({ where: { id: targetUserId }, select: { displayName: true } });
  if (actorUserId === targetUserId) {
    await messageService.sendMessage(actorUserId, group.conversationId, `${targetUser?.displayName ?? "Someone"} left the group`, "SYSTEM");
  } else {
    await messageService.sendMessage(actorUserId, group.conversationId, `removed ${targetUser?.displayName ?? "someone"}`, "SYSTEM");
  }

  return getGroupInfo(groupId);
}

export async function updateMemberRole(
  adminUserId: string,
  groupId: string,
  targetUserId: string,
  role: "ADMIN" | "MEMBER",
) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new NotFoundError("Group not found");

  await requireAdmin(group.conversationId, adminUserId);

  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: group.conversationId, userId: targetUserId } },
  });
  if (!participant) throw new NotFoundError("User is not a member");

  await prisma.conversationParticipant.update({
    where: { id: participant.id },
    data: { role },
  });

  return getGroupInfo(groupId);
}
