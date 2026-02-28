/**
 * @abdd.meta
 * path: .pi/lib/belief-updater.ts
 * role: ベイズ推論に基づく信念状態と確率分布の管理モジュール
 * why: 証拠に基づく動的な仮説評価と、確率的な意思決定支援を行うため
 * related: .pi/lib/thinking-process.ts, .pi/lib/policy-engine.ts
 * public_api: Distribution, Evidence, BayesianBelief, BayesianUpdateOptions, createPrior
 * invariants:
 *   - Distributionの全確率値は正規化時に総和1となる
 *   - Evidence.strengthは0から1の範囲内である
 *   - probabilitiesマップのキーは仮説名と一致する
 * side_effects:
 *   - 呼出元が保持するDistributionオブジェクトの状態更新
 *   - 新しいDistributionオブジェクトの生成
 * failure_modes:
 *   - 総和が0の確率分布によるゼロ除算（smoothingFactorで回避）
 *   - maxEvidenceAgeを超過した証拠の誤用
 *   - 不正な証拠タイプによる尤度計算エラー
 * @abdd.explain
 * overview: 離散確率分布とベイズ更新を通じて、仮説の事前確率を事後確率へと逐次更新する機能を提供する。
 * what_it_does:
 *   - 離散確率分布（Distribution）を作成・正規化する
 *   - 観測・推論・フィードバックなどの証拠（Evidence）を定義・保持する
 *   - 事前分布、尤度、事後分布を含む信念状態（BayesianBelief）を管理する
 *   - ベイズ更新の動作を制御するオプション（BayesianUpdateOptions）を提供する
 *   - 一様分布または指定された初期確率に基づき事前分布を生成する
 * why_it_exists:
 *   - エージェントの意思決定プロセスにおいて、不確実性下での仮説評価を数理的に扱う必要があるため
 *   - 新しい証拠の入手に応じて信念状態を動的に修正し、適応的な行動を実現するため
 * scope:
 *   in: 仮説リスト、初期確率マップ、更新オプション、証拠データ
 *   out: 正規化された確率分布を持つDistributionオブジェクト、更新されたBayesianBeliefオブジェクト
 */

import { ThinkingMode, ThinkingPhase } from '../thinking-process';

/**
 * 確率分布
 * @summary 離散確率分布を表現する型
 */
export interface Distribution {
  /** 各要素の確率値のマップ */
  probabilities: Map<string, number>;
  /** 分布の作成時刻 */
  createdAt: Date;
  /** 分布のバージョン（更新回数） */
  version: number;
}

/**
 * 証拠
 * @summary 観測された証拠を表現する型
 * @param type 証拠の種類
 * @param value 証拠の値
 * @param strength 証拠の強さ（0-1）
 * @param source 証拠のソース
 * @param timestamp 観測時刻
 */
export interface Evidence {
  type: EvidenceType;
  value: string;
  strength: number;
  source: string;
  timestamp: Date;
  /** 証拠が関連する仮説の尤度 */
  likelihoods?: Map<string, number>;
}

/**
 * 証拠タイプ
 * @summary 証拠の種類を表す型
 */
export type EvidenceType =
  | 'observation'      // 直接観測
  | 'inference'        // 推論による
  | 'user-feedback'    // ユーザーからのフィードバック
  | 'test-result'      // テスト結果
  | 'system-log';      // システムログ

/**
 * ベイズ信念
 * @summary 仮説に対する信念を表現する型
 * @param hypothesis 仮説
 * @param prior 事前分布
 * @param likelihood 尤度分布
 * @param posterior 事後分布
 * @param evidence 適用された証拠のリスト
 */
export interface BayesianBelief {
  hypothesis: string;
  prior: Distribution;
  likelihood: Distribution;
  posterior: Distribution;
  evidence: Evidence[];
  lastUpdated: Date;
}

/**
 * ベイズ更新オプション
 * @summary updateBelief関数の設定オプション
 * @param smoothingFactor 平滑化係数（ゼロ除算防止）
 * @param normalize 更新後に正規化するか
 * @param preservePrior 事前分布を保持するか
 */
export interface BayesianUpdateOptions {
  smoothingFactor: number;
  normalize: boolean;
  preservePrior: boolean;
  maxEvidenceAge: number;  // ミリ秒
}

/**
 * デフォルトオプション
 */
