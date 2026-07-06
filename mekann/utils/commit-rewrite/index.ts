import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { resolveEffectiveFeatureConfig } from "../../settings/featureConfig.js";
import { isFeatureEnabled } from "../../settings/enabled.js";
import {
	applyRewords,
	createBackupBranch,
	getCommitDiff,
	getUnpushedCommits,
	getUpstream,
	isClean,
	isRebaseInProgress,
	type CommitInfo,
} from "./git.js";
import { generateCommitMessage } from "./llm.js";
import { isWeakMessage, parseWeakPatterns } from "./detect.js";

interface CommitRewriteSettings {
	createBackup: boolean;
	maxCommits: number;
	minMessageWords: number;
	weakPatterns: string;
	model?: string;
}

function loadSettings(cwd: string): CommitRewriteSettings {
	const config = resolveEffectiveFeatureConfig("commit-rewrite", cwd);
	const get = <T>(key: string, fallback: T): T => {
		const v = config.values[key];
		return (v === undefined ? fallback : v) as T;
	};
	return {
		createBackup: get("createBackup", true),
		maxCommits: get("maxCommits", 30),
		minMessageWords: get("minMessageWords", 3),
		weakPatterns: get("weakPatterns", ""),
		model: get<string | undefined>("model", undefined),
	};
}

function formatPreview(commits: CommitInfo[]): string {
	return commits.map((c, i) => `${i + 1}. ${c.sha.slice(0, 8)}  ${c.subject}  (${c.author})`).join("\n");
}

async function runRewrite(args: string | undefined, ctx: Parameters<NonNullable<Parameters<ExtensionAPI["registerCommand"]>[1]["handler"]>>[1]): Promise<void> {
	const { cwd, ui, model: currentModel, modelRegistry } = ctx;

	// Arg "--preview" is accepted but non-interactive: it only lists candidates without applying.
	const previewOnly = (args ?? "").trim() === "--preview";

	const settings = loadSettings(cwd);

	// Resolve the model: explicit `model` setting (provider/modelId) overrides pi's current model.
	let model = currentModel;
	if (settings.model) {
		const slash = settings.model.indexOf("/");
		if (slash > 0) {
			const provider = settings.model.slice(0, slash);
			const modelId = settings.model.slice(slash + 1);
			const found = modelRegistry.find(provider, modelId);
			if (found) model = found;
			else ui.notify(`設定の model '${settings.model}' が見つからないため、現在のモデルを使います。`, "warning");
		} else {
			ui.notify(`設定の model '${settings.model}' は provider/modelId 形式ではないため、現在のモデルを使います。`, "warning");
		}
	}

	if (!model) {
		ui.notify("現在のモデルが設定されていません。先にモデルを選択してください。", "error");
		return;
	}

	// --- Safety gates -------------------------------------------------------
	let upstream: string;
	try {
		upstream = await getUpstream(cwd);
	} catch {
		ui.notify("upstream（@{u}）が未設定のため、未 push コミットを特定できません。", "error");
		return;
	}

	if (await isRebaseInProgress(cwd)) {
		ui.notify("rebase が進行中です。先に git rebase --abort または --continue で解決してください。", "error");
		return;
	}

	if (!(await isClean(cwd))) {
		ui.notify("working tree が dirty です。先に commit / stash してください。", "error");
		return;
	}

	const commits = await getUnpushedCommits(cwd, upstream);
	if (commits.length === 0) {
		ui.notify("未 push のコミットはありません（現在のブランチは upstream と同期的です）。", "info");
		return;
	}

	if (commits.length > settings.maxCommits) {
		ui.notify(
			`未 push コミットが ${commits.length} 件あり、安全上限（maxCommits=${settings.maxCommits}）を超えています。mekann settings で上限を上げるか、コミットを分割してください。`,
			"error",
		);
		return;
	}

	// 未 push の中から貧弱メッセージだけを抽出する（Conventional Commits 形式は除外）
	const patterns = parseWeakPatterns(settings.weakPatterns);
	const weak = commits.filter((c) => isWeakMessage(c.subject, patterns, settings.minMessageWords));

	if (weak.length === 0) {
		ui.notify(`未 push ${commits.length} 件のうち、貧弱なメッセージはありませんでした。書き直し不要です。`, "info");
		return;
	}

	ui.notify(`未 push ${commits.length} 件のうち貧弱メッセージ ${weak.length} 件を書き直します:\n${formatPreview(weak)}`, "info");

	if (previewOnly) {
		return;
	}

	// --- Generate one message per commit -----------------------------------
	const shaToMessage = new Map<string, string>();
	let backupName: string | null = null;

	try {
		// Backup first, so a mid-run failure is always recoverable.
		if (settings.createBackup) {
			backupName = await createBackupBranch(cwd);
			ui.notify(`バックアップブランチを作成: ${backupName}`, "info");
		}

		for (let i = 0; i < weak.length; i++) {
			const commit = weak[i];
			ui.notify(`生成中 (${i + 1}/${weak.length}): ${commit.sha.slice(0, 8)} ${commit.subject}`, "info");
			const diff = await getCommitDiff(commit.sha, cwd);
			const message = await generateCommitMessage(model, { sha: commit.sha, subject: commit.subject, author: commit.author, diff });
			shaToMessage.set(commit.sha, message);
		}

		// --- Apply via a single non-interactive rebase -----------------------
		ui.notify("生成したメッセージを rebase で適用しています…", "info");
		await applyRewords(upstream, shaToMessage, cwd);

		const changed = [...shaToMessage.entries()].map(([sha, msg]) => `${sha.slice(0, 8)}: ${msg.split("\n")[0]}`);
		const restoreHint = backupName ? `\n復元: git reset --hard ${backupName}` : "";
		ui.notify(`✅ ${shaToMessage.size} 件のコミットメッセージを書き換えました:\n${changed.join("\n")}${restoreHint}`, "info");
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const restoreHint = backupName ? `\n復元: git reset --hard ${backupName} / git rebase --abort` : "\ngit rebase --abort で中断できます";
		ui.notify(`コミットメッセージの書き換えに失敗しました: ${detail}${restoreHint}`, "error");
	}
}

export default function commitRewriteExtension(pi: ExtensionAPI): void {
	if (!isFeatureEnabled("commit-rewrite")) return;

	pi.registerCommand("commit-rewrite", {
		description: "現在のブランチの未 push コミットのメッセージを、現在のモデルで1コミットずつ Conventional Commits 形式に書き直します。--preview で対象一覧のみ表示。",
		handler: async (args, ctx) => {
			await runRewrite(args, ctx);
		},
	});
}
