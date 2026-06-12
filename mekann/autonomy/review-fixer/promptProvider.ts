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
          "実装完了後、PR を作成する前に review_fixer を実行してコード品質を最善化してください。",
          "review_fixer は child Pi を起動するため、実行中は他の操作ができません。",
        ].join("\n"),
      }];
    },
  });
}
