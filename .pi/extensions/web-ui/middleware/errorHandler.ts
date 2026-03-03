/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/middleware/errorHandler.ts
 * @role Error handling middleware for HTTP server
 * @why Centralize error handling logic for Express server
 * @related server.ts, middleware/cors.ts
 * @public_api asyncHandler, ApiError
 * @invariants Errors must always return proper JSON response
 * @side_effects Logs errors to console
 * @failure_modes None (error handler itself)
 *
 * @abdd.explain
 * @overview Error handling utilities and middleware
 * @what_it_does Wraps async route handlers, provides structured error responses
 * @why_it_exists Simplifies error handling in route handlers
 * @scope(in) Route handlers, errors
 * @scope(out) JSON error responses
 */

import type { Request, Response, NextFunction } from "express";

/**
 * @summary API error with status code
 */
export class ApiError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public details?: string
	) {
		super(message);
		this.name = "ApiError";
	}
}

/**
 * @summary Wrap async route handler to catch errors
 * @param fn - Async route handler function
 * @returns Express middleware that handles async errors
 */
export function asyncHandler(
	fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => void {
	return (req: Request, res: Response, next: NextFunction): void => {
		Promise.resolve(fn(req, res, next)).catch(next);
	};
}

/**
 * @summary Global error handler middleware
 * @param err - Error object
 * @param _req - Request
 * @param res - Response
 * @param _next - Next function
 */
export function errorHandler(
	err: Error,
	_req: Request,
	res: Response,
	_next: NextFunction
): void {
	console.error("[web-ui] Error:", err.message);

	if (err instanceof ApiError) {
		res.status(err.statusCode).json({
			success: false,
			error: err.message,
			details: err.details,
		});
		return;
	}

	res.status(500).json({
		success: false,
		error: "Internal server error",
		details: err.message,
	});
}
