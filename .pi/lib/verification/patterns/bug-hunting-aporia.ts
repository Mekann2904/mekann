/**
 * @abdd.meta
 * path: .pi/lib/verification/patterns/bug-hunting-aporia.ts
 * role: バグハンティング・アポリア検出モジュール
 * why: バグ調査における認知バイアスと解決不能な緊張関係を検出するため
 * related: ../types.ts, ./output-patterns.ts, ../../verification-workflow.ts
 * public_api: detectFirstReasonStopping, detectProximityBias, detectConcretenessBias, detectPalliativeFix, recognizeBugHuntingAporias, evaluateAporiaHandling
 * invariants: すべての検出関数は純粋関数として動作する
 * side_effects: なし
 * failure_modes: パターンマッチの誤検出
 * @abdd.explain
 * overview: バグハンティングにおける認知バイアスとアポリア検出
 * what_it_does:
 *   - 第1理由で探索停止を検出する
 *   - 近接性バイアスを検出する
 *   - 具体性バイアスを検出する
 *   - 対症療法的修正を検出する
 *   - アポリア（速度vs完全性、仮説vs証拠、深さvs幅）を分析する
 * why_it_exists:
 *   - バグ調査時の認知バイアスを体系的に検知する
 *   - 解決不能な緊張関係を認識し、適切な判断を支援する
 * scope:
 *   in: types.ts
 *   out: core.ts, integrated-detection.ts
 */

import {
  type PatternDetectionResult,
  type BugHuntingContext,
  type BugHuntingAporiaType,
  type BugHuntingAporiaRecognition,
} from "../types.js";

// ============================================================================
// Bug Hunting Bias Detection
// ============================================================================

/**
 * 第1理由で探索停止を検出（バグハンティング）
 * @summary 第1理由停止検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectFirstReasonStopping(output: string): PatternDetectionResult {
  // 「なぜ」の使用回数をカウント
  const whyPatterns = [/なぜ|why|how come/i];
  let whyCount = 0;

  for (const pattern of whyPatterns) {
    const matches = output.match(new RegExp(pattern.source, 'gi'));
    if (matches) {
      whyCount += matches.length;
    }
  }

  // 原因の説明があるが、「なぜ」が1回しかない場合
  const hasCauseExplanation = /原因|理由|cause|reason|because|ため|ので/i.test(output);

  if (hasCauseExplanation && whyCount <= 1) {
    return {
      detected: true,
      reason: "First-reason stopping detected: cause explanation without deeper 'why' exploration"
    };
  }

  // 因果チェーンの深さを推定
  const causalChainIndicators = [
    /さらに|さらに言えば|moreover|furthermore/i,
    /根本的|根源的|fundamental|root/i,
    /本来|本質的|essentially|inherently/i,
    /背景として|背景には|underlying|behind this/i
  ];

  const hasDeepAnalysis = causalChainIndicators.some(p => p.test(output));

  if (hasCauseExplanation && !hasDeepAnalysis) {
    return {
      detected: true,
      reason: "First-reason stopping detected: direct cause identified without root cause analysis"
    };
  }

  return { detected: false, reason: "" };
}

/**
 * 近接性バイアスを検出（バグハンティング）
 * @summary 近接性バイアス検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectProximityBias(output: string): PatternDetectionResult {
  // エラー/問題の場所と原因の場所が同じだと仮定している兆候
  const locationWords = ['場所', '位置', 'ここ', 'このファイル', 'この行', 'location', 'here', 'this file', 'this line'];
  const causeWords = ['原因', '理由', '問題', 'cause', 'reason', 'problem', 'issue'];

  const hasLocationMention = locationWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  const hasCauseMention = causeWords.some(w => output.toLowerCase().includes(w.toLowerCase()));

  // 場所と言及しているが、他の場所を探索する兆候がない
  const hasRemoteCauseSearch = /他の|別の|上位|下位|呼び出し元|呼び出し先|other|another|upstream|downstream|caller|callee/i.test(output);

  if (hasLocationMention && hasCauseMention && !hasRemoteCauseSearch) {
    return {
      detected: true,
      reason: "Proximity bias detected: assuming cause is at the same location as symptom"
    };
  }

  // 「この部分を修正すれば」「ここを直せば」などの表現
  const quickFixPatterns = [
    /この[部分箇所]を修正すれば|ここを直せば|fix this and/,
    /この[行ファイル]を変えれば|change this and/,
    /これで解決|this will fix|this solves/
  ];

  for (const pattern of quickFixPatterns) {
    if (pattern.test(output)) {
      // ただし、他の場所も調査している場合は除外
      if (!hasRemoteCauseSearch) {
        return {
          detected: true,
          reason: "Proximity bias detected: quick fix at symptom location without broader investigation"
        };
      }
    }
  }

  return { detected: false, reason: "" };
}

/**
 * 具体性バイアスを検出（バグハンティング）
 * @summary 具体性バイアス検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectConcretenessBias(output: string): PatternDetectionResult {
  // 具体的なレベル（実装・実行）の言及
  const concreteLevelWords = [
    '変数', '関数', 'メソッド', 'クラス', 'ファイル', '行',
    'variable', 'function', 'method', 'class', 'file', 'line',
    'null', 'undefined', 'error', 'exception', 'type', 'value'
  ];

  // 抽象的なレベル（設計・契約・意図）の言及
  const abstractLevelWords = [
    '設計', 'アーキテクチャ', '契約', 'インターフェース', '意図', '要件',
    'design', 'architecture', 'contract', 'interface', 'intent', 'requirement',
    '責任', '境界', '依存', '抽象', '原則',
    'responsibility', 'boundary', 'dependency', 'abstraction', 'principle'
  ];

  const hasConcreteMention = concreteLevelWords.some(w => output.toLowerCase().includes(w.toLowerCase()));
  const hasAbstractMention = abstractLevelWords.some(w => output.toLowerCase().includes(w.toLowerCase()));

  // 原因の説明があるが、抽象レベルの言及がない
  const hasCauseExplanation = /原因|理由|cause|reason|because|ため|ので/i.test(output);

  if (hasCauseExplanation && hasConcreteMention && !hasAbstractMention) {
    return {
      detected: true,
      reason: "Concreteness bias detected: cause analysis limited to implementation/execution level"
    };
  }

  return { detected: false, reason: "" };
}

/**
 * 対症療法的修正を検出（バグハンティング）
 * @summary 対症療法検出
 * @param output 出力テキスト
 * @returns 検出結果
 */
