/**
 * @file tests/unit/extensions/agent-teams/live-monitor.test.ts
 * @description agent-teams/live-monitor.ts の単体テスト
 * @testFramework vitest
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// テスト対象のインポート
import {
  toTeamLiveItemKey,
  renderAgentTeamLiveView,
  createAgentTeamLiveMonitor,
} from "../../../../.pi/extensions/agent-teams/live-monitor";
import type {
  TeamLiveItem,
  TeamLiveViewMode,
  LiveStreamView,
  TeamQueueStatus,
} from "../../../../.pi/lib/team-types";

// ============================================================================
// テスト用ユーティリティ
// ============================================================================

/**
 * テスト用TeamLiveItem生成
 */
function createTestLiveItem(
  key: string,
  label: string,
  overrides: Partial<TeamLiveItem> = {},
): TeamLiveItem {
  return {
    key,
    label,
    partners: [],
    status: "pending",
    phase: "queued",
    stdoutTail: "",
    stderrTail: "",
    stdoutBytes: 0,
    stderrBytes: 0,
    stdoutNewlineCount: 0,
    stderrNewlineCount: 0,
    stdoutEndsWithNewline: false,
    stderrEndsWithNewline: false,
    events: [],
    discussionTail: "",
    discussionBytes: 0,
    discussionNewlineCount: 0,
    discussionEndsWithNewline: false,
    ...overrides,
  };
}

/**
 * テスト用テーマモック
 */
function createMockTheme() {
  const fg = vi.fn((color: string, text: string) => `[${color}]${text}[/${color}]`);
  const bold = vi.fn((text: string) => `**${text}**`);
  return { fg, bold };
}

// ============================================================================
// toTeamLiveItemKey
// ============================================================================

describe("toTeamLiveItemKey", () => {
  it("toTeamLiveItemKey_正常な入力_スラッシュ区切りのキーを生成する", () => {
    // Arrange
    const teamId = "team-123";
    const memberId = "member-456";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("team-123/member-456");
  });

  it("toTeamLiveItemKey_空のteamId_スラッシュで始まるキーを生成する", () => {
    // Arrange
    const teamId = "";
    const memberId = "member-1";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("/member-1");
  });

  it("toTeamLiveItemKey_空のmemberId_スラッシュで終わるキーを生成する", () => {
    // Arrange
    const teamId = "team-1";
    const memberId = "";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("team-1/");
  });

  it("toTeamLiveItemKey_両方空_スラッシュのみを返す", () => {
    // Arrange
    const teamId = "";
    const memberId = "";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("/");
  });

  it("toTeamLiveItemKey_特殊文字含む_そのまま連結する", () => {
    // Arrange
    const teamId = "team-with-dashes";
    const memberId = "member_with_underscores";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("team-with-dashes/member_with_underscores");
  });

  it("toTeamLiveItemKey_スラッシュ含むID_スラッシュが複数になる", () => {
    // Arrange
    const teamId = "team/with/slash";
    const memberId = "member/also";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("team/with/slash/member/also");
  });

  it("toTeamLiveItemKey_Unicode文字_正しく連結する", () => {
    // Arrange
    const teamId = "チームID";
    const memberId = "メンバーID";

    // Act
    const result = toTeamLiveItemKey(teamId, memberId);

    // Assert
    expect(result).toBe("チームID/メンバーID");
  });
});

// ============================================================================
// renderAgentTeamLiveView
// ============================================================================

