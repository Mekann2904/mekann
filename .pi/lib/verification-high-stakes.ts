/**
 * @abdd.meta
 * path: .pi/lib/verification-high-stakes.ts
 * role: 高リスクタスク判定ユーティリティ
 * why: 動的ツール生成やエージェント実行時に、安全性を確保するため
 * related: .pi/extensions/dynamic-tools.ts, .pi/extensions/agent-teams/member-execution.ts
 * public_api: isHighStakesTask, HIGH_STAKES_PATTERNS
 * invariants: 戻り値はboolean, パターンマッチングはcase-insensitive
 * side_effects: なし
 * failure_modes: なし
 * @abdd.explain
 * overview: タスク内容が高リスク（破壊的操作、セキュリティ関連等）かどうかを判定する
 * what_it_does:
 *   - タスク文字列を正規表現パターンで評価
 *   - 削除、本番環境、セキュリティ等のキーワードを検出
 * why_it_exists:
 *   - 危険な操作を事前に検出し、適切な確認や検証をトリガーするため
 * scope:
 *   in: タスク文字列
 *   out: 高リスク判定結果
 */

/**
 * 高リスクタスクを判定する正規表現パターン
 *
 * カテゴリ:
 * 1. 削除・破壊的操作 (Destructive operations)
 * 2. 本番環境・リリース (Production & Release)
 * 3. セキュリティ・認証 (Security & Authentication)
 * 4. データベース操作 (Database operations)
 * 5. API契約変更 (API contract changes)
 * 6. 認可・アクセス制御 (Authorization & Access Control)
 * 7. インフラ・デプロイ (Infrastructure & Deployment)
 * 8. 機密データ・コスト (Sensitive Data & Cost)
 * 9. 不可逆操作・危険フラグ (Irreversible & Dangerous flags)
 */
export const HIGH_STAKES_PATTERNS: RegExp[] = [
  // 1. 削除・破壊的操作 (Destructive operations)
  /削除/i,
  /破壊的/i,
  /delete/i,
  /destructive/i,
  /remove/i,
  /drop/i,
  /truncate/i,
  / purge /i,         // Note: スペースを含む場合のみマッチ（危険なコマンド実行）
  /wipe/i,
  /消去/i,
  /除去/i,

  // 2. 本番環境・リリース (Production & Release)
  /本番/i,
  /production/i,
  /prod\b/i,
  /リリース/i,
  /release/i,
  /live\s*environment/i,
  /実環境/i,

  // 3. セキュリティ・認証 (Security & Authentication)
  /セキュリティ/i,
  /security/i,
  /認証/i,
  /authentication/i,
  /暗号化/i,
  /encryption/i,
  /パスワード/i,
  /password/i,
  /credentials/i,
  /シークレット/i,
  /\bsecret\b/i,
  /api\s*key/i,
  /\btoken\b/i,
  /vulnerability/i,
  /脆弱性/i,
  /injection/i,
  /\bxss\b/i,
  /\bcsrf\b/i,
  /\bsql\s*injection/i,

  // 4. データベース操作 (Database operations)
  /マイグレーション/i,
  /migration/i,
  /\bschema\b/i,
  /スキーマ/i,
  /\balter\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /データベース変更/i,
  /database\s*change/i,
  /テーブル変更/i,
  /table\s*modification/i,
  /カラム変更/i,
  /column\s*change/i,
  /\breset\b/i,
  /\brollback\b/i,
  /\brevert\b/i,
  /\brestore\b/i,
  /\bbackup\b/i,
  /レプリケーション/i,
  /replication/i,
  /フェイルオーバー/i,
  /\bfailover\b/i,

  // 5. API契約変更 (API contract changes)
  /breaking\s*change/i,
  /破壊的変更/i,
  /deprecated/i,
  /廃止/i,
  /非推奨/i,
  /api\s*contract/i,
  /エンドポイント変更/i,
  /endpoint\s*change/i,
  /互換性がない/i,
  /incompatible/i,

  // 6. 認可・アクセス制御 (Authorization & Access Control)
  /権限/i,
  /\bpermission\b/i,
  /\bauthorize\b/i,
  /authorization/i,
  /認可/i,
  /アクセス制御/i,
  /access\s*control/i,
  /\bacl\b/i,
  /role\s*change/i,
  /ロール変更/i,
  /権限付与/i,
  /privilege/i,

  // 7. インフラ・デプロイ (Infrastructure & Deployment)
  /デプロイ/i,
  /\bdeploy\b/i,
  /インフラ/i,
  /infrastructure/i,
  /\binfra\b/i,
  /kubernetes/i,
  /\bk8s\b/i,
  /コンテナ/i,
  /\bcontainer\b/i,
  /スケーリング/i,
  /\bscale\s*(up|down|out|in)\b/i,
  /設定変更/i,
  /configuration\s*change/i,
  /\bconfig\s*change/i,
  /オートスケール/i,
  /auto\s*scale/i,
  /\biac\b/i,
  /terraform/i,
  /cloudformation/i,

  // 8. 機密データ・コスト (Sensitive Data & Cost)
  /\bpii\b/i,
  /個人情報/i,
  /personal\s*data/i,
  /機密/i,
  /confidential/i,
  /\bprivate\b/i,
  /sensitive\s*data/i,
  /コスト/i,
  /\bcost\b/i,
  /レート制限/i,
  /rate\s*limit/i,
  /課金/i,
  /billing/i,
  /予算/i,
  /\bbudget\b/i,
  /ログ削除/i,
  /log\s*deletion/i,

  // 9. 不可逆操作・危険フラグ (Irreversible & Dangerous flags)
  /\bforce\b/i,
  /強制/i,
  /永続的/i,
  /permanent/i,
  /不可逆/i,
  /irreversible/i,
  /bypass/i,
  /スキップ/i,
  /\bskip\b/i,
  /安全でない/i,
  /unsafe/i,
  /危険/i,
  /\bdanger\b/i,
  /\brisky\b/i,
  /上書き/i,
  /\boverwrite\b/i,
];

/**
 * 高リスクタスク判定
 * @summary リスク判定
 * @param task タスク内容
 * @returns 高リスクの場合はtrue
 */
export function isHighStakesTask(task: string): boolean {
  return HIGH_STAKES_PATTERNS.some(pattern => pattern.test(task));
}
