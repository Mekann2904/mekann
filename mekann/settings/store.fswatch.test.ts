// IC-035: an external edit (editor / `mekann settings-editor` CLI / another Pi)
// must invalidate the process settings cache. We drive the fs.watch listener
// manually because vitest does not reliably deliver real fs.watch events in this
// environment (confirmed across pools); the watch→debounce→invalidate→re-read
// pipeline is what this test guards. Real Node fs.watch delivery itself is an
// OS/Node concern. Lives in its own file because vi.mock("node:fs") is module-wide.
import { afterEach, describe, expect, it, vi } from "vitest";
import * as path from "node:path";
import * as os from "node:os";

// Captured fs.watch listener for the most recently watched path. The fake
// watcher mirrors the FSWatcher surface store.ts uses (`.on("error")`, `.close()`).
let capturedListener: ((event: string, filename: string | Buffer | null) => void) | undefined;

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const fakeWatcher = { on: () => fakeWatcher, close: () => undefined };
  return {
    ...actual,
    watch: vi.fn((_filePath: unknown, listener?: (event: string, filename: string | Buffer | null) => void) => {
      capturedListener = listener;
      return fakeWatcher;
    }),
  };
});

const {
  emptySettings,
  invalidateSettingsCache,
  loadSettings,
  setFeatureValue,
} = await import("./store.js");

const fs = await import("node:fs");

describe("settings cache external-edit invalidation (IC-035)", () => {
  afterEach(() => {
    capturedListener = undefined;
    invalidateSettingsCache();
    vi.mocked(fs.watch).mockClear();
  });

  it("starts a watcher on first read and invalidates the cache on an external change", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mekann-fswatch-"));
    const file = path.join(dir, "mekann.json");
    try {
      fs.writeFileSync(file, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 1), null, 2) + "\n", "utf8");

      // Cold read: caches the value and registers an fs.watch listener.
      const first = loadSettings(file);
      expect(first.settings.features.subagent?.maxSubagents).toBe(1);
      expect(vi.mocked(fs.watch)).toHaveBeenCalledWith(file, expect.any(Function));
      expect(capturedListener).toBeTypeOf("function");

      // A second read is served from cache (no new watcher registered).
      const watchersBefore = vi.mocked(fs.watch).mock.calls.length;
      expect(loadSettings(file).settings.features.subagent?.maxSubagents).toBe(1);
      expect(vi.mocked(fs.watch).mock.calls.length).toBe(watchersBefore);

      // Simulate an external process editing the file, then the OS delivering
      // the change event to our watcher.
      fs.writeFileSync(file, JSON.stringify(setFeatureValue(emptySettings(), "subagent", "maxSubagents", 42), null, 2) + "\n", "utf8");
      capturedListener!("change", "mekann.json");

      // The watcher debounces; let the invalidation timer fire.
      await new Promise((resolve) => setTimeout(resolve, 150));

      // The cache was invalidated, so the next read reflects the external value.
      expect(loadSettings(file).settings.features.subagent?.maxSubagents).toBe(42);
    } finally {
      invalidateSettingsCache(file);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not start a watcher for a non-existent settings file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mekann-fswatch-absent-"));
    const file = path.join(dir, "missing.json");
    try {
      const loaded = loadSettings(file);
      expect(loaded.exists).toBe(false);
      expect(vi.mocked(fs.watch)).not.toHaveBeenCalled();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
