import { Router } from "express";
import { connectionManager } from "../ws/connectionManager.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    wsConnections: connectionManager.totalConnections,
    onlineUsers: connectionManager.onlineUserCount,
  });
});

export default router;
