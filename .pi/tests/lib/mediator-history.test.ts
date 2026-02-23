/**
 * @abdd.meta
 * path: .pi/tests/lib/mediator-history.test.ts
 * role: mediator-history.tsの単体テスト
 * why: Mediator層の履歴管理機能の正確性を保証するため
 * related: .pi/lib/mediator-history.ts, .pi/lib/mediator-types.ts
 * public_api: テストケースの実行
 * invariants: テストは一時ディレクトリを使用
 * side_effects: テスト用一時ディレクトリの作成・削除
 * failure_modes: なし
 * @abdd.explain
 * overview: Mediator履歴管理の単体テスト
 * what_it_does:
 *   - loadConfirmedFacts/saveConfirmedFactsのテスト
 *   - appendFact/findFactByKeyのテスト
 *   - loadConversationSummary/saveConversationSummaryのテスト
 *   - 履歴クリーンアップのテスト
 * why_it_exists: 履歴管理機能の信頼性を保証するため
 * scope:
 *   in: .pi/lib/mediator-history.ts
 *   out: テスト結果
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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

// ============================================================================
// Test Setup
// ============================================================================

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `mediator-history-test-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
});

// ============================================================================
// Tests: loadConfirmedFacts / saveConfirmedFacts
// ============================================================================

describe("loadConfirmedFacts / saveConfirmedFacts", () => {
  it("ファイルが存在しない場合はデフォルト値を返す", () => {
    // Arrange & Act
    const store = loadConfirmedFacts(testDir);

    // Assert
    expect(store.facts).toEqual([]);
    expect(store.userPreferences).toEqual({});
  });

  it("確認済み事実を保存して読み込める", () => {
    // Arrange
    const store = {
      facts: [{
        id: "fact-1",
        key: "test-key",
        value: "test-value",
        context: "test context",
        confirmedAt: new Date().toISOString(),
        sessionId: "session-1",
      }],
      userPreferences: { preferredLanguage: "ja" as const },
      lastUpdatedAt: new Date().toISOString(),
    };

    // Act
    const saved = saveConfirmedFacts(testDir, store);
    const loaded = loadConfirmedFacts(testDir);

    // Assert
    expect(saved).toBe(true);
    expect(loaded.facts.length).toBe(1);
    expect(loaded.facts[0].key).toBe("test-key");
    expect(loaded.userPreferences.preferredLanguage).toBe("ja");
  });

  it("保存時にタイムスタンプが更新される", () => {
    // Arrange
    const store = {
      facts: [],
      userPreferences: {},
      lastUpdatedAt: "2020-01-01T00:00:00.000Z",
    };

    // Act
    saveConfirmedFacts(testDir, store);

    // Assert
    expect(store.lastUpdatedAt).not.toBe("2020-01-01T00:00:00.000Z");
  });

  it("不正なJSONファイルの場合はデフォルト値を返す", () => {
    // Arrange
    const filePath = join(testDir, HISTORY_FILES.confirmedFacts);
    writeFileSync(filePath, "invalid json", "utf-8");

    // Act
    const store = loadConfirmedFacts(testDir);

    // Assert
    expect(store.facts).toEqual([]);
  });
});

// ============================================================================
// Tests: appendFact
// ============================================================================

describe("appendFact", () => {
  it("新しい事実を追加できる", () => {
    // Arrange & Act
    const result = appendFact(testDir, {
      key: "new-key",
      value: "new-value",
      context: "context",
      sessionId: "session-1",
    });

    // Assert
    expect(result).toBe(true);
    const store = loadConfirmedFacts(testDir);
    expect(store.facts.length).toBe(1);
    expect(store.facts[0].key).toBe("new-key");
    expect(store.facts[0].id).toBeDefined();
    expect(store.facts[0].confirmedAt).toBeDefined();
  });

  it("同じキーの事実は更新される", () => {
    // Arrange
    appendFact(testDir, {
      key: "existing-key",
      value: "old-value",
      context: "context",
      sessionId: "session-1",
    });

    // Act
    appendFact(testDir, {
      key: "existing-key",
      value: "new-value",
      context: "updated context",
      sessionId: "session-2",
    });

    // Assert
    const store = loadConfirmedFacts(testDir);
    expect(store.facts.length).toBe(1);
    expect(store.facts[0].value).toBe("new-value");
  });
});

// ============================================================================
// Tests: findFactByKey
// ============================================================================

describe("findFactByKey", () => {
  it("キーで事実を検索できる", () => {
    // Arrange
    appendFact(testDir, {
      key: "search-key",
      value: "search-value",
      context: "context",
      sessionId: "session-1",
    });

    // Act
    const fact = findFactByKey(testDir, "search-key");

    // Assert
    expect(fact).toBeDefined();
    expect(fact?.value).toBe("search-value");
  });

  it("存在しないキーは undefined を返す", () => {
    // Act
    const fact = findFactByKey(testDir, "non-existent");

    // Assert
    expect(fact).toBeUndefined();
  });
});

// ============================================================================
// Tests: getRecentFacts
// ============================================================================

describe("getRecentFacts", () => {
  it("最新N件の事実を取得できる", () => {
    // Arrange
    for (let i = 0; i < 5; i++) {
      appendFact(testDir, {
        key: `key-${i}`,
        value: `value-${i}`,
        context: "context",
        sessionId: "session-1",
      });
    }

    // Act
    const facts = getRecentFacts(testDir, 3);

    // Assert
    expect(facts.length).toBe(3);
  });

  it("デフォルトは10件", () => {
    // Arrange
    for (let i = 0; i < 15; i++) {
      appendFact(testDir, {
        key: `key-${i}`,
        value: `value-${i}`,
        context: "context",
        sessionId: "session-1",
      });
    }

    // Act
    const facts = getRecentFacts(testDir);

    // Assert
    expect(facts.length).toBe(10);
  });
});

// ============================================================================
// Tests: getFactsBySession
// ============================================================================

describe("getFactsBySession", () => {
  it("特定セッションの事実を取得できる", () => {
    // Arrange
    appendFact(testDir, {
      key: "key-1",
      value: "value-1",
      context: "context",
      sessionId: "session-A",
    });
    appendFact(testDir, {
      key: "key-2",
      value: "value-2",
      context: "context",
      sessionId: "session-B",
    });
    appendFact(testDir, {
      key: "key-3",
      value: "value-3",
      context: "context",
      sessionId: "session-A",
    });

    // Act
    const facts = getFactsBySession(testDir, "session-A");

    // Assert
    expect(facts.length).toBe(2);
    expect(facts.every(f => f.sessionId === "session-A")).toBe(true);
  });
});

// ============================================================================
// Tests: loadConversationSummary / saveConversationSummary
// ============================================================================

describe("loadConversationSummary / saveConversationSummary", () => {
  it("ファイルが存在しない場合は空文字を返す", () => {
    // Act
    const summary = loadConversationSummary(testDir);

    // Assert
    expect(summary).toBe("");
  });

  it("会話要約を保存して読み込める", () => {
    // Arrange
    const summary = "# Test Summary\n\nThis is a test.";

    // Act
    const saved = saveConversationSummary(testDir, summary);
    const loaded = loadConversationSummary(testDir);

    // Assert
    expect(saved).toBe(true);
    expect(loaded).toBe(summary);
  });
});

// ============================================================================
// Tests: appendSummarySection
// ============================================================================

describe("appendSummarySection", () => {
  it("新しいセクションを追加できる", () => {
    // Arrange & Act
    const result = appendSummarySection(testDir, {
      title: "New Section",
      content: ["Line 1", "Line 2"],
    });

    // Assert
    expect(result).toBe(true);
    const summary = loadConversationSummary(testDir);
    expect(summary).toContain("## New Section");
    expect(summary).toContain("Line 1");
  });

  it("既存の要約に追記される", () => {
    // Arrange
    saveConversationSummary(testDir, "Existing content");

    // Act
    appendSummarySection(testDir, {
      title: "New Section",
      content: ["New line"],
    });

    // Assert
    const summary = loadConversationSummary(testDir);
    expect(summary).toContain("Existing content");
    expect(summary).toContain("## New Section");
  });
});

// ============================================================================
// Tests: createSessionSummary
// ============================================================================

describe("createSessionSummary", () => {
  it("セッション要約を生成できる", () => {
    // Arrange & Act
    const summary = createSessionSummary(
      "session-123",
      "Test Topic",
      ["Decision 1", "Decision 2"],
      ["Pending 1"]
    );

    // Assert
    expect(summary).toContain("session-123");
    expect(summary).toContain("Test Topic");
    expect(summary).toContain("## Decisions");
    expect(summary).toContain("Decision 1");
    expect(summary).toContain("## Pending");
    expect(summary).toContain("Pending 1");
  });

  it("決定事項がない場合は Decisions セクションを含まない", () => {
    // Act
    const summary = createSessionSummary(
      "session-123",
      "Test",
      [],
      []
    );

    // Assert
    expect(summary).not.toContain("## Decisions");
    expect(summary).not.toContain("## Pending");
  });
});

// ============================================================================
// Tests: getUserPreferences / updateUserPreferences
// ============================================================================

describe("getUserPreferences / updateUserPreferences", () => {
  it("デフォルトのユーザー設定を取得できる", () => {
    // Act
    const prefs = getUserPreferences(testDir);

    // Assert
    expect(prefs).toEqual({});
  });

  it("ユーザー設定を更新できる", () => {
    // Act
    const result = updateUserPreferences(testDir, {
      preferredLanguage: "en",
      preferredDetailLevel: "detailed",
    });

    // Assert
    expect(result).toBe(true);
    const prefs = getUserPreferences(testDir);
    expect(prefs.preferredLanguage).toBe("en");
    expect(prefs.preferredDetailLevel).toBe("detailed");
  });

  it("部分的な更新が可能", () => {
    // Arrange
    updateUserPreferences(testDir, { preferredLanguage: "ja" });

    // Act
    updateUserPreferences(testDir, { preferredDetailLevel: "brief" });

    // Assert
    const prefs = getUserPreferences(testDir);
    expect(prefs.preferredLanguage).toBe("ja"); // 前の値が保持される
    expect(prefs.preferredDetailLevel).toBe("brief");
  });
});

// ============================================================================
// Tests: pruneOldFacts
// ============================================================================

describe("pruneOldFacts", () => {
  it("古い事実を削除できる", () => {
    // Arrange
    // 新しい事実
    appendFact(testDir, {
      key: "new-fact",
      value: "new value",
      context: "context",
      sessionId: "session-1",
    });

    // 古い事実を直接ファイルに書き込む
    const store = loadConfirmedFacts(testDir);
    store.facts.push({
      id: "old-fact",
      key: "old-key",
      value: "old value",
      context: "context",
      confirmedAt: "2020-01-01T00:00:00.000Z",
      sessionId: "session-old",
    });
    saveConfirmedFacts(testDir, store);

    // Act
    const removed = pruneOldFacts(testDir, 30);

    // Assert
    expect(removed).toBe(1);
    const remaining = loadConfirmedFacts(testDir);
    expect(remaining.facts.length).toBe(1);
    expect(remaining.facts[0].key).toBe("new-fact");
  });

  it("削除対象がない場合は0を返す", () => {
    // Arrange
    appendFact(testDir, {
      key: "new-fact",
      value: "new value",
      context: "context",
      sessionId: "session-1",
    });

    // Act
    const removed = pruneOldFacts(testDir, 30);

    // Assert
    expect(removed).toBe(0);
  });
});

// ============================================================================
// Tests: exportHistory
// ============================================================================

describe("exportHistory", () => {
  it("履歴をエクスポートできる", () => {
    // Arrange
    appendFact(testDir, {
      key: "test-key",
      value: "test-value",
      context: "context",
      sessionId: "session-1",
    });
    saveConversationSummary(testDir, "Test summary");

    // Act
    const exported = exportHistory(testDir);

    // Assert
    expect(exported.confirmedFacts.facts.length).toBe(1);
    expect(exported.conversationSummary).toBe("Test summary");
    expect(exported.exportedAt).toBeDefined();
  });
});

// ============================================================================
// Tests: getHistoryStats
// ============================================================================

describe("getHistoryStats", () => {
  it("履歴統計を取得できる", () => {
    // Arrange
    appendFact(testDir, {
      key: "test-key",
      value: "test-value",
      context: "context",
      sessionId: "session-1",
    });

    // Act
    const stats = getHistoryStats(testDir);

    // Assert
    expect(stats.totalFacts).toBe(1);
    expect(stats.oldestFact).toBeDefined();
    expect(stats.newestFact).toBeDefined();
    expect(stats.hasConversationSummary).toBe(false);
  });

  it("事実がない場合は null を返す", () => {
    // Act
    const stats = getHistoryStats(testDir);

    // Assert
    expect(stats.totalFacts).toBe(0);
    expect(stats.oldestFact).toBeNull();
    expect(stats.newestFact).toBeNull();
  });

  it("会話要約がある場合は hasConversationSummary が true", () => {
    // Arrange
    saveConversationSummary(testDir, "Some summary");

    // Act
    const stats = getHistoryStats(testDir);

    // Assert
    expect(stats.hasConversationSummary).toBe(true);
  });
});
