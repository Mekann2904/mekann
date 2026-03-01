/**
 * @jest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { ensureDir } from "../../../lib/core/fs-utils.js";

describe("ensureDir", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `fs-utils-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should create directory if it does not exist", () => {
    const dirPath = join(testDir, "new-dir");
    expect(existsSync(dirPath)).toBe(false);
    
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should not throw if directory already exists", () => {
    const dirPath = join(testDir, "existing-dir");
    mkdirSync(dirPath, { recursive: true });
    expect(existsSync(dirPath)).toBe(true);
    
    // Should not throw
    expect(() => ensureDir(dirPath)).not.toThrow();
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should create nested directories recursively", () => {
    const dirPath = join(testDir, "level1", "level2", "level3");
    expect(existsSync(dirPath)).toBe(false);
    
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
    expect(existsSync(join(testDir, "level1"))).toBe(true);
    expect(existsSync(join(testDir, "level1", "level2"))).toBe(true);
  });

  it("should handle multiple calls to same path", () => {
    const dirPath = join(testDir, "multi-call");
    
    ensureDir(dirPath);
    ensureDir(dirPath);
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should handle paths with trailing slash", () => {
    const dirPath = join(testDir, "trailing-slash") + "/";
    
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should handle relative paths", () => {
    const relativePath = `./test-temp-dir-${Date.now()}`;
    
    ensureDir(relativePath);
    
    expect(existsSync(relativePath)).toBe(true);
    
    // Cleanup
    rmSync(relativePath, { recursive: true, force: true });
  });

  it("should handle paths with special characters", () => {
    const dirPath = join(testDir, "dir with spaces", "dir-with-dashes", "dir_with_underscores");
    
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should handle unicode in path", () => {
    const dirPath = join(testDir, "日本語ディレクトリ", "emoji-🎉");
    
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should handle deeply nested paths", () => {
    const levels = 10;
    const parts = [testDir];
    for (let i = 0; i < levels; i++) {
      parts.push(`level${i}`);
    }
    const dirPath = join(...parts);
    
    ensureDir(dirPath);
    
    expect(existsSync(dirPath)).toBe(true);
  });

  it("should handle root temp directory", () => {
    // This should not throw since tmpdir always exists
    expect(() => ensureDir(tmpdir())).not.toThrow();
  });
});
