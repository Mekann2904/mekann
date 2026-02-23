/**
 * @abdd.meta
 * path: .pi/extensions/agent-teams/index.ts
 * role: Agent Teams拡張機能のエントリーポイント
 * why: pi local discoveryがindex.tsを通じてサブディレクトリの拡張機能を読み込むため
 * related: .pi/extensions/agent-teams/extension.ts, .pi/extensions/search/index.ts
 * public_api: extension.tsのデフォルトエクスポート
 * invariants: エクスポートがextension.jsのデフォルトエクスポートと一致すること
 * side_effects: なし
 * failure_modes: extension.jsの読み込みに失敗した場合、拡張機能が利用できない
 * @abdd.explain
 * overview: Agent Teams拡張機能のモジュールを再エクスポートするファイル
 * what_it_does:
 *   - extension.jsのデフォルトエクスポートを外部に公開する
 *   - 拡張機能システムによる動的読み込みのためのインターフェースを提供する
 * why_it_exists:
 *   - 拡張機能のディレクトリ構造を標準化し、発見プロセスを簡素化するため
 *   - 実装詳細をextension.tsに隠蔽し、エントリーポイントの役割を明確にするため
 * scope:
 *   in: 外部からのインポート要求
 *   out: Agent Teams拡張機能のメインモジュール
 */

/**
 * path: .pi/extensions/agent-teams/index.ts
 * role: Agent Teams extension entrypoint for local extension discovery.
 * why: pi local discovery loads subdirectory extensions via index.ts.
 * related: .pi/extensions/agent-teams/extension.ts, package.json, .pi/extensions/search/index.ts
 */

export { default } from "./extension.js";

