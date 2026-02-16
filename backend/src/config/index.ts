import dotenv from "dotenv";
dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env["PORT"] ?? "3000", 10),
  jwtSecret: requireEnv("JWT_SECRET"),
  databaseUrl: requireEnv("DATABASE_URL"),
  nodeEnv: process.env["NODE_ENV"] ?? "development",
} as const;