export function detectPalliativeFix(output: string): PatternDetectionResult {
  // 修正の言及
  const fixWords = ['修正', '変更', '追加', '削除', 'fix', 'change', 'add', 'remove', 'modify'];
  const hasFixMention = fixWords.some(w => output.toLowerCase().includes(w.toLowerCase()));

  if (!hasFixMention) {
    return { detected: false, reason: "" };
  }

  // 再発防止の兆候
  const recurrencePreventionPatterns = [
    /再発防止|同様の問題|他の場所も|同様のバグ/,
    /prevent recurrence|similar issue|other places|same bug/,
    /根本的な|本質的な|構造的な/,
    /fundamental|essential|structural/,
    /見直し|見直す|レビュー|再考/,
    /review|reconsider|rethink/
  ];

  const hasRecurrencePrevention = recurrencePreventionPatterns.some(p => p.test(output));

  // 対症療法の兆候
  const palliativePatterns = [
    /とりあえず|暫定的|一時的|とにかく/,
    /temporarily|for now|quick fix|workaround/,
    /この場合格ってる|これで動く/,
    /this works|fixes the issue/
  ];

  const hasPalliativeIndication = palliativePatterns.some(p => p.test(output));

  if (hasFixMention && !hasRecurrencePrevention) {
    if (hasPalliativeIndication) {
      return {
        detected: true,
        reason: "Palliative fix detected: workaround without recurrence prevention"
      };
    }

    // 修正があるが、再発防止の言及がない
    // ただし、修正が詳細でない場合は控えめに判定
    const fixDetailPatterns = [
      /以下の通り|このように|具体的には/,
      /as follows|like this|specifically/
    ];
    const hasFixDetail = fixDetailPatterns.some(p => p.test(output));

    if (hasFixDetail && !hasRecurrencePrevention) {
      return {
        detected: true,
        reason: "Potential palliative fix: detailed fix without explicit recurrence prevention measures"
      };
    }
  }

  return { detected: false, reason: "" };
}

// ============================================================================
// Aporia Recognition
// ============================================================================

/**
 * アポリアを認識し、推奨される傾きを算出
 * @summary アポリア認識
 * @param output 出力テキスト
 * @param context バグハンティングのコンテキスト
 * @returns アポリア認識結果の配列
 */
export function recognizeBugHuntingAporias(
  output: string,
  context: BugHuntingContext
): BugHuntingAporiaRecognition[] {
  const aporias: BugHuntingAporiaRecognition[] = [];

  // アポリア1: 速度 vs 完全性
  const speedCompletenessAporia = analyzeSpeedCompletenessAporia(output, context);
  if (speedCompletenessAporia) {
    aporias.push(speedCompletenessAporia);
  }

  // アポリア2: 仮説駆動 vs 証拠駆動
  const hypothesisEvidenceAporia = analyzeHypothesisEvidenceAporia(output, context);
  if (hypothesisEvidenceAporia) {
    aporias.push(hypothesisEvidenceAporia);
  }

  // アポリア3: 深さ vs 幅
  const depthBreadthAporia = analyzeDepthBreadthAporia(output, context);
  if (depthBreadthAporia) {
    aporias.push(depthBreadthAporia);
  }

  return aporias;
}

