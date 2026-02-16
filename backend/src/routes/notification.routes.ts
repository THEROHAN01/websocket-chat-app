import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { prisma } from "../config/database.js";

const router = Router();

router.get("/api/notifications/unread", requireAuth, async (req, res, next) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user.userId;

    const participants = await prisma.conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    });

    let totalUnread = 0;
    const perConversation: { conversationId: string; unreadCount: number }[] = [];

    for (const p of participants) {
      const count = await prisma.message.count({
        where: {
          conversationId: p.conversationId,
          senderId: { not: userId },
          ...(p.lastReadAt ? { createdAt: { gt: p.lastReadAt } } : {}),
        },
      });
      if (count > 0) {
        perConversation.push({ conversationId: p.conversationId, unreadCount: count });
        totalUnread += count;
      }
    }

    res.json({ totalUnread, conversations: perConversation });
  } catch (err) {
    next(err);
  }
});

export default router;