const DEFAULT_OPTIONS: BayesianUpdateOptions = {
  smoothingFactor: 0.001,
  normalize: true,
  preservePrior: true,
  maxEvidenceAge: 7 * 24 * 60 * 60 * 1000  // 7日
};

/**
 * @summary 事前分布を作成する
 * @param hypotheses 仮説のリスト
 * @param initialProbabilities 初期確率（省略時は一様分布）
 * @returns 作成された事前分布
 */
export function createPrior(
  hypotheses: string[],
  initialProbabilities?: Map<string, number>
): Distribution {
  const probabilities = new Map<string, number>();

  if (initialProbabilities) {
    // 初期確率が指定されている場合
    let sum = 0;
    hypotheses.forEach(h => {
      const p = initialProbabilities.get(h) || 0;
      probabilities.set(h, p);
      sum += p;
    });

    // 正規化
    if (sum > 0) {
      hypotheses.forEach(h => {
        probabilities.set(h, (probabilities.get(h) || 0) / sum);
      });
    } else {
      // 全て0の場合は一様分布
      const uniform = 1 / hypotheses.length;
      hypotheses.forEach(h => probabilities.set(h, uniform));
    }
  } else {
    // 一様分布
    const uniform = 1 / hypotheses.length;
    hypotheses.forEach(h => probabilities.set(h, uniform));
  }

  return {
    probabilities,
    createdAt: new Date(),
    version: 0
  };
}

/**
 * @summary 分布を正規化する
 * @param distribution 正規化する分布
 * @returns 正規化された分布
 */
export function normalizeDistribution(distribution: Distribution): Distribution {
  const probabilities = new Map<string, number>();
  let sum = 0;

  distribution.probabilities.forEach((p, _h) => {
    sum += p;
  });

  if (sum === 0) {
    // ゼロ除算回避：一様分布に戻す
    const uniform = 1 / distribution.probabilities.size;
    distribution.probabilities.forEach((_, h) => {
      probabilities.set(h, uniform);
    });
  } else {
    distribution.probabilities.forEach((p, h) => {
      probabilities.set(h, p / sum);
    });
  }

  return {
    probabilities,
    createdAt: distribution.createdAt,
    version: distribution.version + 1
  };
}

/**
 * @summary ベイズ更新を実行する
 * @param prior 事前分布
 * @param evidence 証拠
 * @param options 更新オプション
 * @returns 事後分布
 */
export function updateBelief(
  prior: Distribution,
  evidence: Evidence,
  options: Partial<BayesianUpdateOptions> = {}
): Distribution {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const probabilities = new Map<string, number>();

  // 各仮説について事後確率を計算: P(H|E) ∝ P(E|H) * P(H)
  prior.probabilities.forEach((priorProb, hypothesis) => {
    // 尤度を取得（証拠に含まれていない場合は一様）
    const likelihood = evidence.likelihoods?.get(hypothesis) ?? 0.5;

    // 事後確率 = 尤度 * 事前確率 + 平滑化項
    const posteriorProb = (likelihood * priorProb) + opts.smoothingFactor;

    probabilities.set(hypothesis, posteriorProb);
  });

  let posterior: Distribution = {
    probabilities,
    createdAt: prior.createdAt,
    version: prior.version + 1
  };

  // 正規化
  if (opts.normalize) {
    posterior = normalizeDistribution(posterior);
  }

  return posterior;
}

/**
 * @summary 複数の証拠を順次適用して信念を更新
 * @param prior 初事事前分布
 * @param evidenceList 証拠のリスト
 * @param options 更新オプション
 * @returns 最終的な事後分布と更新履歴
 */
export function updateWithMultipleEvidence(
  prior: Distribution,
  evidenceList: Evidence[],
  options: Partial<BayesianUpdateOptions> = {}
): {
  finalPosterior: Distribution;
  updateHistory: Distribution[];
  appliedEvidence: Evidence[];
} {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const now = new Date();
  const updateHistory: Distribution[] = [prior];
  const appliedEvidence: Evidence[] = [];

  let currentDistribution = prior;

  for (const evidence of evidenceList) {
    // 古い証拠を除外
    const evidenceAge = now.getTime() - evidence.timestamp.getTime();
    if (evidenceAge > opts.maxEvidenceAge) {
      continue;
    }

    currentDistribution = updateBelief(currentDistribution, evidence, opts);
    updateHistory.push(currentDistribution);
    appliedEvidence.push(evidence);
  }

  return {
    finalPosterior: currentDistribution,
    updateHistory,
    appliedEvidence
  };
}

