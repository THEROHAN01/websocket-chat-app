export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthenticationError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "AUTHENTICATION_ERROR", message);
    this.name = "AuthenticationError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(400, "VALIDATION_ERROR", message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Access denied") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}
