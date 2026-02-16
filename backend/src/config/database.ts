import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { config } from "./index.js";
import { logger } from "../utils/logger.js";

const pool = new pg.Pool({ connectionString: config.databaseUrl });
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

export async function connectDatabase(): Promise<void> {
  try {
    // Test connection
    const client = await pool.connect();
    client.release();
    logger.info("Database connected");
  } catch (error) {
    logger.error("Database connection failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
  logger.info("Database disconnected");
}
