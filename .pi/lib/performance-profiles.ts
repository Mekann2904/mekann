/**
 * @abdd.meta
 * path: .pi/lib/performance-profiles.ts
 * role: エージェントのパフォーマンスプロファイル管理モジュール
 * why: タスクタイプに応じて検証・委任・自己点検のレベルを動的に調整し、パフォーマンスを最大化するため
 * related: execution-rules.ts, verification-workflow.ts, task-execution.ts
 * public_api: PerformanceProfile, getProfileForTask, applyProfile, PROFILE_PRESETS
 * invariants: プロファイルは必ず1つ選択される
 * side_effects: なし
 * failure_modes: 不正なタスクタイプ分類
 * @abdd.explain
 * overview: タスクタイプに応じたパフォーマンスプロファイルを選択・適用する
 * what_it_does: タスク分類、プロファイル選択、検証レベル調整
 * why_it_exists: 全タスクで同じ検証レベルを適用するオーバーヘッドを削減するため
 * scope:
 *   in: タスク内容、コンテキスト情報
 *   out: 選択されたプロファイル、調整された設定
 */

/**
 * パフォーマンスプロファイル
 * @summary パフォーマンス設定のプロファイル
 * @param id プロファイルID
 * @param name プロファイル名
 * @param description 説明
 * @param verificationLevel 検証レベル
 * @param delegationThreshold 委任閾値（タスク複雑度）
 * @param metacognitiveDepth 自己点検の深度
 * @param philosophicalReflection 7つの視座の適用有無
 * @param maxIterations 最大反復回数
 * @param timeoutMultiplier タイムアウト倍率
 */
export interface PerformanceProfile {
  id: string;
  name: string;
  description: string;
  verificationLevel: 'none' | 'light' | 'standard' | 'strict';
  delegationThreshold: 'none' | 'low' | 'medium' | 'high' | 'always';
  metacognitiveDepth: 0 | 1 | 2 | 3 | 4 | 5;
  philosophicalReflection: boolean;
  aporiaHandling: boolean;
  maxIterations: number;
  timeoutMultiplier: number;
  priorityRules: string[];
}

/**
 * タスクタイプ
 * @summary タスクの分類
 */
export type TaskType =
  | 'trivial'        // 自明な修正（タイポ等）
  | 'simple'         // 単純タスク（1-2ステップ）
  | 'moderate'       // 中程度タスク（複数ステップ）
  | 'complex'        // 複雑タスク（設計判断必要）
  | 'critical'       // 重要タスク（削除・本番・セキュリティ）
  | 'exploratory'    // 探索的タスク（研究・分析）
  | 'creative';      // 創造的タスク（設計・発明）

/**
 * タスク分類結果
 * @summary タスク分類の詳細情報
 * @param type タスクタイプ
 * @param confidence 分類の信頼度
 * @param indicators 分類の根拠
 * @param recommendedProfile 推奨プロファイル
 */
export interface TaskClassification {
  type: TaskType;
  confidence: number;
  indicators: string[];
  recommendedProfile: string;
}

/**
 * 事前定義プロファイル
 */
