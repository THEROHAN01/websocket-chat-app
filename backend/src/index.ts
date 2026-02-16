import { createServer } from "node:http";
import { config } from "./config/index.js";
import app from "./app.js";
import { setupWebSocket } from "./ws/index.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { logger } from "./utils/logger.js";

async function main() {
  await connectDatabase();

  const server = createServer(app);
  const wss = setupWebSocket(server);

  server.listen(config.port, () => {
    logger.info(`Server listening on port ${config.port}`, {
      port: config.port,
      env: config.nodeEnv,
    });
    logger.info(`HTTP:  http://localhost:${config.port}`);
    logger.info(`WS:    ws://localhost:${config.port}`);
    logger.info(`Health: http://localhost:${config.port}/health`);
  });

  // Graceful shutdown
  function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down...`);

    wss.clients.forEach((client) => {
      client.close(1001, "Server shutting down");
    });

    wss.close(() => {
      logger.info("WebSocket server closed");
      server.close(async () => {
        await disconnectDatabase();
        logger.info("HTTP server closed");
        process.exit(0);
      });
    });

    setTimeout(() => {
      logger.error("Forced shutdown after timeout");
      process.exit(1);
    }, 5000);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Failed to start server", { error: String(err) });
  process.exit(1);
});
