/**
 * @abdd.meta
 * @path .pi/extensions/web-ui/src/schemas/instance.schema.ts
 * @role インスタンス関連のZodスキーマ定義
 * @why インスタンスAPIの入出力バリデーションと型安全性
 * @related common.schema.ts, routes/instances.ts
 * @public_api InstanceInfoSchema, InstanceFilterSchema
 * @invariants PIDは一意、ハートビートは定期的に更新
 * @side_effects なし
 * @failure_modes バリデーション失敗時はZodError
 *
 * @abdd.explain
 * @overview piインスタンス情報のスキーマ定義
 * @what_it_does インスタンスの登録・状態・フィルタリング
 * @why_it_exists 型安全なインスタンス管理
 * @scope(in) HTTPリクエスト
 * @scope(out) 型定義
 */

import { z } from "zod";

/**
 * インスタンス情報スキーマ
 */
export const InstanceInfoSchema = z.object({
  /** プロセスID */
  pid: z.number().int().positive(),
  /** 起動時刻（Unix タイムスタンプ） */
  startedAt: z.number().int().positive(),
  /** 作業ディレクトリ */
  cwd: z.string(),
  /** 使用モデル */
  model: z.string(),
  /** 最終ハートビート時刻 */
  lastHeartbeat: z.number().int().positive(),
});

/**
 * インスタンス統計スキーマ
 */
export const InstanceStatsSchema = z.object({
  /** アクティブインスタンス数 */
  activeCount: z.number().int().nonnegative(),
  /** 総コンテキスト使用量 */
  totalContextUsage: z.object({
    input: z.number().int().nonnegative(),
    output: z.number().int().nonnegative(),
  }),
  /** 平均コンテキスト使用量 */
  avgContextUsage: z.object({
    input: z.number().nonnegative(),
    output: z.number().nonnegative(),
  }),
});

/**
 * コンテキスト履歴エントリスキーマ
 */
export const ContextHistoryEntrySchema = z.object({
  /** タイムスタンプ */
  timestamp: z.string().datetime(),
  /** 入力トークン数 */
  input: z.number().int().nonnegative(),
  /** 出力トークン数 */
  output: z.number().int().nonnegative(),
  /** プロセスID */
  pid: z.number().int().positive(),
});

/**
 * インスタンスコンテキスト履歴スキーマ
 */
export const InstanceContextHistorySchema = z.object({
  /** プロセスID */
  pid: z.number().int().positive(),
  /** 作業ディレクトリ */
  cwd: z.string(),
  /** モデル名 */
  model: z.string(),
  /** 履歴エントリ */
  history: z.array(ContextHistoryEntrySchema),
});

/**
 * 型エクスポート
 */
export type InstanceInfo = z.infer<typeof InstanceInfoSchema>;
export type InstanceStats = z.infer<typeof InstanceStatsSchema>;
export type ContextHistoryEntry = z.infer<typeof ContextHistoryEntrySchema>;
export type InstanceContextHistory = z.infer<typeof InstanceContextHistorySchema>;
