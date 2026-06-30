// queryEvaluation/messages.ts
// 静的クエリ評価のローカライズメッセージカタログ (issue #162, IC-267)。
//
// メッセージ KEY は pipeline.ts / evaluate.ts 側に置き、ローカライズテキスト
// (現在は `ja` のみ) をこの単一辞書に集約する。これにより empty-state 分岐と
// 共有メッセージビルダが同じ日本語文字列を重複保持せず、将来のロケール追加も
// 辞書の差し替えで済むようになる。
//
// 動的に値を埋め込むメッセージは `{name}` プレースホルダを用い、
// {@link formatMessage} で解決する。

import type { MetricDirection } from "./evaluate.js";

export type QueryEvalMessageId =
  | "block.empty_objective"
  | "block.metric_undefined"
  | "block.direction_unspecified"
  | "block.benchmark_unspecified"
  | "block.extraction_unspecified"
  | "block.checks_unspecified"
  | "block.safety_risk"
  | "warn.checks_unspecified"
  | "warn.scope_unspecified"
  | "ambig.too_broad"
  | "ambig.metric_unknown"
  | "ambig.scope_unknown"
  | "ambig.scope_multiple"
  | "rewrite.reject"
  | "rewrite.broad"
  | "rewrite.ready_for_init"
  | "rewrite.needs_command"
  | "rewrite.needs_metric_extraction"
  | "rewrite.needs_checks_policy"
  | "rewrite.needs_metric_design"
  | "rewrite.default_wall_clock"
  | "rewrite.default_higher"
  | "rewrite.default_fallback"
  | "q.metric_priority"
  | "q.benchmark_command"
  | "q.metric_measurement"
  | "q.checks_policy"
  | "q.scope"
  | "q.priority";

export type QueryEvalLocale = "ja";

export const queryEvalMessages: Record<QueryEvalLocale, Record<QueryEvalMessageId, string>> = {
  ja: {
    "block.empty_objective": "実験の目的が不明確です",
    "block.metric_undefined": "主指標 (metric) が未定義です",
    "block.direction_unspecified": "改善方向 (lower/higher) が未指定です",
    "block.benchmark_unspecified": "ベンチマークコマンドが未指定です",
    "block.extraction_unspecified": "metric の抽出方法 (extraction rule) が未確定です",
    "block.checks_unspecified": "検証方針 (checks policy) が未指定です",
    "block.safety_risk": "安全上の問題: {flag}",
    "warn.checks_unspecified": "検証方針 (checks) が未指定です。変更が既存の振る舞いを壊さないか確認するため、checks command または autoresearch.checks.sh の方針を明示することを推奨します。",
    "warn.scope_unspecified": "対象範囲 (scope) が未指定です。改善対象を明確にすると実験の再現性が向上します。",
    "ambig.too_broad": "目的が広すぎます。具体的な測定可能な指標に分解する必要があります",
    "ambig.metric_unknown": "測定指標が不明です。主指標 (primary metric) を明記してください",
    "ambig.scope_unknown": "対象範囲が不明です",
    "ambig.scope_multiple": "複数の対象範囲が含まれています",
    "rewrite.reject": "安全上の理由により、このクエリは実験として実行できません。危険な操作を削除した上で、安全な代替手段を検討してください。",
    "rewrite.broad": "目的が広すぎるため、まず測定可能な proxy metric を選ぶ必要があります。候補: lint violation 数、型エラー数、重複行数、複雑度、test coverage、prepush 実行時間などから一つ選び、具体的な benchmark command と合わせて再投稿してください。",
    "rewrite.ready_for_init": "init は可能ですが、run 前に {missingText} が必要です。\n例: `<command>` の実行時間を短縮したい。metric は {metric}、{directionWord} is better。既存 checks を使う。",
    "rewrite.needs_command": "主指標は {metric} で、{directionWord} is better。benchmark command を指定してください。",
    "rewrite.needs_metric_extraction": "主指標 {metric} の抽出方法を指定してください。\n- wall-clock (実行時間): 自動測定\n- stdout_metric: コマンドが METRIC {metric}=<value> を出力\n- report_file: カバレッジレポート等から抽出",
    "rewrite.needs_checks_policy": "検証方針を指定してください。\n- checks command を明示: checks は `npm test`\n- autoresearch.checks.sh を使う: 「既存 checks を使う」と記載",
    "rewrite.needs_metric_design": "測定可能な主指標 (metric) と改善方向 (lower/higher) を指定してください。",
    "rewrite.default_wall_clock": "主指標は `{command}` の実行時間秒数で、lower is better。挙動を変えず、既存 checks が成功する範囲で改善する。",
    "rewrite.default_higher": "主指標は {metric} で、higher is better。",
    "rewrite.default_fallback": "主指標と benchmark command を明記してください。",
    "q.metric_priority": "主指標は wall-clock time、テスト成功率、coverage のどれを優先しますか？",
    "q.benchmark_command": "benchmark command は何を実行しますか？（例: `npm run prepush`、`pnpm test`）",
    "q.metric_measurement": "主指標 {metricName} はどうやって測定しますか？（stdout / report file / wall-clock）",
    "q.checks_policy": "検証には autoresearch.checks.sh を使いますか？それとも checks command を指定しますか？",
    "q.scope": "改善対象の scope はリポジトリ全体ですか、それとも特定 package や directory ですか？",
    "q.priority": "どの側面を最優先で改善しますか？",
  },
};

const DEFAULT_LOCALE: QueryEvalLocale = "ja";

/** 静的メッセージのローカライズテキストを取得する。 */
export function messageText(id: QueryEvalMessageId, locale: QueryEvalLocale = DEFAULT_LOCALE): string {
  return queryEvalMessages[locale][id];
}

export type MessageParams = Record<string, string | number>;

/**
 * プレースホルダ `{name}` を埋め込んだメッセージを整形する。
 *
 * `String.prototype.replaceAll` ではなく `split().join()` を使うことで、
 * 置換文字列内の `$` パターンによる破損を防ぐ。
 */
export function formatMessage(id: QueryEvalMessageId, params?: MessageParams, locale: QueryEvalLocale = DEFAULT_LOCALE): string {
  let text = queryEvalMessages[locale][id];
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      text = text.split(`{${key}}`).join(String(value));
    }
  }
  return text;
}

/** 方向語 (higher/lower) を解決する。unknown は lower 扱い (既存ビルダと同一)。 */
export function directionWord(direction: MetricDirection): string {
  return direction === "higher" ? "higher" : "lower";
}
