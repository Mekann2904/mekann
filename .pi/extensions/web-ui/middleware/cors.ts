/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/middleware/cors.ts
 * @role CORS and security middleware for HTTP server
 * @why Provide reusable security middleware for Express server
 * @related server.ts, middleware/errorHandler.ts
 * @public_api securityHeaders, corsMiddleware
 * @invariants CORS validation must be consistent across all requests
 * @side_effects Sets HTTP response headers
 * @failure_modes CORS rejection returns 403
 *
 * @abdd.explain
 * @overview CORS and security header middleware functions
 * @what_it_does Validates CORS origins, sets security headers (X-Content-Type-Options, X-Frame-Options, etc.)
 * @why_it_exists Centralizes security middleware for reuse and maintainability
 * @scope(in) HTTP requests with Origin header
 * @scope(out) HTTP responses with security headers
 */

import type { Request, Response } from "express";

// セキュリティ設定: CORS
const CORS_ORIGIN = process.env.PI_CORS_ORIGIN || "http://localhost:*";
const CORS_ALLOWED_ORIGINS = CORS_ORIGIN.split(",").map((o) => o.trim());

/**
 * @summary CORSオリジンを検証する
 * @param origin - リクエストのOriginヘッダー
 * @returns 許可される場合はtrue
 */
export function isCorsAllowed(origin: string | undefined): boolean {
	if (!origin) return true;
	if (CORS_ALLOWED_ORIGINS.includes("*")) return true;
	if (CORS_ALLOWED_ORIGINS.includes(origin)) return true;
	for (const allowed of CORS_ALLOWED_ORIGINS) {
		if (allowed.endsWith("*") && origin.startsWith(allowed.slice(0, -1))) {
			return true;
		}
	}
	return false;
}

/**
 * @summary セキュリティヘッダーを設定するミドルウェア（簡易helmet）
 * @param _req - リクエスト
 * @param res - レスポンス
 * @param next - 次のミドルウェア
 */
export function securityHeaders(_req: Request, res: Response, next: () => void): void {
	// X-Content-Type-Options: MIMEタイプスニッフィング防止
	res.setHeader("X-Content-Type-Options", "nosniff");
	// X-Frame-Options: クリックジャッキング防止
	res.setHeader("X-Frame-Options", "DENY");
	// X-XSS-Protection: XSSフィルター有効化（レガシーブラウザ用）
	res.setHeader("X-XSS-Protection", "1; mode=block");
	// Referrer-Policy: リファラー情報の制限
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	// Cache-Control: APIレスポンスのキャッシュ防止
	if (_req.path.startsWith("/api/")) {
		res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
	}
	next();
}

/**
 * @summary CORSヘッダーを設定するミドルウェア
 * @param req - リクエスト
 * @param res - レスポンス
 * @param next - 次のミドルウェア
 */
export function corsMiddleware(req: Request, res: Response, next: () => void): void {
	const origin = req.headers.origin;
	if (!isCorsAllowed(origin)) {
		res.status(403).json({ error: "CORS policy blocked" });
		return;
	}
	const corsOrigin = origin && isCorsAllowed(origin) ? origin : CORS_ALLOWED_ORIGINS[0];
	res.setHeader("Access-Control-Allow-Origin", corsOrigin || "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");
	res.setHeader("Access-Control-Allow-Credentials", "true");
	if (req.method === "OPTIONS") {
		res.status(204).end();
		return;
	}
	next();
}
