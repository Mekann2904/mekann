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

// Inactive guard, compressed to a one-liner (issue #96). The previous
// ~600-char block was injected on every turn of every non-autoresearch
// session (~9.7k injections). This preserves the safety guard — no
// autonomous experiment loop / candidate eval / continuation, no
// autoresearch_* tools, treat the request as a normal request — at a fraction
// of the size, and still advertises the `/autoresearch on` opt-in.
const SYSTEM_PROMPT_INACTIVE = "## autoresearch モード(OFF)。`/autoresearch on` するまで実験ループ・候補評価・継続タスクを開始/再開せず、autoresearch_run 系ツール（log/init/plan/run_contract 含む）を使わない。現在の依頼は通常の依頼として扱う。autoresearch.md / .autoresearch/ は明示時・理解に必要な場合のみ参照する。";

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
