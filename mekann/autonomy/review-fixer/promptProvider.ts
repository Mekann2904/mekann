import { registerPromptProvider } from "../../core/prompt-core/index.js";

export function registerReviewFixerPromptProvider(): void {
  registerPromptProvider({
    id: "review-fixer",
    getFragments() {
      return [{
        id: "review-fixer:policy",
        source: "review-fixer",
        kind: "review_fixer_policy",
        stability: "stable",
        scope: "global",
        priority: 351,
        version: "v1",
        cacheIntent: "prefer_cache",
        content: [
          "review_fixer tool は issue worktree で PR 作成前に使用する同期 review + edit ツールです。",
          "issue worktree (branch issue-<number>) で実装を完了した場合、commit / push / PR 作成する前に必ず review_fixer tool を実行してください。",
          "review_fixer が完了したら、その結果を確認してから commit / push / PR 作成に進んでください。",
          "review_fixer は child Pi を起動するため、実行中は他の操作ができません。",
        ].join("\n"),
      }];
    },
  });
}
