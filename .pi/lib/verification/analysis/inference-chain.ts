/**
 * @abdd.meta
 * path: .pi/lib/verification/analysis/inference-chain.ts
 * role: 推論チェーン解析機能
 * why: LLM出力における推論の論理的構造と妥当性を評価するため
 * related: ./metacognitive-check.ts, ../types.ts
 * public_api: parseInferenceChain, InferenceChain, InferenceStep
 * invariants: parseInferenceChainは常にInferenceChainオブジェクトを返す
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、空のチェーンを返す
 * @abdd.explain
 * overview: テキストから前提、推論ステップ、結論を抽出し、論理的妥当性を評価
 * what_it_does:
 *   - 前提文を抽出する
 *   - 推論ステップを特定し、タイプを分類する
 *   - 結論文を抽出する
 *   - 論理的飛躍を検出する
 *   - チェーン全体の妥当性を判定する
 * why_it_exists:
 *   - LLMの推論過程を透明化し、論理的欠陥を特定するため
 * scope:
 *   in: types.ts
 *   out: ./metacognitive-check.ts, ../generation/improvement-actions.ts
 */

// ============================================================================
// Types
// ============================================================================

/**
 * 推論チェーンを表すインターフェース
 * @summary 推論チェーン構造
 */
export interface InferenceChain {
  /** 前提文 */
  premises: string[];
  /** 推論ステップ */
  steps: InferenceStep[];
  /** 結論文 */
  conclusion: string;
  /** チェーン全体の妥当性 */
  validity: 'valid' | 'invalid' | 'uncertain';
  /** 検出された論理的飛躍 */
  gaps: string[];
}

/**
 * 個別の推論ステップ
 * @summary 推論ステップ
 */
export interface InferenceStep {
  /** ステップ番号 */
  stepNumber: number;
  /** 入力（前提または前のステップの出力） */
  input: string;
  /** 推論タイプ */
  inferenceType: 'deductive' | 'inductive' | 'abductive' | 'analogical' | 'unknown';
  /** 出力 */
  output: string;
  /** 妥当性 */
  isValid: boolean;
  /** 根拠 */
  justification?: string;
}

// ============================================================================
// Main Functions
// ============================================================================

/**
 * 推論チェーンを解析する
 * @summary テキストから推論構造を抽出
 * @param output 出力テキスト
 * @returns 解析された推論チェーン
 */
