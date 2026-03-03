/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/middleware/error-handler.ts
 * @role Unified error handling middleware for web-ui server
 * @why Provide consistent error responses across all routes
 * @related unified-server.ts, routes/*.ts
 * @public_api errorHandler, asyncHandler
 * @invariants All errors must be logged, response format must be consistent
 * @side_effects Logs errors to console
 * @failure_modes None (error handler should never throw)
 *
 * @abdd.explain
 * @overview Centralized error handling with async wrapper
 * @what_it_does Catches errors, formats responses, logs details
 * @why_it_exists Ensures consistent error handling across all routes
 * @scope(in) Express request/response/next, async route handlers
 * @scope(out) JSON error responses, console logs
 */

import type { Request, Response, NextFunction } from "express";

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: string;
  details?: string;
  code?: string;
  timestamp: string;
}

/**
 * Success response format
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
}

/**
 * API response type (success or error)
 */
export type ApiResponse<T = unknown> = SuccessResponse<T> | ErrorResponse;

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: string,
  details?: string,
  code?: string
): ErrorResponse {
  return {
    success: false,
    error,
    details,
    code,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(data: T): SuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

/**
 * Async route handler wrapper with automatic error catching
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Global error handler middleware
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[web-ui] Error:", err);

  const statusCode = (err as Error & { status?: number }).status || 500;
  const errorResponse = createErrorResponse(
    err.message || "Internal server error",
    err.stack,
    (err as Error & { code?: string }).code
  );

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  const errorResponse = createErrorResponse(
    "Not found",
    `Route ${req.method} ${req.path} not found`,
    "NOT_FOUND"
  );

  res.status(404).json(errorResponse);
}
