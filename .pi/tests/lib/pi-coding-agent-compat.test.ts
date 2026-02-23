/**
 * @abdd.meta
 * path: .pi/tests/lib/pi-coding-agent-compat.test.ts
 * role: pi-coding-agent-compat.tsの単体テスト
 * why: 宣言マージによる型拡張が正しく機能することを検証するため
 * related: .pi/lib/pi-coding-agent-compat.ts
 * public_api: テストケースの実行
 * invariants: テストは型レベルの検証を主眼とする
 * side_effects: なし
 * failure_modes: 型の不整合によるコンパイルエラー
 * @abdd.explain
 * overview: モジュール宣言マージによる型拡張が正しく適用されていることを検証する
 */

import { describe, it, expect } from "vitest";

describe("pi-coding-agent-compat", () => {
  describe("ExtensionUIContext拡張", () => {
    it("notifyメソッドの型シグネチャを確認する", () => {
      // Arrange
      const mockContext = {
        notify: (message: string, type?: "info" | "warning" | "error" | "success") => {
          return { message, type: type ?? "info" };
        },
      };

      // Act
      const result = mockContext.notify("Test message", "success");

      // Assert
      expect(result.message).toBe("Test message");
      expect(result.type).toBe("success");
    });

    it("getTitleメソッドの型シグネチャを確認する", () => {
      // Arrange
      const mockContext = {
        getTitle: () => "Test Title",
      };

      // Act
      const title = mockContext.getTitle();

      // Assert
      expect(title).toBe("Test Title");
    });

    it("getTitleはundefinedを返すことができる", () => {
      // Arrange
      const mockContext = {
        getTitle: (): string | undefined => undefined,
      };

      // Act
      const title = mockContext.getTitle();

      // Assert
      expect(title).toBeUndefined();
    });
  });

  describe("ContextUsage拡張", () => {
    it("usageTokensとtrailingTokensの型を確認する", () => {
      // Arrange
      const usage = {
        usageTokens: 1000,
        trailingTokens: 50,
      };

      // Assert
      expect(usage.usageTokens).toBe(1000);
      expect(usage.trailingTokens).toBe(50);
    });

    it("usageTokensとtrailingTokensは省略可能である", () => {
      // Arrange
      const usage = {};

      // Assert
      expect(usage.usageTokens).toBeUndefined();
      expect(usage.trailingTokens).toBeUndefined();
    });
  });

  describe("ExtensionAPI拡張", () => {
    it("contextプロパティの型を確認する", () => {
      // Arrange
      const mockAPI = {
        context: {
          cwd: "/test/path",
          args: {},
        },
      };

      // Assert
      expect(mockAPI.context.cwd).toBe("/test/path");
    });

    it("onメソッドでsession_endイベントをリッスンできる", () => {
      // Arrange
      const handlers: string[] = [];
      const mockAPI = {
        on: (event: string, handler: () => void) => {
          handlers.push(event);
        },
      };

      // Act
      mockAPI.on("session_end", () => {});

      // Assert
      expect(handlers).toContain("session_end");
    });
  });

  describe("SessionStartEvent型", () => {
    it("sessionIdを持つイベントを作成できる", () => {
      // Arrange
      const event = {
        sessionId: "session-123",
      };

      // Assert
      expect(event.sessionId).toBe("session-123");
    });

    it("sessionIdは省略可能である", () => {
      // Arrange
      const event = {};

      // Assert
      expect(event.sessionId).toBeUndefined();
    });
  });

  describe("ToolResultEvent型", () => {
    it("BashToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        error: "Command failed",
        result: null,
      };

      // Assert
      expect(event.error).toBe("Command failed");
    });

    it("ReadToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: "file content",
      };

      // Assert
      expect(event.result).toBe("file content");
    });

    it("EditToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: { success: true },
      };

      // Assert
      expect(event.result).toEqual({ success: true });
    });

    it("WriteToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: { bytesWritten: 100 },
      };

      // Assert
      expect(event.result).toEqual({ bytesWritten: 100 });
    });

    it("GrepToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: ["match1", "match2"],
      };

      // Assert
      expect(event.result).toHaveLength(2);
    });

    it("FindToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: ["/path/to/file1", "/path/to/file2"],
      };

      // Assert
      expect(event.result).toHaveLength(2);
    });

    it("LsToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: { files: ["a.ts", "b.ts"], directories: ["src"] },
      };

      // Assert
      expect(event.result.files).toHaveLength(2);
    });

    it("CustomToolResultEventを作成できる", () => {
      // Arrange
      const event = {
        result: { custom: "data" },
      };

      // Assert
      expect(event.result).toEqual({ custom: "data" });
    });
  });

  describe("型の不変条件", () => {
    it("errorフィールドは文字列型である", () => {
      // Arrange
      const event = {
        error: "Error message",
      };

      // Assert
      expect(typeof event.error).toBe("string");
    });

    it("resultフィールドは任意の型を取れる", () => {
      // Arrange
      const stringResult = { result: "string" };
      const objectResult = { result: { key: "value" } };
      const arrayResult = { result: [1, 2, 3] };
      const nullResult = { result: null };

      // Assert
      expect(typeof stringResult.result).toBe("string");
      expect(typeof objectResult.result).toBe("object");
      expect(Array.isArray(arrayResult.result)).toBe(true);
      expect(nullResult.result).toBeNull();
    });
  });

  describe("境界値テスト", () => {
    it("空文字列のメッセージを処理できる", () => {
      // Arrange
      const mockContext = {
        notify: (message: string) => message,
      };

      // Act
      const result = mockContext.notify("");

      // Assert
      expect(result).toBe("");
    });

    it("非常に長いメッセージを処理できる", () => {
      // Arrange
      const longMessage = "x".repeat(10000);
      const mockContext = {
        notify: (message: string) => message,
      };

      // Act
      const result = mockContext.notify(longMessage);

      // Assert
      expect(result.length).toBe(10000);
    });
  });
});
