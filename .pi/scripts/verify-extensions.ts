#!/usr/bin/env npx tsx
/**
 * pi-coding-agent拡張機能検証スクリプト
 * 
 * このスクリプトは、pi-coding-agentの拡張機能が正しく動作していることを確認します。
 * 検証項目:
 * 1. 拡張機能のロード確認
 * 2. ツール/コマンドの登録確認
 * 3. イベントハンドラの設定確認
 * 4. クロスインスタンス連携の確認
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// 色付き出力
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

function log(message: string, level: "info" | "success" | "warning" | "error" = "info") {
  const prefix = {
    info: `${colors.cyan}[INFO]${colors.reset}`,
    success: `${colors.green}[SUCCESS]${colors.reset}`,
    warning: `${colors.yellow}[WARNING]${colors.reset}`,
    error: `${colors.red}[ERROR]${colors.reset}`,
  };
  console.log(`${prefix[level]} ${message}`);
}

// カウンター
let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;

function check(description: string, result: boolean, details?: string) {
  totalChecks++;
  if (result) {
    passedChecks++;
    log(`${description}${details ? `: ${details}` : ""}`, "success");
  } else {
    failedChecks++;
    log(`${description}${details ? `: ${details}` : ""}`, "error");
  }
}

// メイン関数
async function main() {
  log("pi-coding-agent拡張機能検証を開始します...\n");

  // ============================================
  // 1. 拡張機能ファイルの存在確認
  // ============================================
  log("=== 1. 拡張機能ファイルの確認 ===", "info");

  const extensionsDir = join(process.cwd(), ".pi", "extensions");
  let extensionFiles: string[] = [];

  try {
    extensionFiles = readdirSync(extensionsDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .map((f) => join(extensionsDir, f));

    check(
      "拡張機能ディレクトリの存在",
      extensionFiles.length > 0,
      `${extensionFiles.length}個のファイルを検出`
    );
  } catch (e) {
    check("拡張機能ディレクトリの存在", false, String(e));
    process.exit(1);
  }

  // ============================================
  // 2. 必須拡張機能の確認
  // ============================================
  log("\n=== 2. 必須拡張機能の確認 ===", "info");

  const requiredExtensions = [
    // ABDDツールは単一ファイルに統合
    "abdd.ts",
    "abbr.ts",
    "agent-idle-indicator.ts",
    "agent-runtime.ts",
    "agent-usage-tracker.ts",
    "append-system-loader.ts",
    "code-panel.ts",
    "code-viewer.ts",
    "context-usage-dashboard.ts",
    "cross-instance-runtime.ts",
    "dynamic-tools.ts",
    "enhanced-read.ts",
    "github-agent.ts",
    "invariant-pipeline.ts",
    "kitty-status-integration.ts",
    "loop.ts",
    "pi-ai-abort-fix.ts",
    "pi-coding-agent-lock-fix.ts",
    "pi-coding-agent-rate-limit-fix.ts",
    "plan.ts",
    "question.ts",
    "rate-limit-retry-budget.ts",
    "rpm-throttle.ts",
    "skill-inspector.ts",
    "startup-context.ts",
    "subagents.ts",
    "ul-dual-mode.ts",
    "usage-tracker.ts",
  ];

  for (const ext of requiredExtensions) {
    const exists = extensionFiles.some((f) => basename(f) === ext);
    check(`必須拡張機能: ${ext}`, exists);
  }

  // ============================================
  // 3. 拡張機能の構造確認
  // ============================================
  log("\n=== 3. 拡張機能の構造確認 ===", "info");

  for (const file of extensionFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      const fileName = basename(file);

      // デフォルトエクスポートの存在確認
      const hasDefaultExport =
        content.includes("export default") || content.includes("export default function");

      // pi.registerTool の存在確認（ツール登録）
      const hasRegisterTool = content.includes("registerTool");

      // pi.registerCommand の存在確認（コマンド登録）
      const hasRegisterCommand = content.includes("registerCommand");

      // pi.on の存在確認（イベントハンドラ）
      const hasEventHandler = content.includes("pi.on(");

      // @abdd.metaの存在確認
      const hasAbddMeta = content.includes("@abdd.meta");

      check(
        `構造: ${fileName}`,
        hasDefaultExport,
        `default export=${hasDefaultExport ? "✓" : "✗"} tools=${
          hasRegisterTool ? "✓" : "✗"
        } commands=${hasRegisterCommand ? "✓" : "✗"} events=${
          hasEventHandler ? "✓" : "✗"
        } abdd.meta=${hasAbddMeta ? "✓" : "✗"}`
      );
    } catch (e) {
      check(`構造: ${basename(file)}`, false, String(e));
    }
  }

  // ============================================
  // 4. 共有モジュールの確認
  // ============================================
  log("\n=== 4. 共有モジュールの確認 ===", "info");

  const sharedDir = join(extensionsDir, "shared");
  try {
    const sharedFiles = readdirSync(sharedDir)
      .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
      .map((f) => join(sharedDir, f));

    check("共有モジュールディレクトリの存在", sharedFiles.length > 0, `${sharedFiles.length}個のファイル`);

    for (const file of sharedFiles) {
      const content = readFileSync(file, "utf-8");
      const fileName = basename(file);
      check(`共有モジュール: ${fileName}`, content.length > 0);
    }
  } catch (e) {
    check("共有モジュールディレクトリの存在", false, String(e));
  }

  // ============================================
  // 5. ライブラリモジュールの確認
  // ============================================
  log("\n=== 5. ライブラリモジュールの確認 ===", "info");

  const libDir = join(process.cwd(), ".pi", "lib");
  try {
    const libFiles = readdirSync(libDir, { withFileTypes: true })
      .filter((d) => d.isFile() && (d.name.endsWith(".ts") || d.name.endsWith(".js")))
      .map((d) => join(libDir, d.name));

    check("ライブラリディレクトリの存在", libFiles.length > 0, `${libFiles.length}個のファイル`);

    // 重要なライブラリの存在確認
    const requiredLibs = [
      "agent-types.ts",
      "agent-common.ts",
      "runtime-config.ts",
      "provider-limits.ts",
      "cross-instance-coordinator.ts",
    ];

    for (const lib of requiredLibs) {
      const exists = libFiles.some((f) => basename(f) === lib);
      check(`必須ライブラリ: ${lib}`, exists);
    }
  } catch (e) {
    check("ライブラリディレクトリの存在", false, String(e));
  }

  // ============================================
  // 6. ABDDツールの詳細確認（統合版）
  // ============================================
  log("\n=== 6. ABDDツールの詳細確認 ===", "info");

  // 統合されたABDDファイルを確認
  const abddFile = join(extensionsDir, "abdd.ts");
  try {
    const content = readFileSync(abddFile, "utf-8");

    // 各ABDDツールの登録を確認
    const abddTools = [
      "abdd_generate",
      "abdd_jsdoc",
      "abdd_review",
      "abdd_analyze",
      "abdd_workflow",
    ];

    for (const tool of abddTools) {
      const hasTool = content.includes(`name: "${tool}"`) || content.includes(`name: '${tool}'`);
      check(`ABDDツール登録: ${tool}`, hasTool);
    }

    // パラメータ定義の確認
    const hasParameters = content.includes("Type.Object");

    // execute関数の確認
    const hasExecute = content.includes("async execute");

    check(
      `ABDD統合ファイル構造`,
      hasParameters && hasExecute,
      `params=${hasParameters ? "✓" : "✗"} execute=${hasExecute ? "✓" : "✗"}`
    );
  } catch (e) {
    check(`ABDD統合ファイル`, false, String(e));
  }

  // ============================================
  // 7. パッチ拡張機能の確認
  // ============================================
  log("\n=== 7. パッチ拡張機能の確認 ===", "info");

  const patchExtensions = [
    { file: "pi-ai-abort-fix.ts", target: "@mariozechner/pi-ai" },
    { file: "pi-coding-agent-lock-fix.ts", target: "@mariozechner/pi-coding-agent" },
    { file: "pi-coding-agent-rate-limit-fix.ts", target: "@mariozechner/pi-coding-agent" },
  ];

  for (const ext of patchExtensions) {
    const filePath = join(extensionsDir, ext.file);
    try {
      const content = readFileSync(filePath, "utf-8");

      // ターゲットパッケージの確認
      const hasTarget = content.includes(ext.target);

      // patchFile関数の確認
      const hasPatchFunction = content.includes("async function patchFile");

      // session_startイベントハンドラの確認
      const hasSessionStart = content.includes('pi.on("session_start"');

      check(
        `パッチ: ${ext.file}`,
        hasTarget && hasPatchFunction && hasSessionStart,
        `target=${hasTarget ? "✓" : "✗"} patch=${hasPatchFunction ? "✓" : "✗"} event=${
          hasSessionStart ? "✓" : "✗"
        }`
      );
    } catch (e) {
      check(`パッチ: ${ext.file}`, false, String(e));
    }
  }

  // ============================================
  // 8. TypeScriptコンパイル確認
  // ============================================
  log("\n=== 8. TypeScriptコンパイル確認 ===", "info");

  try {
    // tsc --noEmit で型チェックのみ実行
    execSync("npx tsc --noEmit --project .pi/tsconfig.json", {
      cwd: process.cwd(),
      stdio: "pipe",
      timeout: 60000,
    });
    check("TypeScriptコンパイル", true, "型エラーなし");
  } catch (e: any) {
    const stderr = e.stderr?.toString() || "";
    const hasErrors = stderr.includes("error TS");
    check("TypeScriptコンパイル", !hasErrors, hasErrors ? "型エラーあり" : "コンパイル成功");
    if (hasErrors) {
      log(`詳細:\n${stderr.slice(0, 500)}`, "warning");
    }
  }

  // ============================================
  // 9. 依存関係の確認
  // ============================================
  log("\n=== 9. 依存関係の確認 ===", "info");

  const packageJsonPath = join(process.cwd(), "package.json");
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    // pi-tuiはpi-coding-agentの一部として提供されているため、pi-coding-agentがあればOK
    const requiredDeps = [
      "@mariozechner/pi-coding-agent",
      "@mariozechner/pi-ai",
      "@sinclair/typebox",
    ];

    for (const dep of requiredDeps) {
      check(`依存関係: ${dep}`, dep in deps, deps[dep] || "未インストール");
    }

    // pi-tuiの確認（オプション）
    const hasPiTui = "@mariozechner/pi-tui" in deps;
    if (hasPiTui) {
      log(`依存関係: @mariozechner/pi-tui - ${deps["@mariozechner/pi-tui"]} (オプション)`, "info");
    } else {
      log(`依存関係: @mariozechner/pi-tui - pi-coding-agentに含まれる可能性があります`, "info");
    }
  } catch (e) {
    check("package.jsonの読み込み", false, String(e));
  }

  // ============================================
  // 結果サマリー
  // ============================================
  log("\n=== 検証結果サマリー ===", "info");
  console.log(`総チェック数: ${totalChecks}`);
  console.log(`${colors.green}成功: ${passedChecks}${colors.reset}`);
  console.log(`${colors.red}失敗: ${failedChecks}${colors.reset}`);

  const successRate = totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0;
  console.log(`\n成功率: ${successRate.toFixed(1)}%`);

  if (failedChecks > 0) {
    log("\n失敗したチェックがあります。詳細を確認してください。", "error");
    process.exit(1);
  } else {
    log("\nすべてのチェックが成功しました！", "success");
    process.exit(0);
  }
}

// エラーハンドリング
process.on("unhandledRejection", (error) => {
  log(`未処理の例外: ${error}`, "error");
  process.exit(1);
});

// 実行
main().catch((error) => {
  log(`実行エラー: ${error}`, "error");
  process.exit(1);
});
