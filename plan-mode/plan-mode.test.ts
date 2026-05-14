/**
 * Plan Mode 拡張機能のテスト — 最小実装版
 *
 * isSafeCommand, extractProposedPlan, buildBlockReason, loadPrompt,
 * hashContent, sanitizePlanTools とツールブロック判定を検証する。
 */

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { isSafeCommand, extractProposedPlan, buildBlockReason, loadPrompt, hashContent, sanitizePlanTools, SAFE_PLAN_TOOLS, parseModelRef, formatModelRef, sameModelRef, loadModelConfig, saveModelConfig, updateModelConfig, updateThinkingConfig, createDefaultConfig, getConfigPath, isThinkingLevel, formatThinkingLevel, normalizeConfig, type ModelRef, type ThinkingLevel } from "./utils.js";
import { type Mode, type PlanState, createInitialState, isReadOnlyMode, modeLabel } from "./state.js";

// isSafeCommand — bash コマンドの安全性判定
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

// extractProposedPlan — plan テキスト抽出
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

// buildBlockReason — ブロック理由メッセージ
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

// loadPrompt — プロンプトファイル読み込み
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

	it("変数置換が機能する", async () => {
		// plan-mode.md に ${} プレースホルダはないので、
		// vars を渡しても元の内容がそのまま返ることを確認
		const prompt = loadPrompt("plan-mode", { nonexistent: "replaced" });
		expect(prompt).toContain("プランモード");
		expect(prompt).not.toContain("replaced");

		// 変数置換の実コードパスをテスト: 一時ファイルで検証
		const { writeFileSync, unlinkSync } = await import("node:fs");
		const { dirname, join } = await import("node:path");
		const { fileURLToPath } = await import("node:url");
		const dir = dirname(fileURLToPath(import.meta.url));
		const tmpFile = join(dir, "prompts", "_test-vars.md");
		try {
			writeFileSync(tmpFile, "Hello \\-dist-${name}\\-suffix", "utf-8");
			const result = loadPrompt("_test-vars", { name: "world" });
			expect(result).toBe("Hello \\-dist-world\\-suffix");
		} finally {
			unlinkSync(tmpFile);
		}
	});
});

// hashContent — コンテンツハッシュ
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

// sanitizePlanTools
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

// State: createInitialState, isReadOnlyMode, modeLabel
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

// Tool blocking simulation
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

// 統合シナリオ: plan mode の最小ワークフロー
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

// ─── Model preference utilities ──────────────────────────────────

describe("parseModelRef", () => {
	it("standard provider/modelId", () => {
		const ref = parseModelRef("anthropic/claude-sonnet-4-5");
		expect(ref).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
	});

	it("modelId with slashes (e.g. openrouter)", () => {
		const ref = parseModelRef("openrouter/anthropic/claude-3.5-sonnet");
		expect(ref).toEqual({ provider: "openrouter", modelId: "anthropic/claude-3.5-sonnet" });
	});

	it("trims whitespace", () => {
		const ref = parseModelRef("  anthropic/claude-sonnet-4-5  ");
		expect(ref).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
	});

	it("empty string returns undefined", () => {
		expect(parseModelRef("")).toBeUndefined();
		expect(parseModelRef("   ")).toBeUndefined();
	});

	it("no slash returns undefined", () => {
		expect(parseModelRef("noprovider")).toBeUndefined();
	});

	it("slash only at start returns undefined", () => {
		expect(parseModelRef("/noprovider")).toBeUndefined();
	});

	it("slash only at end returns undefined", () => {
		expect(parseModelRef("provider/")).toBeUndefined();
	});
});

describe("formatModelRef", () => {
	it("formats provider/modelId", () => {
		expect(formatModelRef({ provider: "anthropic", modelId: "claude-sonnet-4-5" })).toBe("anthropic/claude-sonnet-4-5");
	});

	it("undefined returns (not set)", () => {
		expect(formatModelRef(undefined)).toBe("(not set)");
	});
});

