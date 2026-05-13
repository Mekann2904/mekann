/**
 * Plan Mode 拡張機能のテスト
 *
 * ユーティリティ関数（isSafeCommand, extractTodoItems, markCompletedSteps 等）と
 * 拡張機能全体の動作を検証するテストスイート。
 */

import { describe, it, expect } from "vitest";
import {
	isSafeCommand,
	extractTodoItems,
	extractDoneSteps,
	markCompletedSteps,
	cleanStepText,
	buildBlockReason,
	loadPrompt,
	type TodoItem,
} from "./utils.js";

// tool_call イベントのブロック判定をシミュレーション
function shouldBlockToolCall(
	planModeEnabled: boolean,
	toolName: string,
	input: Record<string, unknown>,
): boolean {
	const BLOCKED_TOOLS = ["edit", "write", "bash"];
	if (!planModeEnabled) return false;
	if (!BLOCKED_TOOLS.includes(toolName)) return false;
	if (toolName === "bash") {
		const command = input.command as string;
		if (isSafeCommand(command)) return false;
	}
	return true;
}

// ============================================================
// isSafeCommand — bash コマンドの安全性判定
// ============================================================
describe("isSafeCommand", () => {
	// --- 安全なコマンド ---
	describe("安全なコマンド", () => {
		const safeCommands = [
			"cat README.md",
			"head -20 package.json",
			"tail -n 50 output.log",
			"less file.txt",
			"more file.txt",
			"grep -r 'TODO' src/",
			"find . -name '*.ts'",
			"ls -la",
			"pwd",
			"echo 'hello'",
			"printf '%s\\n' foo bar",
			"wc -l file.txt",
			"sort names.txt",
			"uniq -c counts.txt",
			"diff old.txt new.txt",
			"file image.png",
			"stat config.json",
			"du -sh .",
			"df -h",
			"tree src/",
			"which node",
			"whereis git",
			"type npm",
			"env",
			"printenv PATH",
			"uname -a",
			"whoami",
			"id",
			"date",
			"uptime",
			"ps aux",
			"free -h",
			"git status",
			"git log --oneline -10",
			"git diff HEAD~1",
			"git show HEAD:file.ts",
			"git branch -a",
			"git remote -v",
			"git config --get user.name",
			"git ls-files",
			"git ls-remote --heads origin",
			"git submodule status",
			"git submodule summary",
			"npm list",
			"npm ls --depth=0",
			"npm view react version",
			"npm info express",
			"npm outdated",
			"npm audit",
			"node --version",
			"python --version",
			"jq '.name' package.json",
			"sed -n '1,10p' file.txt",
			"awk '{print $1}' data.txt",
			"rg 'pattern' src/",
			"fd '.ts$' src/",
			"bat README.md",
			"eza -la",
		];

		for (const cmd of safeCommands) {
			it(`✓ ${cmd}`, () => {
				expect(isSafeCommand(cmd)).toBe(true);
			});
		}
	});

	// --- 危険なコマンド ---
	describe("危険なコマンド", () => {
		const dangerousCommands = [
			"rm -rf node_modules",
			"rmdir empty_dir",
			"mv old.txt new.txt",
			"cp file.txt backup.txt",
			"mkdir new_directory",
			"touch newfile.txt",
			"chmod 755 script.sh",
			"chown user:group file.txt",
			"chgrp staff file.txt",
			"ln -s target link",
			"tee output.txt",
			"truncate -s 0 file.txt",
			"dd if=/dev/zero of=file.bin bs=1M count=10",
			"shred secret.txt",
			"npm install express",
			"npm uninstall lodash",
			"npm update",
			"npm ci",
			"yarn add react",
			"yarn remove lodash",
			"pnpm add typescript",
			"pip install requests",
			"apt-get install nginx",
			"brew install node",
			"git add .",
			"git commit -m 'test'",
			"git push origin main",
			"git pull origin main",
			"git merge feature",
			"git rebase main",
			"git reset --hard HEAD~1",
			"git checkout -b new-branch",
			"git stash",
			"git cherry-pick abc123",
			"git revert HEAD",
			"git tag v1.0",
			"git init",
			"git clone https://github.com/repo",
			"git submodule update --init",
			"sudo rm -rf /",
			"su root",
			"kill -9 1234",
			"pkill -f node",
			"killall node",
			"reboot",
			"shutdown -h now",
			"systemctl start nginx",
			"systemctl stop nginx",
			"service nginx start",
			"vim file.txt",
			"nano config.yaml",
			"emacs file.el",
			"code .",
			"subl file.txt",
		];

		for (const cmd of dangerousCommands) {
			it(`✗ ${cmd}`, () => {
				expect(isSafeCommand(cmd)).toBe(false);
			});
		}
	});

	// --- リダイレクトの処理 ---
	describe("リダイレクト", () => {
		it("安全なリダイレクト: 2>/dev/null を含む読み取りコマンドは安全", () => {
			expect(isSafeCommand("cat file.txt 2>/dev/null")).toBe(true);
		});

		it("安全なリダイレクト: 2>&1 を含む読み取りコマンドは安全", () => {
			expect(isSafeCommand("ls -la 2>&1")).toBe(true);
		});

		it("安全なリダイレクト: >/dev/null を含む読み取りコマンドは安全", () => {
			expect(isSafeCommand("grep pattern file.txt >/dev/null")).toBe(true);
		});

		it("危険なリダイレクト: > file への書き込み", () => {
			expect(isSafeCommand("echo hello > output.txt")).toBe(false);
		});

		it("危険なリダイレクト: >> file への追記", () => {
			expect(isSafeCommand("echo hello >> output.txt")).toBe(false);
		});
	});

	// --- エッジケース ---
	describe("エッジケース", () => {
		it("空文字列は危険", () => {
			expect(isSafeCommand("")).toBe(false);
		});

		it("安全でないコマンドは安全パターンにマッチしない限り危険", () => {
			expect(isSafeCommand("unknown-command")).toBe(false);
		});

		it("パイプ付きの安全なコマンドの最初の部分が安全でもパイプ先が危険なら判定される", () => {
			// isSafeCommand はコマンド全体を評価するため、パイプ先の内容次第
			// 現在の実装ではコマンド文字列全体に対してパターンマッチ
			const cmd = "cat file.txt | grep foo";
			expect(isSafeCommand(cmd)).toBe(true);
		});
	});
});

