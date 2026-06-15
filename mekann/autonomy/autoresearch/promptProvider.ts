import type { AutoresearchContractV1 } from "./contractV1.js";
import { COMPLETE_MARKER } from "./runner.js";
import { buildActiveContext } from "./activeContext.js";
import type { SessionStore } from "./tools/sessionStore.js";
import { registerPromptProvider } from "../../core/prompt-core/index.js";

const SYSTEM_PROMPT_EXTRA = [
	"",
	"## autoresearch モード(アクティブ)",
	"",
	"- まず下記の dynamic autoresearch context を読み、現在の目的・指標・進捗・未探索領域を把握する。autoresearch.md だけに依存せず、state / current.plan / journal / plan contract も確認する。",
	"- 目的に沿って実験を繰り返す。未初期化なら autoresearch_init/plan/approve 系 tool で契約を整える。",
	"- autoresearch_run 後は必ず autoresearch_log または contract evaluator で記録する。autoresearch_log は自動で git commit / revert するため手動 git 操作はしない。",
	"- 長時間コマンドには timeout を明示し、webui/watch など終了しないコマンドは使わない。",
	"- 自然文目的が曖昧なら run 前に autoresearch_evaluate_query で不足事項を確認する。ready_for_run 以外では run に進まない。",
	"- autoresearch 中の subagent patch は直接 apply せず candidate escrow → apply_candidate → run_contract で評価する。",
	"- 改善余地・未検証候補・不確実性が残る場合は継続する。早期 COMPLETE を避ける。",
	"- subagent が使える場合は、独立調査・候補生成・失敗分析を並列化して積極的に活用する。",
	"- 1ターン1実験を目安に、日本語で簡潔に報告する。ideas は必要時のみ autoresearch.ideas.md 等へ保存する。",
	"- " + COMPLETE_MARKER + " は、十分な探索証拠があり未探索候補がない場合のみ返す。",
].join("\n");

const SYSTEM_PROMPT_INACTIVE = [
	"",
	"## autoresearch モード(OFF)",
	"",
	"- autoresearch は現在 OFF。",
	"- ユーザーが明示的に `/autoresearch on` を実行するまで、autoresearch の実験ループ・候補評価・継続タスクを開始/再開しない。",
	"- 現在のユーザー依頼を通常の依頼として扱う。修正・調査・質問・レビューなど、依頼内容に従って対応する。",
	"- autoresearch_run / autoresearch_log / autoresearch_init / autoresearch_plan / autoresearch_run_contract は使わない。",
	"- autoresearch.md / .autoresearch/ は、ユーザーが明示した場合、または現在の依頼を理解するために必要な場合だけ参照する。",
].join("\n");

export function registerAutoresearchPromptProvider(
	store: SessionStore,
	readCurrentPlanContract: (cwd: string) => AutoresearchContractV1 | null,
): void {
	registerPromptProvider({
		id: "autoresearch",
		getFragments(ctx) {
			if (!store.active) {
				return [{
					id: "autoresearch:inactive-policy",
					source: "autoresearch",
					kind: "autoresearch_policy",
					stability: "stable",
					scope: "mode",
					priority: 400,
					version: "v1",
					cacheIntent: "prefer_cache",
					metadata: { volatileTermsArePolicyReferences: true },
					content: SYSTEM_PROMPT_INACTIVE,
				}];
			}
			return [
				{
					id: "autoresearch:policy",
					source: "autoresearch",
					kind: "autoresearch_policy",
					stability: "stable",
					scope: "mode",
					priority: 400,
					version: "v1",
					cacheIntent: "prefer_cache",
					metadata: { volatileTermsArePolicyReferences: true },
					content: SYSTEM_PROMPT_EXTRA,
				},
				{
					id: "autoresearch:active-context",
					source: "autoresearch",
					kind: "autoresearch_state",
					stability: "dynamic",
					scope: "turn",
					priority: 750,
					version: "v1",
					cacheIntent: "avoid_cache",
					content: buildActiveContext(ctx.cwd, store, readCurrentPlanContract),
				},
			];
		},
	});
}
