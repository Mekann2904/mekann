import { registerPromptProvider } from "../../core/prompt-core/index.js";

export function registerReviewFixerPromptProvider(): void {
  registerPromptProvider({
    id: "review-fixer",
    getFragments() {
      return [{
        id: "review-fixer:policy",
        source: "review-fixer",
        kind: "tool_policy",
        stability: "stable",
        scope: "global",
        priority: 351,
        version: "v1",
        cacheIntent: "prefer_cache",
        content: [
          "review_fixer tool は issue worktree で PR 作成前に使用する同期 review + edit ツールです。",
          "",
          "【GATE】issue worktree (branch issue-<number>) で実装を完了した場合、commit / push / PR 作成する前に review_fixer tool を必ず実行すること。これは強制 gate であり、省略不可。",
          "- issue対応 → review_fixerによる調査と修正 → issue_workflow(status→diff→commit→push→create_pr) のフェーズ順で動くこと。",
          "- Phase 3 の commit / push / PR 作成は issue_workflow tool を使うこと。bash で git/gh を直接叩いてはいけない（git-safety が止め、メッセージが壊れる）。",
          "- 各フェーズ開始時に現在のフェーズを短く宣言すること。",
          "- review_fixer を実行せずに git add / commit / push / PR 作成に進んではならない。",
          "- blocked issue では review_fixer を実行しないこと。",
          "",
          "review_fixer は child Pi を起動するため、実行中は他の操作ができません。",
          "review_fixer が完了したら、結果確認として返された structured result の findings / changes / verification を確認してから次の step に進んでください。",
        ].join("\n"),
      }];
    },
  });
}
