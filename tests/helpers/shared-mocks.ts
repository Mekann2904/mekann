/**
 * @abdd.meta
 * path: tests/helpers/shared-mocks.ts
 * role: Mock factory functions for test isolation
 * why: Eliminate 50+ duplicate mock implementations across test files
 * related: tests/helpers/fixtures.ts, tests/setup-vitest.ts
 * public_api: createFsMock, createMockPi, createMockRuntime, createMockTypeValidator, createMockHttpClient
 * invariants: All mocks return vi.fn() instances, no external state mutations
 * side_effects: None (pure factory functions)
 * failure_modes: Invalid override objects may cause runtime errors
 * @abdd.explain
 * overview: Provides reusable mock factory functions for Vitest tests
 * what_it_does: Creates consistent mock instances for fs, Pi API, runtime, validators, HTTP
 * why_it_exists: DRY principle - centralize mock creation logic
 * scope:
 *   in: Factory functions with optional overrides
 *   out: Actual module implementations, production code
 */

import { vi } from "vitest";

/**
 * @summary Creates fs module mock with optional overrides
 * @param overrides - Partial fs module implementation to override defaults
 * @returns Mocked fs module with vi.fn() wrappers
 */
export function createFsMock(
  overrides: Partial<typeof import("node:fs")> = {}
) {
  return {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isFile: () => true, size: 0 })),
    rmSync: vi.fn(),
    renameSync: vi.fn(),
    copyFileSync: vi.fn(),
    ...overrides,
  };
}

/**
 * @summary Creates ExtensionAPI (Pi) mock with all core methods
 * @param overrides - Additional or replacement mock methods
 * @returns Mocked Pi API instance
 */
export function createMockPi(
  overrides: Record<string, unknown> = {}
): Record<string, ReturnType<typeof vi.fn> | unknown> {
  return {
    // Core API
    log: vi.fn(),
    logError: vi.fn(),
    logWarning: vi.fn(),
    logInfo: vi.fn(),
    logDebug: vi.fn(),

    // State
    getState: vi.fn(() => ({})),
    setState: vi.fn(),
    clearState: vi.fn(),

    // UI
    question: vi.fn().mockResolvedValue({ answer: "default" }),
    display: vi.fn(),
    clearDisplay: vi.fn(),

    // File operations
    readFile: vi.fn().mockResolvedValue(""),
    writeFile: vi.fn().mockResolvedValue(undefined),
    fileExists: vi.fn().mockResolvedValue(false),

    // Hooks
    onMessage: vi.fn(),
    onCommand: vi.fn(),
    onFileChange: vi.fn(),

    // Overrides
    ...overrides,
  };
}

/**
 * @summary Creates Agent Runtime mock for subagent testing
 * @param overrides - Custom runtime behavior overrides
 * @returns Mocked runtime instance
 */
export function createMockRuntime(
  overrides: Record<string, unknown> = {}
): Record<string, ReturnType<typeof vi.fn> | unknown> {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn(() => false),
    execute: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn(() => "idle"),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    onOutput: vi.fn(),
    onError: vi.fn(),
    ...overrides,
  };
}

/**
 * @summary Creates type validator mock for schema validation tests
 * @param overrides - Custom validation behavior
 * @returns Mocked type validator instance
 */
export function createMockTypeValidator(
  overrides: Record<string, unknown> = {}
): Record<string, ReturnType<typeof vi.fn> | unknown> {
  return {
    validate: vi.fn(() => ({ valid: true, errors: [] })),
    coerce: vi.fn(<T>(v: T) => v),
    isValid: vi.fn(() => true),
    getErrors: vi.fn(() => []),
    ...overrides,
  };
}

/**
 * @summary Creates HTTP client mock with pre-configured responses
 * @param responses - URL to response mapping for mock fetch
 * @returns Mock fetch function with mockResponse helper
 */
export function createMockHttpClient(
  responses: Record<string, unknown> = {}
) {
  const responseMap = { ...responses };

  const mock = Object.assign(
    vi.fn(async (url: string) => {
      if (responseMap[url]) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve(responseMap[url]),
          text: () => Promise.resolve(JSON.stringify(responseMap[url])),
        };
      }
      return {
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
        text: () => Promise.resolve("Not found"),
      };
    }),
    {
      mockResponse: (url: string, response: unknown) => {
        responseMap[url] = response;
      },
    }
  );

  return mock;
}
