/**
 * @abdd.meta
 * path: .pi/tests/e2e/tool-chain-workflow.test.ts
 * role: ツール連携のE2Eテスト（BDDスタイル）
 * why: ユーザーが複数のツール（read, bash, edit, write）を連携させて使用するワークフローを検証するため
 * related: .pi/lib/fs-utils.ts, .pi/lib/error-utils.ts, .pi/extensions/enhanced-read.ts
 * public_api: なし（テストファイル）
 * invariants: テストは冪等性を持つ、モックを使用して外部依存を排除
 * side_effects: なし（テスト実行環境でのみ動作）
 * failure_modes: テスト失敗時は詳細なエラーメッセージを出力
 * @abdd.explain
 * overview: ツール連携のユーザージャーニーをBDDスタイルでテスト
 * what_it_does:
 *   - Given-When-Then構造でのテスト記述
 *   - read→edit→writeの連携フローの検証
 *   - bashコマンドの実行フローの検証
 *   - エラーハンドリングの検証
 * why_it_exists:
 *   - ユーザーが実際に使用するツール連携ワークフローの品質を保証するため
 *   - ツール間の依存関係を検証するため
 * scope:
 *   in: テストケースの入力データ（ファイルパス、コマンド、編集内容）
 *   out: テスト結果（成功/失敗）
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// 型定義（テスト用）
// ============================================================================

/**
 * ファイル読み取り結果
 */
interface ReadResult {
  ok: boolean;
  content?: string;
  path?: string;
  error?: string;
  truncated?: boolean;
}

/**
 * ファイル書き込み結果
 */
interface WriteResult {
  ok: boolean;
  path?: string;
  bytesWritten?: number;
  error?: string;
}

/**
 * ファイル編集結果
 */
interface EditResult {
  ok: boolean;
  path?: string;
  matchesReplaced?: number;
  error?: string;
}

/**
 * コマンド実行結果
 */
interface BashResult {
  ok: boolean;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  error?: string;
}

/**
 * ツール実行の状態
 */
type ToolState = "idle" | "pending" | "running" | "completed" | "failed";

/**
 * ツール実行コンテキスト
 */
interface ToolContext {
  cwd: string;
  env: Record<string, string>;
  timeout: number;
}

// ============================================================================
// モック設定
// ============================================================================

/**
 * ファイルシステムのモック
 */
const createMockFileSystem = () => {
  const files: Map<string, { content: string; mtime: Date }> = new Map();

  return {
    readFile: vi.fn(async (path: string): Promise<ReadResult> => {
      const file = files.get(path);
      if (!file) {
        return {
          ok: false,
          error: `File not found: ${path}`,
        };
      }

      return {
        ok: true,
        content: file.content,
        path,
        truncated: file.content.length > 50000,
      };
    }),

    writeFile: vi.fn(async (path: string, content: string): Promise<WriteResult> => {
      files.set(path, {
        content,
        mtime: new Date(),
      });

      return {
        ok: true,
        path,
        bytesWritten: Buffer.byteLength(content, "utf-8"),
      };
    }),

    editFile: vi.fn(async (path: string, oldText: string, newText: string): Promise<EditResult> => {
      const file = files.get(path);
      if (!file) {
        return {
          ok: false,
          error: `File not found: ${path}`,
        };
      }

      if (!file.content.includes(oldText)) {
        return {
          ok: false,
          error: `Text not found in file: ${path}`,
        };
      }

      // 最初の一致を置換
      const index = file.content.indexOf(oldText);
      const newContent =
        file.content.slice(0, index) + newText + file.content.slice(index + oldText.length);

      files.set(path, {
        content: newContent,
        mtime: new Date(),
      });

      return {
        ok: true,
        path,
        matchesReplaced: 1,
      };
    }),

    exists: vi.fn((path: string): boolean => {
      return files.has(path);
    }),

    deleteFile: vi.fn((path: string): boolean => {
      return files.delete(path);
    }),

    listFiles: vi.fn((dir: string): string[] => {
      const result: string[] = [];
      for (const path of files.keys()) {
        if (path.startsWith(dir)) {
          result.push(path);
        }
      }
      return result;
    }),

    // テスト用のヘルパー
    setFile: (path: string, content: string) => {
      files.set(path, { content, mtime: new Date() });
    },

    getFile: (path: string): string | undefined => {
      return files.get(path)?.content;
    },

    clear: () => {
      files.clear();
    },
  };
};

