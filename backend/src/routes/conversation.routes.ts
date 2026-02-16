import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import * as conversationController from "../controllers/conversation.controller.js";

const router = Router();

router.get("/api/conversations", requireAuth, (req, res, next) => {
  conversationController.list(req as AuthenticatedRequest, res, next);
});

router.get("/api/conversations/:id", requireAuth, (req, res, next) => {
  conversationController.getById(req as AuthenticatedRequest, res, next);
});

router.get("/api/conversations/:id/messages", requireAuth, (req, res, next) => {
  conversationController.getMessages(req as AuthenticatedRequest, res, next);
});

router.post("/api/conversations/direct", requireAuth, (req, res, next) => {
  conversationController.createDirect(req as AuthenticatedRequest, res, next);
});

export default router;