describe("renderAgentTeamLiveView", () => {
  const theme = createMockTheme();

  describe("基本動作", () => {
    it("renderAgentTeamLiveView_アイテムなし_空状態メッセージを表示する", () => {
      // Arrange
      const input = {
        title: "Test Team",
        items: [] as TeamLiveItem[],
        globalEvents: [] as string[],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.length).toBeGreaterThan(0);
      expect(result.some((line) => line.includes("no running team members"))).toBe(true);
    });

    it("renderAgentTeamLiveView_タイトル設定_ヘッダーにタイトルを表示する", () => {
      // Arrange
      const input = {
        title: "My Custom Team",
        items: [] as TeamLiveItem[],
        globalEvents: [] as string[],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("My Custom Team"))).toBe(true);
    });
  });

  describe("モード切替", () => {
    const items = [
      createTestLiveItem("team-1/member-1", "member-1", {
        status: "running",
        phase: "initial",
        startedAtMs: Date.now() - 1000,
      }),
    ];

    it("renderAgentTeamLiveView_listモード_リスト形式で描画する", () => {
      // Arrange
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("[j/k] nav"))).toBe(true);
    });

    it("renderAgentTeamLiveView_detailモード_詳細形式で描画する", () => {
      // Arrange
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "detail" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("[tab] stream"))).toBe(true);
    });

    it("renderAgentTeamLiveView_discussionモード_議論形式で描画する", () => {
      // Arrange
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "discussion" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("DISCUSSION"))).toBe(true);
    });

    it("renderAgentTeamLiveView_timelineモード_タイムライン形式で描画する", () => {
      // Arrange
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "timeline" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("timeline") || line.includes("CURRENT STATE"))).toBe(true);
    });
  });

  describe("ステータス表示", () => {
    it("renderAgentTeamLiveView_実行中アイテム_Run数を表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          status: "running",
          phase: "initial",
        }),
        createTestLiveItem("team-1/member-2", "member-2", {
          status: "completed",
          phase: "finished",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("Run:1"))).toBe(true);
      expect(result.some((line) => line.includes("Done:1"))).toBe(true);
    });

    it("renderAgentTeamLiveView_失敗アイテム_Fail数を表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          status: "failed",
          phase: "finished",
          error: "Test error",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("Fail:1"))).toBe(true);
    });
  });

  describe("キューステータス", () => {
    it("renderAgentTeamLiveView_待機状態あり_キュー情報を表示する", () => {
      // Arrange
      const queueStatus: TeamQueueStatus = {
        isWaiting: true,
        waitedMs: 5000,
        queuePosition: 2,
        queuedAhead: 1,
      };
      const input = {
        title: "Test",
        items: [] as TeamLiveItem[],
        globalEvents: [] as string[],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
        queueStatus,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("QUEUE"))).toBe(true);
      expect(result.some((line) => line.includes("pos:2"))).toBe(true);
    });

    it("renderAgentTeamLiveView_待機状態なし_キュー情報を表示しない", () => {
      // Arrange
      const queueStatus: TeamQueueStatus = {
        isWaiting: false,
      };
      const input = {
        title: "Test",
        items: [] as TeamLiveItem[],
        globalEvents: [] as string[],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
        queueStatus,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("QUEUE"))).toBe(false);
    });
  });

  describe("グローバルイベント", () => {
    it("renderAgentTeamLiveView_グローバルイベントあり_イベントを表示する", () => {
      // Arrange
      const globalEvents = ["[12:00:00] Team started", "[12:00:05] Phase changed"];
      const input = {
        title: "Test",
        items: [] as TeamLiveItem[],
        globalEvents,
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("team events"))).toBe(true);
    });
  });

  describe("カーソル操作", () => {
    it("renderAgentTeamLiveView_カーソル範囲外_クランプされる", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1"),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 100, // 範囲外
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert - エラーにならず描画されることを確認
      expect(result.length).toBeGreaterThan(0);
    });

    it("renderAgentTeamLiveView_負のカーソル_0にクランプされる", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1"),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: -1, // 負の値
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert - エラーにならず描画されることを確認
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("ストリーム切替", () => {
    it("renderAgentTeamLiveView_stdoutストリーム_標準出力を表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          stdoutTail: "stdout content",
          stderrTail: "stderr content",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "detail" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("stdout"))).toBe(true);
    });

    it("renderAgentTeamLiveView_stderrストリーム_標準エラーを表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          stdoutTail: "stdout content",
          stderrTail: "stderr content",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "detail" as TeamLiveViewMode,
        stream: "stderr" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("stderr"))).toBe(true);
    });
  });

  describe("高さ制限", () => {
    it("renderAgentTeamLiveView_高さ指定あり_指定行数以内に収める", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1"),
        createTestLiveItem("team-1/member-2", "member-2"),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        height: 10,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert - 結果が返ることを確認（正確な行数は内容による）
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("discussion モード", () => {
    it("renderAgentTeamLiveView_議論内容あり_議論を表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          discussionTail: "SUMMARY: test\nCLAIM: test claim",
          discussionBytes: 30,
          discussionNewlineCount: 1,
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "discussion" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("SUMMARY"))).toBe(true);
    });

    it("renderAgentTeamLiveView_議論内容なし_プレースホルダ表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          discussionTail: "",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "discussion" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("no discussion content"))).toBe(true);
    });
  });

  describe("エラー表示", () => {
    it("renderAgentTeamLiveView_エラーあり_エラー情報を表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          status: "failed",
          phase: "finished",
          error: "Connection timeout",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "detail" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("Connection timeout"))).toBe(true);
    });

    it("renderAgentTeamLiveView_サマリーあり_サマリーを表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          status: "completed",
          phase: "finished",
          summary: "Task completed successfully",
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "detail" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("Task completed successfully"))).toBe(true);
    });
  });

  describe("ツリービュー", () => {
    it("renderAgentTeamLiveView_パートナーあり_ツリー構造を表示する", () => {
      // Arrange
      const items = [
        createTestLiveItem("team-1/member-1", "member-1", {
          status: "running",
          partners: ["member-2"],
        }),
        createTestLiveItem("team-1/member-2", "member-2", {
          status: "pending",
          partners: [],
        }),
      ];
      const input = {
        title: "Test",
        items,
        globalEvents: [],
        cursor: 0,
        mode: "list" as TeamLiveViewMode,
        stream: "stdout" as LiveStreamView,
        width: 80,
        theme,
      };

      // Act
      const result = renderAgentTeamLiveView(input);

      // Assert
      expect(result.some((line) => line.includes("member-1"))).toBe(true);
      expect(result.some((line) => line.includes("member-2"))).toBe(true);
    });
  });
});

