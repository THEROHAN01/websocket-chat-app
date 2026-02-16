import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import * as contactController from "../controllers/contact.controller.js";

const router = Router();

router.get("/api/contacts", requireAuth, (req, res, next) => {
  contactController.list(req as AuthenticatedRequest, res, next);
});

router.post("/api/contacts", requireAuth, (req, res, next) => {
  contactController.add(req as AuthenticatedRequest, res, next);
});

router.delete("/api/contacts/:userId", requireAuth, (req, res, next) => {
  contactController.remove(req as AuthenticatedRequest, res, next);
});

router.post("/api/contacts/block", requireAuth, (req, res, next) => {
  contactController.block(req as AuthenticatedRequest, res, next);
});

router.delete("/api/contacts/block/:userId", requireAuth, (req, res, next) => {
  contactController.unblock(req as AuthenticatedRequest, res, next);
});

router.get("/api/contacts/blocked", requireAuth, (req, res, next) => {
  contactController.blockedList(req as AuthenticatedRequest, res, next);
});

export default router;