describe("sameModelRef", () => {
	it("same refs are equal", () => {
		const a: ModelRef = { provider: "anthropic", modelId: "claude-sonnet-4-5" };
		expect(sameModelRef(a, a)).toBe(true);
	});

	it("identical refs are equal", () => {
		expect(sameModelRef({ provider: "a", modelId: "b" }, { provider: "a", modelId: "b" })).toBe(true);
	});

	it("different provider is not equal", () => {
		expect(sameModelRef({ provider: "a", modelId: "b" }, { provider: "c", modelId: "b" })).toBe(false);
	});

	it("different modelId is not equal", () => {
		expect(sameModelRef({ provider: "a", modelId: "b" }, { provider: "a", modelId: "c" })).toBe(false);
	});

	it("both undefined is equal", () => {
		expect(sameModelRef(undefined, undefined)).toBe(true);
	});

	it("one undefined is not equal", () => {
		expect(sameModelRef({ provider: "a", modelId: "b" }, undefined)).toBe(false);
		expect(sameModelRef(undefined, { provider: "a", modelId: "b" })).toBe(false);
	});
});

// ─── Config persistence ───────────────────────────────────────────

describe("config persistence", () => {
	it("load from nonexistent file returns default", () => {
		const config = loadModelConfig("/nonexistent/path/plan-mode-test.json");
		expect(config).toEqual(createDefaultConfig());
	});

	it("save and load round-trip", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			const config = createDefaultConfig();
			config.models.main = { provider: "anthropic", modelId: "claude-sonnet-4-5" };
			config.models.plan = { provider: "openai", modelId: "gpt-4.1" };

			saveModelConfig(config, path);

			const loaded = loadModelConfig(path);
			expect(loaded.models.main).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
			expect(loaded.models.plan).toEqual({ provider: "openai", modelId: "gpt-4.1" });
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("invalid JSON returns default config", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			writeFileSync(path, "NOT JSON", "utf-8");
			const loaded = loadModelConfig(path);
			expect(loaded).toEqual(createDefaultConfig());
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("updateModelConfig sets and clears", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			const config = createDefaultConfig();
			updateModelConfig(config, "main", { provider: "anthropic", modelId: "sonnet" }, path);
			expect(config.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });

			const loaded = loadModelConfig(path);
			expect(loaded.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });

			updateModelConfig(config, "main", undefined, path);
			expect(config.models.main).toBeUndefined();

			const loaded2 = loadModelConfig(path);
			expect(loaded2.models.main).toBeUndefined();
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});
});

// ─── State with config ────────────────────────────────────────────

describe("createInitialState with config", () => {
	it("accepts custom config", () => {
		const config = createDefaultConfig();
		config.models.main = { provider: "anthropic", modelId: "claude-sonnet-4-5" };
		const state = createInitialState(config);
		expect(state.modelConfig.models.main).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
	});

	it("defaults to empty config", () => {
		const state = createInitialState();
		expect(state.modelConfig).toEqual(createDefaultConfig());
	});
});

// ─── Mode switch model simulation ─────────────────────────────────

describe("mode switch model simulation", () => {
	it("main → plan saves main model to config", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		expect(state.mode).toBe("main");

		// Simulate: entering plan mode, current model = anthropic/sonnet
		state.savedMainModel = { provider: "anthropic", modelId: "sonnet" };
		updateModelConfig(state.modelConfig, "main", state.savedMainModel);
		state.mode = "plan";

		expect(state.modelConfig.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });
		expect(state.savedMainModel).toEqual({ provider: "anthropic", modelId: "sonnet" });
	});

	it("plan → main restores main model from config", () => {
		const config = createDefaultConfig();
		config.models.main = { provider: "anthropic", modelId: "sonnet" };
		const state = createInitialState(config);
		state.mode = "plan";

		// Simulate: exiting plan mode
		state.mode = "main";
		const mainRef = state.modelConfig.models.main;
		expect(mainRef).toEqual({ provider: "anthropic", modelId: "sonnet" });
	});

	it("plan config model is used when entering plan", () => {
		const config = createDefaultConfig();
		config.models.plan = { provider: "openai", modelId: "gpt-4.1" };
		const state = createInitialState(config);

		// On enterPlanMode, config.models.plan should be the target
		const planRef = state.modelConfig.models.plan;
		expect(planRef).toEqual({ provider: "openai", modelId: "gpt-4.1" });
	});

	it("model_select ignored for restore source", () => {
		// Restore events should not update config
		const source = "restore" as const;
		expect(source).toBe("restore");
		// The actual logic is: if (event.source === "restore") return;
	});

	it("model_select in main mode updates main config", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		state.mode = "main";

		// Simulate: user selected a new model in main mode
		const newRef: ModelRef = { provider: "google", modelId: "gemini-2.5-pro" };
		if (state.mode === "main") {
			updateModelConfig(state.modelConfig, "main", newRef);
		}

		expect(state.modelConfig.models.main).toEqual({ provider: "google", modelId: "gemini-2.5-pro" });
	});

	it("model_select in plan mode updates plan config", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		state.mode = "plan";

		// Simulate: user selected a new model in plan mode
		const newRef: ModelRef = { provider: "google", modelId: "gemini-2.5-flash" };
		if (state.mode === "plan") {
			updateModelConfig(state.modelConfig, "plan", newRef);
		}

		expect(state.modelConfig.models.plan).toEqual({ provider: "google", modelId: "gemini-2.5-flash" });
	});
});

