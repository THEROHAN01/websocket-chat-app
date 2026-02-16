import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import * as userController from "../controllers/user.controller.js";
import { validate, validateQuery } from "../middleware/validate.js";
import { updateProfileSchema, searchUsersSchema } from "../validators/user.validator.js";

const router = Router();

router.get("/api/users/search", requireAuth, validateQuery(searchUsersSchema), (req, res, next) => {
  userController.searchUsers(req as AuthenticatedRequest, res, next);
});

router.get("/api/users/me", requireAuth, (req, res, next) => {
  userController.getMe(req as AuthenticatedRequest, res, next);
});

router.put("/api/users/me", requireAuth, validate(updateProfileSchema), (req, res, next) => {
  userController.updateMe(req as AuthenticatedRequest, res, next);
});

router.get("/api/users/:id", requireAuth, (req, res, next) => {
  userController.getUserById(req as AuthenticatedRequest, res, next);
});

export default router;
