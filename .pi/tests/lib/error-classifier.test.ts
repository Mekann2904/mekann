/**
 * @file .pi/lib/error-classifier.ts の単体テスト
 * @description エラー分類機能のテスト
 * @testFramework vitest
 */

import { describe, it, expect } from "vitest";
import {
	classifyErrorDetailed,
	isErrorRetryable,
	getErrorUserMessage,
	computeBackoffDelayFromClassification,
	type ErrorCategory,
	type ErrorClassification,
} from "../../lib/error-classifier.js";

describe("classifyErrorDetailed", () => {
	describe("HTTPステータスコードベースの分類", () => {
		describe("401 Unauthorized", () => {
			it("should classify 401 as auth_error", () => {
				const error = { status: 401 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("auth_error");
				expect(result.retryable).toBe(false);
				expect(result.backoffStrategy).toBe("none");
				expect(result.maxRetries).toBe(0);
				expect(result.baseDelayMs).toBe(0);
				expect(result.userMessage).toContain("Authentication failed");
			});
		});

		describe("403 Forbidden", () => {
			it("should classify 403 as auth_error", () => {
				const error = { status: 403 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("auth_error");
				expect(result.retryable).toBe(false);
			});
		});

		describe("429 Rate Limit", () => {
			it("should classify 429 as rate_limit", () => {
				const error = { status: 429 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("rate_limit");
				expect(result.retryable).toBe(true);
				expect(result.backoffStrategy).toBe("exponential");
				expect(result.maxRetries).toBe(4);
				expect(result.baseDelayMs).toBe(1000);
			});
		});

		describe("502 Bad Gateway", () => {
			it("should classify 502 as network_transient", () => {
				const error = { status: 502 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_transient");
				expect(result.retryable).toBe(true);
				expect(result.backoffStrategy).toBe("exponential");
				expect(result.maxRetries).toBe(3);
				expect(result.baseDelayMs).toBe(2000);
			});
		});

		describe("503 Service Unavailable", () => {
			it("should classify 503 as network_transient", () => {
				const error = { status: 503 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_transient");
				expect(result.retryable).toBe(true);
			});
		});

		describe("504 Gateway Timeout", () => {
			it("should classify 504 as network_transient", () => {
				const error = { status: 504 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_transient");
				expect(result.retryable).toBe(true);
			});
		});

		describe("500 Internal Server Error", () => {
			it("should classify 500 as provider_error by default", () => {
				const error = { status: 500, message: "Something went wrong" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("provider_error");
				expect(result.retryable).toBe(true);
				expect(result.maxRetries).toBe(2);
			});

			it("should classify 500 with 'overloaded' as capacity", () => {
				const error = { status: 500, message: "Server is overloaded" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("capacity");
				expect(result.retryable).toBe(true);
				expect(result.maxRetries).toBe(3);
				expect(result.baseDelayMs).toBe(5000);
			});

			it("should classify 500 with 'capacity' as capacity", () => {
				const error = { status: 500, message: "At capacity" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("capacity");
			});
		});

		describe("400 Bad Request", () => {
			it("should classify 400 as validation_error by default", () => {
				const error = { status: 400, message: "Invalid input" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("validation_error");
				expect(result.retryable).toBe(false);
			});

			it("should classify 400 with 'context_length' as resource_exhausted", () => {
				const error = { status: 400, message: "context_length_exceeded" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("resource_exhausted");
				expect(result.retryable).toBe(false);
			});

			it("should classify 400 with 'token' as resource_exhausted", () => {
				const error = { status: 400, message: "Max tokens exceeded" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("resource_exhausted");
			});
		});

		describe("408 Request Timeout", () => {
			it("should classify 408 as timeout", () => {
				const error = { status: 408 };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("timeout");
				expect(result.retryable).toBe(true);
				expect(result.backoffStrategy).toBe("linear");
				expect(result.maxRetries).toBe(2);
				expect(result.baseDelayMs).toBe(5000);
			});
		});
	});

	describe("エラーメッセージベースの分類", () => {
		describe("タイムアウト系", () => {
			it("should classify 'timeout' message as timeout", () => {
				const error = { message: "Connection timeout" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("timeout");
				expect(result.retryable).toBe(true);
			});

			it("should classify 'timed out' message as timeout", () => {
				const error = { message: "Request timed out" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("timeout");
			});

			it("should classify 'ETIMEDOUT' message as timeout", () => {
				const error = { message: "ETIMEDOUT error" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("timeout");
			});
		});

		describe("ネットワークエラー（恒久的）", () => {
			it("should classify 'ECONNREFUSED' as network_permanent", () => {
				const error = { message: "ECONNREFUSED" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_permanent");
				expect(result.retryable).toBe(false);
			});

			it("should classify 'ENOTFOUND' as network_permanent", () => {
				const error = { message: "ENOTFOUND example.com" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_permanent");
				expect(result.retryable).toBe(false);
			});

			it("should classify 'net::err' as network_permanent", () => {
				const error = { message: "net::err_connection_refused" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_permanent");
			});
		});

		describe("ネットワークエラー（一時的）", () => {
			it("should classify 'ECONNRESET' as network_transient", () => {
				const error = { message: "ECONNRESET" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_transient");
				expect(result.retryable).toBe(true);
			});

			it("should classify 'socket hang up' as network_transient", () => {
				const error = { message: "socket hang up" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("network_transient");
				expect(result.retryable).toBe(true);
			});
		});

		describe("レートリミット系", () => {
			it("should classify 'rate limit' message as rate_limit", () => {
				const error = { message: "Rate limit exceeded" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("rate_limit");
				expect(result.retryable).toBe(true);
			});

			it("should classify 'too many requests' message as rate_limit", () => {
				const error = { message: "Too many requests" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("rate_limit");
			});

			it("should classify 'quota exceeded' message as rate_limit", () => {
				const error = { message: "Quota exceeded for today" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("rate_limit");
			});
		});

		describe("容量関連", () => {
			it("should classify 'overloaded' message as capacity", () => {
				const error = { message: "System is overloaded" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("capacity");
				expect(result.retryable).toBe(true);
			});

			it("should classify 'temporarily unavailable' message as capacity", () => {
				const error = { message: "Service temporarily unavailable" };
				const result = classifyErrorDetailed(error);

				expect(result.category).toBe("capacity");
			});
		});
	});

	describe("未知のエラー", () => {
		it("should classify unknown errors as unknown", () => {
			const error = { message: "Some random error" };
			const result = classifyErrorDetailed(error);

			expect(result.category).toBe("unknown");
			expect(result.retryable).toBe(false);
			expect(result.backoffStrategy).toBe("none");
		});

		it("should truncate long messages in userMessage", () => {
			const longMessage = "a".repeat(200);
			const error = { message: longMessage };
			const result = classifyErrorDetailed(error);

			expect(result.userMessage.length).toBeLessThanOrEqual(100 + "Unknown error: ".length);
		});
	});

	describe("Anthropic API エラー形式", () => {
		it("should extract status from nested error object", () => {
			const error = {
				error: {
					status: 429,
				},
			};
			const result = classifyErrorDetailed(error);

			expect(result.category).toBe("rate_limit");
		});

		it("should extract status from statusCode field", () => {
			const error = {
				statusCode: 503,
			};
			const result = classifyErrorDetailed(error);

			expect(result.category).toBe("network_transient");
		});
	});

	describe("Error インスタンス", () => {
		it("should handle Error instances", () => {
			const error = new Error("timeout occurred");
			const result = classifyErrorDetailed(error);

			expect(result.category).toBe("timeout");
		});
	});

	describe("文字列エラー", () => {
		it("should handle string errors", () => {
			const result = classifyErrorDetailed("rate limit hit");

			expect(result.category).toBe("rate_limit");
		});
	});

	describe("境界条件", () => {
		it("should handle null error", () => {
			const result = classifyErrorDetailed(null);

			expect(result.category).toBe("unknown");
		});

		it("should handle undefined error", () => {
			const result = classifyErrorDetailed(undefined);

			expect(result.category).toBe("unknown");
		});

		it("should handle empty object", () => {
			const result = classifyErrorDetailed({});

			expect(result.category).toBe("unknown");
		});

		it("should handle number error", () => {
			const result = classifyErrorDetailed(500);

			expect(result.category).toBe("unknown");
		});

		it("should handle case-insensitive message matching", () => {
			const error1 = { message: "TIMEOUT" };
			const error2 = { message: "Rate LIMIT" };

			expect(classifyErrorDetailed(error1).category).toBe("timeout");
			expect(classifyErrorDetailed(error2).category).toBe("rate_limit");
		});
	});
});

describe("isErrorRetryable", () => {
	it("should return true for retryable errors", () => {
		expect(isErrorRetryable({ status: 429 })).toBe(true);
		expect(isErrorRetryable({ status: 503 })).toBe(true);
		expect(isErrorRetryable({ message: "timeout" })).toBe(true);
		expect(isErrorRetryable({ message: "ECONNRESET" })).toBe(true);
	});

	it("should return false for non-retryable errors", () => {
		expect(isErrorRetryable({ status: 401 })).toBe(false);
		expect(isErrorRetryable({ status: 403 })).toBe(false);
		expect(isErrorRetryable({ status: 400 })).toBe(false);
		expect(isErrorRetryable({ message: "ECONNREFUSED" })).toBe(false);
	});
});

describe("getErrorUserMessage", () => {
	it("should return user-friendly message for auth errors", () => {
		const message = getErrorUserMessage({ status: 401 });
		expect(message).toContain("Authentication failed");
	});

	it("should return user-friendly message for rate limit", () => {
		const message = getErrorUserMessage({ status: 429 });
		expect(message).toContain("Rate limit");
	});

	it("should return user-friendly message for timeout", () => {
		const message = getErrorUserMessage({ status: 408 });
		expect(message).toContain("timed out");
	});

	it("should include truncated message for unknown errors", () => {
		const message = getErrorUserMessage({ message: "custom error" });
		expect(message).toContain("Unknown error");
	});
});

describe("computeBackoffDelayFromClassification", () => {
	describe("backoffStrategy: none", () => {
		it("should return 0", () => {
			const classification: ErrorClassification = {
				category: "auth_error",
				retryable: false,
				backoffStrategy: "none",
				maxRetries: 0,
				baseDelayMs: 1000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(1, classification)).toBe(0);
		});
	});

	describe("backoffStrategy: fixed", () => {
		it("should return baseDelayMs regardless of attempt", () => {
			const classification: ErrorClassification = {
				category: "rate_limit",
				retryable: true,
				backoffStrategy: "fixed",
				maxRetries: 3,
				baseDelayMs: 1000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(1, classification)).toBe(1000);
			expect(computeBackoffDelayFromClassification(2, classification)).toBe(1000);
			expect(computeBackoffDelayFromClassification(5, classification)).toBe(1000);
		});
	});

	describe("backoffStrategy: linear", () => {
		it("should return baseDelayMs * attempt", () => {
			const classification: ErrorClassification = {
				category: "timeout",
				retryable: true,
				backoffStrategy: "linear",
				maxRetries: 2,
				baseDelayMs: 5000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(1, classification)).toBe(5000);
			expect(computeBackoffDelayFromClassification(2, classification)).toBe(10000);
			expect(computeBackoffDelayFromClassification(3, classification)).toBe(15000);
		});
	});

	describe("backoffStrategy: exponential", () => {
		it("should return baseDelayMs * 2^(attempt-1)", () => {
			const classification: ErrorClassification = {
				category: "rate_limit",
				retryable: true,
				backoffStrategy: "exponential",
				maxRetries: 4,
				baseDelayMs: 1000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(1, classification)).toBe(1000);
			expect(computeBackoffDelayFromClassification(2, classification)).toBe(2000);
			expect(computeBackoffDelayFromClassification(3, classification)).toBe(4000);
			expect(computeBackoffDelayFromClassification(4, classification)).toBe(8000);
		});

		it("should cap at 60000ms", () => {
			const classification: ErrorClassification = {
				category: "rate_limit",
				retryable: true,
				backoffStrategy: "exponential",
				maxRetries: 10,
				baseDelayMs: 1000,
				userMessage: "",
			};

			// 2^16 = 65536, * 1000 = 65536000 > 60000
			expect(computeBackoffDelayFromClassification(17, classification)).toBe(60000);
		});
	});

	describe("境界条件", () => {
		it("should handle attempt 0 (use 1 as minimum)", () => {
			const classification: ErrorClassification = {
				category: "timeout",
				retryable: true,
				backoffStrategy: "linear",
				maxRetries: 2,
				baseDelayMs: 1000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(0, classification)).toBe(1000);
		});

		it("should handle negative attempt (use 1 as minimum)", () => {
			const classification: ErrorClassification = {
				category: "timeout",
				retryable: true,
				backoffStrategy: "linear",
				maxRetries: 2,
				baseDelayMs: 1000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(-5, classification)).toBe(1000);
		});

		it("should handle decimal attempt (truncate to integer)", () => {
			const classification: ErrorClassification = {
				category: "timeout",
				retryable: true,
				backoffStrategy: "linear",
				maxRetries: 2,
				baseDelayMs: 1000,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(2.7, classification)).toBe(2000);
		});

		it("should return 0 when baseDelayMs is 0", () => {
			const classification: ErrorClassification = {
				category: "auth_error",
				retryable: false,
				backoffStrategy: "exponential",
				maxRetries: 0,
				baseDelayMs: 0,
				userMessage: "",
			};

			expect(computeBackoffDelayFromClassification(1, classification)).toBe(0);
		});
	});
});

describe("不変条件テスト", () => {
	describe("決定論的分類", () => {
		it("should return same result for same error (idempotent)", () => {
			const error = { status: 429 };

			const result1 = classifyErrorDetailed(error);
			const result2 = classifyErrorDetailed(error);
			const result3 = classifyErrorDetailed(error);

			expect(result1).toEqual(result2);
			expect(result2).toEqual(result3);
		});
	});

	describe("副作用なし", () => {
		it("should not modify input error object", () => {
			const error = { status: 500, message: "original" };
			const originalStatus = error.status;
			const originalMessage = error.message;

			classifyErrorDetailed(error);

			expect(error.status).toBe(originalStatus);
			expect(error.message).toBe(originalMessage);
		});
	});
});

describe("エッジケース・失敗モード", () => {
	describe("優先順位確認", () => {
		it("should prioritize status code over message for 429", () => {
			// 429 だがメッセージは timeout 関連
			const error = { status: 429, message: "timeout" };
			const result = classifyErrorDetailed(error);

			expect(result.category).toBe("rate_limit");
		});

		it("should prioritize status code over message for 401", () => {
			const error = { status: 401, message: "rate limit" };
			const result = classifyErrorDetailed(error);

			expect(result.category).toBe("auth_error");
		});
	});

	describe("複合エラーパターン", () => {
		it("should handle nested error with both status and message at top level", () => {
			const error = {
				status: 500,
				message: "overloaded",
			};
			const result = classifyErrorDetailed(error);

			// 500 + overloaded → capacity
			expect(result.category).toBe("capacity");
		});

		it("should handle status 500 without capacity message as provider_error", () => {
			const error = {
				status: 500,
				error: {
					message: "overloaded",
				},
			};
			const result = classifyErrorDetailed(error);

			// extractErrorMessage は error.error.message を再帰的に処理しないため
			// provider_error として分類される
			expect(result.category).toBe("provider_error");
		});
	});
});