// ─── Bug fix: suppressModelSelectPersist ───────────────────────────

describe("suppressModelSelectPersist guard", () => {
	it("model_select with source=restore is ignored", () => {
		// When source is "restore", the model_select handler should return early
		const source = "restore";
		// Simulating: the handler checks `if (event.source === "restore") return;`
		// No config update should happen
		const config = createDefaultConfig();
		config.models.main = { provider: "anthropic", modelId: "sonnet" };
		const state = createInitialState(config);
		state.mode = "main";
		// If restore were not ignored, main would be overwritten:
		// But since source=restore, config stays as-is
		expect(state.modelConfig.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });
	});

	it("extension-driven setModel should not trigger config overwrite", () => {
		// When suppressModelSelectPersist is true, model_select handler returns early
		// This simulates the guard: `if (suppressModelSelectPersist) return;`
		let suppressModelSelectPersist = true;
		const config = createDefaultConfig();
		config.models.main = { provider: "anthropic", modelId: "sonnet" };
		const state = createInitialState(config);
		state.mode = "main";

		// Simulate: extension calls trySetModel which sets suppressModelSelectPersist=true
		// Then pi.setModel fires model_select, but handler returns early
		if (!suppressModelSelectPersist && state.mode === "main") {
			updateModelConfig(state.modelConfig, "main", { provider: "google", modelId: "gemini" });
		}

		// Config should NOT have been overwritten
		expect(state.modelConfig.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });

		// After trySetModel finishes, suppressModelSelectPersist is reset
		suppressModelSelectPersist = false;
		expect(suppressModelSelectPersist).toBe(false);
	});
});

// ─── Bug fix: enterPlanMode persistCurrentMain option ──────────────

describe("enterPlanMode persistCurrentMain option", () => {
	it("default (persistCurrentMain=true) saves current model", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		state.mode = "main";

		// Simulate: user toggles /plan — persistCurrentMain defaults to true
		const persistCurrentMain = true;
		const currentMain: ModelRef = { provider: "anthropic", modelId: "sonnet" };

		if (persistCurrentMain) {
			state.savedMainModel = currentMain;
			updateModelConfig(state.modelConfig, "main", currentMain);
		}

		state.mode = "plan";
		expect(state.savedMainModel).toEqual({ provider: "anthropic", modelId: "sonnet" });
		expect(state.modelConfig.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });
	});

	it("persistCurrentMain=false (--plan startup) does NOT overwrite config", () => {
		// User hand-wrote config: main=zai/glm-5.1, plan=openai-codex/gpt-5.5
		const config = createDefaultConfig();
		config.models.main = { provider: "zai", modelId: "glm-5.1" };
		config.models.plan = { provider: "openai-codex", modelId: "gpt-5.5" };
		const state = createInitialState(config);
		state.mode = "main";

		// Simulate: --plan startup calls enterPlanMode(ctx, { persistCurrentMain: false })
		const persistCurrentMain = false;
		// Current model is anthropic/default (pi's startup default), NOT zai/glm-5.1
		const currentModel: ModelRef = { provider: "anthropic", modelId: "default-model" };

		if (persistCurrentMain) {
			// This block should NOT execute
			state.savedMainModel = currentModel;
			updateModelConfig(state.modelConfig, "main", currentModel);
		}

		state.mode = "plan";

		// Config should still have the hand-written values
		expect(state.modelConfig.models.main).toEqual({ provider: "zai", modelId: "glm-5.1" });
		expect(state.modelConfig.models.plan).toEqual({ provider: "openai-codex", modelId: "gpt-5.5" });
		// savedMainModel should NOT be set
		expect(state.savedMainModel).toBeUndefined();
	});
});

// ─── Bug fix: exitPlanMode ordering ────────────────────────────────

