/**
 * Application error hierarchy. Services throw these; the API handler maps them to
 * HTTP responses so business code never deals with status codes.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(message, 403, "FORBIDDEN");
  }
}

/** Also used for resources the user is not authorised to see, to avoid leaking existence. */
export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super(message, 409, "CONFLICT", details);
  }
}

/** A business rule (e.g. a workflow guard) prevented the operation. */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "BUSINESS_RULE_VIOLATION", details);
  }
}

/**
 * Optimistic-concurrency failure: the record's `version` moved on since the client loaded it.
 * The UI keeps the user's draft and offers to reload (code STALE_VERSION).
 */
export class StaleVersionError extends AppError {
  constructor(message = "This was changed by someone else – reload to see their changes.") {
    super(message, 409, "STALE_VERSION");
  }
}