export const PROFILE_PRESETS: Record<string, PerformanceProfile> = {
  /**
   * 高速プロファイル：自明なタスク用
   * 検証なし、委任なし、最小オーバーヘッド
   */
  fast: {
    id: 'fast',
    name: '高速モード',
    description: '自明なタスク向け。最小限の検証とオーバーヘッド。',
    verificationLevel: 'none',
    delegationThreshold: 'none',
    metacognitiveDepth: 0,
    philosophicalReflection: false,
    aporiaHandling: false,
    maxIterations: 1,
    timeoutMultiplier: 0.5,
    priorityRules: ['efficiency', 'speed'],
  },

  /**
   * 標準プロファイル：通常タスク用
   * 軽量検証、条件付き委任、バランス重視
   */
  standard: {
    id: 'standard',
    name: '標準モード',
    description: '通常タスク向け。バランスの取れた検証と委任。',
    verificationLevel: 'light',
    delegationThreshold: 'medium',
    metacognitiveDepth: 1,
    philosophicalReflection: false,
    aporiaHandling: false,
    maxIterations: 3,
    timeoutMultiplier: 1.0,
    priorityRules: ['balance', 'quality'],
  },

  /**
   * 品質プロファイル：複雑なタスク用
   * 標準検証、積極的委任、深い自己点検
   */
  quality: {
    id: 'quality',
    name: '品質重視モード',
    description: '複雑なタスク向け。深い分析と品質保証。',
    verificationLevel: 'standard',
    delegationThreshold: 'high',
    metacognitiveDepth: 3,
    philosophicalReflection: true,
    aporiaHandling: true,
    maxIterations: 5,
    timeoutMultiplier: 1.5,
    priorityRules: ['quality', 'thoroughness'],
  },

  /**
   * 厳格プロファイル：重要タスク用
   * 完全検証、常に委任、最大深度
   */
  strict: {
    id: 'strict',
    name: '厳格モード',
    description: '重要タスク向け。完全な検証と深い自己点検。',
    verificationLevel: 'strict',
    delegationThreshold: 'always',
    metacognitiveDepth: 5,
    philosophicalReflection: true,
    aporiaHandling: true,
    maxIterations: 10,
    timeoutMultiplier: 2.0,
    priorityRules: ['safety', 'correctness', 'thoroughness'],
  },

  /**
   * 探索プロファイル：研究・分析用
   * 軽量検証、委任なし、創造性重視
   */
  exploratory: {
    id: 'exploratory',
    name: '探索モード',
    description: '研究・分析タスク向け。創造性と柔軟性を優先。',
    verificationLevel: 'light',
    delegationThreshold: 'low',
    metacognitiveDepth: 2,
    philosophicalReflection: true,
    aporiaHandling: true,
    maxIterations: 5,
    timeoutMultiplier: 1.5,
    priorityRules: ['creativity', 'flexibility', 'depth'],
  },

  /**
   * 創造プロファイル：設計・発明用
   * 検証なし、委任なし、最大の自由度
   */
  creative: {
    id: 'creative',
    name: '創造モード',
    description: '設計・発明タスク向け。最大の自由度と創造性。',
    verificationLevel: 'none',
    delegationThreshold: 'low',
    metacognitiveDepth: 4,
    philosophicalReflection: true,
    aporiaHandling: true,
    maxIterations: 8,
    timeoutMultiplier: 2.0,
    priorityRules: ['creativity', 'novelty', 'originality'],
  },
};

/**
 * タスク分類のキーワードパターン
 */
const TASK_PATTERNS: Record<TaskType, { patterns: RegExp[]; indicators: string[] }> = {
  trivial: {
    patterns: [
      /タイポ|typo|誤字|脱字/i,
      /修正して|fix/i,
      /単純な|simple/i,
    ],
    indicators: ['1文字〜数文字の変更', '単一ファイル', '判断不要'],
  },
  simple: {
    patterns: [
      /追加して|add/i,
      /更新して|update/i,
      /変更して|change/i,
      /^.{1,50}$/s,  // 短いタスク
    ],
    indicators: ['1-2ステップ', '明確な手順', '単一モジュール'],
  },
  moderate: {
    patterns: [
      /実装して|implement/i,
      /リファクタリング|refactor/i,
      /テスト|test/i,
    ],
    indicators: ['複数ステップ', '複数ファイル', '設計判断一部必要'],
  },
  complex: {
    patterns: [
      /設計|design|アーキテクチャ|architecture/i,
      /統合|integrate/i,
      /最適化|optimize/i,
      /分析|analyze/i,
    ],
    indicators: ['設計判断必要', '複数モジュール', 'トレードオフ存在'],
  },
  critical: {
    patterns: [
      /削除|delete|remove/i,
      /本番|production|prod/i,
      /セキュリティ|security|auth/i,
      /権限|permission/i,
      /移行|migrate/i,
      /デプロイ|deploy/i,
    ],
    indicators: ['取り返しがつかない', '影響範囲大', 'リスク高'],
  },
  exploratory: {
    patterns: [
      /調査|investigate|research/i,
      /分析|analyze/i,
      /なぜ|why|原因/i,
      /どう|how/i,
    ],
    indicators: ['正解不明', '仮説検証必要', '探索的'],
  },
  creative: {
    patterns: [
      /設計|design/i,
      /作成|create|create/i,
      /発明|invent/i,
      /アイデア|idea/i,
      /新規|new/i,
    ],
    indicators: ['創造性必要', '複数解存在', '自由度高い'],
  },
};