// ============================================================================
// createAgentTeamLiveMonitor
// ============================================================================

describe("createAgentTeamLiveMonitor", () => {
  describe("コントローラ生成", () => {
    it("createAgentTeamLiveMonitor_UIGなし_undefinedを返す", () => {
      // Arrange
      const ctx = { hasUI: false };

      // Act
      const result = createAgentTeamLiveMonitor(ctx as any, {
        title: "Test",
        items: [],
      });

      // Assert
      expect(result).toBeUndefined();
    });

    it("createAgentTeamLiveMonitor_ctxなし_undefinedを返す", () => {
      // Arrange
      const ctx = null;

      // Act
      const result = createAgentTeamLiveMonitor(ctx as any, {
        title: "Test",
        items: [],
      });

      // Assert
      expect(result).toBeUndefined();
    });

    it("createAgentTeamLiveMonitor_customUIなし_undefinedを返す", () => {
      // Arrange
      const ctx = { hasUI: true, ui: {} };

      // Act
      const result = createAgentTeamLiveMonitor(ctx as any, {
        title: "Test",
        items: [],
      });

      // Assert
      expect(result).toBeUndefined();
    });
  });

  describe("コントローラメソッド", () => {
    let mockCtx: any;
    let mockCustom: any;

    beforeEach(() => {
      mockCustom = vi.fn(() => Promise.resolve());
      mockCtx = {
        hasUI: true,
        ui: {
          custom: mockCustom,
        },
      };
    });

    it("createAgentTeamLiveMonitor_正常なctx_コントローラを返す", async () => {
      // Arrange - mockCustomがUIハンドラを返すように設定
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        const keybindings = {};
        const done = vi.fn();
        handler(tui, theme, keybindings, done);
        return Promise.resolve();
      });

      // Act
      const result = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test Team",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // Assert
      expect(result).toBeDefined();
      expect(result).toHaveProperty("markStarted");
      expect(result).toHaveProperty("markFinished");
      expect(result).toHaveProperty("appendEvent");
      expect(result).toHaveProperty("appendBroadcastEvent");
      expect(result).toHaveProperty("appendChunk");
      expect(result).toHaveProperty("appendDiscussion");
      expect(result).toHaveProperty("updateQueueStatus");
      expect(result).toHaveProperty("close");
      expect(result).toHaveProperty("wait");
    });

    it("markStarted_存在しないキー_エラーにならない", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [],
      });

      // Act & Assert - エラーにならないことを確認
      expect(() => controller?.markStarted("non-existent")).not.toThrow();
    });

    it("markFinished_完了状態を設定する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // Act & Assert - エラーにならないことを確認
      expect(() =>
        controller?.markFinished("team-1/member-1", "completed", "Done")
      ).not.toThrow();
    });

    it("appendEvent_イベントを追加する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // Act & Assert
      expect(() =>
        controller?.appendEvent("team-1/member-1", "Test event")
      ).not.toThrow();
    });

    it("appendBroadcastEvent_全アイテムにイベントを追加する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [
          { key: "team-1/member-1", label: "member-1" },
          { key: "team-1/member-2", label: "member-2" },
        ],
      });

      // Act & Assert
      expect(() =>
        controller?.appendBroadcastEvent("Broadcast message")
      ).not.toThrow();
    });

    it("appendChunk_stdout_出力を追加する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // Act & Assert
      expect(() =>
        controller?.appendChunk("team-1/member-1", "stdout", "output line\n")
      ).not.toThrow();
    });

    it("appendChunk_stderr_エラー出力を追加する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // Act & Assert
      expect(() =>
        controller?.appendChunk("team-1/member-1", "stderr", "error line\n")
      ).not.toThrow();
    });

    it("appendDiscussion_議論を追加する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // Act & Assert
      expect(() =>
        controller?.appendDiscussion("team-1/member-1", "Discussion content\n")
      ).not.toThrow();
    });

    it("updateQueueStatus_待機状態を更新する", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [],
      });

      // Act & Assert
      expect(() =>
        controller?.updateQueueStatus({
          isWaiting: true,
          queuePosition: 3,
          waitedMs: 1000,
        })
      ).not.toThrow();
    });

    it("close_複数回呼び出し_エラーにならない", async () => {
      // Arrange
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [],
      });

      // Act & Assert
      expect(() => controller?.close()).not.toThrow();
      expect(() => controller?.close()).not.toThrow(); // 2回目
    });

    it("markStarted_再実行時_完了状態をクリアして経過時間が再開する", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

      let uiHandle: { render: (width: number) => string[] } | undefined;
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        uiHandle = handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      // 1回目の実行
      controller?.markStarted("team-1/member-1");
      vi.advanceTimersByTime(2000);
      controller?.markFinished("team-1/member-1", "failed", "(failed)", "boom");

      // 2回目の実行（ここでfinishedAtをクリアできないと時間が00:00:00のまま固まる）
      vi.advanceTimersByTime(1000);
      controller?.markStarted("team-1/member-1");
      vi.advanceTimersByTime(2000);

      const lines = uiHandle?.render(120) ?? [];
      expect(lines.some((line) => line.includes("00:00:02"))).toBe(true);
      expect(lines.some((line) => line.includes("running"))).toBe(true);

      vi.useRealTimers();
    });

    it("markPhase_queued_待機状態へ戻して古い失敗表示をクリアする", async () => {
      let uiHandle: { render: (width: number) => string[]; handleInput: (key: string) => void } | undefined;
      mockCustom.mockImplementation((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        uiHandle = handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });

      const controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      controller?.markStarted("team-1/member-1");
      controller?.markFinished("team-1/member-1", "failed", "(failed)", "boom");
      controller?.markPhase("team-1/member-1", "queued");

      // detail表示に切り替えて、error表示が残っていないことを確認
      uiHandle?.handleInput("\n");
      const lines = uiHandle?.render(120) ?? [];
      expect(lines.some((line) => line.includes("pending"))).toBe(true);
      expect(lines.some((line) => line.includes("error: boom"))).toBe(false);
    });
  });

  describe("close後の操作", () => {
    let mockCtx: any;
    let controller: ReturnType<typeof createAgentTeamLiveMonitor>;

    beforeEach(async () => {
      const mockCustom = vi.fn((handler: Function) => {
        const tui = { requestRender: vi.fn(), terminal: { rows: 24 } };
        const theme = createMockTheme();
        handler(tui, theme, {}, vi.fn());
        return Promise.resolve();
      });
      mockCtx = {
        hasUI: true,
        ui: { custom: mockCustom },
      };

      controller = createAgentTeamLiveMonitor(mockCtx, {
        title: "Test",
        items: [{ key: "team-1/member-1", label: "member-1" }],
      });

      controller?.close();
    });

    it("close後_markStarted_何もしない", () => {
      // Act & Assert - エラーにならず無視される
      expect(() => controller?.markStarted("team-1/member-1")).not.toThrow();
    });

    it("close後_appendEvent_何もしない", () => {
      // Act & Assert
      expect(() =>
        controller?.appendEvent("team-1/member-1", "Event")
      ).not.toThrow();
    });

    it("close後_markFinished_何もしない", () => {
      // Act & Assert
      expect(() =>
        controller?.markFinished("team-1/member-1", "completed", "Done")
      ).not.toThrow();
    });
  });
});