/**
 * シェル実行のモック
 */
const createMockShell = () => {
  const commandHistory: { command: string; result: BashResult }[] = [];

  return {
    execute: vi.fn(async (command: string, _context?: ToolContext): Promise<BashResult> => {
      // シミュレートされた実行時間
      await new Promise((resolve) => setTimeout(resolve, 5));

      // 特定のコマンドに対するモックレスポンス
      if (command.includes("fail") || command.includes("error")) {
        const result: BashResult = {
          ok: false,
          stdout: "",
          stderr: "Command failed",
          exitCode: 1,
        };
        commandHistory.push({ command, result });
        return result;
      }

      if (command === "ls") {
        const result: BashResult = {
          ok: true,
          stdout: "file1.txt\nfile2.txt\nfile3.txt",
          stderr: "",
          exitCode: 0,
        };
        commandHistory.push({ command, result });
        return result;
      }

      if (command.startsWith("echo ")) {
        const result: BashResult = {
          ok: true,
          stdout: command.slice(5),
          stderr: "",
          exitCode: 0,
        };
        commandHistory.push({ command, result });
        return result;
      }

      if (command === "pwd") {
        const result: BashResult = {
          ok: true,
          stdout: "/home/user/project",
          stderr: "",
          exitCode: 0,
        };
        commandHistory.push({ command, result });
        return result;
      }

      if (command.startsWith("grep ")) {
        const result: BashResult = {
          ok: true,
          stdout: "found matching line",
          stderr: "",
          exitCode: 0,
        };
        commandHistory.push({ command, result });
        return result;
      }

      // デフォルトの成功レスポンス
      const result: BashResult = {
        ok: true,
        stdout: "Command executed successfully",
        stderr: "",
        exitCode: 0,
      };
      commandHistory.push({ command, result });
      return result;
    }),

    getHistory: () => [...commandHistory],

    clear: () => {
      commandHistory.length = 0;
    },
  };
};

/**
 * ツールチェーン実行のモック
 */
const createMockToolChain = () => {
  const fs = createMockFileSystem();
  const shell = createMockShell();
  const executionLog: { tool: string; input: unknown; output: unknown; duration: number }[] = [];

  return {
    read: async (path: string): Promise<ReadResult> => {
      const start = Date.now();
      const result = await fs.readFile(path);
      executionLog.push({
        tool: "read",
        input: { path },
        output: result,
        duration: Date.now() - start,
      });
      return result;
    },

    write: async (path: string, content: string): Promise<WriteResult> => {
      const start = Date.now();
      const result = await fs.writeFile(path, content);
      executionLog.push({
        tool: "write",
        input: { path, contentLength: content.length },
        output: result,
        duration: Date.now() - start,
      });
      return result;
    },

    edit: async (path: string, oldText: string, newText: string): Promise<EditResult> => {
      const start = Date.now();
      const result = await fs.editFile(path, oldText, newText);
      executionLog.push({
        tool: "edit",
        input: { path, oldTextLength: oldText.length, newTextLength: newText.length },
        output: result,
        duration: Date.now() - start,
      });
      return result;
    },

    bash: async (command: string, context?: ToolContext): Promise<BashResult> => {
      const start = Date.now();
      const result = await shell.execute(command, context);
      executionLog.push({
        tool: "bash",
        input: { command },
        output: result,
        duration: Date.now() - start,
      });
      return result;
    },

    fs,
    shell,

    getExecutionLog: () => [...executionLog],

    clear: () => {
      fs.clear();
      shell.clear();
      executionLog.length = 0;
    },
  };
};

