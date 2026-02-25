/**
 * @abdd.meta
 * path: tests/helpers/fixtures.ts
 * role: Custom Vitest fixtures for test isolation
 * why: Eliminate 30+ duplicate setup patterns across test files
 * related: tests/helpers/shared-mocks.ts, tests/setup-vitest.ts
 * public_api: test, describe, it, expect, TestFixtures
 * invariants: Each fixture provides clean state per test, auto-cleanup on completion
 * side_effects: Creates temp directories, mocks modules, clears vi state
 * failure_modes: Temp dir cleanup may fail on permission issues
 * @abdd.explain
 * overview: Provides Vitest fixture extension for consistent test setup
 * what_it_does: Creates isolated test contexts with mockPi, mockRuntime, mockFs, tempDir, cleanState
 * why_it_exists: DRY principle - centralize test setup/teardown logic
 * scope:
 *   in: Vitest test functions
 *   out: Production code, actual file system operations
 */

import { test as base, vi, expect, describe, it } from "vitest";
import { createMockPi, createMockRuntime, createFsMock } from "./shared-mocks";

/**
 * Custom test fixtures for isolated testing
 */
export type TestFixtures = {
  /** Clean ExtensionAPI mock instance */
  mockPi: ReturnType<typeof createMockPi>;
  /** Clean Agent Runtime mock instance */
  mockRuntime: ReturnType<typeof createMockRuntime>;
  /** File system mock with vi.fn() wrappers */
  mockFs: ReturnType<typeof createFsMock>;
  /** Unique temporary directory path (auto-cleaned) */
  tempDir: string;
  /** Fixture that ensures clean vi state before/after test */
  cleanState: void;
};

/**
 * Extended test function with custom fixtures
 */
export const test = base.extend<TestFixtures>({
  /**
   * Provides a clean PI mock for each test
   */
  mockPi: async ({}, use) => {
    const mockPi = createMockPi();
    await use(mockPi);
    // Auto cleanup via garbage collection
  },

  /**
   * Provides a clean runtime mock for each test
   */
  mockRuntime: async ({}, use) => {
    const runtime = createMockRuntime();
    await use(runtime);
    // Verify no unexpected stop calls
  },

  /**
   * Provides a file system mock with automatic module unmocking
   */
  mockFs: async ({}, use) => {
    vi.mock("node:fs", () => createFsMock());
    await use(createFsMock());
    vi.unmock("node:fs");
  },

  /**
   * Provides a unique temporary directory with automatic cleanup
   */
  tempDir: async ({}, use) => {
    const os = await import("node:os");
    const path = await import("node:path");
    const tempDir = path.join(os.tmpdir(), `pi-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    await use(tempDir);

    // Cleanup: remove temp directory
    const fs = await import("node:fs/promises");
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {
      // Ignore cleanup errors
    });
  },

  /**
   * Ensures clean vi state before and after each test
   */
  cleanState: async ({}, use) => {
    // Pre-test: reset global state
    vi.clearAllMocks();

    await use();

    // Post-test: restore all mocks and reset modules
    vi.restoreAllMocks();
    vi.resetModules();
  },
});

export { expect, describe, it };
