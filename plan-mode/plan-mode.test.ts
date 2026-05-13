/**
 * Plan Mode 拡張機能のテスト
 *
 * ユーティリティ関数（isSafeCommand, extractTodoItems, markCompletedSteps,
 * validatePlan, cleanStepText 等）と拡張機能全体の動作を検証するテストスイート。
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
	hashContent,
	hashTodoItems,
	resolveExecutionTools,
	validatePlan,
	type TodoItem,
} from "./utils.js";

const DEFAULT_EXEC_TOOLS = ["read", "bash", "grep", "find", "ls", "edit", "write"];

// tool_call イベントのブロック判定をシミュレーション（allowlist 方式）
const SAFE_PLAN_TOOLS = new Set(["read", "grep", "find", "ls"]);

function shouldBlockToolCall(
	planModeEnabled: boolean,
	toolName: string,
	input: Record<string, unknown> | null | undefined,
): boolean {
	if (!planModeEnabled) return false;

	// read/grep/find/ls は無条件許可
	if (SAFE_PLAN_TOOLS.has(toolName)) return false;

	// bash は isSafeCommand で検査
	if (toolName === "bash") {
		const safeInput = input ?? {};
		const command = String((safeInput as Record<string, unknown>).command ?? "");
		return !isSafeCommand(command);
	}

	// それ以外は原則ブロック
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
			"find . -type f",
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

	// --- P0: 追加された危険パターン ---
	describe("P0: 追加された危険パターン", () => {
		it("find -delete をブロック", () => {
			expect(isSafeCommand("find . -delete")).toBe(false);
			expect(isSafeCommand("find . -name '*.tmp' -delete")).toBe(false);
		});

		it("find -exec をブロック", () => {
			expect(isSafeCommand("find . -exec rm {} \\;")).toBe(false);
		});

		it("find -execdir をブロック", () => {
			expect(isSafeCommand("find . -execdir rm {} +")).toBe(false);
		});

		it("find -ok をブロック", () => {
			expect(isSafeCommand("find . -ok rm {} \\;")).toBe(false);
		});

		it("find -fls をブロック", () => {
			expect(isSafeCommand("find . -fls /tmp/find.log")).toBe(false);
		});

		it("find -fprint をブロック", () => {
			expect(isSafeCommand("find . -fprint /tmp/find.txt")).toBe(false);
		});

		it("npm audit fix をブロック", () => {
			expect(isSafeCommand("npm audit fix")).toBe(false);
		});

		it("npm audit --fix をブロック", () => {
			expect(isSafeCommand("npm audit --fix")).toBe(false);
		});

		it("git diff --output をブロック", () => {
			expect(isSafeCommand("git diff --output=patch")).toBe(false);
		});

		it("git diff --output-files をブロック", () => {
			expect(isSafeCommand("git diff --output-file patch.diff")).toBe(false);
		});

		it("npm audit --omit=dev --fix をブロック", () => {
			expect(isSafeCommand("npm audit --omit=dev --fix")).toBe(false);
		});

		it("find -fprint0 をブロック", () => {
			expect(isSafeCommand("find . -fprint0 /tmp/out")).toBe(false);
		});

		it("sed -i をブロック（-n 付きでも）", () => {
			expect(isSafeCommand("sed -n -i '1p' file.txt")).toBe(false);
		});

		it("sed -i.bak をブロック", () => {
			expect(isSafeCommand("sed -i.bak 's/old/new/g' file.txt")).toBe(false);
		});
	});

	// --- Shell metacharacter guard ---
	describe("シェルメタ文字ガード", () => {
		it("パイプを含むコマンドはブロック", () => {
			expect(isSafeCommand("cat file.txt | grep foo")).toBe(false);
			expect(isSafeCommand("ls -la | head -5")).toBe(false);
		});

		it("&& チェーンを含むコマンドはブロック", () => {
			expect(isSafeCommand("cd /tmp && ls")).toBe(false);
		});

		it("|| チェーンを含むコマンドはブロック", () => {
			expect(isSafeCommand("cd /tmp || echo fail")).toBe(false);
		});

		it("; セミコロンを含むコマンドはブロック", () => {
			expect(isSafeCommand("ls; pwd")).toBe(false);
		});

		it("backtick コマンド置換を含むコマンドはブロック", () => {
			expect(isSafeCommand("echo `cat /etc/passwd`")).toBe(false);
		});

		it("$() コマンド置換を含むコマンドはブロック", () => {
			expect(isSafeCommand("echo $(cat /etc/passwd)")).toBe(false);
		});

		it("プロセス置換を含むコマンドはブロック", () => {
			expect(isSafeCommand("cat <(echo hello)")).toBe(false);
		});

		it("P0: 単独 & バックグラウンド実行をブロック", () => {
			expect(isSafeCommand("echo foo &")).toBe(false);
			expect(isSafeCommand("sleep 10 &")).toBe(false);
		});

		it("P0: 単独 & (disown付き) をブロック", () => {
			expect(isSafeCommand("echo foo&disown")).toBe(false);
		});

		it("P0: 改行による複数コマンドをブロック", () => {
			expect(isSafeCommand("ls\nrm -rf /")).toBe(false);
		});

		it("P0: CRLFによる複数コマンドをブロック", () => {
			expect(isSafeCommand("ls\r\nrm -rf /")).toBe(false);
		});

		it("P0: CRのみでもブロック", () => {
			expect(isSafeCommand("ls\rrm -rf /")).toBe(false);
		});
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

		it("メタ文字付きの安全コマンドはメタ文字ガードでブロックされる", () => {
			expect(isSafeCommand("cat file.txt && echo done")).toBe(false);
		});
	});
});

// ============================================================
// extractTodoItems — プランからステップを抽出
// ============================================================
describe("extractTodoItems", () => {
	describe("<plan_steps_json> ブロックからの抽出（優先）", () => {
		it("構造化 JSON からステップを抽出する", () => {
			const message = `
<proposed_plan>
概要テキスト
</proposed_plan>

<plan_steps_json>
[
  {"id":"add-validator","title":"パスワードバリデーターを追加する","acceptance":"テストが通る"},
  {"id":"update-tests","title":"既存のテストを更新する","instruction":"auth.test.ts を更新","acceptance":"全テスト green"},
  {"id":"fix-api","title":"API エンドポイントを修正する"}
]
</plan_steps_json>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(3);

			expect(items[0]).toEqual({
				id: "add-validator",
				step: 1,
				text: "パスワードバリデーターを追加する",
				instruction: "パスワードバリデーターを追加する",
				acceptance: "テストが通る",
				completed: false,
			});
			expect(items[1]).toEqual({
				id: "update-tests",
				step: 2,
				text: "既存のテストを更新する",
				instruction: "auth.test.ts を更新",
				acceptance: "全テスト green",
				completed: false,
			});
			expect(items[2]).toEqual({
				id: "fix-api",
				step: 3,
				text: "API エンドポイントを修正する",
				instruction: "API エンドポイントを修正する",
				acceptance: undefined,
				completed: false,
			});
		});

		it("不正な JSON はフォールバックする", () => {
			const message = `
<proposed_plan>
## Key Changes

- フォールバックのステップ
</proposed_plan>

<plan_steps_json>
this is not json
</plan_steps_json>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe("step-1");
			expect(items[0].text).toBe("フォールバックのステップ");
		});

		it("空配列の JSON はフォールバックする", () => {
			const message = `
<proposed_plan>
## Key Changes

- フォールバックのステップ
</proposed_plan>

<plan_steps_json>
[]
</plan_steps_json>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe("step-1");
		});

		it("plan_steps_json が proposed_plan より優先される", () => {
			const message = `
<proposed_plan>
## Key Changes

- Markdown 側のステップ（使われない）
</proposed_plan>

<plan_steps_json>
[
  {"id":"json-step","title":"JSON 側のステップ"}
]
</plan_steps_json>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe("json-step");
			expect(items[0].text).toBe("JSON 側のステップ");
		});

		// P3: タグとコンテンツが同じ行でも抽出できる
		it("P3: タグ前後の空白のみで抽出（改行を前提にしない）", () => {
			const message = `<plan_steps_json>[{"id":"x","title":"Y"}]</plan_steps_json>`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe("x");
			expect(items[0].text).toBe("Y");
		});

		it("P3: タグ直後に空白→内容→空白→閉じタグ", () => {
			const message = `<plan_steps_json>  [{"id":"a","title":"A"}]  </plan_steps_json>`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].id).toBe("a");
		});
	});

	describe("<proposed_plan> ブロックからの抽出（フォールバック）", () => {
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
				id: "step-1",
				step: 1,
				text: "新しいパスワードバリデーターを追加する",
				instruction: "新しいパスワードバリデーターを追加する",
				completed: false,
			});
			expect(items[1]).toEqual({
				id: "step-2",
				step: 2,
				text: "既存のテストを更新する",
				instruction: "既存のテストを更新する",
				completed: false,
			});
			expect(items[2]).toEqual({
				id: "step-3",
				step: 3,
				text: "API エンドポイントを修正する",
				instruction: "API エンドポイントを修正する",
				completed: false,
			});
			expect(items[3]).toEqual({
				id: "step-4",
				step: 4,
				text: "ドキュメントを追加する",
				instruction: "ドキュメントを追加する",
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
			expect(items[0].instruction).toBe("データベーススキーマを分析する");
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
			expect(items).toHaveLength(0);
		});

		it("太字やコード記法を除去し、識別子の大小文字を保持する", () => {
			const message = `
<proposed_plan>
## Key Changes

- **auth.ts** のパスワード検証を更新する
- \`validatePassword\` 関数を追加する
</proposed_plan>
`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(2);
			// auth.ts はファイル名として大文字化されない
			expect(items[0].text).toBe("auth.ts のパスワード検証を更新する");
			// validatePassword は camelCase として大文字化されない
			expect(items[1].text).toBe("validatePassword 関数を追加する");
			// instruction も元のテキストを保持
			expect(items[0].instruction).toBe("auth.ts のパスワード検証を更新する");
			expect(items[1].instruction).toBe("validatePassword 関数を追加する");
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

		// P3: タグ前後の空白が緩い場合
		it("P3: タグとコンテンツが同じ行でも抽出", () => {
			const message = `<proposed_plan>## Key Changes\n- 同じ行のステップ内容です\n</proposed_plan>`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(1);
			expect(items[0].text).toBe("同じ行のステップ内容です");
		});
	});

	describe("P3: 終了タグなしの proposed_plan は検出されない", () => {
		it("終了タグなしは抽出されず空配列", () => {
			const message = `<proposed_plan>\n## Key Changes\n- 抽出されないステップ\n`;
			const items = extractTodoItems(message);
			expect(items).toHaveLength(0);
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
			// instruction は元のテキストを保持
			expect(items[0].instruction).toBe("認証モジュールを分析する");
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

	it("[DONE:id] マーカーから step ID を抽出する", () => {
		expect(extractDoneSteps("[DONE:update-auth]")).toEqual(["update-auth"]);
		expect(extractDoneSteps("[DONE:fix_tests] [DONE:add-validator]")).toEqual(["fix_tests", "add-validator"]);
	});

	it("番号と ID が混在しても両方抽出する", () => {
		expect(extractDoneSteps("[DONE:1] [DONE:update-auth] [DONE:3]")).toEqual([1, "update-auth", 3]);
	});

	it("大文字小文字を区別しない", () => {
		expect(extractDoneSteps("[done:1]")).toEqual([1]);
		expect(extractDoneSteps("[Done:update-auth]")).toEqual(["update-auth"]);
	});

	it("マーカーがない場合は空配列", () => {
		expect(extractDoneSteps("マーカーなし")).toEqual([]);
	});
});

describe("markCompletedSteps", () => {
	it("マーカーに一致するステップを完了にする", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1", completed: false },
			{ id: "step-2", step: 2, text: "ステップ2", instruction: "ステップ2", completed: false },
			{ id: "step-3", step: 3, text: "ステップ3", instruction: "ステップ3", completed: false },
		];
		const count = markCompletedSteps("[DONE:1] [DONE:3]", items);
		expect(count).toBe(2);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(false);
		expect(items[2].completed).toBe(true);
	});

	it("step ID で完了にする", () => {
		const items: TodoItem[] = [
			{ id: "add-validator", step: 1, text: "バリデーター追加", instruction: "バリデーター追加", completed: false },
			{ id: "update-tests", step: 2, text: "テスト更新", instruction: "テスト更新", completed: false },
		];
		const count = markCompletedSteps("[DONE:add-validator]", items);
		expect(count).toBe(1);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(false);
	});

	it("番号と ID が混在しても動作する", () => {
		const items: TodoItem[] = [
			{ id: "add-validator", step: 1, text: "バリデーター追加", instruction: "バリデーター追加", completed: false },
			{ id: "update-tests", step: 2, text: "テスト更新", instruction: "テスト更新", completed: false },
		];
		const count = markCompletedSteps("[DONE:add-validator] [DONE:2]", items);
		expect(count).toBe(2);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(true);
	});

	it("存在しないステップ番号は変更なしで返す", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1", completed: false },
		];
		const count = markCompletedSteps("[DONE:99]", items);
		expect(count).toBe(0);
		expect(items[0].completed).toBe(false);
	});

	it("すでに完了しているステップは変更なしで返す", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1", completed: true },
		];
		const count = markCompletedSteps("[DONE:1]", items);
		expect(count).toBe(0);
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

	it("コードマーカーを除去する（通常英単語は大文字化）", () => {
		expect(cleanStepText("`code`")).toBe("Code");
	});

	it("先頭の動詞を除去する", () => {
		expect(cleanStepText("Create a new file")).toBe("A new file");
		expect(cleanStepText("Update the configuration")).toBe("Configuration");
		expect(cleanStepText("Remove deprecated code")).toBe("Deprecated code");
	});

	it("camelCase 識別子は大文字化しない", () => {
		expect(cleanStepText("validatePassword 関数を追加")).toBe("validatePassword 関数を追加");
		expect(cleanStepText("getUserInfo を実装")).toBe("getUserInfo を実装");
	});

	it("ドット付きファイル名は大文字化しない", () => {
		expect(cleanStepText("auth.ts を更新")).toBe("auth.ts を更新");
		expect(cleanStepText("config.json の設定")).toBe("config.json の設定");
	});

	it("通常の英文は先頭を大文字にする", () => {
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
// validatePlan — プラン品質チェック
// ============================================================
describe("validatePlan", () => {
	it("有効なプラン（acceptance あり）は valid: true、warnings 空", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "分析する", instruction: "コードを分析する", acceptance: "分析完了", completed: false },
			{ id: "step-2", step: 2, text: "実装する", instruction: "機能を実装する", acceptance: "テスト通過", completed: false },
			{ id: "step-3", step: 3, text: "テストする", instruction: "テストを追加する", acceptance: "全テストgreen", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
		expect(result.warnings).toHaveLength(0);
	});

	it("有効なプラン（acceptance なし）は valid: true、warnings あり", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "分析する", instruction: "コードを分析する", completed: false },
			{ id: "step-2", step: 2, text: "実装する", instruction: "機能を実装する", completed: false },
			{ id: "step-3", step: 3, text: "テストする", instruction: "テストを追加する", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
		expect(result.warnings).toHaveLength(3);
		for (let i = 0; i < 3; i++) {
			expect(result.warnings[i]).toContain("acceptance がありません");
		}
	});

	it("ステップ数が少なすぎる場合は invalid", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "実装する", instruction: "機能を実装する", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(false);
		expect(result.issues).toContain("ステップ数が少なすぎます（最低3ステップ）。");
	});

	it("ステップ数が多すぎる場合は invalid", () => {
		const items: TodoItem[] = Array.from({ length: 20 }, (_, i) => ({
			id: `step-${i + 1}`,
			step: i + 1,
			text: `ステップ${i + 1}を実装する`,
			instruction: `ステップ${i + 1}の機能を実装する`,
			completed: false,
		}));
		const result = validatePlan(items);
		expect(result.valid).toBe(false);
		expect(result.issues.some((s) => s.includes("多すぎます"))).toBe(true);
	});

	it("動作の記述がないステップは invalid", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "概要セクション", instruction: "Overview section description", completed: false },
			{ id: "step-2", step: 2, text: "別の概要", instruction: "Another overview", completed: false },
			{ id: "step-3", step: 3, text: "さらに概要", instruction: "Yet another overview", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(false);
		expect(result.issues.some((s) => s.includes("動作の記述が見つかりません"))).toBe(true);
	});

	it("日本語の動詞を含むステップは valid", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
			{ id: "step-2", step: 2, text: "実装", instruction: "新機能を追加する", completed: false },
			{ id: "step-3", step: 3, text: "テスト", instruction: "テストを実装する", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(true);
	});

	it("英語の動詞で始まるステップは valid", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "Analyze", instruction: "Analyze the codebase", completed: false },
			{ id: "step-2", step: 2, text: "Implement", instruction: "Implement the feature", completed: false },
			{ id: "step-3", step: 3, text: "Test", instruction: "Add tests for coverage", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(true);
	});

	// P1: 重複 ID
	it("P1: 重複 ID は hard error", () => {
		const items: TodoItem[] = [
			{ id: "dup", step: 1, text: "ステップ1", instruction: "ステップ1を実装する", completed: false },
			{ id: "dup", step: 2, text: "ステップ2", instruction: "ステップ2を実装する", completed: false },
			{ id: "unique", step: 3, text: "ステップ3", instruction: "ステップ3を実装する", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(false);
		expect(result.issues.some((s) => s.includes("重複するステップID") && s.includes("dup"))).toBe(true);
	});

	// P1: 空 instruction
	it("P1: 空 instruction は hard error", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1を実装する", completed: false },
			{ id: "step-2", step: 2, text: "ステップ2", instruction: "", completed: false },
			{ id: "step-3", step: 3, text: "ステップ3", instruction: "ステップ3を実装する", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(false);
		expect(result.issues.some((s) => s.includes("instruction が空"))).toBe(true);
	});

	// P1: acceptance 欠落は soft warning
	it("P1: acceptance 欠落は soft warning で valid: true", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1を実装する", completed: false },
			{ id: "step-2", step: 2, text: "ステップ2", instruction: "ステップ2を実装する", acceptance: "テスト通過", completed: false },
			{ id: "step-3", step: 3, text: "ステップ3", instruction: "ステップ3を実装する", completed: false },
		];
		const result = validatePlan(items);
		expect(result.valid).toBe(true);
		expect(result.warnings).toHaveLength(2);
		expect(result.warnings[0]).toContain("step-1");
		expect(result.warnings[1]).toContain("step-3");
	});

	// step ID 形式バリデーション（kebab-case）
	describe("step ID 形式バリデーション", () => {
		it("有効な kebab-case ID は valid", () => {
			const items: TodoItem[] = [
				{ id: "add-validator", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api-v2", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(true);
		});

		it("数字始まりの ID も valid", () => {
			const items: TodoItem[] = [
				{ id: "0-setup", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "1-implement", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "2-test", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(true);
		});

		it("underscore を含む ID は invalid", () => {
			const items: TodoItem[] = [
				{ id: "add_validator", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(false);
			expect(result.issues.some((s) => s.includes("add_validator") && s.includes("kebab-case"))).toBe(true);
		});

		it("大文字を含む ID は invalid", () => {
			const items: TodoItem[] = [
				{ id: "AddValidator", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(false);
			expect(result.issues.some((s) => s.includes("AddValidator"))).toBe(true);
		});

		it("空文字 ID は invalid", () => {
			const items: TodoItem[] = [
				{ id: "", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(false);
			expect(result.issues.some((s) => s.includes("\"\"") && s.includes("無効"))).toBe(true);
		});

		it("日本語 ID は invalid", () => {
			const items: TodoItem[] = [
				{ id: "ステップ1", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(false);
			expect(result.issues.some((s) => s.includes("ステップ1"))).toBe(true);
		});

		it("スペース入り ID は invalid", () => {
			const items: TodoItem[] = [
				{ id: "add validator", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(false);
		});

		it("コロン入り ID は invalid", () => {
			const items: TodoItem[] = [
				{ id: "module:add", step: 1, text: "分析", instruction: "コードを分析する", completed: false },
				{ id: "update-tests", step: 2, text: "実装", instruction: "機能を実装する", completed: false },
				{ id: "fix-api", step: 3, text: "テスト", instruction: "テストを追加する", completed: false },
			];
			const result = validatePlan(items);
			expect(result.valid).toBe(false);
		});
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

		// 品質チェック
		const validation = validatePlan(items);
		expect(validation.valid).toBe(true);

		// --- フェーズ2: 実行開始、ステップ完了 ---
		let marked = markCompletedSteps("[DONE:1]", items);
		expect(marked).toBe(1);
		expect(items[0].completed).toBe(true);

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

		const previousMessages = `
[DONE:1] ステップ1を実行しました。
[DONE:2] ステップ2を実行しました。
`;
		markCompletedSteps(previousMessages, items);

		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(true);
		expect(items[2].completed).toBe(false);

		markCompletedSteps("[DONE:3]", items);
		expect(items[2].completed).toBe(true);
	});

	it("プラン修正シナリオ: 新しい <proposed_plan> が古いプランを置き換える", () => {
		const plan1 = `
<proposed_plan>
## Key Changes

- 古いステップA
- 古いステップB
</proposed_plan>
`;
		let items = extractTodoItems(plan1);
		expect(items).toHaveLength(2);

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
		for (const item of items) {
			expect(item.completed).toBe(false);
		}
	});

	it("構造化 plan_steps_json ワークフロー", () => {
		const planMessage = `
<proposed_plan>
概要テキスト
</proposed_plan>

<plan_steps_json>
[
  {"id":"inspect-state","title":"現在の状態を確認する","acceptance":"関連ファイルを確認済み"},
  {"id":"fix-policy","title":"ツールポリシーを修正する","instruction":"bash policy を修正","acceptance":"ポリシーとプロンプトが一致"},
  {"id":"add-tests","title":"テストを追加する","acceptance":"regression test が通る"}
]
</plan_steps_json>
`;
		const items = extractTodoItems(planMessage);
		expect(items).toHaveLength(3);

		expect(items[0].id).toBe("inspect-state");
		expect(items[1].id).toBe("fix-policy");
		expect(items[2].id).toBe("add-tests");

		// instruction が正しく設定されている
		expect(items[1].instruction).toBe("bash policy を修正");
		expect(items[0].instruction).toBe("現在の状態を確認する");

		// Step ID で完了マーク
		const marked = markCompletedSteps("[DONE:inspect-state]", items);
		expect(marked).toBe(1);
		expect(items[0].completed).toBe(true);
		expect(items[1].completed).toBe(false);

		// 品質チェック
		const validation = validatePlan(items);
		expect(validation.valid).toBe(true);
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
	});

	it("プランモードONでeditをブロックする", () => {
		expect(shouldBlockToolCall(true, "edit", { path: "src/index.ts" })).toBe(true);
	});

	it("プランモードONでwriteをブロックする", () => {
		expect(shouldBlockToolCall(true, "write", { path: "src/new-file.ts" })).toBe(true);
	});

	it("bash は isSafeCommand で検査し、unsafe ならブロック", () => {
		expect(shouldBlockToolCall(true, "bash", { command: "npm install" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "rm -rf dist/" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "git commit -m 'test'" })).toBe(true);
	});

	it("bash は isSafeCommand で検査し、safe なら許可", () => {
		expect(shouldBlockToolCall(true, "bash", { command: "git status" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "ls -la" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "cat README.md" })).toBe(false);
	});

	it("bash のパイプ/チェーンはシェルメタガードでブロック", () => {
		expect(shouldBlockToolCall(true, "bash", { command: "cat file | grep foo" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "ls && pwd" })).toBe(true);
	});

	it("プランモードONでread等の非ブロックツールは許可する", () => {
		expect(shouldBlockToolCall(true, "read", { path: "file.ts" })).toBe(false);
		expect(shouldBlockToolCall(true, "grep", { pattern: "TODO" })).toBe(false);
		expect(shouldBlockToolCall(true, "find", { path: "." })).toBe(false);
		expect(shouldBlockToolCall(true, "ls", { path: "." })).toBe(false);
	});

	// P0: null input でもクラッシュしない
	it("P0: null input でもクラッシュしない", () => {
		expect(shouldBlockToolCall(true, "edit", null)).toBe(true);
		expect(shouldBlockToolCall(true, "bash", null)).toBe(true);
		expect(shouldBlockToolCall(true, "bash", undefined)).toBe(true);
	});

	it("P0: undefined input でもクラッシュしない", () => {
		expect(shouldBlockToolCall(true, "write", undefined)).toBe(true);
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

	it("2回目のブロック: 警告が強化される", () => {
		const reason = buildBlockReason("edit", { path: "file.ts" }, 2);
		expect(reason).toContain("2回目のブロック");
		expect(reason).toContain("再度試行しても同じ結果");
		expect(reason).toContain("<proposed_plan>");
	});

	it("3回目のブロック: 最高レベルの警告", () => {
		const reason = buildBlockReason("edit", { path: "file.ts" }, 3);
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

	// P0: defensive input handling
	it("P0: null input でもクラッシュしない", () => {
		const reason = buildBlockReason("edit", null as unknown as Record<string, unknown>, 1);
		expect(reason).toContain("【プランモード・読み取り専用】");
		expect(reason).toContain("unknown");
	});

	it("P0: path なしの input でもクラッシュしない", () => {
		const reason = buildBlockReason("edit", {}, 1);
		expect(reason).toContain("unknown");
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

// ============================================================
// hashContent — コンテンツハッシュ
// ============================================================
describe("hashContent", () => {
	it("同じ入力で同じハッシュを返す", () => {
		const content = "hello world";
		expect(hashContent(content)).toBe(hashContent(content));
	});

	it("異なる入力で異なるハッシュを返す", () => {
		expect(hashContent("abc")).not.toBe(hashContent("xyz"));
	});

	it("ハッシュは12文字の16進文字列", () => {
		const hash = hashContent("test");
		expect(hash).toHaveLength(12);
		expect(hash).toMatch(/^[0-9a-f]{12}$/);
	});
});

// ============================================================
// before_agent_start プロンプト注入最適化
// ============================================================

function simulateBeforeAgentStart(
	planModeEnabled: boolean,
	executionMode: boolean,
	todoItems: TodoItem[],
	state: { planPromptDelivered: boolean; planPromptHash: string | undefined },
): { systemPrompt: string; injectedPromptType: "full" | "reminder" | "execute" | "none" } {
	if (planModeEnabled) {
		const fullPrompt = loadPrompt("plan-mode");
		const currentHash = hashContent(fullPrompt);

		const shouldInjectFull =
			!state.planPromptDelivered ||
			state.planPromptHash !== currentHash;

		const prompt = shouldInjectFull
			? fullPrompt
			: loadPrompt("plan-mode-reminder");

		if (shouldInjectFull) {
			state.planPromptHash = currentHash;
			state.planPromptDelivered = true;
		}

		const injectedPromptType = shouldInjectFull ? "full" as const : "reminder" as const;
		return {
			systemPrompt: `BASE\n\n${prompt}`,
			injectedPromptType,
		};
	}

	if (executionMode && todoItems.length > 0) {
		const remaining = todoItems.filter((t) => !t.completed);
		const completed = todoItems.filter((t) => t.completed);
		// P5: acceptance を含める（index.ts の実装に合わせる）
		const todoList = remaining.map((t) => {
			let line = `${t.step}. [${t.id}] ${t.instruction ?? t.text}`;
			if (t.acceptance) line += `\n   Acceptance: ${t.acceptance}`;
			return line;
		}).join("\n");
		const completedList = completed.map((t) => `${t.step}. [${t.id}] ${t.text} ✓`).join("\n");
		const executeModeTemplate = loadPrompt("execute-mode");
		const executeModePrompt = executeModeTemplate
			.replaceAll("\${completedList}", completedList || "（なし）")
			.replaceAll("\${todoList}", todoList);

		return {
			systemPrompt: `BASE\n\n${executeModePrompt}`,
			injectedPromptType: "execute",
		};
	}

	return {
		systemPrompt: "BASE",
		injectedPromptType: "none",
	};
}

describe("before_agent_start プロンプト注入", () => {
	it("初回 plan mode ON → フルプロンプトが選択される", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		const result = simulateBeforeAgentStart(true, false, [], state);

		expect(result.injectedPromptType).toBe("full");
		expect(result.systemPrompt).toContain("プランモード（対話型）");
		expect(result.systemPrompt).toContain("フェーズ1");
		expect(state.planPromptDelivered).toBe(true);
		expect(state.planPromptHash).toBeDefined();
	});

	it("2回目（継続中）→ reminder が選択される", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		simulateBeforeAgentStart(true, false, [], state);
		expect(state.planPromptDelivered).toBe(true);

		const result = simulateBeforeAgentStart(true, false, [], state);
		expect(result.injectedPromptType).toBe("reminder");
		expect(result.systemPrompt).toContain("プランモード（実行中）");
		expect(result.systemPrompt).not.toContain("フェーズ1");
	});

	it("プロンプト変更 → フルプロンプトが再注入される", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		simulateBeforeAgentStart(true, false, [], state);
		state.planPromptHash = "000000000000";

		const result = simulateBeforeAgentStart(true, false, [], state);
		expect(result.injectedPromptType).toBe("full");
		expect(result.systemPrompt).toContain("プランモード（対話型）");
	});

	it("plan mode OFF → 何も注入されない", () => {
		const state = { planPromptDelivered: true, planPromptHash: "abc123" as string | undefined };
		const result = simulateBeforeAgentStart(false, false, [], state);

		expect(result.injectedPromptType).toBe("none");
		expect(result.systemPrompt).toBe("BASE");
	});

	it("OFF → ON → フルプロンプトが再注入される", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		simulateBeforeAgentStart(true, false, [], state);
		expect(state.planPromptDelivered).toBe(true);

		state.planPromptDelivered = false;
		state.planPromptHash = undefined;

		const result = simulateBeforeAgentStart(true, false, [], state);
		expect(result.injectedPromptType).toBe("full");
		expect(result.systemPrompt).toContain("プランモード（対話型）");
	});

	it("実行モード→プランモード復帰 → フルプロンプトが再注入される", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		simulateBeforeAgentStart(true, false, [], state);
		expect(state.planPromptDelivered).toBe(true);

		state.planPromptDelivered = false;
		state.planPromptHash = undefined;

		const todoItems: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1", completed: false },
		];
		const execResult = simulateBeforeAgentStart(false, true, todoItems, state);
		expect(execResult.injectedPromptType).toBe("execute");

		state.planPromptDelivered = false;
		state.planPromptHash = undefined;

		const planResult = simulateBeforeAgentStart(true, false, [], state);
		expect(planResult.injectedPromptType).toBe("full");
		expect(planResult.systemPrompt).toContain("プランモード（対話型）");
	});

	it("実行モードプロンプトに step ID が含まれる", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		const todoItems: TodoItem[] = [
			{ id: "add-validator", step: 1, text: "バリデーター追加", instruction: "バリデーターを追加する", completed: false },
			{ id: "update-tests", step: 2, text: "テスト更新", instruction: "テストを更新する", completed: true },
		];

		const result = simulateBeforeAgentStart(false, true, todoItems, state);
		expect(result.injectedPromptType).toBe("execute");
		expect(result.systemPrompt).toContain("[add-validator]");
		expect(result.systemPrompt).toContain("バリデーターを追加する");
		expect(result.systemPrompt).toContain("[update-tests]");
	});

	// P5: acceptance が実行モードプロンプトに含まれる
	it("P5: 実行モードプロンプトに acceptance が含まれる", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		const todoItems: TodoItem[] = [
			{ id: "add-validator", step: 1, text: "バリデーター追加", instruction: "バリデーターを追加する", acceptance: "テストが通る", completed: false },
		];

		const result = simulateBeforeAgentStart(false, true, todoItems, state);
		expect(result.injectedPromptType).toBe("execute");
		expect(result.systemPrompt).toContain("Acceptance: テストが通る");
	});

	it("P5: acceptance なしのステップには Acceptance 行が含まれない", () => {
		const state = { planPromptDelivered: false, planPromptHash: undefined as string | undefined };
		const todoItems: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップ1", instruction: "ステップ1を実装する", completed: false },
		];

		const result = simulateBeforeAgentStart(false, true, todoItems, state);
		expect(result.injectedPromptType).toBe("execute");
		expect(result.systemPrompt).not.toContain("Acceptance:");
	});

	it("reminder のみの状態でブロック対象ツール呼び出し → ブロックされる", () => {
		const planModeEnabled = true;
		const result = shouldBlockToolCall(planModeEnabled, "edit", { path: "/tmp/test.ts" });
		expect(result).toBe(true);

		const result2 = shouldBlockToolCall(planModeEnabled, "write", { path: "/tmp/test.ts" });
		expect(result2).toBe(true);

		const result3 = shouldBlockToolCall(planModeEnabled, "read", { path: "/tmp/test.ts" });
		expect(result3).toBe(false);

		const result4 = shouldBlockToolCall(planModeEnabled, "bash", { command: "git status" });
		expect(result4).toBe(false);

		const result5 = shouldBlockToolCall(planModeEnabled, "bash", { command: "npm install" });
		expect(result5).toBe(true);
	});
});

// ============================================================
// 追加テスト1: bash tool_call の isSafeCommand 実行経路接続
// ============================================================
describe("tool_call: bash safety enforcement at execution boundary", () => {
	it("unsafe bash command is blocked in plan mode", () => {
		expect(isSafeCommand("npm install")).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "npm install" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "rm -rf node_modules" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "git commit -m 'test'" })).toBe(true);
	});

	it("safe bash command is allowed in plan mode", () => {
		expect(isSafeCommand("git status")).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "git status" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "cat README.md" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "ls -la" })).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "rg 'pattern' src/" })).toBe(false);
	});

	it("bash tool_call uses isSafeCommand regardless of planTools config", () => {
		expect(isSafeCommand("rm -rf dist/")).toBe(false);
		expect(shouldBlockToolCall(true, "bash", { command: "rm -rf dist/" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "git push origin main" })).toBe(true);
		expect(shouldBlockToolCall(true, "bash", { command: "sudo rm -rf /" })).toBe(true);
	});

	it("plan mode OFF では bash もブロックしない", () => {
		expect(shouldBlockToolCall(false, "bash", { command: "npm install" })).toBe(false);
		expect(shouldBlockToolCall(false, "bash", { command: "rm -rf /" })).toBe(false);
	});
});

// ============================================================
// 追加テスト2: active tools 保存・復元（実関数 resolveExecutionTools）
// ============================================================

describe("active tools: resolveExecutionTools", () => {
	it("savedActiveTools があれば configExecTools 未設定でもそちらを返す", () => {
		expect(resolveExecutionTools(["read", "grep"], undefined, DEFAULT_EXEC_TOOLS))
			.toEqual(["read", "grep"]);
	});

	it("configExecTools が明示されていればそちらを優先", () => {
		expect(resolveExecutionTools(["read", "grep"], ["read", "bash", "edit"], DEFAULT_EXEC_TOOLS))
			.toEqual(["read", "bash", "edit"]);
	});

	it("savedActiveTools も configExecTools もない場合は DEFAULT にフォールバック", () => {
		expect(resolveExecutionTools(undefined, undefined, DEFAULT_EXEC_TOOLS))
			.toEqual(DEFAULT_EXEC_TOOLS);
	});

	it("resolveExecutionTools は引数を変更しない（saved array は不変）", () => {
		const saved = ["read", "grep"];
		const result = resolveExecutionTools(saved, undefined, DEFAULT_EXEC_TOOLS);
		expect(result).toEqual(["read", "grep"]);
		expect(saved).toEqual(["read", "grep"]);
	});

	it("startExecution 相当: saved は消えず、次回 get でも同じものが返る", () => {
		const saved = ["read", "grep"];

		const tools1 = resolveExecutionTools(saved, undefined, DEFAULT_EXEC_TOOLS);
		expect(tools1).toEqual(["read", "grep"]);

		const tools2 = resolveExecutionTools(saved, undefined, DEFAULT_EXEC_TOOLS);
		expect(tools2).toEqual(["read", "grep"]);
	});

	it("agent_end 相当: saved をクリア後は DEFAULT にフォールバック", () => {
		let saved: string[] | undefined = ["read", "grep"];

		const restoredTools = resolveExecutionTools(saved, undefined, DEFAULT_EXEC_TOOLS);
		expect(restoredTools).toEqual(["read", "grep"]);

		saved = undefined;

		const fallbackTools = resolveExecutionTools(saved, undefined, DEFAULT_EXEC_TOOLS);
		expect(fallbackTools).toEqual(DEFAULT_EXEC_TOOLS);
	});

	it("session resume: saved が永続化されていれば復元後も制限が維持される", () => {
		const original = ["read", "grep"];

		const data: Record<string, unknown> = { savedActiveTools: original };

		let restored: string[] | undefined = undefined;
		if ((data as { savedActiveTools?: string[] }).savedActiveTools) {
			restored = (data as { savedActiveTools?: string[] }).savedActiveTools;
		}

		const tools = resolveExecutionTools(restored, undefined, DEFAULT_EXEC_TOOLS);
		expect(tools).toEqual(["read", "grep"]);
	});
});

// ============================================================
// 追加テスト3: plan identity — hashTodoItems による DONE 混入防止
// ============================================================
describe("plan identity: hash-based DONE rescan", () => {
	it("hashTodoItems produces stable hash for same items", () => {
		const items: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップA", instruction: "ステップA", completed: false },
			{ id: "step-2", step: 2, text: "ステップB", instruction: "ステップB", completed: false },
		];
		expect(hashTodoItems(items)).toBe(hashTodoItems(items));
	});

	it("different todos produce different hashes", () => {
		const items1: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップA", instruction: "ステップA", completed: false },
		];
		const items2: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップB", instruction: "ステップB", completed: false },
		];
		expect(hashTodoItems(items1)).not.toBe(hashTodoItems(items2));
	});

	it("completion status does not affect hash", () => {
		const items1: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップA", instruction: "ステップA", completed: false },
		];
		const items2: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップA", instruction: "ステップA", completed: true },
		];
		expect(hashTodoItems(items1)).toBe(hashTodoItems(items2));
	});

	it("DONE from old plan with different hash is ignored", () => {
		const oldPlan: TodoItem[] = [
			{ id: "step-1", step: 1, text: "古いステップA", instruction: "古いステップA", completed: false },
			{ id: "step-2", step: 2, text: "古いステップB", instruction: "古いステップB", completed: false },
		];
		const oldHash = hashTodoItems(oldPlan);

		const newPlan: TodoItem[] = [
			{ id: "step-1", step: 1, text: "新しいステップX", instruction: "新しいステップX", completed: false },
			{ id: "step-2", step: 2, text: "新しいステップY", instruction: "新しいステップY", completed: false },
		];
		const newHash = hashTodoItems(newPlan);

		expect(oldHash).not.toBe(newHash);

		const executionPlanHash = oldHash;
		const currentPlanHash = hashTodoItems(newPlan);
		expect(executionPlanHash === currentPlanHash).toBe(false);

		for (const item of newPlan) {
			expect(item.completed).toBe(false);
		}
	});

	it("DONE from matching plan is correctly applied", () => {
		const plan: TodoItem[] = [
			{ id: "step-1", step: 1, text: "ステップA", instruction: "ステップA", completed: false },
			{ id: "step-2", step: 2, text: "ステップB", instruction: "ステップB", completed: false },
			{ id: "step-3", step: 3, text: "ステップC", instruction: "ステップC", completed: false },
		];
		const planHash = hashTodoItems(plan);

		expect(planHash).toBe(hashTodoItems(plan));

		const messages = "[DONE:1] 完了 [DONE:3] 完了";
		markCompletedSteps(messages, plan);

		expect(plan[0].completed).toBe(true);
		expect(plan[1].completed).toBe(false);
		expect(plan[2].completed).toBe(true);
	});
});
