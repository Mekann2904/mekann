/**
 * @abdd.meta
 * path: .pi/application/ports/index.ts
 * role: アプリケーション層のポート（インターフェース）定義
 * why: 依存関係逆転の原則（DIP）を実現し、詳細から抽象を分離するため
 * related: adapters/gateways, adapters/repositories
 * public_api: IStorage, ILogger, ILLMProvider, IRuntimeSnapshotProvider
 * invariants: なし
 * side_effects: なし（インターフェース定義のみ）
 * failure_modes: なし
 * @abdd.explain
 * overview: アプリケーション層が外側の層に期待するインターフェースを定義する
 * what_it_does:
 *   - ストレージポート（IStorage）を定義する
 *   - ログポート（ILogger）を定義する
 *   - LLMプロバイダーポート（ILLMProvider）を定義する
 *   - ランタイムスナップショットポート（IRuntimeSnapshotProvider）を定義する
 * why_it_exists:
 *   - アプリケーション層がインフラストラクチャに依存しないようにするため
 *   - テスト時にモックを注入可能にするため
 * scope:
 *   in: なし
 *   out: adapters層での実装
 */

// ============================================================================
// Storage Port (ストレージポート)
// ============================================================================

/**
 * ストレージ操作ポート
 * @summary ストレージポート
 *
 * ファイルの読み書きを抽象化する。
 */
export interface IStorage {
  /**
   * ファイルを読み込む
   * @summary ファイル読込
   * @param path - ファイルパス
   * @returns ファイル内容
   */
  read(path: string): Promise<string>;

  /**
   * ファイルに書き込む
   * @summary ファイル書込
   * @param path - ファイルパス
   * @param content - 書き込む内容
   */
  write(path: string, content: string): Promise<void>;

  /**
   * ファイルが存在するか確認する
   * @summary 存在確認
   * @param path - ファイルパス
   * @returns 存在するかどうか
   */
  exists(path: string): Promise<boolean>;

  /**
   * ディレクトリを作成する
   * @summary ディレクトリ作成
   * @param path - ディレクトリパス
   */
  ensureDir(path: string): Promise<void>;

  /**
   * ファイルを削除する
   * @summary ファイル削除
   * @param path - ファイルパス
   */
  delete(path: string): Promise<void>;
}

// ============================================================================
// Logger Port (ログポート)
// ============================================================================

/**
 * ログレベル
 * @summary ログレベル
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * ログ操作ポート
 * @summary ログポート
 *
 * ログ出力を抽象化する。
 */
export interface ILogger {
  /**
   * ログを出力する
   * @summary ログ出力
   * @param level - ログレベル
   * @param message - メッセージ
   * @param context - コンテキスト（オプション）
   */
  log(level: LogLevel, message: string, context?: Record<string, unknown>): void;

  /**
   * デバッグログ
   * @summary デバッグ
   * @param message - メッセージ
   * @param context - コンテキスト（オプション）
   */
  debug(message: string, context?: Record<string, unknown>): void;

  /**
   * 情報ログ
   * @summary 情報
   * @param message - メッセージ
   * @param context - コンテキスト（オプション）
   */
  info(message: string, context?: Record<string, unknown>): void;

  /**
   * 警告ログ
   * @summary 警告
   * @param message - メッセージ
   * @param context - コンテキスト（オプション）
   */
  warn(message: string, context?: Record<string, unknown>): void;

  /**
   * エラーログ
   * @summary エラー
   * @param message - メッセージ
   * @param error - エラーオブジェクト（オプション）
   * @param context - コンテキスト（オプション）
   */
  error(message: string, error?: Error, context?: Record<string, unknown>): void;
}

// ============================================================================
// LLM Provider Port (LLMプロバイダーポート)
// ============================================================================

/**
 * LLM呼び出しオプション
 * @summary LLMオプション
 */
export interface LLMCallOptions {
  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
  /** 推論レベル */
  thinkingLevel?: string;
  /** 最大トークン数 */
  maxTokens?: number;
  /** 温度パラメータ */
  temperature?: number;
}

/**
 * LLM呼び出し結果
 * @summary LLM結果
 */
export interface LLMCallResult {
  /** 出力テキスト */
  output: string;
  /** 使用トークン数（入力） */
  inputTokens?: number;
  /** 使用トークン数（出力） */
  outputTokens?: number;
  /** 完了理由 */
  finishReason?: string;
}