/**
 * @summary ベイズ信念を作成する
 * @param hypothesis 主仮説
 * @param alternativeHypotheses 代替仮説のリスト
 * @param initialPrior 初事事前確率（省略時は一様分布）
 * @returns 作成されたベイズ信念
 */
export function createBayesianBelief(
  hypothesis: string,
  alternativeHypotheses: string[] = [],
  initialPrior?: Map<string, number>
): BayesianBelief {
  const allHypotheses = [hypothesis, ...alternativeHypotheses];
  const prior = createPrior(allHypotheses, initialPrior);

  return {
    hypothesis,
    prior,
    likelihood: createPrior(allHypotheses),  // 初期尤度は一様
    posterior: { ...prior, version: 0 },
    evidence: [],
    lastUpdated: new Date()
  };
}

/**
 * @summary ベイズ信念に証拠を適用して更新
 * @param belief 更新する信念
 * @param evidence 適用する証拠
 * @param options 更新オプション
 * @returns 更新された信念
 */
export function updateBayesianBelief(
  belief: BayesianBelief,
  evidence: Evidence,
  options: Partial<BayesianUpdateOptions> = {}
): BayesianBelief {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // 事後分布を更新
  const newPosterior = updateBelief(belief.posterior, evidence, opts);

  // 尤度を更新（証拠から取得）
  const newLikelihood = { ...belief.likelihood };
  if (evidence.likelihoods) {
    evidence.likelihoods.forEach((l, h) => {
      newLikelihood.probabilities.set(h, l);
    });
  }

  return {
    hypothesis: belief.hypothesis,
    prior: opts.preservePrior ? belief.prior : newPosterior,
    likelihood: newLikelihood,
    posterior: newPosterior,
    evidence: [...belief.evidence, evidence],
    lastUpdated: new Date()
  };
}

/**
 * @summary 分布から最も確率の高い仮説を取得
 * @param distribution 確率分布
 * @returns 最も確率の高い仮説とその確率
 */
export function getMostProbable(distribution: Distribution): {
  hypothesis: string;
  probability: number;
} {
  let maxProb = 0;
  let maxHypothesis = '';

  distribution.probabilities.forEach((prob, hypothesis) => {
    if (prob > maxProb) {
      maxProb = prob;
      maxHypothesis = hypothesis;
    }
  });

  return { hypothesis: maxHypothesis, probability: maxProb };
}

/**
 * @summary 分布のエントロピーを計算（不確実性の測度）
 * @param distribution 確率分布
 * @returns エントロピー値（高いほど不確実）
 */
export function calculateEntropy(distribution: Distribution): number {
  let entropy = 0;

  distribution.probabilities.forEach(prob => {
    if (prob > 0) {
      entropy -= prob * Math.log2(prob);
    }
  });

  return entropy;
}

/**
 * @summary 分布の最大エントロピーを計算
 * @param numHypotheses 仮説の数
 * @returns 最大エントロピー（一様分布の場合）
 */
export function getMaxEntropy(numHypotheses: number): number {
  if (numHypotheses <= 1) return 0;
  return Math.log2(numHypotheses);
}

/**
 * @summary 信念の確からしさを評価
 * @param belief 評価する信念
 * @returns 評価結果
 */
export function evaluateBeliefStrength(belief: BayesianBelief): {
  confidence: number;
  uncertainty: number;
  evidenceCount: number;
  mainHypothesisProbability: number;
} {
  const mainProb = belief.posterior.probabilities.get(belief.hypothesis) || 0;
  const entropy = calculateEntropy(belief.posterior);
  const maxEntropy = getMaxEntropy(belief.posterior.probabilities.size);

  // エントロピー比から不確実性を計算
  const uncertainty = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // 信頼度は主仮説の確率から不確実性を引いた値
  const confidence = Math.max(0, mainProb - uncertainty * 0.5);

  return {
    confidence,
    uncertainty,
    evidenceCount: belief.evidence.length,
    mainHypothesisProbability: mainProb
  };
}

/**
 * @summary 思考モード用のベイズ選択器を作成
 * @param initialPriors 初期事前確率（省略時は一様分布）
 * @returns 思考モード選択用の信念
 */
