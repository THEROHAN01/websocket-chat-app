import type { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  logger.error("Unhandled error", {
    error: err.message,
    stack: err.stack,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
    },
  });
}
