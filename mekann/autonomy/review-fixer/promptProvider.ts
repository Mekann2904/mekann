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
          "- 実装完了 → review_fixer 実行 → 結果確認 → commit / push / PR 作成 の順序を守ること。",
          "- review_fixer を実行せずに commit / push / PR 作成に進んではならない。",
          "- blocked issue では review_fixer を実行しないこと。",
          "",
          "review_fixer は child Pi を起動するため、実行中は他の操作ができません。",
          "review_fixer が完了したら、返された structured result の findings / changes / verification を確認してから次の step に進んでください。",
        ].join("\n"),
      }];
    },
  });
}