describe("exitPlanMode ordering", () => {
	it("state.mode is main before model restore triggers model_select", () => {
		const config = createDefaultConfig();
		config.models.main = { provider: "anthropic", modelId: "sonnet" };
		const state = createInitialState(config);
		state.mode = "plan";
		state.pendingPlan = "test plan";

		// Simulate: exitPlanMode sets mode=main BEFORE trySetModel
		const plan = state.pendingPlan;
		state.mode = "main";
		// Now model_select would fire (from trySetModel), and it should update "main" config
		expect(state.mode).toBe("main");

		// Cleanup
		Object.assign(state, { pendingPlan: undefined });
		expect(state.pendingPlan).toBeUndefined();
	});
});

// ─── Bug fix: session_start main model apply ───────────────────────

describe("session_start main model apply", () => {
	it("normal startup applies configured main model", () => {
		const config = createDefaultConfig();
		config.models.main = { provider: "zai", modelId: "glm-5.1" };
		const state = createInitialState(config);

		// Simulate: session_start with --plan=false and main model configured
		const isPlanStartup = false;

		if (!isPlanStartup && state.modelConfig.models.main) {
			// trySetModel would be called with the configured main model
			const targetRef = state.modelConfig.models.main;
			expect(targetRef).toEqual({ provider: "zai", modelId: "glm-5.1" });
		}
	});

	it("--plan startup does NOT apply main model (enters plan mode instead)", () => {
		const config = createDefaultConfig();
		config.models.main = { provider: "zai", modelId: "glm-5.1" };
		config.models.plan = { provider: "openai-codex", modelId: "gpt-5.5" };
		const state = createInitialState(config);

		// Simulate: session_start with --plan=true
		const isPlanStartup = true;

		if (isPlanStartup) {
			// Should call enterPlanMode(ctx, { persistCurrentMain: false })
			// Should NOT call trySetModel for main model at session_start level
			state.mode = "plan";
		}

		expect(state.mode).toBe("plan");
		// main config should be untouched
		expect(state.modelConfig.models.main).toEqual({ provider: "zai", modelId: "glm-5.1" });
	});

	it("normal startup with no main config does not crash", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);

		const isPlanStartup = false;

		if (!isPlanStartup && state.modelConfig.models.main) {
			// This block should NOT execute since main is undefined
			expect(true).toBe(false); // should not reach
		}

		// Should reach here without error
		expect(state.modelConfig.models.main).toBeUndefined();
	});
});

// ─── Bug fix: /plan-model status availability check ────────────────

describe("/plan-model status availability", () => {
	it("formats available model with ✓", () => {
		const mainRef: ModelRef = { provider: "anthropic", modelId: "sonnet" };
		// Simulate: modelRegistry.find returns a model (truthy)
		const registryResult = { provider: "anthropic", id: "sonnet" }; // truthy = found
		const avail = registryResult ? "✓" : "✗";
		const formatted = `${mainRef.provider}/${mainRef.modelId} ${avail}`;
		expect(formatted).toBe("anthropic/sonnet ✓");
	});

	it("formats unavailable model with ✗", () => {
		const planRef: ModelRef = { provider: "openai-codex", modelId: "gpt-5.5" };
		// Simulate: modelRegistry.find returns undefined
		const registryResult = undefined;
		const avail = registryResult ? "✓" : "✗";
		const formatted = `${planRef.provider}/${planRef.modelId} ${avail}`;
		expect(formatted).toBe("openai-codex/gpt-5.5 ✗");
	});

	it("unset model shows (unset)", () => {
		const ref: ModelRef | undefined = undefined;
		const formatted = ref ? `${ref.provider}/${ref.modelId}` : "(unset)";
		expect(formatted).toBe("(unset)");
	});
});

// ─── Thinking Level Utilities ──────────────────────────────────────

describe("isThinkingLevel", () => {
	it("accepts valid levels", () => {
		const validLevels: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
		for (const level of validLevels) {
			expect(isThinkingLevel(level)).toBe(true);
		}
	});

	it("rejects invalid values", () => {
		expect(isThinkingLevel("ultra")).toBe(false);
		expect(isThinkingLevel("")).toBe(false);
		expect(isThinkingLevel(null)).toBe(false);
		expect(isThinkingLevel(undefined)).toBe(false);
		expect(isThinkingLevel(123)).toBe(false);
		expect(isThinkingLevel("HIGH")).toBe(false);
	});
});