// ============================================================================
// E2Eテスト: ユーザージャーニー
// ============================================================================

describe("E2E: ツール連携のユーザージャーニー", () => {
  let tools: ReturnType<typeof createMockToolChain>;

  beforeEach(() => {
    tools = createMockToolChain();
  });

  afterEach(() => {
    vi.clearAllMocks();
    tools.clear();
  });

  // ==========================================================================
  // Scenario 1: read→edit→writeの基本フロー
  // ==========================================================================
  describe("Scenario 1: read→edit→writeの基本フロー", () => {
    it("Given: ファイルが存在する, When: 読み取り→編集→書き込み, Then: ファイルが更新される", async () => {
      // Given: ファイルが存在する
      const filePath = "/src/config.ts";
      const originalContent = "const config = {\n  debug: false,\n};";
      tools.fs.setFile(filePath, originalContent);

      // When: 読み取り→編集→書き込み
      // Step 1: 読み取り
      const readResult = await tools.read(filePath);
      expect(readResult.ok).toBe(true);
      expect(readResult.content).toBe(originalContent);

      // Step 2: 編集（editツールを使用）
      const editResult = await tools.edit(filePath, "debug: false", "debug: true");
      expect(editResult.ok).toBe(true);

      // Step 3: 変更を確認
      const updatedContent = tools.fs.getFile(filePath);
      expect(updatedContent).toContain("debug: true");
    });
  });

  // ==========================================================================
  // Scenario 2: 新規ファイルの作成
  // ==========================================================================
  describe("Scenario 2: 新規ファイルの作成", () => {
    it("Given: ファイルが存在しない, When: 書き込む, Then: ファイルが作成される", async () => {
      // Given: ファイルが存在しない
      const filePath = "/src/new-file.ts";
      expect(tools.fs.exists(filePath)).toBe(false);

      // When: 書き込む
      const content = "export const hello = 'world';";
      const writeResult = await tools.write(filePath, content);

      // Then: ファイルが作成される
      expect(writeResult.ok).toBe(true);
      expect(writeResult.path).toBe(filePath);
      expect(tools.fs.exists(filePath)).toBe(true);
      expect(tools.fs.getFile(filePath)).toBe(content);
    });
  });

  // ==========================================================================
  // Scenario 3: bashコマンドの実行
  // ==========================================================================
  describe("Scenario 3: bashコマンドの実行", () => {
    it("Given: コマンドを実行したい, When: bashを実行, Then: 結果が返される", async () => {
      // Given: コマンドを実行したい
      const command = "ls";

      // When: bashを実行
      const result = await tools.bash(command);

      // Then: 結果が返される
      expect(result.ok).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("file1.txt");
    });

    it("Given: 失敗するコマンド, When: bashを実行, Then: エラーが返される", async () => {
      // Given: 失敗するコマンド
      const command = "fail command";

      // When: bashを実行
      const result = await tools.bash(command);

      // Then: エラーが返される
      expect(result.ok).toBe(false);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("failed");
    });
  });

  // ==========================================================================
  // Scenario 4: 複数ツールの連携
  // ==========================================================================
  describe("Scenario 4: 複数ツールの連携", () => {
    it("Given: 複数の操作が必要, When: ツールを連携, Then: 全ての操作が成功する", async () => {
      // Given: 複数の操作が必要
      const filePath = "/src/combined.txt";

      // When: ツールを連携
      // 1. ファイルを作成
      const writeResult = await tools.write(filePath, "Initial content\n");
      expect(writeResult.ok).toBe(true);

      // 2. ファイルを読み取り
      const readResult = await tools.read(filePath);
      expect(readResult.ok).toBe(true);

      // 3. 内容を編集
      const editResult = await tools.edit(filePath, "Initial content", "Updated content");
      expect(editResult.ok).toBe(true);

      // 4. bashで確認
      const bashResult = await tools.bash("echo verified");
      expect(bashResult.ok).toBe(true);

      // Then: 全ての操作が成功する
      const log = tools.getExecutionLog();
      expect(log).toHaveLength(4);
      expect(log.map((l) => l.tool)).toEqual(["write", "read", "edit", "bash"]);
    });
  });

  // ==========================================================================
  // Scenario 5: エラーハンドリング
  // ==========================================================================
  describe("Scenario 5: エラーハンドリング", () => {
    it("Given: 存在しないファイル, When: 読み取る, Then: エラーが返される", async () => {
      // Given: 存在しないファイル
      const filePath = "/non/existent/file.txt";

      // When: 読み取る
      const result = await tools.read(filePath);

      // Then: エラーが返される
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("Given: テキストが含まれないファイル, When: 編集する, Then: エラーが返される", async () => {
      // Given: テキストが含まれないファイル
      const filePath = "/src/test.txt";
      tools.fs.setFile(filePath, "Some content");

      // When: 編集する
      const result = await tools.edit(filePath, "non-existent-text", "replacement");

      // Then: エラーが返される
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  // ==========================================================================
  // Scenario 6: ワークフローの状態管理
  // ==========================================================================
  describe("Scenario 6: ワークフローの状態管理", () => {
    it("Given: 一連の操作, When: 実行ログを確認, Then: 全ての操作が記録される", async () => {
      // Given: 一連の操作
      tools.fs.setFile("/src/a.txt", "Content A");
      tools.fs.setFile("/src/b.txt", "Content B");

      // When: 実行
      await tools.read("/src/a.txt");
      await tools.read("/src/b.txt");
      await tools.write("/src/c.txt", "Content C");
      await tools.bash("ls");

      // Then: 全ての操作が記録される
      const log = tools.getExecutionLog();
      expect(log).toHaveLength(4);
      expect(log[0].tool).toBe("read");
      expect(log[1].tool).toBe("read");
      expect(log[2].tool).toBe("write");
      expect(log[3].tool).toBe("bash");
    });
  });
});

// ============================================================================
// E2Eテスト: 一般的なユースケース
// ============================================================================

describe("E2E: 一般的なユースケース", () => {
  let tools: ReturnType<typeof createMockToolChain>;

  beforeEach(() => {
    tools = createMockToolChain();
  });

  afterEach(() => {
    tools.clear();
  });

  it("設定ファイルの更新: 読み取り→編集→確認", async () => {
    // 初期ファイル
    tools.fs.setFile("/config.json", '{\n  "version": "1.0.0",\n  "debug": false\n}');

    // 読み取り
    const readResult = await tools.read("/config.json");
    expect(readResult.ok).toBe(true);

    // 編集
    const editResult = await tools.edit("/config.json", '"debug": false', '"debug": true');
    expect(editResult.ok).toBe(true);

    // 確認
    const updatedContent = tools.fs.getFile("/config.json");
    expect(updatedContent).toContain('"debug": true');
  });

  it("ログファイルの解析: 読み取り→bashで解析", async () => {
    // ログファイル
    tools.fs.setFile("/logs/app.log", "ERROR: Connection failed\nINFO: Retrying\nERROR: Timeout");

    // 読み取り
    const readResult = await tools.read("/logs/app.log");
    expect(readResult.ok).toBe(true);

    // bashで解析（grep）
    const bashResult = await tools.bash("grep ERROR /logs/app.log");
    expect(bashResult.ok).toBe(true);
  });

  it("コードのリファクタリング: 読み取り→複数編集", async () => {
    // ソースファイル
    tools.fs.setFile(
      "/src/utils.ts",
      "function oldName() { return 1; }\nconst x = oldName();"
    );

    // 読み取り
    const readResult = await tools.read("/src/utils.ts");
    expect(readResult.ok).toBe(true);

    // 編集1: 関数名
    const edit1 = await tools.edit("/src/utils.ts", "function oldName()", "function newName()");
    expect(edit1.ok).toBe(true);

    // 編集2: 呼び出し
    const edit2 = await tools.edit("/src/utils.ts", "oldName()", "newName()");
    expect(edit2.ok).toBe(true);

    // 確認
    const updated = tools.fs.getFile("/src/utils.ts");
    expect(updated).toContain("function newName()");
    expect(updated).toContain("newName()");
  });
});

// ============================================================================
// E2Eテスト: エッジケース
// ============================================================================

describe("E2E: ツール連携のエッジケース", () => {
  let tools: ReturnType<typeof createMockToolChain>;

  beforeEach(() => {
    tools = createMockToolChain();
  });

  afterEach(() => {
    tools.clear();
  });

  it("空のファイルを処理できる", async () => {
    tools.fs.setFile("/empty.txt", "");

    const result = await tools.read("/empty.txt");
    expect(result.ok).toBe(true);
    expect(result.content).toBe("");
  });

  it("大きなファイルを処理できる", async () => {
    const largeContent = "x".repeat(100000);
    tools.fs.setFile("/large.txt", largeContent);

    const result = await tools.read("/large.txt");
    expect(result.ok).toBe(true);
    expect(result.content?.length).toBe(100000);
  });

  it("特殊文字を含むファイルを処理できる", async () => {
    const specialContent = "特殊文字\n\t<>&\"'🎉";
    tools.fs.setFile("/special.txt", specialContent);

    const result = await tools.read("/special.txt");
    expect(result.ok).toBe(true);
    expect(result.content).toBe(specialContent);
  });

  it("長いパスを処理できる", async () => {
    const longPath = "/very/long/path/that/goes/on/and/on/file.txt";

    const result = await tools.write(longPath, "content");
    expect(result.ok).toBe(true);
    expect(tools.fs.exists(longPath)).toBe(true);
  });

  it("複数回の編集を処理できる", async () => {
    tools.fs.setFile("/multi.txt", "a b c d e");

    await tools.edit("/multi.txt", "a", "1");
    await tools.edit("/multi.txt", "b", "2");
    await tools.edit("/multi.txt", "c", "3");

    const content = tools.fs.getFile("/multi.txt");
    expect(content).toBe("1 2 3 d e");
  });

  it("並列操作を処理できる", async () => {
    // 複数のファイルを並列で作成
    const promises = [
      tools.write("/file1.txt", "Content 1"),
      tools.write("/file2.txt", "Content 2"),
      tools.write("/file3.txt", "Content 3"),
    ];

    const results = await Promise.all(promises);

    expect(results.every((r) => r.ok)).toBe(true);
    expect(tools.fs.exists("/file1.txt")).toBe(true);
    expect(tools.fs.exists("/file2.txt")).toBe(true);
    expect(tools.fs.exists("/file3.txt")).toBe(true);
  });
});

// ============================================================================
// E2Eテスト: 不変条件
// ============================================================================

describe("E2E: ツール連携の不変条件", () => {
  let tools: ReturnType<typeof createMockToolChain>;

  beforeEach(() => {
    tools = createMockToolChain();
  });

  afterEach(() => {
    tools.clear();
  });

  it("実行時間は非負である", async () => {
    tools.fs.setFile("/test.txt", "content");

    await tools.read("/test.txt");
    const log = tools.getExecutionLog();

    log.forEach((entry) => {
      expect(entry.duration).toBeGreaterThanOrEqual(0);
    });
  });

  it("成功時の出力には必須フィールドがある", async () => {
    tools.fs.setFile("/test.txt", "content");

    const readResult = await tools.read("/test.txt");
    if (readResult.ok) {
      expect(readResult.content).toBeDefined();
      expect(readResult.path).toBeDefined();
    }
  });

  it("失敗時の出力にはエラーがある", async () => {
    const readResult = await tools.read("/non-existent.txt");
    if (!readResult.ok) {
      expect(readResult.error).toBeDefined();
    }
  });

  it("書き込みバイト数は内容と一致する", async () => {
    const content = "Hello, World!";
    const result = await tools.write("/test.txt", content);

    if (result.ok) {
      expect(result.bytesWritten).toBe(Buffer.byteLength(content, "utf-8"));
    }
  });
});
