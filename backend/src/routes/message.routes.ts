import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import * as messageController from "../controllers/message.controller.js";

const router = Router();

router.get("/api/messages/search", requireAuth, (req, res, next) => {
  messageController.searchMessages(req as AuthenticatedRequest, res, next);
});

router.put("/api/messages/:id", requireAuth, (req, res, next) => {
  messageController.editMessage(req as AuthenticatedRequest, res, next);
});

router.delete("/api/messages/:id", requireAuth, (req, res, next) => {
  messageController.deleteMessage(req as AuthenticatedRequest, res, next);
});

router.post("/api/messages/forward", requireAuth, (req, res, next) => {
  messageController.forwardMessage(req as AuthenticatedRequest, res, next);
});

router.post("/api/messages/:id/star", requireAuth, (req, res, next) => {
  messageController.starMessage(req as AuthenticatedRequest, res, next);
});

export default router;