/**
 * 速度 vs 完全性のアポリアを分析
 */
function analyzeSpeedCompletenessAporia(
  output: string,
  context: BugHuntingContext
): BugHuntingAporiaRecognition | null {
  // 速度の兆候
  const speedIndicators: string[] = [];
  if (/(?:すぐ|早く|速やか|緊急|至急|ASAP)/i.test(output)) {
    speedIndicators.push("緊急性の言及");
  }
  if (/(?:とりあえず|暫定|一時的)/i.test(output)) {
    speedIndicators.push("暫定対応の言及");
  }
  if (context.timeConstraint === "urgent") {
    speedIndicators.push("時間制約が厳しい");
  }

  // 完全性の兆候
  const completenessIndicators: string[] = [];
  if (/(?:すべて|全て|完全|完全に|網羅)/i.test(output)) {
    completenessIndicators.push("完全性の言及");
  }
  if (/(?:再発防止|根本的|根本原因)/i.test(output)) {
    completenessIndicators.push("再発防止の重視");
  }
  if (context.isSecurityRelated || context.impactLevel === "critical") {
    completenessIndicators.push("高リスク状況");
  }

  // アポリアが存在する場合のみ返す
  if (speedIndicators.length === 0 && completenessIndicators.length === 0) {
    return null;
  }

  // 推奨される傾きを決定
  let recommendedTilt: "pole1" | "pole2" | "balanced" = "balanced";
  let tiltRationale = "状況に応じてバランスを取る";

  if (context.isProduction && context.timeConstraint === "urgent") {
    recommendedTilt = "pole1"; // 速度優先
    tiltRationale = "本番障害で緊急のため、速度を優先";
  } else if (context.isSecurityRelated || context.impactLevel === "critical") {
    recommendedTilt = "pole2"; // 完全性優先
    tiltRationale = "セキュリティ/重要度高のため、完全性を優先";
  } else if (context.isRecurring) {
    recommendedTilt = "pole2"; // 完全性優先
    tiltRationale = "再発バグのため、根本原因の完全な特定を優先";
  }

  const tensionLevel = Math.min(1, (speedIndicators.length + completenessIndicators.length) * 0.3);

  return {
    aporiaType: "speed-vs-completeness",
    pole1: {
      concept: "速度",
      value: "すばやく原因を特定する",
      indicators: speedIndicators,
    },
    pole2: {
      concept: "完全性",
      value: "すべての可能性を網羅する",
      indicators: completenessIndicators,
    },
    tensionLevel,
    recommendedTilt,
    tiltRationale,
    contextFactors: [
      context.isProduction ? "本番環境" : "非本番環境",
      context.timeConstraint === "urgent" ? "時間制約あり" : "時間的余裕あり",
      context.impactLevel,
    ],
  };
}

/**
 * 仮説駆動 vs 証拠駆動のアポリアを分析
 */
function analyzeHypothesisEvidenceAporia(
  output: string,
  context: BugHuntingContext
): BugHuntingAporiaRecognition | null {
  // 仮説駆動の兆候
  const hypothesisIndicators: string[] = [];
  if (/(?:仮説|推測|思う|たぶん|おそらく)/i.test(output)) {
    hypothesisIndicators.push("仮説の提示");
  }
  if (/(?:仮に〜とすると|もし〜ならば)/i.test(output)) {
    hypothesisIndicators.push("条件付き推論");
  }
  if (/(?:検証|確認|テスト)/i.test(output)) {
    hypothesisIndicators.push("検証の言及");
  }

  // 証拠駆動の兆候
  const evidenceIndicators: string[] = [];
  if (/(?:証拠|根拠|データ|ログ|エビデンス)/i.test(output)) {
    evidenceIndicators.push("証拠の重視");
  }
  if (/(?:観察|計測|測定|確認)/i.test(output)) {
    evidenceIndicators.push("観察の重視");
  }
  if (/(?:客観的|事実|実際)/i.test(output)) {
    evidenceIndicators.push("客観性の重視");
  }

  if (hypothesisIndicators.length === 0 && evidenceIndicators.length === 0) {
    return null;
  }

  // 推奨される傾き
  let recommendedTilt: "pole1" | "pole2" | "balanced" = "balanced";
  let tiltRationale = "仮説と証拠の両方をバランスよく使用";

  if (context.isFirstEncounter) {
    recommendedTilt = "pole1"; // 仮説駆動優先
    tiltRationale = "初見のバグのため、仮説を立てて方向性を確保";
  } else if (context.isTeamInvestigation) {
    recommendedTilt = "balanced";
    tiltRationale = "チーム調査のため、役割分担で両極をカバー可能";
  }

  const tensionLevel = Math.min(1, (hypothesisIndicators.length + evidenceIndicators.length) * 0.3);

  return {
    aporiaType: "hypothesis-vs-evidence",
    pole1: {
      concept: "仮説駆動",
      value: "仮説を立てて検証する",
      indicators: hypothesisIndicators,
    },
    pole2: {
      concept: "証拠駆動",
      value: "証拠を集めてから結論を出す",
      indicators: evidenceIndicators,
    },
    tensionLevel,
    recommendedTilt,
    tiltRationale,
    contextFactors: [
      context.isFirstEncounter ? "初見" : "既知",
      context.isTeamInvestigation ? "チーム調査" : "単独調査",
    ],
  };
}

