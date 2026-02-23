/**
 * mediator-history.tsの単体テスト
 * Mediator層の履歴管理機能を検証する
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadConfirmedFacts,
  saveConfirmedFacts,
  appendFact,
  findFactByKey,
  getRecentFacts,
  getFactsBySession,
  loadConversationSummary,
  saveConversationSummary,
  appendSummarySection,
  createSessionSummary,
  getUserPreferences,
  updateUserPreferences,
  pruneOldFacts,
  exportHistory,
  getHistoryStats,
  HISTORY_FILES,
} from "../../lib/mediator-history.js";
import { type ConfirmedFactsStore, type ConfirmedFact } from "../../lib/mediator-types.js";

describe("mediator-history", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mediator-history-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("HISTORY_FILES", () => {
    it("期待されるファイル名が定義されている", () => {
      expect(HISTORY_FILES.confirmedFacts).toBe("confirmed-facts.json");
      expect(HISTORY_FILES.conversationSummary).toBe("conversation-summary.md");
    });
  });

  describe("loadConfirmedFacts", () => {
    it("ファイルが存在しない場合はデフォルト値を返す", () => {
      // Arrange & Act
      const store = loadConfirmedFacts(tempDir);

      // Assert
      expect(store.facts).toEqual([]);
      expect(store.userPreferences).toEqual({});
    });

    it("存在するファイルを読み込める", () => {
      // Arrange
      const store: ConfirmedFactsStore = {
        facts: [
          {
            id: "fact-1",
            key: "targetFile",
            value: "test.ts",
            context: "Initial setup",
            confirmedAt: "2024-01-01T00:00:00.000Z",
            sessionId: "session-1",
          },
        ],
        userPreferences: { preferredLanguage: "ja" },
        lastUpdatedAt: "2024-01-01T00:00:00.000Z",
      };
      fs.writeFileSync(
        path.join(tempDir, HISTORY_FILES.confirmedFacts),
        JSON.stringify(store)
      );

      // Act
      const loaded = loadConfirmedFacts(tempDir);

      // Assert
      expect(loaded.facts.length).toBe(1);
      expect(loaded.facts[0].key).toBe("targetFile");
      expect(loaded.userPreferences.preferredLanguage).toBe("ja");
    });

    it("不正なJSONの場合はデフォルト値を返す", () => {
      // Arrange
      fs.writeFileSync(
        path.join(tempDir, HISTORY_FILES.confirmedFacts),
        "invalid json"
      );

      // Act
      const store = loadConfirmedFacts(tempDir);

      // Assert
      expect(store.facts).toEqual([]);
    });
  });

  describe("saveConfirmedFacts", () => {
    it("ストアを保存できる", () => {
      // Arrange
      const store: ConfirmedFactsStore = {
        facts: [],
        userPreferences: {},
        lastUpdatedAt: "2024-01-01T00:00:00.000Z",
      };

      // Act
      const result = saveConfirmedFacts(tempDir, store);

      // Assert
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(tempDir, HISTORY_FILES.confirmedFacts))).toBe(true);
    });

    it("ディレクトリが存在しない場合は作成される", () => {
      // Arrange
      const newDir = path.join(tempDir, "nested", "dir");
      const store: ConfirmedFactsStore = {
        facts: [],
        userPreferences: {},
        lastUpdatedAt: "2024-01-01T00:00:00.000Z",
      };

      // Act
      const result = saveConfirmedFacts(newDir, store);

      // Assert
      expect(result).toBe(true);
      expect(fs.existsSync(path.join(newDir, HISTORY_FILES.confirmedFacts))).toBe(true);
    });

    it("タイムスタンプが更新される", () => {
      // Arrange
      const store: ConfirmedFactsStore = {
        facts: [],
        userPreferences: {},
        lastUpdatedAt: "2020-01-01T00:00:00.000Z",
      };

      // Act
      saveConfirmedFacts(tempDir, store);

      // Assert
      expect(store.lastUpdatedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  describe("appendFact", () => {
    it("新しい事実を追加できる", () => {
      // Arrange & Act
      const result = appendFact(tempDir, {
        key: "targetFile",
        value: "app.ts",
        context: "User specified",
        sessionId: "session-1",
      });

      // Assert
      expect(result).toBe(true);
      const store = loadConfirmedFacts(tempDir);
      expect(store.facts.length).toBe(1);
      expect(store.facts[0].key).toBe("targetFile");
      expect(store.facts[0].id).toBeDefined();
      expect(store.facts[0].confirmedAt).toBeDefined();
    });

    it("同じキーの事実は更新される", () => {
      // Arrange
      appendFact(tempDir, {
        key: "targetFile",
        value: "old.ts",
        context: "First",
        sessionId: "session-1",
      });

      // Act
      appendFact(tempDir, {
        key: "targetFile",
        value: "new.ts",
        context: "Updated",
        sessionId: "session-1",
      });

      // Assert
      const store = loadConfirmedFacts(tempDir);
      expect(store.facts.length).toBe(1);
      expect(store.facts[0].value).toBe("new.ts");
    });
  });

  describe("findFactByKey", () => {
    it("キーで事実を検索できる", () => {
      // Arrange
      appendFact(tempDir, {
        key: "targetFile",
        value: "main.ts",
        context: "Test",
        sessionId: "session-1",
      });

      // Act
      const fact = findFactByKey(tempDir, "targetFile");

      // Assert
      expect(fact).toBeDefined();
      expect(fact?.value).toBe("main.ts");
    });

    it("存在しないキーはundefinedを返す", () => {
      // Arrange & Act
      const fact = findFactByKey(tempDir, "nonexistent");

      // Assert
      expect(fact).toBeUndefined();
    });
  });

  describe("getRecentFacts", () => {
    it("最近の事実を取得できる", () => {
      // Arrange
      for (let i = 0; i < 15; i++) {
        appendFact(tempDir, {
          key: `fact-${i}`,
          value: `value-${i}`,
          context: `Test ${i}`,
          sessionId: "session-1",
        });
      }

      // Act
      const recent = getRecentFacts(tempDir, 5);

      // Assert
      expect(recent.length).toBe(5);
    });

    it("新しい順で返される", async () => {
      // Arrange
      appendFact(tempDir, {
        key: "first",
        value: "1",
        context: "First",
        sessionId: "session-1",
      });

      await new Promise(r => setTimeout(r, 10));

      appendFact(tempDir, {
        key: "second",
        value: "2",
        context: "Second",
        sessionId: "session-1",
      });

      // Act
      const recent = getRecentFacts(tempDir, 10);

      // Assert
      expect(recent[0].key).toBe("second");
      expect(recent[1].key).toBe("first");
    });
  });

  describe("getFactsBySession", () => {
    it("特定セッションの事実をフィルタリングできる", () => {
      // Arrange
      appendFact(tempDir, {
        key: "fact-1",
        value: "value-1",
        context: "Test",
        sessionId: "session-A",
      });

      appendFact(tempDir, {
        key: "fact-2",
        value: "value-2",
        context: "Test",
        sessionId: "session-B",
      });

      // Act
      const factsA = getFactsBySession(tempDir, "session-A");
      const factsB = getFactsBySession(tempDir, "session-B");

      // Assert
      expect(factsA.length).toBe(1);
      expect(factsA[0].sessionId).toBe("session-A");
      expect(factsB.length).toBe(1);
      expect(factsB[0].sessionId).toBe("session-B");
    });
  });

  describe("loadConversationSummary / saveConversationSummary", () => {
    it("会話要約を保存・読み込みできる", () => {
      // Arrange
      const summary = "# Session Summary\n\nTopic: Testing\n\n- Decision 1\n- Decision 2";

      // Act
      saveConversationSummary(tempDir, summary);
      const loaded = loadConversationSummary(tempDir);

      // Assert
      expect(loaded).toBe(summary);
    });

    it("ファイルが存在しない場合は空文字を返す", () => {
      // Arrange & Act
      const summary = loadConversationSummary(tempDir);

      // Assert
      expect(summary).toBe("");
    });
  });

  describe("appendSummarySection", () => {
    it("新しいセクションを追記できる", () => {
      // Arrange
      saveConversationSummary(tempDir, "# Existing Content\n\nSome text");

      // Act
      const result = appendSummarySection(tempDir, {
        title: "New Section",
        content: ["Line 1", "Line 2"],
      });

      // Assert
      expect(result).toBe(true);
      const summary = loadConversationSummary(tempDir);
      expect(summary).toContain("# Existing Content");
      expect(summary).toContain("## New Section");
    });
  });

  describe("createSessionSummary", () => {
    it("セッション要約を生成できる", () => {
      // Arrange & Act
      const summary = createSessionSummary(
        "session-123",
        "Code Review",
        ["Approved the PR", "Merged to main"],
        ["Follow up on tests"]
      );

      // Assert
      expect(summary).toContain("session-123");
      expect(summary).toContain("Code Review");
      expect(summary).toContain("## Decisions");
      expect(summary).toContain("Approved the PR");
      expect(summary).toContain("## Pending");
      expect(summary).toContain("Follow up on tests");
    });
  });

  describe("getUserPreferences / updateUserPreferences", () => {
    it("ユーザー設定を取得・更新できる", () => {
      // Arrange & Act
      updateUserPreferences(tempDir, {
        preferredLanguage: "en",
        preferredDetailLevel: "detailed",
      });

      const prefs = getUserPreferences(tempDir);

      // Assert
      expect(prefs.preferredLanguage).toBe("en");
      expect(prefs.preferredDetailLevel).toBe("detailed");
    });

    it("部分的な更新が可能", () => {
      // Arrange
      updateUserPreferences(tempDir, {
        preferredLanguage: "ja",
        preferredDetailLevel: "brief",
      });

      // Act
      updateUserPreferences(tempDir, {
        preferredDetailLevel: "detailed",
      });

      const prefs = getUserPreferences(tempDir);

      // Assert
      expect(prefs.preferredLanguage).toBe("ja"); // 変更されない
      expect(prefs.preferredDetailLevel).toBe("detailed"); // 更新される
    });
  });

  describe("pruneOldFacts", () => {
    it("古い事実を削除できる", async () => {
      // Arrange
      appendFact(tempDir, {
        key: "new-fact",
        value: "new",
        context: "Test",
        sessionId: "session-1",
      });

      // Act - 0日で全てアーカイブ
      const removed = pruneOldFacts(tempDir, 0);

      // Assert
      expect(removed).toBe(1);
      const store = loadConfirmedFacts(tempDir);
      expect(store.facts.length).toBe(0);
    });

    it("保持期間内の事実は削除されない", () => {
      // Arrange
      appendFact(tempDir, {
        key: "recent-fact",
        value: "recent",
        context: "Test",
        sessionId: "session-1",
      });

      // Act - 30日保持
      const removed = pruneOldFacts(tempDir, 30);

      // Assert
      expect(removed).toBe(0);
      const store = loadConfirmedFacts(tempDir);
      expect(store.facts.length).toBe(1);
    });
  });

  describe("exportHistory", () => {
    it("全履歴をエクスポートできる", () => {
      // Arrange
      appendFact(tempDir, {
        key: "fact-1",
        value: "value-1",
        context: "Test",
        sessionId: "session-1",
      });
      saveConversationSummary(tempDir, "# Summary");

      // Act
      const exported = exportHistory(tempDir);

      // Assert
      expect(exported.confirmedFacts.facts.length).toBe(1);
      expect(exported.conversationSummary).toBe("# Summary");
      expect(exported.exportedAt).toBeDefined();
    });
  });

  describe("getHistoryStats", () => {
    it("履歴の統計情報を取得できる", () => {
      // Arrange
      appendFact(tempDir, {
        key: "fact-1",
        value: "value-1",
        context: "Test",
        sessionId: "session-1",
      });
      saveConversationSummary(tempDir, "# Summary");

      // Act
      const stats = getHistoryStats(tempDir);

      // Assert
      expect(stats.totalFacts).toBe(1);
      expect(stats.hasConversationSummary).toBe(true);
      expect(stats.oldestFact).toBeDefined();
      expect(stats.newestFact).toBeDefined();
    });

    it("空の履歴の統計情報", () => {
      // Arrange & Act
      const stats = getHistoryStats(tempDir);

      // Assert
      expect(stats.totalFacts).toBe(0);
      expect(stats.hasConversationSummary).toBe(false);
      expect(stats.oldestFact).toBeNull();
      expect(stats.newestFact).toBeNull();
    });
  });
});
