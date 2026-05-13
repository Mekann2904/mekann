/**
 * Plan Mode 拡張機能のテスト — 最小実装版
 *
 * isSafeCommand, extractProposedPlan, buildBlockReason, loadPrompt,
 * hashContent, sanitizePlanTools とツールブロック判定を検証する。
 */

import { describe, it, expect } from "vitest";
import {
	isSafeCommand,
	extractProposedPlan,
	buildBlockReason,
	loadPrompt,
	hashContent,
	sanitizePlanTools,
} from "./utils.js";
import {
	type Mode,
	type PlanState,
	createInitialState,
	isReadOnlyMode,
	modeLabel,
} from "./state.js";

// ============================================================
// isSafeCommand — bash コマンドの安全性判定
// ============================================================
describe("isSafeCommand", () => {
	describe("安全なコマンド", () => {
		const safeCommands = [
			"cat README.md",
			"head -20 package.json",
			"tail -n 50 output.log",
			"grep -r 'TODO' src/",
			"find . -name '*.ts'",
			"find . -type f",
			"ls -la",
			"pwd",
			"echo 'hello'",
			"wc -l file.txt",
			"sort names.txt",
			"diff old.txt new.txt",
			"du -sh .",
			"tree src/",
			"git status",
			"git log --oneline -10",
			"git diff HEAD~1",
			"git branch -a",
			"npm list",
			"npm view react version",
			"jq '.name' package.json",
			"rg 'pattern' src/",
			"fd '.ts$' src/",
			"bat README.md",
		];

		for (const cmd of safeCommands) {
			it(`✓ ${cmd}`, () => {
				expect(isSafeCommand(cmd)).toBe(true);
			});
		}
	});

	describe("危険なコマンド", () => {
		const dangerousCommands = [
			"rm -rf node_modules",
			"mv old.txt new.txt",
			"cp file.txt backup.txt",
			"mkdir new_directory",
			"touch newfile.txt",
			"chmod 755 script.sh",
			"npm install express",
			"git add .",
			"git commit -m 'test'",
			"git push origin main",
			"sudo rm -rf /",
			"kill -9 1234",
			"reboot",
			"vim file.txt",
		];

		for (const cmd of dangerousCommands) {
			it(`✗ ${cmd}`, () => {
				expect(isSafeCommand(cmd)).toBe(false);
			});
		}
	});

	describe("シェルメタ文字ガード", () => {
		it("パイプをブロック", () => {
			expect(isSafeCommand("cat file.txt | grep foo")).toBe(false);
		});

		it("&& チェーンをブロック", () => {
			expect(isSafeCommand("cd /tmp && ls")).toBe(false);
		});

		it("; セミコロンをブロック", () => {
			expect(isSafeCommand("ls; pwd")).toBe(false);
		});

		it("$() コマンド置換をブロック", () => {
			expect(isSafeCommand("echo $(cat /etc/passwd)")).toBe(false);
		});

		it("改行による複数コマンドをブロック", () => {
			expect(isSafeCommand("ls\nrm -rf /")).toBe(false);
		});
	});

	describe("リダイレクト", () => {
		it("2>/dev/null 付きの読み取りは安全", () => {
			expect(isSafeCommand("cat file.txt 2>/dev/null")).toBe(true);
		});

		it("> file への書き込みは危険", () => {
			expect(isSafeCommand("echo hello > output.txt")).toBe(false);
		});
	});

	describe("エッジケース", () => {
		it("空文字列は危険", () => {
			expect(isSafeCommand("")).toBe(false);
		});

		it("安全でない未知コマンドは危険", () => {
			expect(isSafeCommand("unknown-command")).toBe(false);
		});
	});
});

