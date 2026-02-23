/**
 * tui/live-monitor-base.tsの単体テスト
 * ライブモニタービューの基底実装を検証する
 */

import { describe, it, expect } from "vitest";
import {
  createBaseLiveItem,
  appendStreamChunk,
  getStreamTail,
  getStreamBytes,
  getStreamLineCount,
  handleListModeInput,
  handleDetailModeInput,
  applyInputResult,
  LIVE_PREVIEW_LINE_LIMIT,
  LIVE_LIST_WINDOW_SIZE,
  type BaseLiveItem,
  type LiveStreamView,
  type LiveViewMode,
} from "../../../lib/tui/live-monitor-base.js";

// ============================================================================
// Tests: createBaseLiveItem
// ============================================================================

describe("createBaseLiveItem", () => {
  it("デフォルト値でアイテムを生成する", () => {
    // Arrange & Act
    const item = createBaseLiveItem({ id: "test-1" });

    // Assert
    expect(item.id).toBe("test-1");
    expect(item.status).toBe("pending");
    expect(item.stdoutTail).toBe("");
    expect(item.stderrTail).toBe("");
    expect(item.stdoutBytes).toBe(0);
    expect(item.stderrBytes).toBe(0);
  });

  it("名前を含むアイテムを生成できる", () => {
    // Arrange & Act
    const item = createBaseLiveItem({ id: "test-2", name: "Test Agent" });

    // Assert
    expect(item.id).toBe("test-2");
  });
});

// ============================================================================
// Tests: appendStreamChunk
// ============================================================================

describe("appendStreamChunk", () => {
  it("stdoutにチャンクを追加する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });

    // Act
    appendStreamChunk(item, "stdout", "Hello ");

    // Assert
    expect(item.stdoutTail).toBe("Hello ");
    expect(item.stdoutBytes).toBe(6);
  });

  it("stderrにチャンクを追加する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });

    // Act
    appendStreamChunk(item, "stderr", "Error: ");

    // Assert
    expect(item.stderrTail).toBe("Error: ");
    expect(item.stderrBytes).toBe(7);
  });

  it("複数のチャンクを追加する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });

    // Act
    appendStreamChunk(item, "stdout", "Line 1\n");
    appendStreamChunk(item, "stdout", "Line 2\n");

    // Assert
    expect(item.stdoutNewlineCount).toBe(2);
  });

  it("lastChunkAtMsが更新される", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    const before = Date.now();

    // Act
    appendStreamChunk(item, "stdout", "test");

    // Assert
    expect(item.lastChunkAtMs).toBeDefined();
    expect(item.lastChunkAtMs!).toBeGreaterThanOrEqual(before);
  });
});

// ============================================================================
// Tests: getStreamTail
// ============================================================================

describe("getStreamTail", () => {
  it("stdoutの末尾を取得する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    appendStreamChunk(item, "stdout", "output");

    // Act
    const tail = getStreamTail(item, "stdout");

    // Assert
    expect(tail).toBe("output");
  });

  it("stderrの末尾を取得する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    appendStreamChunk(item, "stderr", "error");

    // Act
    const tail = getStreamTail(item, "stderr");

    // Assert
    expect(tail).toBe("error");
  });

  it("失敗時は自動的にstderrに切り替える", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    item.status = "failed";
    appendStreamChunk(item, "stderr", "error message");

    // Act
    const tail = getStreamTail(item, "stdout", true);

    // Assert
    expect(tail).toBe("error message");
  });
});

// ============================================================================
// Tests: getStreamBytes
// ============================================================================

describe("getStreamBytes", () => {
  it("stdoutのバイト数を取得する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    appendStreamChunk(item, "stdout", "Hello");

    // Act
    const bytes = getStreamBytes(item, "stdout");

    // Assert
    expect(bytes).toBe(5);
  });

  it("stderrのバイト数を取得する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    appendStreamChunk(item, "stderr", "Error");

    // Act
    const bytes = getStreamBytes(item, "stderr");

    // Assert
    expect(bytes).toBe(5);
  });
});

// ============================================================================
// Tests: getStreamLineCount
// ============================================================================

describe("getStreamLineCount", () => {
  it("行数を推定する", () => {
    // Arrange
    const item = createBaseLiveItem({ id: "test" });
    appendStreamChunk(item, "stdout", "Line 1\nLine 2\nLine 3");

    // Act
    const lines = getStreamLineCount(item, "stdout");

    // Assert
    expect(lines).toBeGreaterThan(0);
  });
});

