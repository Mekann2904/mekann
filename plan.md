# テストコード品質改善実装計画

**作成日:** 2026-02-25
**作成者:** architect subagent
**対象:** mekannプロジェクト テストコード品質改善

---

## 目的

research.mdの調査結果に基づき、テストコード品質を改善する。
主な目標:

1. ステートメントカバレッジ: 2.89% → 60%（フェーズ1）
2. スナップショットテストの導入
3. パラメータ化テストの導入
4. テストコードの重複排除

---

## 変更内容

### 1. カバレッジ向上戦略

#### 1.1 優先モジュール選定

| 優先度 | モジュール | 行数 | 理由 |
|--------|-----------|------|------|
| P0 | `dynamic-tools/registry.ts` | 1,189 | 最重要・未テスト |
| P0 | `embeddings/registry.ts` | 344 | 検索機能の中核 |
| P1 | `search/utils/cache.ts` | 491 | キャッシュ戦略 |
| P1 | `search/types.ts` | 802 | 型ガード・バリデーション |
| P2 | `search/utils/metrics.ts` | 388 | メトリクス計算 |

#### 1.2 テストファイル作成

```
tests/unit/lib/dynamic-tools/
├── registry.test.ts              # 新規作成
└── registry.property.test.ts     # プロパティテスト

tests/unit/lib/embeddings/
├── registry.test.ts              # 新規作成
└── registry.property.test.ts     # プロパティテスト

tests/unit/extensions/search/
├── cache.test.ts                 # 新規作成
├── types.test.ts                 # 新規作成
└── metrics.test.ts               # 新規作成
```

#### 1.3 コード例: dynamic-tools/registry.test.ts

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { DynamicToolRegistry } from "@pi/lib/dynamic-tools/registry";

