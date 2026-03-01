/**
 * @jest-environment node
 */
import { describe, it, expect } from "vitest";
import {
  toError,
  toErrorMessage,
  getErrorMessage,
  isError,
  isStringError,
  extractStatusCodeFromMessage,
  classifyPressureError,
  isCancelledErrorMessage,
  isTimeoutErrorMessage,
  PressureErrorType,
} from "../../../lib/core/error-utils.js";

describe("toError", () => {
  it("should return same Error if already Error", () => {
    const original = new Error("Test error");
    const result = toError(original);
    expect(result).toBe(original);
  });

  it("should wrap string in Error", () => {
    const result = toError("String error");
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe("String error");
  });

  it("should convert other types to string in Error", () => {
    expect(toError(123).message).toBe("123");
    expect(toError(true).message).toBe("true");
    expect(toError(null).message).toBe("null");
    expect(toError(undefined).message).toBe("undefined");
    expect(toError({ key: "value" }).message).toBe("[object Object]");
  });

  it("should handle objects with toString", () => {
    const obj = {
      toString: () => "custom string",
    };
    expect(toError(obj).message).toBe("custom string");
  });
});

describe("toErrorMessage", () => {
  it("should extract message from Error", () => {
    const error = new Error("Test error");
    expect(toErrorMessage(error)).toBe("Test error");
  });

  it("should return string as-is", () => {
    expect(toErrorMessage("String error")).toBe("String error");
  });

  it("should stringify objects", () => {
    const obj = { key: "value" };
    expect(toErrorMessage(obj)).toBe('{"key":"value"}');
  });

  it("should stringify arrays", () => {
    expect(toErrorMessage([1, 2, 3])).toBe("[1,2,3]");
  });

  it("should convert primitives to string", () => {
    expect(toErrorMessage(123)).toBe("123");
    expect(toErrorMessage(true)).toBe("true");
    expect(toErrorMessage(null)).toBe("null");
    expect(toErrorMessage(undefined)).toBe("undefined");
  });

  it("should handle circular references", () => {
    const circular: Record<string, unknown> = { key: "value" };
    circular.self = circular;
    // Should not throw and should return some string
    const result = toErrorMessage(circular);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should handle objects with throwing toString", () => {
    const obj = {
      toString: () => {
        throw new Error("toString failed");
      },
    };
    // Should fall back to "[object Object]"
    const result = toErrorMessage(obj);
    expect(typeof result).toBe("string");
  });
});

describe("getErrorMessage", () => {
  it("should be alias for toErrorMessage", () => {
    const error = new Error("Test");
    expect(getErrorMessage(error)).toBe(toErrorMessage(error));
    expect(getErrorMessage("string")).toBe("string");
    expect(getErrorMessage(123)).toBe("123");
  });
});

describe("isError", () => {
  it("should return true for Error instances", () => {
    expect(isError(new Error("Test"))).toBe(true);
    expect(isError(new TypeError("Test"))).toBe(true);
    expect(isError(new RangeError("Test"))).toBe(true);
  });

  it("should return false for non-Error values", () => {
    expect(isError("error")).toBe(false);
    expect(isError(123)).toBe(false);
    expect(isError(null)).toBe(false);
    expect(isError(undefined)).toBe(false);
    expect(isError({ message: "Test" })).toBe(false);
  });
});

describe("isStringError", () => {
  it("should return true for strings", () => {
    expect(isStringError("error")).toBe(true);
    expect(isStringError("")).toBe(true);
  });

  it("should return false for non-strings", () => {
    expect(isStringError(new Error("Test"))).toBe(false);
    expect(isStringError(123)).toBe(false);
    expect(isStringError(null)).toBe(false);
    expect(isStringError(undefined)).toBe(false);
  });
});

describe("extractStatusCodeFromMessage", () => {
  it("should extract 429 status code", () => {
    expect(extractStatusCodeFromMessage("Error: 429 Too Many Requests")).toBe(429);
    expect(extractStatusCodeFromMessage("429 rate limit")).toBe(429);
    expect(extractStatusCodeFromMessage("Status: 429")).toBe(429);
  });

  it("should extract 5xx status codes", () => {
    expect(extractStatusCodeFromMessage("500 Internal Server Error")).toBe(500);
    expect(extractStatusCodeFromMessage("502 Bad Gateway")).toBe(502);
    expect(extractStatusCodeFromMessage("503 Service Unavailable")).toBe(503);
    expect(extractStatusCodeFromMessage("504 Gateway Timeout")).toBe(504);
  });

  it("should return undefined for non-429/5xx codes", () => {
    expect(extractStatusCodeFromMessage("200 OK")).toBeUndefined();
    expect(extractStatusCodeFromMessage("404 Not Found")).toBeUndefined();
    expect(extractStatusCodeFromMessage("401 Unauthorized")).toBeUndefined();
  });

  it("should return undefined when no status code found", () => {
    expect(extractStatusCodeFromMessage("No status code here")).toBeUndefined();
    expect(extractStatusCodeFromMessage("")).toBeUndefined();
    expect(extractStatusCodeFromMessage(null)).toBeUndefined();
    expect(extractStatusCodeFromMessage(undefined)).toBeUndefined();
  });

  it("should work with Error objects", () => {
    const error = new Error("429 Too Many Requests");
    expect(extractStatusCodeFromMessage(error)).toBe(429);
  });

  it("should extract first 3-digit number", () => {
    expect(extractStatusCodeFromMessage("Error 500 and 503")).toBe(500);
  });
});