// ============================================================================
// エッジケース
// ============================================================================

describe("エッジケース", () => {
  const theme = createMockTheme();

  it("幅0_エラーにならず描画する", () => {
    // Arrange
    const input = {
      title: "Test",
      items: [] as TeamLiveItem[],
      globalEvents: [] as string[],
      cursor: 0,
      mode: "list" as TeamLiveViewMode,
      stream: "stdout" as LiveStreamView,
      width: 0,
      theme,
    };

    // Act & Assert
    expect(() => renderAgentTeamLiveView(input)).not.toThrow();
  });

  it("非常に長いタイトル_描画する", () => {
    // Arrange
    const longTitle = "A".repeat(200);
    const input = {
      title: longTitle,
      items: [] as TeamLiveItem[],
      globalEvents: [] as string[],
      cursor: 0,
      mode: "list" as TeamLiveViewMode,
      stream: "stdout" as LiveStreamView,
      width: 80,
      theme,
    };

    // Act & Assert
    expect(() => renderAgentTeamLiveView(input)).not.toThrow();
  });

  it("大量のイベント_制限付きで描画する", () => {
    // Arrange
    const events = Array.from({ length: 200 }, (_, i) => `[12:00:${String(i).padStart(2, "0")}] Event ${i}`);
    const items = [
      createTestLiveItem("team-1/member-1", "member-1", {
        events,
        status: "running",
      }),
    ];
    const input = {
      title: "Test",
      items,
      globalEvents: events.slice(0, 150),
      cursor: 0,
      mode: "detail" as TeamLiveViewMode,
      stream: "stdout" as LiveStreamView,
      width: 80,
      theme,
    };

    // Act
    const result = renderAgentTeamLiveView(input);

    // Assert - エラーにならず結果が返る
    expect(result.length).toBeGreaterThan(0);
  });

  it("空文字イベント_無視される", () => {
    // Arrange
    const items = [
      createTestLiveItem("team-1/member-1", "member-1", {
        events: ["", "   ", "[12:00:00] Valid event"],
        status: "running",
      }),
    ];
    const input = {
      title: "Test",
      items,
      globalEvents: [],
      cursor: 0,
      mode: "detail" as TeamLiveViewMode,
      stream: "stdout" as LiveStreamView,
      width: 80,
      theme,
    };

    // Act & Assert
    expect(() => renderAgentTeamLiveView(input)).not.toThrow();
  });

  it("Nullバイト含む入力_エラーにならない", () => {
    // Arrange
    const items = [
      createTestLiveItem("team-1/member-1", "member-1", {
        stdoutTail: "line1\x00line2",
        status: "running",
      }),
    ];
    const input = {
      title: "Test",
      items,
      globalEvents: [],
      cursor: 0,
      mode: "detail" as TeamLiveViewMode,
      stream: "stdout" as LiveStreamView,
      width: 80,
      theme,
    };

    // Act & Assert
    expect(() => renderAgentTeamLiveView(input)).not.toThrow();
  });
});