describe("DynamicToolRegistry", () => {
  let registry: DynamicToolRegistry;

  beforeEach(() => {
    registry = new DynamicToolRegistry();
  });

  afterEach(() => {
    registry.clear();
  });

  describe("register", () => {
    it("should register a valid tool", () => {
      const tool = {
        name: "test-tool",
        description: "Test tool",
        execute: vi.fn(),
        parameters: {},
      };

      const result = registry.register(tool);

      expect(result.success).toBe(true);
      expect(registry.has("test-tool")).toBe(true);
    });

    it("should reject duplicate tool names", () => {
      const tool = {
        name: "duplicate",
        description: "First",
        execute: vi.fn(),
        parameters: {},
      };

      registry.register(tool);
      const result = registry.register({ ...tool, description: "Second" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    // パラメータ化テスト
    it.each([
      ["empty name", { name: "", description: "test", execute: vi.fn() }],
      ["null name", { name: null, description: "test", execute: vi.fn() }],
      ["missing execute", { name: "test", description: "test" }],
    ])("should reject invalid tool: %s", (_desc, invalidTool) => {
      const result = registry.register(invalidTool as any);
      expect(result.success).toBe(false);
    });
  });

  describe("execute", () => {
    it("should execute tool with valid parameters", async () => {
      const executeMock = vi.fn().mockResolvedValue({ result: "ok" });
      registry.register({
        name: "echo",
        description: "Echo tool",
        execute: executeMock,
        parameters: {},
      });

      const result = await registry.execute("echo", { input: "hello" });

      expect(executeMock).toHaveBeenCalledWith({ input: "hello" });
      expect(result).toEqual({ result: "ok" });
    });

    it("should throw for non-existent tool", async () => {
      await expect(registry.execute("missing", {})).rejects.toThrow(
        "Tool not found"
      );
    });
  });

  // プロパティベーステスト
  describe("property tests", () => {
    it("should maintain consistency: register + has + get", () => {
      fc.assert(
        fc.property(
          fc.record({
            name: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.string({ maxLength: 200 }),
          }),
          (toolDef) => {
            const tool = {
              ...toolDef,
              execute: vi.fn(),
              parameters: {},
            };

            registry.register(tool);

            // インバリアント: 登録後は has が true を返す
            fc.pre(registry.has(toolDef.name));

            // インバリアント: get は登録したツールを返す
            const retrieved = registry.get(toolDef.name);
            expect(retrieved?.name).toBe(toolDef.name);
            expect(retrieved?.description).toBe(toolDef.description);
          }
        )
      );
    });
  });
});
```

---

### 2. スナップショットテストの導入

#### 2.1 導入方針

| 対象 | 理由 | ファイル |
|------|------|---------|
| TUIコンポーネント出力 | 複雑な構造 | `tests/snapshots/tui/` |
| エラーメッセージ | 一貫性維持 | `tests/snapshots/errors/` |
| 設定ファイル生成 | 構造検証 | `tests/snapshots/config/` |
| ログフォーマット | フォーマット検証 | `tests/snapshots/logs/` |

#### 2.2 ディレクトリ構造

```
tests/snapshots/
├── tui/
│   ├── question-dialog.test.ts
│   └── plan-renderer.test.ts
├── errors/
│   └── error-messages.test.ts
├── config/
│   └── generated-configs.test.ts
└── __snapshots__/
    ├── question-dialog.test.ts.snap
    ├── plan-renderer.test.ts.snap
    └── ...
```

#### 2.3 コード例: TUIスナップショットテスト

```typescript
import { describe, it, expect } from "vitest";
import { renderQuestionDialog } from "@pi/extensions/question/ui";

describe("QuestionDialog snapshots", () => {
  it("should render single-choice question", () => {
    const output = renderQuestionDialog({
      type: "single-choice",
      question: "Which option?",
      options: ["Option A", "Option B", "Option C"],
      defaultOption: 0,
    });

    expect(output).toMatchSnapshot();
  });

  it("should render multi-select question", () => {
    const output = renderQuestionDialog({
      type: "multi-select",
      question: "Select all that apply:",
      options: ["Feature 1", "Feature 2", "Feature 3"],
      defaultOptions: [0, 2],
    });

    expect(output).toMatchSnapshot();
  });

  it("should render confirmation dialog", () => {
    const output = renderQuestionDialog({
      type: "confirm",
      question: "Are you sure?",
      defaultAnswer: false,
    });

    expect(output).toMatchSnapshot();
  });

  // インラインスナップショット（小さな出力用）
  it("should render empty state", () => {
    const output = renderQuestionDialog({
      type: "single-choice",
      question: "No options",
      options: [],
    });

    expect(output).toMatchInlineSnapshot(`
      "┌─────────────────────────────┐
       │ No options                  │
       │                             │
       │ (No options available)      │
       └─────────────────────────────┘"
    `);
  });
});
```

#### 2.4 コード例: エラーメッセージスナップショット

```typescript
import { describe, it, expect } from "vitest";
import { formatError } from "@pi/lib/errors/formatter";

describe("Error message snapshots", () => {
  it("should format validation error", () => {
    const error = new Error("Invalid input");
    error.name = "ValidationError";

    const formatted = formatError(error, { context: "user-input" });

    expect(formatted).toMatchSnapshot();
  });

  it("should format timeout error with stack trace", () => {
    const error = new Error("Operation timed out after 5000ms");
    error.name = "TimeoutError";
    error.stack = "TimeoutError: Operation timed out\n  at async execute";

    const formatted = formatError(error, {
      context: "api-call",
      includeStack: true,
    });

    expect(formatted).toMatchSnapshot();
  });

  // パラメータ化 + スナップショット
  it.each([
    ["network", "ECONNREFUSED"],
    ["permission", "EPERM"],
    ["not-found", "ENOENT"],
    ["memory", "ENOMEM"],
  ])("should format %s error (%s)", (type, code) => {
    const error = new Error(`${type} error occurred`);
    error.name = `${type}Error`;
    (error as any).code = code;

    const formatted = formatError(error);

    expect(formatted).toMatchSnapshot(`error-${type}`);
  });
});
```

---

### 3. パラメータ化テストの導入

#### 3.1 導入方針

| パターン | 使用場面 | 例 |
|----------|---------|-----|
| `it.each` | 固定データセット | エッジケース検証 |
| `describe.each` | 複数設定での同一テスト | 環境差異テスト |
| `fc.property` | プロパティベース | インバリアント検証 |

#### 3.2 コード例: バリデーションパラメータ化テスト

```typescript
import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateConfig } from "@pi/lib/config/validator";

describe("Config validation", () => {
  // 固定データセットでのパラメータ化
  describe.each([
    [
      "minimal",
      { name: "test", version: "1.0.0" },
      { valid: true, errors: [] },
    ],
    [
      "with description",
      { name: "test", version: "1.0.0", description: "Test config" },
      { valid: true, errors: [] },
    ],
    [
      "missing name",
      { version: "1.0.0" },
      { valid: false, errors: ["name is required"] },
    ],
    [
      "invalid version",
      { name: "test", version: "not-semver" },
      { valid: false, errors: ["version must be semver"] },
    ],
    [
      "empty name",
      { name: "", version: "1.0.0" },
      { valid: false, errors: ["name cannot be empty"] },
    ],
  ])("validateConfig: %s", (_name, config, expected) => {
    it(`should return ${expected.valid ? "valid" : "invalid"}`, () => {
      const result = validateConfig(config as any);

      expect(result.valid).toBe(expected.valid);
      if (!expected.valid) {
        expect(result.errors).toEqual(
          expect.arrayContaining(expected.errors)
        );
      }
    });
  });

  // 数値範囲のパラメータ化
  it.each([
    [0, false, "zero is invalid"],
    [1, true, "minimum valid"],
    [100, true, "normal value"],
    [1000, true, "large value"],
    [1001, false, "exceeds maximum"],
    [-1, false, "negative is invalid"],
  ])(
    "should validate timeout %i: %s",
    (timeout, expectedValid, _description) => {
      const result = validateConfig({
        name: "test",
        version: "1.0.0",
        timeout,
      } as any);

      expect(result.valid).toBe(expectedValid);
    }
  );

  // 文字列パターンのパラメータ化
  it.each([
    ["valid-name", true],
    ["valid_name", true],
    ["validName", true],
    ["invalid name", false],
    ["invalid.name", false],
    ["123invalid", false],
    ["", false],
    ["a".repeat(256), false], // too long
  ])("should validate name '%s': %s", (name, expectedValid) => {
    const result = validateConfig({
      name,
      version: "1.0.0",
    } as any);

    expect(result.valid).toBe(expectedValid);
  });
});
```

#### 3.3 コード例: 非同期パラメータ化テスト

```typescript
import { describe, it, expect } from "vitest";
import { retryWithBackoff } from "@pi/lib/retry/retry-with-backoff";

describe("retryWithBackoff parameterized", () => {
  const scenarios = [
    {
      name: "succeeds on first try",
      attempts: [true],
      expectedAttempts: 1,
      expectedDelay: 0,
    },
    {
      name: "succeeds on second try",
      attempts: [false, true],
      expectedAttempts: 2,
      expectedDelay: 100, // base delay
    },
    {
      name: "succeeds on third try",
      attempts: [false, false, true],
      expectedAttempts: 3,
      expectedDelay: 300, // 100 + 200
    },
    {
      name: "fails after max retries",
      attempts: [false, false, false, false],
      expectedAttempts: 4,
      expectedDelay: 700, // 100 + 200 + 400
      shouldThrow: true,
    },
  ];

  it.each(scenarios)(
    "$name",
    async ({ attempts, expectedAttempts, shouldThrow }) => {
      let callCount = 0;
      const operation = vi.fn(() => {
        const success = attempts[callCount++];
        if (success) return Promise.resolve("success");
        return Promise.reject(new Error("failed"));
      });

      if (shouldThrow) {
        await expect(
          retryWithBackoff(operation, { maxRetries: 3, baseDelay: 100 })
        ).rejects.toThrow("failed");
      } else {
        const result = await retryWithBackoff(operation, {
          maxRetries: 3,
          baseDelay: 100,
        });
        expect(result).toBe("success");
      }

      expect(operation).toHaveBeenCalledTimes(expectedAttempts);
    }
  );
});
```

---

### 4. テストリファクタリング（重複排除）

#### 4.1 重複パターンの特定

| 重複パターン | 出現箇所 | 対策 |
|-------------|---------|------|
| モック作成 | 50+ ファイル | 共有ヘルパー作成 |
| セットアップ処理 | 30+ ファイル | カスタムフィクスチャ |
| アサーションパターン | 40+ ファイル | カスタムマッチャー |
| テストデータ生成 | 60+ ファイル | ファクトリー関数 |

#### 4.2 共有モックヘルパー

**新規ファイル:** `tests/helpers/shared-mocks.ts`

```typescript
import { vi } from "vitest";

/**
 * 共有モックファクトリー
 * テスト間で再利用可能なモックインスタンスを生成
 */

// ファイルシステムモック
export function createFsMock(overrides: Partial<typeof import("node:fs")> = {}) {
  return {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn(() => "{}"),
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(() => []),
    statSync: vi.fn(() => ({ isFile: () => true, size: 0 })),
    ...overrides,
  };
}

// ExtensionAPIモック
export function createMockPi(overrides: Record<string, any> = {}) {
  return {
    // Core API
    log: vi.fn(),
    logError: vi.fn(),
    logWarning: vi.fn(),

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

// Agent Runtimeモック
export function createMockRuntime(overrides: Record<string, any> = {}) {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    isRunning: vi.fn(() => false),
    execute: vi.fn().mockResolvedValue({ success: true }),
    getStatus: vi.fn(() => "idle"),
    ...overrides,
  };
}

// Typeバリデーションモック
export function createMockTypeValidator() {
  return {
    validate: vi.fn(() => ({ valid: true, errors: [] })),
    coerce: vi.fn((v) => v),
    ...overrides,
  };
}

// HTTPクライアントモック
export function createMockHttpClient(responses: Record<string, any> = {}) {
  const mock = vi.fn(async (url: string) => {
    if (responses[url]) {
      return { ok: true, json: () => Promise.resolve(responses[url]) };
    }
    return { ok: false, status: 404 };
  });

  mock.mockResponse = (url: string, response: any) => {
    responses[url] = response;
  };

  return mock;
}
```

#### 4.3 カスタムフィクスチャ

**新規ファイル:** `tests/helpers/fixtures.ts`

```typescript
import { test as base, vi } from "vitest";
import { createMockPi, createMockRuntime, createFsMock } from "./shared-mocks";

// カスタムフィクスチャ型定義
type TestFixtures = {
  mockPi: ReturnType<typeof createMockPi>;
  mockRuntime: ReturnType<typeof createMockRuntime>;
  mockFs: ReturnType<typeof createFsMock>;
  tempDir: string;
  cleanState: void;
};

// フィクスチャ定義
export const test = base.extend<TestFixtures>({
  // 各テストで自動的にクリーンなPIモックを提供
  mockPi: async ({}, use) => {
    const mockPi = createMockPi();
    await use(mockPi);
    // クリーンアップ: 自動的にガベージコレクト
  },

  // ランタイムモック
  mockRuntime: async ({}, use) => {
    const runtime = createMockRuntime();
    await use(runtime);
    // 停止確認
    expect(runtime.stop).not.toHaveBeenCalled();
  },

  // ファイルシステムモック
  mockFs: async ({}, use) => {
    vi.mock("node:fs", () => createFsMock());
    await use(createFsMock());
    vi.unmock("node:fs");
  },

  // 一時ディレクトリ
  tempDir: async ({}, use) => {
    const os = await import("node:os");
    const path = await import("node:path");
    const tempDir = path.join(os.tmpdir(), `test-${Date.now()}`);

    await use(tempDir);

    // クリーンアップ: 一時ディレクトリ削除
    const fs = await import("node:fs/promises");
    await fs.rm(tempDir, { recursive: true, force: true });
  },

  // 状態クリーンアップ
  cleanState: async ({}, use) => {
    // テスト前: グローバル状態リセット
    vi.clearAllMocks();

    await use();

    // テスト後: 確実なクリーンアップ
    vi.restoreAllMocks();
    vi.resetModules();
  },
});

export { expect, describe, it } from "vitest";
```

#### 4.4 カスタムマッチャー

**新規ファイル:** `tests/helpers/custom-matchers.ts`

```typescript
import { expect } from "vitest";

// カスタムマッチャー定義
expect.extend({
  /**
   * オブジェクトが必要なプロパティを持つことを検証
   */
  toHaveRequiredProperties(received: any, required: string[]) {
    const missing = required.filter((prop) => !(prop in received));

    return {
      pass: missing.length === 0,
      message: () =>
        missing.length === 0
          ? `expected object not to have properties: ${required.join(", ")}`
          : `expected object to have properties: ${missing.join(", ")}`,
    };
  },

  /**
   * 非同期関数が指定した時間内に完了することを検証
   */
  async toCompleteWithin(received: () => Promise<any>, ms: number) {
    const start = Date.now();
    try {
      await received();
      const duration = Date.now() - start;
      return {
        pass: duration <= ms,
        message: () =>
          `expected function to complete within ${ms}ms, but took ${duration}ms`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () =>
          `expected function to complete within ${ms}ms, but threw: ${error}`,
      };
    }
  },

  /**
   * 値が有効なUUID形式であることを検証
   */
  toBeValidUuid(received: string) {
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return {
      pass: uuidRegex.test(received),
      message: () =>
        `expected ${received} to be a valid UUID`,
    };
  },

  /**
   * 配列がソートされていることを検証
   */
  toBeSorted(received: any[], options: { descending?: boolean } = {}) {
    const { descending = false } = options;
    let isSorted = true;

    for (let i = 1; i < received.length; i++) {
      if (descending) {
        if (received[i] > received[i - 1]) {
          isSorted = false;
          break;
        }
      } else {
        if (received[i] < received[i - 1]) {
          isSorted = false;
          break;
        }
      }
    }

    return {
      pass: isSorted,
      message: () =>
        `expected array to be sorted ${descending ? "descending" : "ascending"}`,
    };
  },
});

// TypeScript型定義
declare module "vitest" {
  interface Assertion<T = any> {
    toHaveRequiredProperties(required: string[]): void;
    toCompleteWithin(ms: number): Promise<void>;
    toBeValidUuid(): void;
    toBeSorted(options?: { descending?: boolean }): void;
  }
}
```

#### 4.5 ファクトリー関数

**新規ファイル:** `tests/helpers/factories.ts`

```typescript
import { v4 as uuidv4 } from "uuid";

/**
 * テストデータファクトリー
 * 一貫したテストデータを生成
 */

// Planファクトリー
export function createPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: uuidv4(),
    title: "Test Plan",
    description: "A test plan",
    status: "draft",
    steps: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Stepファクトリー
export function createStep(overrides: Partial<Step> = {}): Step {
  return {
    id: uuidv4(),
    title: "Test Step",
    description: "A test step",
    status: "pending",
    order: 0,
    ...overrides,
  };
}

// Subagentファクトリー
export function createSubagent(overrides: Partial<Subagent> = {}): Subagent {
  return {
    id: uuidv4(),
    name: "test-subagent",
    role: "Test role",
    status: "idle",
    createdAt: new Date(),
    ...overrides,
  };
}

// Messageファクトリー
export function createMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: uuidv4(),
    role: "user",
    content: "Test message",
    timestamp: new Date(),
    ...overrides,
  };
}

// バッチ生成ヘルパー
export function createPlans(count: number, overrides: Partial<Plan> = {}): Plan[] {
  return Array.from({ length: count }, (_, i) =>
    createPlan({ ...overrides, title: `Plan ${i + 1}` })
  );
}

export function createSteps(count: number, overrides: Partial<Step> = {}): Step[] {
  return Array.from({ length: count }, (_, i) =>
    createStep({ ...overrides, title: `Step ${i + 1}`, order: i })
  );
}

// シーケンス生成（プロパティテスト用）
export function* planSequence(): Generator<Plan> {
  let id = 1;
  while (true) {
    yield createPlan({
      id: `plan-${id}`,
      title: `Generated Plan ${id}`,
    });
    id++;
  }
}
```

---

### 5. 具体的な実装手順

#### フェーズ1: 基盤整備（Week 1）

```
Day 1-2: ヘルパー作成
├── tests/helpers/shared-mocks.ts
├── tests/helpers/fixtures.ts
├── tests/helpers/custom-matchers.ts
└── tests/helpers/factories.ts

Day 3: スナップショットテスト基盤
├── tests/snapshots/__snapshots__/
└── vitest.config.ts 更新

Day 4-5: P0モジュールテスト作成
├── tests/unit/lib/dynamic-tools/registry.test.ts
├── tests/unit/lib/dynamic-tools/registry.property.test.ts
├── tests/unit/lib/embeddings/registry.test.ts
└── tests/unit/lib/embeddings/registry.property.test.ts
```

#### フェーズ2: 拡充（Week 2）

```
Day 1-2: P1モジュールテスト
├── tests/unit/extensions/search/cache.test.ts
├── tests/unit/extensions/search/types.test.ts
└── tests/unit/extensions/search/metrics.test.ts

Day 3: スナップショットテスト
├── tests/snapshots/tui/question-dialog.test.ts
├── tests/snapshots/tui/plan-renderer.test.ts
└── tests/snapshots/errors/error-messages.test.ts

Day 4-5: リファクタリング
├── 重複テストの統合
└── モック使用箇所のヘルパー化
```

#### フェーズ3: 最適化（Week 3）

```
Day 1-2: カバレッジ分析と追加
├── カバレッジレポート確認
└── 低カバレッジ箇所の追加テスト

Day 3-4: パラメータ化テスト導入
├── 類似テストの統合
└── エッジケースのパラメータ化

Day 5: 最終検証
├── 全テスト実行
├── カバレッジ確認
└── ドキュメント更新
```

---

## 考慮事項

### 技術的制約

- **メモリ制約:** シングルスレッド実行設定を維持
- **テスト分離:** グローバル状態の適切なクリーンアップ
- **CI/CD:** 既存のCIパイプラインとの互換性

### 品質基準

- **カバレッジ目標:** フェーズ1で60%、最終で85%
- **テスト実行時間:** 5分以内を維持
- **スナップショット:** 差分レビューを必須化

### 保守性

- **ヘルパー:** 単一責任原則に従う
- **ファクトリー:** 拡張可能な設計
- **ドキュメント:** JSDoc/ABDDヘッダーを必須

---

## Todo

### フェーズ1: 基盤整備

- [x] `tests/helpers/shared-mocks.ts` 作成
  - [x] createFsMock 実装
  - [x] createMockPi 実装
  - [x] createMockRuntime 実装
  - [x] createMockTypeValidator 実装
  - [x] createMockHttpClient 実装
  - [x] JSDoc追加

- [x] `tests/helpers/fixtures.ts` 作成
  - [x] TestFixtures型定義
  - [x] mockPiフィクスチャ
  - [x] mockRuntimeフィクスチャ
  - [x] mockFsフィクスチャ
  - [x] tempDirフィクスチャ
  - [x] cleanStateフィクスチャ
  - [x] JSDoc追加

- [x] `tests/helpers/custom-matchers.ts` 作成
  - [x] toHaveRequiredProperties実装
  - [x] toCompleteWithin実装
  - [x] toBeValidUuid実装
  - [x] toBeSorted実装
  - [x] TypeScript型定義
  - [x] JSDoc追加

- [x] `tests/helpers/factories.ts` 作成
  - [x] createPlan実装
  - [x] createStep実装
  - [x] createSubagent実装
  - [x] createMessage実装
  - [x] バッチ生成ヘルパー
  - [x] JSDoc追加

- [ ] `vitest.config.ts` 更新
  - [ ] スナップショット設定追加

### フェーズ1: P0モジュールテスト

- [x] `tests/unit/lib/dynamic-tools/registry.test.ts` 作成
  - [x] register基本テスト
  - [x] register重複テスト
  - [x] registerバリデーションテスト（パラメータ化）
  - [x] execute基本テスト
  - [x] executeエラーテスト
  - [x] クリーンアップテスト
  - [x] JSDoc/ABDDヘッダー追加

- [x] `tests/unit/lib/dynamic-tools/registry.property.test.ts` 作成
  - [x] インバリアント: register + has + get 一貫性
  - [x] インバリアント: clear後は空
  - [x] インバリアント: 名前一意性
  - [x] JSDoc/ABDDヘッダー追加

- [x] `tests/unit/lib/embeddings/registry.test.ts` 作成
  - [x] register基本テスト
  - [x] getEmbeddingテスト
  - [x] listProvidersテスト
  - [x] パラメータ化テスト
  - [x] JSDoc/ABDDヘッダー追加

- [x] `tests/unit/lib/embeddings/registry.property.test.ts` 作成
  - [x] インバリアント: 登録後は取得可能
  - [x] インバリアント: プロバイダー名の一意性
  - [x] JSDoc/ABDDヘッダー追加

### フェーズ2: P1モジュールテスト

- [ ] `tests/unit/extensions/search/cache.test.ts` 作成
  - [ ] get/set基本テスト
  - [ ] TTLテスト
  - [ ] 無効化テスト
  - [ ] パラメータ化テスト
  - [ ] JSDoc/ABDDヘッダー追加

- [ ] `tests/unit/extensions/search/types.test.ts` 作成
  - [ ] 型ガードテスト
  - [ ] バリデーションテスト
  - [ ] パラメータ化テスト
  - [ ] JSDoc/ABDDヘッダー追加

- [ ] `tests/unit/extensions/search/metrics.test.ts` 作成
  - [ ] 計算ロジックテスト
  - [ ] 境界値テスト
  - [ ] パラメータ化テスト
  - [ ] JSDoc/ABDDヘッダー追加

### フェーズ2: スナップショットテスト

- [ ] `tests/snapshots/tui/question-dialog.test.ts` 作成
  - [ ] single-choiceスナップショット
  - [ ] multi-selectスナップショット
  - [ ] confirmスナップショット
  - [ ] インラインスナップショット例
  - [ ] JSDoc/ABDDヘッダー追加

- [ ] `tests/snapshots/tui/plan-renderer.test.ts` 作成
  - [ ] draft状態スナップショット
  - [ ] active状態スナップショット
  - [ ] completed状態スナップショット
  - [ ] JSDoc/ABDDヘッダー追加

- [ ] `tests/snapshots/errors/error-messages.test.ts` 作成
  - [ ] ValidationErrorスナップショット
  - [ ] TimeoutErrorスナップショット
  - [ ] パラメータ化 + スナップショット
  - [ ] JSDoc/ABDDヘッダー追加

### フェーズ2: リファクタリング

- [ ] 重複モックの置き換え（20ファイル）
  - [ ] shared-mocksへの移行
  - [ ] 動作確認

- [ ] 重複セットアップの置き換え（15ファイル）
  - [ ] fixturesへの移行
  - [ ] 動作確認

- [ ] 重複アサーションの置き換え（10ファイル）
  - [ ] custom-matchersへの移行
  - [ ] 動作確認

### フェーズ3: 最適化

- [ ] カバレッジレポート分析
  - [ ] 低カバレッジ箇所の特定
  - [ ] 優先順位付け

- [ ] 追加テスト作成
  - [ ] 低カバレッジ箇所のテスト
  - [ ] エッジケース追加

- [ ] パラメータ化テスト拡大
  - [ ] 類似テストの統合（10件）
  - [ ] エッジケースのパラメータ化

- [ ] 最終検証
  - [ ] 全テスト実行
  - [ ] カバレッジ確認（目標60%達成）
  - [ ] ドキュメント更新
  - [ ] README.md更新

---

## ファイルパス一覧

### 新規作成ファイル

```
tests/helpers/shared-mocks.ts
tests/helpers/fixtures.ts
tests/helpers/custom-matchers.ts
tests/helpers/factories.ts

tests/unit/lib/dynamic-tools/registry.test.ts
tests/unit/lib/dynamic-tools/registry.property.test.ts
tests/unit/lib/embeddings/registry.test.ts
tests/unit/lib/embeddings/registry.property.test.ts

tests/unit/extensions/search/cache.test.ts
tests/unit/extensions/search/types.test.ts
tests/unit/extensions/search/metrics.test.ts

tests/snapshots/tui/question-dialog.test.ts
tests/snapshots/tui/plan-renderer.test.ts
tests/snapshots/errors/error-messages.test.ts
tests/snapshots/__snapshots__/*.snap
```

### 更新ファイル

```
vitest.config.ts
tests/setup-vitest.ts (custom-matchers読み込み)
README.md (テストセクション更新)
```

---

**計画作成完了**

この計画に従って実装を進めることで、テストコードの品質と保守性が向上し、
カバレッジ目標の達成が可能になる。
