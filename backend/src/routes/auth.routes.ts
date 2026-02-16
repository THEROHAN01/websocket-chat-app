import { Router } from "express";
import * as authController from "../controllers/auth.controller.js";
import { validate } from "../middleware/validate.js";
import { registerSchema, loginSchema, refreshSchema, logoutSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/api/auth/register", validate(registerSchema), authController.register);
router.post("/api/auth/login", validate(loginSchema), authController.login);
router.post("/api/auth/refresh", validate(refreshSchema), authController.refresh);
router.post("/api/auth/logout", validate(logoutSchema), authController.logout);

export default router;