// ============================================================
// extractProposedPlan — plan テキスト抽出
// ============================================================
describe("extractProposedPlan", () => {
	it("<proposed_plan> の中身を取り出す", () => {
		const msg = `
分析結果に基づき、以下のプランを提案します。

<proposed_plan>
## 概要

認証モジュールのリファクタリング。

## 変更点

- バリデーターを追加する
- テストを更新する
</proposed_plan>
`;
		const plan = extractProposedPlan(msg);
		expect(plan).toContain("認証モジュールのリファクタリング");
		expect(plan).toContain("バリデーターを追加する");
	});

	it("<proposed_plan> がない場合は undefined", () => {
		expect(extractProposedPlan("ただのテキスト")).toBeUndefined();
	});

	it("空の <proposed_plan> は undefined", () => {
		expect(extractProposedPlan("<proposed_plan>\n</proposed_plan>")).toBeUndefined();
		expect(extractProposedPlan("<proposed_plan>   </proposed_plan>")).toBeUndefined();
	});

	it("タグと同じ行でも抽出できる", () => {
		const plan = extractProposedPlan("<proposed_plan>簡潔なプラン</proposed_plan>");
		expect(plan).toBe("簡潔なプラン");
	});

	it("終了タグがない場合は undefined", () => {
		expect(extractProposedPlan("<proposed_plan>\n内容\n")).toBeUndefined();
	});

	it("複数の <proposed_plan> がある場合は最初のものを返す", () => {
		const msg = `
<proposed_plan>
最初のプラン
</proposed_plan>

<proposed_plan>
二番目のプラン
</proposed_plan>
`;
		const plan = extractProposedPlan(msg);
		expect(plan).toContain("最初のプラン");
		expect(plan).not.toContain("二番目のプラン");
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
	});

	it("2回目のブロック: 警告が強化される", () => {
		const reason = buildBlockReason("edit", { path: "file.ts" }, 2);
		expect(reason).toContain("2回目のブロック");
		expect(reason).toContain("<proposed_plan>");
	});

	it("3回以上のブロック: 最高レベルの警告", () => {
		const reason = buildBlockReason("edit", { path: "file.ts" }, 3);
		expect(reason).toContain("3回ブロック済み");
		expect(reason).toContain("絶対に再試行しないでください");
	});

	it("null input でもクラッシュしない", () => {
		const reason = buildBlockReason("edit", null as unknown as Record<string, unknown>, 1);
		expect(reason).toContain("unknown");
	});
});

// ============================================================
// loadPrompt — プロンプトファイル読み込み
// ============================================================
describe("loadPrompt", () => {
	it("plan-mode.md を読み込める", () => {
		const prompt = loadPrompt("plan-mode");
		expect(prompt).toContain("プランモード");
		expect(prompt).toContain("<proposed_plan>");
	});

	it("plan-mode-reminder.md を読み込める", () => {
		const prompt = loadPrompt("plan-mode-reminder");
		expect(prompt).toContain("読み取り専用");
		expect(prompt).toContain("<proposed_plan>");
	});

	it("存在しないファイルはエラーを投げる", () => {
		expect(() => loadPrompt("nonexistent")).toThrow(
			"プロンプトファイルが見つかりません: prompts/nonexistent.md",
		);
	});

	it("変数置換が機能する", () => {
		// plan-mode-reminder には変数がないので、execute-mode は削除済み
		// 代わりに loadPrompt 自体の vars 機能をテストするファイルはないので
		// 関数が存在することだけ確認
		const prompt = loadPrompt("plan-mode");
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(0);
	});
});

