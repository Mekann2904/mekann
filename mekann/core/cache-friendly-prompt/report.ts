/**
 * cache-friendly-prompt/report.ts — キャッシュフレンドリープロンプトレポート生成 (barrel)。
 *
 * 歴史的に single file (1000 行超) だったレポート生成を責務別モジュールに分割した:
 *   - {@link ./report/format.js}    共通 leaf フォーマッタ (shortHash / escapeHtml / formatPct ...)
 *   - {@link ./report/aggregate.js} 集計・パース・統計 (summarize)
 *   - {@link ./report/svg.js}       SVG レンダラ (trend / cacheability / actual-hit-rate / fragments)
 *   - {@link ./report/tables.js}    Markdown 表・行レンダラ (formatUnknownRoleNote ...)
 *   - {@link ./report/document.js}  レポート文書の組み立てとファイル出力
 *
 * このファイルは外部公開 API を維持するための再エクスポート口であり、呼び出し元
 * (logs.ts / report.test.ts / coverage.test.ts / context-control/*) は引き続き
 * `./report.js` から import できる。実装の追加・変更は各 sub-module に対して行うこと。
 */

export { formatUnknownRoleNote } from "./report/tables.js";
export {
	buildCacheFriendlyReportArtifactsForTest,
	generateCacheFriendlyReport,
} from "./report/document.js";
