import { prisma } from "../config/database.js";
import { NotFoundError } from "../utils/errors.js";

const publicUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  about: true,
  isOnline: true,
  lastSeen: true,
  createdAt: true,
} as const;

export async function getProfile(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUserSelect, email: true },
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export async function updateProfile(
  userId: string,
  data: { displayName?: string; avatarUrl?: string | null; about?: string },
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { ...publicUserSelect, email: true },
  });
  return user;
}

export async function getUserById(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });
  if (!user) throw new NotFoundError("User not found");
  return user;
}

export async function searchUsers(query: string, currentUserId: string) {
  const users = await prisma.user.findMany({
    where: {
      AND: [
        { id: { not: currentUserId } },
        {
          OR: [
            { username: { contains: query, mode: "insensitive" } },
            { displayName: { contains: query, mode: "insensitive" } },
          ],
        },
      ],
    },
    select: publicUserSelect,
    take: 20,
    orderBy: { username: "asc" },
  });
  return users;
}

export async function updatePresence(userId: string, isOnline: boolean) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isOnline,
      ...(isOnline ? {} : { lastSeen: new Date() }),
    },
  });
}