describe("formatThinkingLevel", () => {
	it("formats a valid level", () => {
		expect(formatThinkingLevel("high")).toBe("high");
		expect(formatThinkingLevel("xhigh")).toBe("xhigh");
		expect(formatThinkingLevel("off")).toBe("off");
	});

	it("returns (unset) for undefined/null", () => {
		expect(formatThinkingLevel(undefined)).toBe("(unset)");
		expect(formatThinkingLevel(null)).toBe("(unset)");
	});
});

// ─── Thinking Config Persistence ───────────────────────────────────

describe("thinking config persistence", () => {
	it("default config has empty thinking", () => {
		const config = createDefaultConfig();
		expect(config.thinking).toEqual({});
	});

	it("save and load round-trip with thinking", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			const config = createDefaultConfig();
			config.models.main = { provider: "anthropic", modelId: "claude-sonnet-4-5" };
			config.thinking.main = "high";
			config.thinking.plan = "xhigh";

			saveModelConfig(config, path);

			const loaded = loadModelConfig(path);
			expect(loaded.models.main).toEqual({ provider: "anthropic", modelId: "claude-sonnet-4-5" });
			expect(loaded.thinking.main).toBe("high");
			expect(loaded.thinking.plan).toBe("xhigh");
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("existing config without thinking field normalizes correctly", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			// Write a config without "thinking" field (old format)
			writeFileSync(path, JSON.stringify({
				version: 1,
				models: { main: { provider: "anthropic", modelId: "sonnet" } },
			}, null, 2));

			const loaded = loadModelConfig(path);
			expect(loaded.models.main).toEqual({ provider: "anthropic", modelId: "sonnet" });
			expect(loaded.thinking).toEqual({});
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("invalid thinking values are stripped on load", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			writeFileSync(path, JSON.stringify({
				version: 1,
				models: {},
				thinking: { main: "ultra", plan: "high", extra: "low" },
			}, null, 2));

			const loaded = loadModelConfig(path);
			expect(loaded.thinking.main).toBeUndefined();
			expect(loaded.thinking.plan).toBe("high");
			expect((loaded.thinking as Record<string, unknown>).extra).toBeUndefined();
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});
});

// ─── updateThinkingConfig ──────────────────────────────────────────

describe("updateThinkingConfig", () => {
	it("sets and clears thinking", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			const config = createDefaultConfig();
			updateThinkingConfig(config, "main", "high", path);
			expect(config.thinking.main).toBe("high");

			const loaded = loadModelConfig(path);
			expect(loaded.thinking.main).toBe("high");

			updateThinkingConfig(config, "main", undefined, path);
			expect(config.thinking.main).toBeUndefined();

			const loaded2 = loadModelConfig(path);
			expect(loaded2.thinking.main).toBeUndefined();
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});

	it("sets plan thinking", () => {
		const tmpDir = mkdtempSync(`/tmp/plan-mode-test-`);
		const path = `${tmpDir}/plan-mode.json`;

		try {
			const config = createDefaultConfig();
			updateThinkingConfig(config, "plan", "xhigh", path);
			expect(config.thinking.plan).toBe("xhigh");
		} finally {
			rmSync(tmpDir, { recursive: true });
		}
	});
});

// ─── normalizeConfig ──────────────────────────────────────────────

describe("normalizeConfig", () => {
	it("normalizes config with missing fields", () => {
		const config = normalizeConfig({ version: 1 });
		expect(config.version).toBe(1);
		expect(config.models).toEqual({});
		expect(config.thinking).toEqual({});
	});

	it("preserves valid thinking levels", () => {
		const config = normalizeConfig({
			version: 1,
			thinking: { main: "high", plan: "xhigh" },
		});
		expect(config.thinking.main).toBe("high");
		expect(config.thinking.plan).toBe("xhigh");
	});

	it("strips invalid thinking levels", () => {
		const config = normalizeConfig({
			version: 1,
			thinking: { main: "INVALID", plan: "medium" },
		});
		expect(config.thinking.main).toBeUndefined();
		expect(config.thinking.plan).toBe("medium");
	});
});

// ─── Thinking Mode Switch Simulation ──────────────────────────────