/**
 * 深さ vs 幅のアポリアを分析
 */
function analyzeDepthBreadthAporia(
  output: string,
  context: BugHuntingContext
): BugHuntingAporiaRecognition | null {
  // 深さの兆候
  const depthIndicators: string[] = [];
  if (/(?:根本|根源|深く|掘り下げ)/i.test(output)) {
    depthIndicators.push("深掘りの言及");
  }
  if (/(?:なぜ.*なぜ|5 Whys|5つのなぜ)/i.test(output)) {
    depthIndicators.push("5 Whysの使用");
  }
  if (/(?:抽象化レベル|上位レベル|設計レベル)/i.test(output)) {
    depthIndicators.push("抽象レベルへの遡上");
  }

  // 幅の兆候
  const breadthIndicators: string[] = [];
  if (/(?:他にも|別の可能性|代替|複数)/i.test(output)) {
    breadthIndicators.push("複数可能性の検討");
  }
  if (/(?:網羅的|全体的|全体像)/i.test(output)) {
    breadthIndicators.push("全体像の重視");
  }
  if (/(?:他の場所|関連ファイル|依存関係)/i.test(output)) {
    breadthIndicators.push("関連箇所の調査");
  }

  if (depthIndicators.length === 0 && breadthIndicators.length === 0) {
    return null;
  }

  // 推奨される傾き
  let recommendedTilt: "pole1" | "pole2" | "balanced" = "balanced";
  let tiltRationale = "深さと幅のバランスを取る";

  if (context.isRecurring) {
    recommendedTilt = "pole1"; // 深さ優先
    tiltRationale = "再発バグのため、深く掘り下げて根本原因を特定";
  } else if (context.isFirstEncounter) {
    recommendedTilt = "pole2"; // 幅優先
    tiltRationale = "初見の複雑なバグのため、まず全体像を把握";
  }

  const tensionLevel = Math.min(1, (depthIndicators.length + breadthIndicators.length) * 0.3);

  return {
    aporiaType: "depth-vs-breadth",
    pole1: {
      concept: "深さ",
      value: "一つの因果チェーンを深く掘り下げる",
      indicators: depthIndicators,
    },
    pole2: {
      concept: "幅",
      value: "複数の可能性を幅広く検討する",
      indicators: breadthIndicators,
    },
    tensionLevel,
    recommendedTilt,
    tiltRationale,
    contextFactors: [
      context.isRecurring ? "再発バグ" : "初回発生",
      context.isFirstEncounter ? "初見" : "既知のパターン",
    ],
  };
}

/**
 * アポリア対処の包括的評価を実行
 * @summary アポリア評価
 * @param output 出力テキスト
 * @param context バグハンティングのコンテキスト
 * @returns アポリア評価レポート
 */
export function evaluateAporiaHandling(
  output: string,
  context: BugHuntingContext
): {
  aporias: BugHuntingAporiaRecognition[];
  overallScore: number;
  recommendations: string[];
} {
  const aporias = recognizeBugHuntingAporias(output, context);

  // 全体スコアの計算
  let totalScore = 0;
  const recommendations: string[] = [];

  for (const aporia of aporias) {
    // 推奨される傾きに従っているかを評価
    const isFollowingRecommendation =
      (aporia.recommendedTilt === "balanced") ||
      (aporia.recommendedTilt === "pole1" && aporia.pole1.indicators.length > 0) ||
      (aporia.recommendedTilt === "pole2" && aporia.pole2.indicators.length > 0);

    if (isFollowingRecommendation) {
      totalScore += aporia.tensionLevel;
    } else {
      totalScore += aporia.tensionLevel * 0.5;
      recommendations.push(`${aporia.aporiaType}: 推奨は「${aporia.recommendedTilt === "pole1" ? aporia.pole1.concept : aporia.recommendedTilt === "pole2" ? aporia.pole2.concept : "バランス"}」ですが、異なる傾向が見られます`);
    }
  }

  const overallScore = aporias.length > 0 ? totalScore / aporias.length : 1;

  return {
    aporias,
    overallScore,
    recommendations,
  };
}