describe("classifyPressureError", () => {
  it("should classify 429 as rate_limit", () => {
    expect(classifyPressureError("429 Too Many Requests")).toBe("rate_limit");
    expect(classifyPressureError(new Error("Error 429"))).toBe("rate_limit");
  });

  it("should classify 503 as capacity", () => {
    expect(classifyPressureError("503 Service Unavailable")).toBe("capacity");
    expect(classifyPressureError(new Error("Error 503"))).toBe("capacity");
  });

  it("should classify rate limit keywords as rate_limit", () => {
    expect(classifyPressureError("rate limit exceeded")).toBe("rate_limit");
    expect(classifyPressureError("Too many requests")).toBe("rate_limit");
    expect(classifyPressureError("Rate Limit Error")).toBe("rate_limit");
  });

  it("should classify capacity keywords as capacity", () => {
    expect(classifyPressureError("capacity exceeded")).toBe("capacity");
    expect(classifyPressureError("Service overload")).toBe("capacity");
    expect(classifyPressureError("Runtime limit reached")).toBe("capacity");
    expect(classifyPressureError("Limit reached")).toBe("capacity");
  });

  it("should classify timeout keywords as timeout", () => {
    expect(classifyPressureError("Request timeout")).toBe("timeout");
    expect(classifyPressureError("Operation timed out")).toBe("timeout");
    expect(classifyPressureError("Timeout error")).toBe("timeout");
  });

  it("should classify cancel keywords as cancelled", () => {
    expect(classifyPressureError("Request cancelled")).toBe("cancelled");
    expect(classifyPressureError("Operation aborted")).toBe("cancelled");
    expect(classifyPressureError("Cancel request")).toBe("cancelled");
  });

  it("should classify other as other", () => {
    expect(classifyPressureError("Unknown error")).toBe("other");
    expect(classifyPressureError("Connection failed")).toBe("other");
    expect(classifyPressureError("")).toBe("other");
  });

  it("should prioritize status code over keywords", () => {
    // 429 should be rate_limit even if it contains "timeout"
    expect(classifyPressureError("429 timeout")).toBe("rate_limit");
    // 503 should be capacity even if it contains "rate"
    expect(classifyPressureError("503 rate limit")).toBe("capacity");
  });

  it("should work with Error objects", () => {
    const error = new Error("Rate limit exceeded");
    expect(classifyPressureError(error)).toBe("rate_limit");
  });
});

describe("isCancelledErrorMessage", () => {
  it("should detect cancelled errors", () => {
    expect(isCancelledErrorMessage("Operation cancelled")).toBe(true);
    expect(isCancelledErrorMessage("Request aborted")).toBe(true);
    expect(isCancelledErrorMessage("Cancel")).toBe(true);
    expect(isCancelledErrorMessage("Abort")).toBe(true);
  });

  it("should detect Japanese cancelled errors", () => {
    expect(isCancelledErrorMessage("処理が中断されました")).toBe(true);
    expect(isCancelledErrorMessage("キャンセル")).toBe(true);
  });

  it("should return false for non-cancelled errors", () => {
    expect(isCancelledErrorMessage("Error occurred")).toBe(false);
    expect(isCancelledErrorMessage("Timeout")).toBe(false);
    expect(isCancelledErrorMessage("")).toBe(false);
  });

  it("should work with Error objects", () => {
    expect(isCancelledErrorMessage(new Error("Request cancelled"))).toBe(true);
    expect(isCancelledErrorMessage(new Error("Unknown error"))).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isCancelledErrorMessage("CANCELLED")).toBe(true);
    expect(isCancelledErrorMessage("Aborted")).toBe(true);
    expect(isCancelledErrorMessage("CANCEL")).toBe(true);
  });
});

describe("isTimeoutErrorMessage", () => {
  it("should detect timeout errors", () => {
    expect(isTimeoutErrorMessage("Request timeout")).toBe(true);
    expect(isTimeoutErrorMessage("Operation timed out")).toBe(true);
    expect(isTimeoutErrorMessage("Timeout")).toBe(true);
    expect(isTimeoutErrorMessage("Time out")).toBe(true);
  });

  it("should detect Japanese timeout errors", () => {
    expect(isTimeoutErrorMessage("時間切れ")).toBe(true);
    expect(isTimeoutErrorMessage("タイムアウト")).toBe(true);
  });

  it("should return false for non-timeout errors", () => {
    expect(isTimeoutErrorMessage("Error occurred")).toBe(false);
    expect(isTimeoutErrorMessage("Cancelled")).toBe(false);
    expect(isTimeoutErrorMessage("")).toBe(false);
  });

  it("should work with Error objects", () => {
    expect(isTimeoutErrorMessage(new Error("Request timeout"))).toBe(true);
    expect(isTimeoutErrorMessage(new Error("Unknown error"))).toBe(false);
  });

  it("should be case-insensitive", () => {
    expect(isTimeoutErrorMessage("TIMEOUT")).toBe(true);
    expect(isTimeoutErrorMessage("Timed Out")).toBe(true);
    expect(isTimeoutErrorMessage("TIME OUT")).toBe(true);
  });
});