/**
 * LLMプロバイダーポート
 * @summary LLMプロバイダーポート
 *
 * LLM呼び出しを抽象化する。
 */
export interface ILLMProvider {
  /**
   * LLMを呼び出す
   * @summary LLM呼出
   * @param systemPrompt - システムプロンプト
   * @param userMessage - ユーザーメッセージ
   * @param options - オプション
   * @returns 呼び出し結果
   */
  call(
    systemPrompt: string,
    userMessage: string,
    options?: LLMCallOptions
  ): Promise<LLMCallResult>;

  /**
   * プロバイダー名を取得する
   * @summary プロバイダー名
   * @returns プロバイダー名
   */
  getName(): string;
}

// ============================================================================
// Runtime Snapshot Port (ランタイムスナップショットポート)
// ============================================================================

/**
 * ランタイムスナップショット
 * @summary ランタイム状態
 */
export interface RuntimeSnapshot {
  /** 現在のLLM実行数 */
  activeLLMCount: number;
  /** 現在のリクエスト数 */
  activeRequestCount: number;
  /** 最大LLM数 */
  maxLLM: number;
  /** 最大リクエスト数 */
  maxRequests: number;
  /** 利用可能かどうか */
  isAvailable: boolean;
}

/**
 * ランタイムスナップショットプロバイダーポート
 * @summary ランタイムポート
 *
 * ランタイム状態の取得を抽象化する。
 */
export interface IRuntimeSnapshotProvider {
  /**
   * 現在のランタイム状態を取得する
   * @summary 状態取得
   * @returns ランタイムスナップショット
   */
  getSnapshot(): RuntimeSnapshot;

  /**
   * 容量が変化したときに通知するコールバックを登録する
   * @summary 変更通知登録
   * @param callback - コールバック関数
   */
  onCapacityChange(callback: (snapshot: RuntimeSnapshot) => void): void;
}

// ============================================================================
// Repository Ports (リポジトリポート)
// ============================================================================

import type { AgentId, AgentDefinition, AgentRunRecord } from "../../core/domain/agent.js";
import type { TeamId, TeamDefinition, TeamRunRecord } from "../../core/domain/team.js";
import type { PlanId, PlanDefinition } from "../../core/domain/plan.js";

/**
 * エージェントリポジトリポート
 * @summary エージェントリポジトリ
 */
export interface IAgentRepository {
  /** 全エージェント定義を取得 */
  findAll(): Promise<AgentDefinition[]>;
  /** IDでエージェント定義を取得 */
  findById(id: AgentId): Promise<AgentDefinition | null>;
  /** エージェント定義を保存 */
  save(definition: AgentDefinition): Promise<void>;
  /** エージェント定義を削除 */
  delete(id: AgentId): Promise<void>;
  /** 実行記録を保存 */
  saveRunRecord(record: AgentRunRecord): Promise<void>;
  /** 実行記録を取得 */
  getRunRecords(agentId: AgentId, limit?: number): Promise<AgentRunRecord[]>;
}

/**
 * チームリポジトリポート
 * @summary チームリポジトリ
 */
export interface ITeamRepository {
  /** 全チーム定義を取得 */
  findAll(): Promise<TeamDefinition[]>;
  /** IDでチーム定義を取得 */
  findById(id: TeamId): Promise<TeamDefinition | null>;
  /** チーム定義を保存 */
  save(definition: TeamDefinition): Promise<void>;
  /** チーム定義を削除 */
  delete(id: TeamId): Promise<void>;
  /** 実行記録を保存 */
  saveRunRecord(record: TeamRunRecord): Promise<void>;
  /** 実行記録を取得 */
  getRunRecords(teamId: TeamId, limit?: number): Promise<TeamRunRecord[]>;
}

/**
 * プランリポジトリポート
 * @summary プランリポジトリ
 */
export interface IPlanRepository {
  /** 全プラン定義を取得 */
  findAll(): Promise<PlanDefinition[]>;
  /** IDでプラン定義を取得 */
  findById(id: PlanId): Promise<PlanDefinition | null>;
  /** プラン定義を保存 */
  save(definition: PlanDefinition): Promise<void>;
  /** プラン定義を削除 */
  delete(id: PlanId): Promise<void>;
}