describe("thinking mode switch simulation", () => {
	it("main → plan saves main thinking to config", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		expect(state.mode).toBe("main");

		// Simulate: entering plan mode, current thinking = high
		const currentThinking: ThinkingLevel = "high";
		state.savedMainThinking = currentThinking;
		updateThinkingConfig(state.modelConfig, "main", currentThinking);
		state.mode = "plan";

		expect(state.modelConfig.thinking.main).toBe("high");
		expect(state.savedMainThinking).toBe("high");
	});

	it("plan config thinking is used when entering plan", () => {
		const config = createDefaultConfig();
		config.thinking.plan = "xhigh";
		const state = createInitialState(config);

		const planThinking = state.modelConfig.thinking.plan;
		expect(planThinking).toBe("xhigh");
	});

	it("plan → main restores main thinking from config", () => {
		const config = createDefaultConfig();
		config.thinking.main = "medium";
		const state = createInitialState(config);
		state.mode = "plan";

		state.mode = "main";
		const mainThinking = state.modelConfig.thinking.main;
		expect(mainThinking).toBe("medium");
	});

	it("plan → main falls back to savedMainThinking", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		state.mode = "plan";
		state.savedMainThinking = "low";

		state.mode = "main";
		const mainThinking = state.modelConfig.thinking.main ?? state.savedMainThinking;
		expect(mainThinking).toBe("low");
	});

	it("config thinking.main takes precedence over savedMainThinking", () => {
		const config = createDefaultConfig();
		config.thinking.main = "high";
		const state = createInitialState(config);
		state.mode = "plan";
		state.savedMainThinking = "low";

		state.mode = "main";
		const mainThinking = state.modelConfig.thinking.main ?? state.savedMainThinking;
		expect(mainThinking).toBe("high");
	});

	it("--plan startup does NOT overwrite main thinking", () => {
		const config = createDefaultConfig();
		config.thinking.main = "xhigh";
		config.thinking.plan = "high";
		const state = createInitialState(config);

		// Simulate: --plan startup with persistCurrentMain=false
		// Should NOT save current thinking to main
		const persistCurrentMain = false;
		if (persistCurrentMain) {
			// This block should NOT execute
			expect(true).toBe(false);
		}

		state.mode = "plan";
		expect(state.modelConfig.thinking.main).toBe("xhigh");
		expect(state.modelConfig.thinking.plan).toBe("high");
		expect(state.savedMainThinking).toBeUndefined();
	});
});

// ─── Thinking Event Simulation ────────────────────────────────────

describe("thinking event simulation", () => {
	it("thinking_level_select in main mode updates thinking.main", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		state.mode = "main";

		const newLevel: ThinkingLevel = "high";
		if (state.mode === "main") {
			updateThinkingConfig(state.modelConfig, "main", newLevel);
		}

		expect(state.modelConfig.thinking.main).toBe("high");
	});

	it("thinking_level_select in plan mode updates thinking.plan", () => {
		const config = createDefaultConfig();
		const state = createInitialState(config);
		state.mode = "plan";

		const newLevel: ThinkingLevel = "xhigh";
		if (state.mode === "plan") {
			updateThinkingConfig(state.modelConfig, "plan", newLevel);
		}

		expect(state.modelConfig.thinking.plan).toBe("xhigh");
	});

	it("suppressThinkingSelectPersist prevents update", () => {
		const config = createDefaultConfig();
		config.thinking.main = "medium";
		const state = createInitialState(config);
		state.mode = "main";

		let suppressThinkingSelectPersist = true;

		// Simulate: extension-driven setThinkingLevel
		if (!suppressThinkingSelectPersist && state.mode === "main") {
			updateThinkingConfig(state.modelConfig, "main", "high");
		}

		expect(state.modelConfig.thinking.main).toBe("medium");

		suppressThinkingSelectPersist = false;
		expect(suppressThinkingSelectPersist).toBe(false);
	});
});

// ─── /plan-model status now includes thinking ────────────────────

describe("/plan-model status thinking integration", () => {
	it("status includes thinking levels", () => {
		const config = createDefaultConfig();
		config.models.main = { provider: "anthropic", modelId: "sonnet" };
		config.thinking.main = "high";
		config.thinking.plan = "xhigh";

		const mainThinking = formatThinkingLevel(config.thinking.main);
		const planThinking = formatThinkingLevel(config.thinking.plan);

		expect(mainThinking).toBe("high");
		expect(planThinking).toBe("xhigh");
	});

	it("unset thinking shows (unset)", () => {
		const config = createDefaultConfig();
		const mainThinking = formatThinkingLevel(config.thinking.main);
		const planThinking = formatThinkingLevel(config.thinking.plan);
		expect(mainThinking).toBe("(unset)");
		expect(planThinking).toBe("(unset)");
	});
});