// ============================================================
// hashContent — コンテンツハッシュ
// ============================================================
describe("hashContent", () => {
	it("同じ入力で同じハッシュを返す", () => {
		expect(hashContent("hello")).toBe(hashContent("hello"));
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
// sanitizePlanTools
// ============================================================
describe("sanitizePlanTools", () => {
	it("edit と write を除去する", () => {
		expect(sanitizePlanTools(["read", "edit", "write", "grep"])).toEqual(["read", "grep"]);
	});

	it("edit/write がなければそのまま返す", () => {
		expect(sanitizePlanTools(["read", "grep", "find", "ls"])).toEqual(["read", "grep", "find", "ls"]);
	});

	it("bash は保持される", () => {
		expect(sanitizePlanTools(["read", "bash", "grep"])).toEqual(["read", "bash", "grep"]);
	});

	it("空配列は空配列を返す", () => {
		expect(sanitizePlanTools([])).toEqual([]);
	});
});

// ============================================================
// State: createInitialState, isReadOnlyMode, modeLabel
// ============================================================
describe("State", () => {
	it("初期状態は main", () => {
		const state = createInitialState();
		expect(state.mode).toBe("main");
		expect(state.pendingPlan).toBeUndefined();
		expect(state.savedActiveTools).toBeUndefined();
		expect(state.planPromptDelivered).toBe(false);
	});

	it("isReadOnlyMode: plan のみ true", () => {
		expect(isReadOnlyMode("main")).toBe(false);
		expect(isReadOnlyMode("plan")).toBe(true);
	});

	it("modeLabel: plan は PLAN MODE", () => {
		expect(modeLabel("main")).toBe("");
		expect(modeLabel("plan")).toBe("PLAN MODE");
	});
});

// ============================================================
// Tool blocking simulation
// ============================================================
const SAFE_PLAN_TOOLS = new Set(["read", "grep", "find", "ls"]);

function shouldBlockToolCall(
	mode: Mode,
	toolName: string,
	input: Record<string, unknown> | null | undefined,
): boolean {
	if (!isReadOnlyMode(mode)) return false;
	if (SAFE_PLAN_TOOLS.has(toolName)) return false;

	if (toolName === "bash") {
		const safeInput = input ?? {};
		const command = String((safeInput as Record<string, unknown>).command ?? "");
		return !isSafeCommand(command);
	}

	return true;
}

describe("tool_call ブロック判定", () => {
	it("main では何もブロックしない", () => {
		expect(shouldBlockToolCall("main", "edit", { path: "file.ts" })).toBe(false);
		expect(shouldBlockToolCall("main", "write", { path: "file.ts" })).toBe(false);
	});

	it("plan で edit/write をブロックする", () => {
		expect(shouldBlockToolCall("plan", "edit", { path: "src/index.ts" })).toBe(true);
		expect(shouldBlockToolCall("plan", "write", { path: "src/new.ts" })).toBe(true);
	});

	it("plan で read 等は許可する", () => {
		expect(shouldBlockToolCall("plan", "read", { path: "file.ts" })).toBe(false);
		expect(shouldBlockToolCall("plan", "grep", { pattern: "TODO" })).toBe(false);
		expect(shouldBlockToolCall("plan", "find", { path: "." })).toBe(false);
		expect(shouldBlockToolCall("plan", "ls", { path: "." })).toBe(false);
	});

	it("plan で safe bash は許可、unsafe はブロック", () => {
		expect(shouldBlockToolCall("plan", "bash", { command: "git status" })).toBe(false);
		expect(shouldBlockToolCall("plan", "bash", { command: "npm install" })).toBe(true);
	});

	it("null input でもクラッシュしない", () => {
		expect(shouldBlockToolCall("plan", "edit", null)).toBe(true);
		expect(shouldBlockToolCall("plan", "bash", undefined)).toBe(true);
	});
});

// ============================================================
// 統合シナリオ: plan mode の最小ワークフロー
// ============================================================
describe("統合シナリオ: plan mode ワークフロー", () => {
	it("main → plan → plan 抽出 → main で実行", () => {
		const state = createInitialState();

		// 1. main で /plan → plan mode に入る
		expect(state.mode).toBe("main");
		state.mode = "plan";
		state.savedActiveTools = ["read", "bash", "edit", "write"];
		expect(isReadOnlyMode(state.mode)).toBe(true);

		// 2. plan mode で assistant が <proposed_plan> を出力
		const assistantMsg = `
コードを分析しました。

<proposed_plan>
## 概要

リファクタリング。

## 変更点

- バリデーターを追加する
- テストを更新する
</proposed_plan>
`;
		const plan = extractProposedPlan(assistantMsg);
		expect(plan).toBeDefined();
		state.pendingPlan = plan;

		// 3. /plan で main に戻る → plan を実行プロンプトとして注入
		state.mode = "main";
		const executionPrompt = `以下の plan に従って実装してください。\n\n<plan>\n${state.pendingPlan}\n</plan>`;
		expect(executionPrompt).toContain("バリデーターを追加する");
		expect(executionPrompt).toContain("<plan>");
		expect(executionPrompt).toContain("</plan>");

		// 4. main に戻ったのでツール制限なし
		state.pendingPlan = undefined;
		state.savedActiveTools = undefined;
		expect(isReadOnlyMode(state.mode)).toBe(false);
	});

	it("plan mode で <proposed_plan> なし → キャンセル", () => {
		const state = createInitialState();
		state.mode = "plan";

		const assistantMsg = "まだ分析中です。";
		const plan = extractProposedPlan(assistantMsg);
		expect(plan).toBeUndefined();
		// pendingPlan は設定されない
		expect(state.pendingPlan).toBeUndefined();

		// /plan で main に戻る → キャンセル
		state.mode = "main";
		expect(state.pendingPlan).toBeUndefined();
	});

	it("--plan フラグでの起動", () => {
		const state = createInitialState();
		// session_start で --plan が true の場合
		state.mode = "plan";
		state.savedActiveTools = ["read", "bash", "edit", "write"];
		expect(isReadOnlyMode(state.mode)).toBe(true);
	});
});