/**
 * タスクを分類する
 * @summary タスクタイプ分類
 * @param task タスク内容
 * @param context 追加コンテキスト
 * @returns 分類結果
 */
export function classifyTask(task: string, context?: {
  fileCount?: number;
  estimatedSteps?: number;
  isHighRisk?: boolean;
}): TaskClassification {
  const scores: Record<TaskType, number> = {
    trivial: 0,
    simple: 0,
    moderate: 0,
    complex: 0,
    critical: 0,
    exploratory: 0,
    creative: 0,
  };

  const matchedIndicators: string[] = [];

  // パターンマッチング
  for (const [type, config] of Object.entries(TASK_PATTERNS)) {
    for (const pattern of config.patterns) {
      if (pattern.test(task)) {
        scores[type as TaskType] += 1;
        matchedIndicators.push(...config.indicators);
      }
    }
  }

  // コンテキストベースの調整
  if (context) {
    if (context.isHighRisk) {
      scores.critical += 3;
    }
    if (context.fileCount && context.fileCount > 5) {
      scores.complex += 2;
    }
    if (context.estimatedSteps && context.estimatedSteps <= 2) {
      scores.simple += 1;
    }
  }

  // 最高スコアのタイプを選択
  let maxScore = 0;
  let selectedType: TaskType = 'moderate';  // デフォルト

  for (const [type, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      selectedType = type as TaskType;
    }
  }

  // プロファイルマッピング
  const profileMap: Record<TaskType, string> = {
    trivial: 'fast',
    simple: 'fast',
    moderate: 'standard',
    complex: 'quality',
    critical: 'strict',
    exploratory: 'exploratory',
    creative: 'creative',
  };

  // 信頼度計算（スコアの相対的な強さ）
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? maxScore / totalScore : 0.5;

  return {
    type: selectedType,
    confidence: Math.min(confidence + 0.3, 1.0),  // ベースライン信頼度
    indicators: [...new Set(matchedIndicators)].slice(0, 5),
    recommendedProfile: profileMap[selectedType],
  };
}

/**
 * タスクに適したプロファイルを取得
 * @summary プロファイル取得
 * @param task タスク内容
 * @param context 追加コンテキスト
 * @returns パフォーマンスプロファイル
 */
export function getProfileForTask(
  task: string,
  context?: {
    fileCount?: number;
    estimatedSteps?: number;
    isHighRisk?: boolean;
    overrideProfile?: string;
  }
): PerformanceProfile {
  // 明示的なオーバーライド
  if (context?.overrideProfile && PROFILE_PRESETS[context.overrideProfile]) {
    return PROFILE_PRESETS[context.overrideProfile];
  }

  const classification = classifyTask(task, context);
  return PROFILE_PRESETS[classification.recommendedProfile] ?? PROFILE_PRESETS.standard;
}

/**
 * プロファイルを適用して設定を調整
 * @summary プロファイル適用
 * @param profile パフォーマンスプロファイル
 * @param baseConfig ベース設定
 * @returns 調整された設定
 */
export function applyProfile<T extends Record<string, unknown>>(
  profile: PerformanceProfile,
  baseConfig: T
): T & { profile: PerformanceProfile } {
  return {
    ...baseConfig,
    profile,
    // プロファイルに基づく調整
    maxIterations: profile.maxIterations,
    timeoutMs: (baseConfig.timeoutMs as number ?? 60000) * profile.timeoutMultiplier,
    verificationEnabled: profile.verificationLevel !== 'none',
    metacognitiveDepth: profile.metacognitiveDepth,
    philosophicalReflection: profile.philosophicalReflection,
    aporiaHandling: profile.aporiaHandling,
  };
}

/**
 * 現在のパフォーマンス統計を取得
 * @summary パフォーマンス統計取得
 * @returns 統計情報
 */
export function getPerformanceStats(): {
  profileUsage: Record<string, number>;
  averageTaskDuration: number;
  cacheHitRate: number;
} {
  // 実装はメトリクス収集システムと連携
  return {
    profileUsage: {
      fast: 0,
      standard: 0,
      quality: 0,
      strict: 0,
      exploratory: 0,
      creative: 0,
    },
    averageTaskDuration: 0,
    cacheHitRate: 0,
  };
}