export function parseInferenceChain(output: string): InferenceChain {
  const premises: string[] = [];
  const steps: InferenceStep[] = [];
  const gaps: string[] = [];
  let conclusion = '';
  let validity: 'valid' | 'invalid' | 'uncertain' = 'uncertain';

  // 前提を抽出するパターン
  const premisePatterns = [
    /(?:前提|仮定|仮に|assuming|given|suppose|premise)[:：]\s*(.+?)(?:\n|$)/gi,
    /(?:もし|if)\s+(.+?)\s*(?:ならば|then)/gi,
    /(?:当然|obviously|clearly|it is evident that)\s+(.+?)(?:\n|,|。|\.)/gi
  ];

  for (const pattern of premisePatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        premises.push(match[1].trim());
      }
    }
  }

  // 結論を抽出するパターン
  const conclusionPatterns = [
    /(?:結論|結局|したがって|ゆえに|conclusion|therefore|thus|hence)[:：]?\s*(.+?)(?:\n\n|\n[A-Z]|$)/gi,
    /(?:結果として|as a result|consequently)[:：]?\s*(.+?)(?:\n\n|\n[A-Z]|$)/gi
  ];

  for (const pattern of conclusionPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      if (match[1] && match[1].trim().length > 5) {
        conclusion = match[1].trim();
        break;
      }
    }
    if (conclusion) break;
  }

  // 推論ステップを抽出
  const stepPatterns = [
    /(\d+)[.．、)]\s*(.+?)(?=\d+[.．、)]|$)/g,
    /(?:ステップ|step)\s*(\d+)[:：]?\s*(.+?)(?=ステップ|step|$)/gi
  ];

  let stepNumber = 1;
  for (const pattern of stepPatterns) {
    let match;
    while ((match = pattern.exec(output)) !== null) {
      const stepText = match[2]?.trim() ?? '';
      if (stepText.length > 10) {
        // 推論タイプを推定
        let inferenceType: InferenceStep['inferenceType'] = 'unknown';
        if (/(?:したがって|ゆえに|therefore|thus|hence)/i.test(stepText)) {
          inferenceType = 'deductive';
        } else if (/(?:おそらく|likely|probably|tends to)/i.test(stepText)) {
          inferenceType = 'inductive';
        } else if (/(?:恐らく|probably|might|could be because)/i.test(stepText)) {
          inferenceType = 'abductive';
        } else if (/(?:同様に|similarly|like|analogous)/i.test(stepText)) {
          inferenceType = 'analogical';
        }

        steps.push({
          stepNumber: stepNumber++,
          input: '',
          inferenceType,
          output: stepText,
          isValid: inferenceType === 'deductive' || inferenceType === 'unknown'
        });
      }
    }
  }

  // 論理的飛躍を検出
  if (premises.length > 0 && conclusion && steps.length === 0) {
    gaps.push('前提から結論への推論ステップが明示されていない');
    validity = 'uncertain';
  }

  if (steps.length > 1) {
    for (let i = 1; i < steps.length; i++) {
      if (!steps[i-1]?.output || steps[i]?.input === '') {
        gaps.push(`ステップ${i}から${i+1}の間の論理的つながりが不明確`);
      }
    }
  }

  // 妥当性判定
  const hasFallacies = detectFallaciesInChain(output);
  if (hasFallacies) {
    validity = 'invalid';
  } else if (gaps.length === 0 && premises.length > 0 && conclusion) {
    validity = 'valid';
  }

  return {
    premises,
    steps,
    conclusion,
    validity,
    gaps
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * 推論チェーン内の誤謬を検出
 * @summary 簡易的な誤謬検出
 * @param output 出力テキスト
 * @returns 誤謬が検出されたかどうか
 */
function detectFallaciesInChain(output: string): boolean {
  const fallacyPatterns = [
    /だから.*に違いない/,  // 後件肯定
    /なぜなら、.*だからだ/,  // 循環論法
    /どちらか.*いずれか/,  // 偽の二分法
    /そうすれば.*結局は.*だろう/  // 滑り坂
  ];

  return fallacyPatterns.some(pattern => pattern.test(output));
}

/**
 * アポリア回避の誘惑を検出
 * @summary アポリア回避パターンの検出
 * @param aporias 検出されたアポリアのリスト
 * @param output 出力内容
 * @returns 検出された回避パターン
 */
export function detectAporiaAvoidanceTemptation(
  aporias: Array<{ description: string; tensionLevel: number }>,
  output: string
): string[] {
  const temptations: string[] = [];

  aporias.forEach(aporia => {
    // ヘーゲル的弁証法（統合）への誘惑
    if (output.includes('統合') || output.includes('両立') || output.includes('バランス')) {
      temptations.push(`${aporia.description}に対する「統合」による解決への誘惑`);
    }

    // 過度な文脈依存
    if (output.includes('状況による') || output.includes('ケースバイケース')) {
      temptations.push(`${aporia.description}に対する文脈への過度な依存による原則放棄のリスク`);
    }

    // 早まった決断
    if (aporia.tensionLevel < 0.5 && (output.includes('決定') || output.includes('結論'))) {
      temptations.push(`${aporia.description}に対する十分な検討なしの決断の可能性`);
    }
  });

  return temptations;
}

/**
 * 推論ステップを連結して完全なチェーンを構築
 * @summary ステップ間の入出力を接続
 * @param chain 解析済みの推論チェーン
 * @returns 入出力が接続されたチェーン
 */
export function connectInferenceSteps(chain: InferenceChain): InferenceChain {
  const connectedSteps = chain.steps.map((step, index) => {
    if (index === 0) {
      return {
        ...step,
        input: chain.premises.join('; ') || step.input
      };
    }
    return {
      ...step,
      input: chain.steps[index - 1]?.output || step.input
    };
  });

  return {
    ...chain,
    steps: connectedSteps
  };
}

/**
 * 推論チェーンの品質スコアを計算
 * @summary チェーンの論理的品質を0-1で評価
 * @param chain 推論チェーン
 * @returns 品質スコア（0-1）
 */
export function calculateChainQualityScore(chain: InferenceChain): number {
  let score = 0.5; // ベーススコア

  // 前提の存在
  if (chain.premises.length > 0) {
    score += 0.1;
  }
  if (chain.premises.length > 1) {
    score += 0.05;
  }

  // 結論の存在
  if (chain.conclusion) {
    score += 0.1;
  }

  // ステップの存在と品質
  if (chain.steps.length > 0) {
    score += 0.1;
  }
  const validSteps = chain.steps.filter(s => s.isValid).length;
  if (chain.steps.length > 0 && validSteps === chain.steps.length) {
    score += 0.1;
  }

  // 飛躍の欠如
  if (chain.gaps.length === 0) {
    score += 0.1;
  } else {
    score -= chain.gaps.length * 0.1;
  }

  // 妥当性
  if (chain.validity === 'valid') {
    score += 0.15;
  } else if (chain.validity === 'invalid') {
    score -= 0.2;
  }

  return Math.max(0, Math.min(1, score));
}