// ============================================================================
// Tests: handleListModeInput
// ============================================================================

describe("handleListModeInput", () => {
  it("qで終了アクションを返す", () => {
    // Arrange & Act
    const result = handleListModeInput("q");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.action).toBe("close");
  });

  it("jでカーソルを下に移動", () => {
    // Arrange & Act
    const result = handleListModeInput("j");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.cursorDelta).toBe(1);
  });

  it("kでカーソルを上に移動", () => {
    // Arrange & Act
    const result = handleListModeInput("k");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.cursorDelta).toBe(-1);
  });

  it("gで先頭に移動", () => {
    // Arrange & Act
    const result = handleListModeInput("g");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.cursorAbsolute).toBe(0);
  });

  it("Gで末尾に移動", () => {
    // Arrange & Act
    const result = handleListModeInput("G");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.cursorAbsolute).toBe(-1);
  });

  it("Enterで詳細モードに切り替え", () => {
    // Arrange & Act
    const result = handleListModeInput("\r");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.action).toBe("mode-detail");
  });

  it("未処理の入力はhandled=false", () => {
    // Arrange & Act
    const result = handleListModeInput("x");

    // Assert
    expect(result.handled).toBe(false);
  });
});

// ============================================================================
// Tests: handleDetailModeInput
// ============================================================================

describe("handleDetailModeInput", () => {
  it("bでリストモードに戻る", () => {
    // Arrange & Act
    const result = handleDetailModeInput("b");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.action).toBe("mode-list");
  });

  it("Tabでストリーム切り替え", () => {
    // Arrange & Act
    const result = handleDetailModeInput("\t");

    // Assert
    expect(result.handled).toBe(true);
    expect(result.action).toBe("stream-toggle");
  });
});

// ============================================================================
// Tests: applyInputResult
// ============================================================================

describe("applyInputResult", () => {
  it("カーソル移動を適用する", () => {
    // Arrange
    const result = { handled: true, cursorDelta: 1 };
    const state = { cursor: 0, itemCount: 5, mode: "list" as LiveViewMode, stream: "stdout" as LiveStreamView };

    // Act
    const updated = applyInputResult(result, state);

    // Assert
    expect(updated.cursor).toBe(1);
    expect(updated.shouldRender).toBe(true);
  });

  it("カーソルを範囲外に移動しない", () => {
    // Arrange
    const result = { handled: true, cursorDelta: -1 };
    const state = { cursor: 0, itemCount: 5, mode: "list" as LiveViewMode, stream: "stdout" as LiveStreamView };

    // Act
    const updated = applyInputResult(result, state);

    // Assert
    expect(updated.cursor).toBe(0);
  });

  it("モード切り替えを適用する", () => {
    // Arrange
    const result = { handled: true, action: "mode-detail" as const };
    const state = { cursor: 0, itemCount: 5, mode: "list" as LiveViewMode, stream: "stdout" as LiveStreamView };

    // Act
    const updated = applyInputResult(result, state);

    // Assert
    expect(updated.mode).toBe("detail");
  });

  it("ストリーム切り替えを適用する", () => {
    // Arrange
    const result = { handled: true, action: "stream-toggle" as const };
    const state = { cursor: 0, itemCount: 5, mode: "detail" as LiveViewMode, stream: "stdout" as LiveStreamView };

    // Act
    const updated = applyInputResult(result, state);

    // Assert
    expect(updated.stream).toBe("stderr");
  });

  it("closeアクションを処理する", () => {
    // Arrange
    const result = { handled: true, action: "close" as const };
    const state = { cursor: 0, itemCount: 5, mode: "list" as LiveViewMode, stream: "stdout" as LiveStreamView };

    // Act
    const updated = applyInputResult(result, state);

    // Assert
    expect(updated.shouldClose).toBe(true);
  });
});

// ============================================================================
// Tests: Constants
// ============================================================================

describe("Constants", () => {
  it("LIVE_PREVIEW_LINE_LIMITが定義されている", () => {
    expect(LIVE_PREVIEW_LINE_LIMIT).toBe(36);
  });

  it("LIVE_LIST_WINDOW_SIZEが定義されている", () => {
    expect(LIVE_LIST_WINDOW_SIZE).toBe(20);
  });
});