// ============================================================
// extractTodoItems — プランからステップを抽出
// ============================================================
describe("extractTodoItems", () => {
	describe("<proposed_plan> ブロックからの抽出", () => {
		it("基本的な箇条書きステップを抽出する", () => {
			const message = `
分析結果に基づいて、以下のプランを提案します。

<proposed_plan>
## 概要

認証モジュールのリファクタリング。

## Key Changes

- 新しいパスワードバリデーターを追加する
- 既存のテストを更新する
- API エンドポイントを修正する
- ドキュメントを追加する
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(4);
			expect(items[0]).toEqual({
				step: 1,
				text: "新しいパスワードバリデーターを追加する",
				completed: false,
			});
			expect(items[1]).toEqual({
				step: 2,
				text: "既存のテストを更新する",
				completed: false,
			});
			expect(items[2]).toEqual({
				step: 3,
				text: "API エンドポイントを修正する",
				completed: false,
			});
			expect(items[3]).toEqual({
				step: 4,
				text: "ドキュメントを追加する",
				completed: false,
			});
		});

		it("番号付きリストを抽出する", () => {
			const message = `
<proposed_plan>
## Steps

1. データベーススキーマを分析する
2. マイグレーションファイルを作成する
3. テストを実装する
4. コードレビューの準備をする
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(4);
			expect(items[0].text).toBe("データベーススキーマを分析する");
			expect(items[3].text).toBe("コードレビューの準備をする");
		});

		it("日本語セクションヘッダーを認識する", () => {
			const message = `
<proposed_plan>
## 概要

リファクタリングの概要。

## 実装の変更

- 型定義を追加する
- ユーティリティ関数をリファクタリングする
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(2);
			expect(items[0].text).toBe("型定義を追加する");
		});

		it("テスト計画セクションから抽出する", () => {
			const message = `
<proposed_plan>
## Test Plan

- ユニットテストを追加
- 統合テストを更新
- E2Eテストを実行
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(3);
		});

		it("セクションヘッダーがない場合はフォールバックですべての箇条書きを抽出する", () => {
			const message = `
<proposed_plan>
- ステップ1: 環境設定を行う
- ステップ2: 依存関係をインストール
- ステップ3: ビルドを実行
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(3);
		});

		it("セクションヘッダーが実装セクション以外の場合は抽出しない", () => {
			const message = `
<proposed_plan>
## Overview

This is just an overview section with no implementation items.

- これは概要セクションにあるアイテム
</proposed_plan>
`;
			const items = extractTodoItems(message);
			// Overview セクションの箇条書きは実装セクションではないので抽出されない
			expect(items).toHaveLength(0);
		});

		it("太字やコード記法を除去する", () => {
			const message = `
<proposed_plan>
## Key Changes

- **auth.ts** のパスワード検証を更新する
- \`validatePassword\` 関数を追加する
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(2);
			expect(items[0].text).toBe("Auth.ts のパスワード検証を更新する");
			expect(items[1].text).toBe("ValidatePassword 関数を追加する");
		});

		it("5文字以下の項目はスキップする", () => {
			const message = `
<proposed_plan>
## Key Changes

- 短い
- これは十分に長い説明文です
- xyz
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].text).toBe("これは十分に長い説明文です");
		});
	});

	describe("従来の Plan: ヘッダーからの抽出", () => {
		it("番号付きリストを抽出する", () => {
			const message = `
Plan:
1. 認証モジュールを分析する
2. パスワード検証ルールを特定する
3. データベーススキーマ変更を設計する
4. API エンドポイント修正を計画する
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(4);
			expect(items[0].text).toBe("認証モジュールを分析する");
			expect(items[3].text).toBe("API エンドポイント修正を計画する");
		});

		it("Plan: ヘッダーがない場合は空配列", () => {
			const message = "これはただのテキストで、プランは含まれていません。";
			const items = extractTodoItems(message);
			expect(items).toHaveLength(0);
		});
	});

	it("<proposed_plan> があれば Plan: ヘッダーより優先される", () => {
		const message = `
Plan:
1. Plan ヘッダーのステップ

<proposed_plan>
## Key Changes

- proposed_plan ブロックのステップ
</proposed_plan>
`;
		const items = extractTodoItems(message);
		expect(items).toHaveLength(1);
		expect(items[0].text).toBe("Proposed_plan ブロックのステップ");
	});
});

// ============================================================
// extractDoneSteps / markCompletedSteps — 完了マーカーの処理
// ============================================================
describe("extractDoneSteps", () => {
	it("[DONE:n] マーカーからステップ番号を抽出する", () => {
		expect(extractDoneSteps("完了 [DONE:1]")).toEqual([1]);
		expect(extractDoneSteps("ステップ1完了 [DONE:1]、ステップ2完了 [DONE:2]")).toEqual([1, 2]);
		expect(extractDoneSteps("[DONE:1] [DONE:3] [DONE:5]")).toEqual([1, 3, 5]);
	});

	it("大文字小文字を区別しない", () => {
		expect(extractDoneSteps("[done:1]")).toEqual([1]);
		expect(extractDoneSteps("[Done:1]")).toEqual([1]);
	});

	it("マーカーがない場合は空配列", () => {
		expect(extractDoneSteps("マーカーなし")).toEqual([]);
	});
});

describe("markCompletedSteps", () => {
	it("マーカーに一致するステップを完了にする", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "ステップ1", completed: false },
			{ step: 2, text: "ステップ2", completed: false },
			{ step: 3, text: "ステップ3", completed: false },
		];
		const count = markCompletedSteps("[DONE:1] [DONE:3]", items);
		expect(count).toBe(2);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(false);
		expect(items[2].completed).toBe(true);
	});

	it("存在しないステップ番号は無視される", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "ステップ1", completed: false },
		];
		const count = markCompletedSteps("[DONE:99]", items);
		expect(count).toBe(1); // 抽出はされた
		expect(items[0].completed).toBe(false); // マッチしなかった
	});

	it("すでに完了しているステップはそのまま", () => {
		const items: TodoItem[] = [
			{ step: 1, text: "ステップ1", completed: true },
		];
		markCompletedSteps("[DONE:1]", items);
		expect(items[0].completed).toBe(true);
	});
});

// ============================================================
// cleanStepText — ステップテキストのクリーンアップ
// ============================================================
describe("cleanStepText", () => {
	it("太字マーカーを除去する", () => {
		expect(cleanStepText("**太字テキスト**")).toBe("太字テキスト");
	});

	it("コードマーカーを除去する（先頭大文字化に注意）", () => {
		expect(cleanStepText("`code`")).toBe("Code");
	});

	it("先頭の動詞を除去する", () => {
		expect(cleanStepText("Create a new file")).toBe("A new file");
		// "Update the" → the も除去 → "configuration" → "Configuration"
		expect(cleanStepText("Update the configuration")).toBe("Configuration");
		expect(cleanStepText("Remove deprecated code")).toBe("Deprecated code");
	});

	it("先頭を大文字にする", () => {
		expect(cleanStepText("lowercase start")).toBe("Lowercase start");
	});

	it("80文字を超える場合は省略する", () => {
		const longText = "a".repeat(100);
		const result = cleanStepText(longText);
		expect(result.length).toBe(80);
		expect(result.endsWith("...")).toBe(true);
	});

	it("空白を正規化する", () => {
		expect(cleanStepText("  too   many   spaces  ")).toBe("Too many spaces");
	});

	it("空文字列はそのまま返す", () => {
		expect(cleanStepText("")).toBe("");
	});
});

// ============================================================
// 統合シナリオ — プランモードの完全なワークフロー
// ============================================================
describe("統合シナリオ: プランモードワークフロー", () => {
	it("フェーズ1: プラン抽出 → フェーズ2: 進捗追跡 → フェーズ3: 完了", () => {
		// --- フェーズ1: プラン提出 ---
		const planMessage = `
コードを分析した結果、以下のプランを提案します。

<proposed_plan>
## 概要

ユーザー認証フローの改善。

## Key Changes

- パスワードハッシュ化を bcrypt に移行する
- JWT トークンの有効期限を設定する
- ログイン失敗時のレート制限を追加する
- 認証関連のユニットテストを追加する

## Test Plan

- 既存のログインテストが通ることを確認
- 新しいハッシュ化ロジックのテスト
- レート制限のテスト
</proposed_plan>
`;
		const items = extractTodoItems(planMessage);
		expect(items.length).toBeGreaterThan(0);

		// すべてのステップが未完了であることを確認
		for (const item of items) {
			expect(item.completed).toBe(false);
		}

		// --- フェーズ2: 実行開始、ステップ完了 ---
		// 最初のステップを完了
		let marked = markCompletedSteps("[DONE:1]", items);
		expect(marked).toBe(1);
		expect(items[0].completed).toBe(true);

		// 2つ目のステップを完了
		marked = markCompletedSteps("[DONE:2]", items);
		expect(marked).toBe(1);
		expect(items[1].completed).toBe(true);

		// --- フェーズ3: 全ステップ完了 ---
		const remainingSteps = items.map((item, i) => `[DONE:${i + 1}]`).join(" ");
		markCompletedSteps(remainingSteps, items);

		const allCompleted = items.every((item) => item.completed);
		expect(allCompleted).toBe(true);
	});

	it("セッション復元シナリオ: 途中まで完了した状態から再開", () => {
		// プラン抽出
		const planMessage = `
<proposed_plan>
## Key Changes

- ステップ1の実装
- ステップ2の実装
- ステップ3の実装
</proposed_plan>
`;
		const items = extractTodoItems(planMessage);
		expect(items).toHaveLength(3);

		// セッション復元時の再スキャン: 最初の2ステップが完了済み
		const previousMessages = `
[DONE:1] ステップ1を実行しました。
[DONE:2] ステップ2を実行しました。
`;
		markCompletedSteps(previousMessages, items);

		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(true);
		expect(items[2].completed).toBe(false);

		// 残りのステップを完了
		markCompletedSteps("[DONE:3]", items);
		expect(items[2].completed).toBe(true);
	});

	it("プラン修正シナリオ: 新しい <proposed_plan> が古いプランを置き換える", () => {
		// 最初のプラン
		const plan1 = `
<proposed_plan>
## Key Changes

- 古いステップA
- 古いステップB
</proposed_plan>
`;
		let items = extractTodoItems(plan1);
		expect(items).toHaveLength(2);

		// 修正後のプラン（完全な置き換え）
		const plan2 = `
<proposed_plan>
## Key Changes

- 新しいステップX
- 新しいステップY
- 新しいステップZ
</proposed_plan>
`;
		items = extractTodoItems(plan2);
		expect(items).toHaveLength(3);
		expect(items[0].text).toBe("新しいステップX");
		// 古いプランの状態はリセットされる
		for (const item of items) {
			expect(item.completed).toBe(false);
		}
	});
});

// ============================================================
// セキュリティ: プランモードでの書き込みブロック
// ============================================================
describe("セキュリティ: bashコマンドブロック判定", () => {
	it("読み取りコマンドはプランモードで許可される", () => {
		const allowedCommands = [
			"cat src/index.ts",
			"grep -r 'import' src/",
			"find . -name '*.test.ts'",
			"ls -la src/",
			"git status",
			"git diff",
			"git log --oneline -5",
			"rg 'function' src/",
			"fd '.ts' src/",
		];
		for (const cmd of allowedCommands) {
			expect(isSafeCommand(cmd)).toBe(true);
		}
	});

	it("書き込み/変更コマンドはプランモードでブロックされる", () => {
		const blockedCommands = [
			"npm install",
			"git add .",
			"git commit -m 'changes'",
			"rm -rf dist/",
			"mv old.ts new.ts",
			"cp file.ts backup.ts",
			"echo 'text' > file.txt",
			"sed -i 's/old/new/g' file.txt",
			"chmod +x script.sh",
		];
		for (const cmd of blockedCommands) {
			expect(isSafeCommand(cmd)).toBe(false);
		}
	});

	it("2>/dev/null リダイレクト付きの読み取りは安全", () => {
		expect(isSafeCommand("cat file.txt 2>/dev/null")).toBe(true);
		expect(isSafeCommand("grep pattern file 2>/dev/null")).toBe(true);
	});
});

// ============================================================
// tool_call ブロック判定シミュレーション
// ============================================================
describe("tool_call ブロック判定", () => {
	it("プランモードOFFでは何もブロックしない", () => {
		expect(shouldBlockToolCall(false, "edit", { path: "file.ts" })).toBe(false);
		expect(shouldBlockToolCall(false, "write", { path: "file.ts" })).toBe(false);
		expect(shouldBlockToolCall(false, "bash", { command: "rm -rf /" })).toBe(false);
	});

	it("プランモードONでeditをブロックする", () => {
		expect(shouldBlockToolCall(true, "edit", { path: "src/index.ts" })).toBe(true);
	});

	it("プランモードONでwriteをブロックする", () => {
		expect(shouldBlockToolCall(true, "write", { path: "src/new-file.ts" })).toBe(true);
	});

	it("プランモードONで危険なbashをブロックする", () => {
		expect(shouldBlockToolCall(true, "bash", { command: "npm install" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "rm -rf dist" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "git commit -m 'test'" })).toBe(true);
	});

	it("プランモードONでも安全なbashは許可する", () => {
		expect(shouldBlockToolCall(true, "bash", { command: "ls -la" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "cat file.txt" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "grep pattern src/" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "git status" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "git diff" })).toBe(false);
	});

	it("プランモードONでread等の非ブロックツールは許可する", () => {
		expect(shouldBlockToolCall(true, "read", { path: "file.ts" })).toBe(false);
		expect(shouldBlockToolCall(true, "grep", { pattern: "TODO" })).toBe(false);
		expect(shouldBlockToolCall(true, "find", { path: "." })).toBe(false);
		expect(shouldBlockToolCall(true, "ls", { path: "." })).toBe(false);
	});
});

// ============================================================
// buildBlockReason — ブロック理由メッセージ
// ============================================================
describe("buildBlockReason", () => {
	it("1回目のブロック: edit ツール", () => {
		const reason = buildBlockReason("edit", { path: "src/index.ts" }, 1);
		expect(reason).toContain("【プランモード・読み取り専用】");
		expect(reason).toContain("ファイル編集");
		expect(reason).toContain("src/index.ts");
		expect(reason).toContain("ファイル変更は一切禁止");
	});

	it("1回目のブロック: bash ツール", () => {
		const reason = buildBlockReason("bash", { command: "npm install" }, 1);
		expect(reason).toContain("【プランモード・読み取り専用】");
		expect(reason).toContain("シェルコマンド");
		expect(reason).toContain("npm install");
		expect(reason).toContain("読み取りコマンド");
	});

	it("2回目のブロック: 警告が強化される", () => {
		const reason = buildBlockReason("edit", { path: "file.ts" }, 2);
		expect(reason).toContain("2回目のブロック");
		expect(reason).toContain("再度試行しても同じ結果");
		expect(reason).toContain("<proposed_plan>");
	});

	it("3回目のブロック: 最高レベルの警告", () => {
		const reason = buildBlockReason("bash", { command: "rm -rf /" }, 3);
		expect(reason).toContain("3回ブロック済み");
		expect(reason).toContain("今すぐ停止");
		expect(reason).toContain("絶対に再試行しないでください");
		expect(reason).toContain("<proposed_plan>");
	});

	it("4回以上のブロック: 同じ最高レベル警告", () => {
		const reason = buildBlockReason("edit", { path: "file.ts" }, 5);
		expect(reason).toContain("5回ブロック済み");
		expect(reason).toContain("絶対に再試行しないでください");
	});
});


// ============================================================
// loadPrompt — プロンプトファイル読み込み
// ============================================================
describe("loadPrompt", () => {
	it("plan-mode.md を読み込める", () => {
		const prompt = loadPrompt("plan-mode");
		expect(prompt).toContain("プランモード（対話型）");
		expect(prompt).toContain("フェーズ1");
		expect(prompt).toContain("<proposed_plan>");
	});

	it("execute-mode.md を読み込める", () => {
		const prompt = loadPrompt("execute-mode");
		expect(prompt).toContain("プラン実行モード");
		expect(prompt).toContain("\${completedList}");
		expect(prompt).toContain("\${todoList}");
	});

	it("存在しないファイルはエラーを投げる", () => {
		expect(() => loadPrompt("nonexistent")).toThrow(
			"プロンプトファイルが見つかりません: prompts/nonexistent.md",
		);
	});

	it("変数置換が機能する", () => {
		const prompt = loadPrompt("execute-mode", {
			completedList: "1. 完了済み ✓",
			todoList: "2. 未完了ステップ",
		});
		expect(prompt).toContain("1. 完了済み ✓");
		expect(prompt).toContain("2. 未完了ステップ");
		expect(prompt).not.toContain("\${completedList}");
		expect(prompt).not.toContain("\${todoList}");
	});

	it("変数なしで読み込むとプレースホルダーがそのまま残る", () => {
		const prompt = loadPrompt("execute-mode");
		expect(prompt).toContain("\${completedList}");
		expect(prompt).toContain("\${todoList}");
	});
});
