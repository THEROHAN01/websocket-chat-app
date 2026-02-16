import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import * as groupController from "../controllers/group.controller.js";

const router = Router();

router.post("/api/groups", requireAuth, (req, res, next) => {
  groupController.create(req as AuthenticatedRequest, res, next);
});

router.get("/api/groups/:id", requireAuth, (req, res, next) => {
  groupController.getInfo(req as AuthenticatedRequest, res, next);
});

router.put("/api/groups/:id", requireAuth, (req, res, next) => {
  groupController.update(req as AuthenticatedRequest, res, next);
});

router.post("/api/groups/:id/members", requireAuth, (req, res, next) => {
  groupController.addMembers(req as AuthenticatedRequest, res, next);
});

router.delete("/api/groups/:id/members/:userId", requireAuth, (req, res, next) => {
  groupController.removeMember(req as AuthenticatedRequest, res, next);
});

router.put("/api/groups/:id/members/:userId/role", requireAuth, (req, res, next) => {
  groupController.updateRole(req as AuthenticatedRequest, res, next);
});

export default router;