export function createThinkingModeBelief(
  initialPriors?: Map<ThinkingMode, number>
): BayesianBelief {
  const modes: ThinkingMode[] = [
    'creative', 'analytical', 'critical', 'practical', 'social', 'emotional'
  ];

  const priors = initialPriors || new Map<ThinkingMode, number>();
  const priorMap = new Map<string, number>();
  modes.forEach(m => priorMap.set(m, priors.get(m) ?? 1 / modes.length));

  return createBayesianBelief('analytical', modes.filter(m => m !== 'analytical'), priorMap);
}

/**
 * @summary 思考フェーズ用のベイズ選択器を作成
 * @param initialPriors 初期事前確率（省略時は一様分布）
 * @returns 思考フェーズ選択用の信念
 */
export function createThinkingPhaseBelief(
  initialPriors?: Map<ThinkingPhase, number>
): BayesianBelief {
  const phases: ThinkingPhase[] = [
    'problem-discovery', 'problem-formulation', 'strategy-development', 'solution-evaluation'
  ];

  const priors = initialPriors || new Map<ThinkingPhase, number>();
  const priorMap = new Map<string, number>();
  phases.forEach(p => priorMap.set(p, priors.get(p) ?? 1 / phases.length));

  return createBayesianBelief('problem-discovery', phases.filter(p => p !== 'problem-discovery'), priorMap);
}

/**
 * @summary 証拠を作成するヘルパー関数
 * @param type 証拠タイプ
 * @param value 証拠の値
 * @param likelihoods 各仮説に対する尤度
 * @param strength 証拠の強さ
 * @returns 作成された証拠
 */
export function createEvidence(
  type: EvidenceType,
  value: string,
  likelihoods: Map<string, number>,
  strength: number = 0.5
): Evidence {
  return {
    type,
    value,
    strength: Math.max(0, Math.min(1, strength)),
    source: 'system',
    timestamp: new Date(),
    likelihoods
  };
}

/**
 * @summary 分布をJSON形式で出力
 * @param distribution 分布
 * @returns JSON互換オブジェクト
 */
export function distributionToJSON(distribution: Distribution): {
  probabilities: Record<string, number>;
  createdAt: string;
  version: number;
} {
  const probabilities: Record<string, number> = {};
  distribution.probabilities.forEach((prob, hypothesis) => {
    probabilities[hypothesis] = prob;
  });

  return {
    probabilities,
    createdAt: distribution.createdAt.toISOString(),
    version: distribution.version
  };
}

/**
 * @summary JSONから分布を復元
 * @param json JSON互換オブジェクト
 * @returns 復元された分布
 */
export function distributionFromJSON(json: {
  probabilities: Record<string, number>;
  createdAt: string;
  version: number;
}): Distribution {
  const probabilities = new Map<string, number>();
  Object.entries(json.probabilities).forEach(([h, p]) => {
    probabilities.set(h, p);
  });

  return {
    probabilities,
    createdAt: new Date(json.createdAt),
    version: json.version
  };
}

/**
 * @summary 2つの分布間のKL情報量を計算
 * @param p 第一の分布
 * @param q 第二の分布
 * @returns KL情報量（pからqへの）
 */
export function klDivergence(p: Distribution, q: Distribution): number {
  let divergence = 0;

  p.probabilities.forEach((pProb, hypothesis) => {
    const qProb = q.probabilities.get(hypothesis) ?? 0.001;  // ゼロ除算回避
    if (pProb > 0) {
      divergence += pProb * Math.log2(pProb / qProb);
    }
  });

  return divergence;
}

/**
 * @summary 分布のサマリーを取得
 * @param distribution 分布
 * @returns サマリー文字列
 */
export function summarizeDistribution(distribution: Distribution): string {
  const entries: string[] = [];
  const sorted = Array.from(distribution.probabilities.entries())
    .sort((a, b) => b[1] - a[1]);

  for (const [hypothesis, prob] of sorted) {
    entries.push(`${hypothesis}: ${(prob * 100).toFixed(1)}%`);
  }

  const entropy = calculateEntropy(distribution);
  const maxEntropy = getMaxEntropy(distribution.probabilities.size);
  const certaintyRatio = maxEntropy > 0 ? (1 - entropy / maxEntropy) : 1;

  return `分布(v${distribution.version}): [${entries.join(', ')}] 確実性: ${(certaintyRatio * 100).toFixed(0)}%`;
}
