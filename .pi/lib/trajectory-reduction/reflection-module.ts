/**
 * @abdd.meta
 * path: .pi/lib/trajectory-reduction/reflection-module.ts
 * role: LLMベースの軌跡圧縮リフレクションモジュール
 * why: AgentDiet論文に基づき、安価なLLMで軌跡の無駄を検出・削除するため
 * related: .pi/lib/trajectory-reduction/types.ts, .pi/lib/trajectory-reduction/sliding-window.ts
 * public_api: ReflectionModule, createReflectionModule, REFLECTION_PROMPT_TEMPLATE
 * invariants: 出力は入力より短い
 * side_effects: LLM API呼び出し、ログ出力
 * failure_modes: APIエラー、タイムアウト、パースエラー
 * @abdd.explain
 * overview: GPT-4o-mini等の安価なLLMで軌跡の無駄を検出する機能
 * what_it_does:
 *   - 軌跡から無駄・重複・期限切れ情報を検出
 *   - 検出内容を"... (簡潔な説明)"形式に圧縮
 *   - 圧縮結果の妥当性を検証
 * why_it_exists:
 *   - エージェントLLM（高価）の負担を減らすため
 *   - 論文の「リフレクションモジュール」概念を実装するため
 * scope:
 *   in: 軌跡ステップ, 設定
 *   out: 圧縮結果
 */

import type {
  TrajectoryStep,
  TrajectoryReductionConfig,
  ReductionResult,
  WasteType,
  ReflectionPromptParams,
} from "./types.js";
import {
  serializeStepForReflection,
  countTokens,
} from "./serialization.js";

/**
 * リフレクションプロンプトテンプレート
 * LLMLingua-2のアプローチをベースに、エージェント軌跡向けに調整
 */
export const REFLECTION_PROMPT_TEMPLATE = `あなたはLLMエージェントの軌跡圧縮アシスタントです。
以下のエージェント実行履歴から、ステップ{targetStep}に含まれる「無駄な情報」を特定し、圧縮してください。

## 廃棄対象の3タイプ

1. **Useless（無駄）**: タスクに無関係な情報
   - 冗長なテスト出力（PASSEDが100行続く等）
   - 参照されないファイルの全内容
   - デバッグ用のprint文出力

2. **Redundant（重複）**: 既に出現した情報
   - 同じファイルの再読み込み
   - 同じエラーメッセージの繰り返し
   - 既に把握済みの情報

3. **Expired（期限切れ）**: 古くて不要になった情報
   - 編集前のファイル内容（編集後の内容があれば不要）
   - 古い探索結果（最終的に使われなかった）
   - 中間状態の情報（最終結果があれば不要）

## 圧縮ルール

- 無駄な情報は "... (簡潔な説明)" に置換
- 重要な情報は保持：
  - 失敗したテスト名
  - エラーメッセージの核心
  - 最終的なファイル内容
  - 重要な決定事項
- 元の構造を維持（ステップの役割は変えない）

## コンテキスト（ステップ{windowStart}〜{windowEnd}）

{contextSteps}

## 圧縮対象

ステップ{targetStep}:
{targetContent}

## 出力形式

以下の形式で出力してください：

\`\`\`
WASTE_TYPES: [検出された廃棄タイプ（useless/redundant/expired）をカンマ区切り]
CONTENT:
{圧縮後のステップ{targetStep}の内容}
\`\`\`

圧縮後の内容のみを出力してください。説明は不要です。`;

/**
 * リフレクションモジュール
 */
export class ReflectionModule {
  private readonly config: TrajectoryReductionConfig;
  private readonly callLLM: (prompt: string, model: string) => Promise<string>;

  constructor(
    config: TrajectoryReductionConfig,
    callLLM: (prompt: string, model: string) => Promise<string>
  ) {
    this.config = config;
    this.callLLM = callLLM;
  }

  /**
   * 軌跡ステップを圧縮
   * @summary LLMで無駄を検出して圧縮
   * @param params リフレクションパラメータ
   * @returns 圧縮結果
   */
  async reduce(params: ReflectionPromptParams): Promise<ReductionResult> {
    const startTime = Date.now();

    // プロンプトを構築
    const prompt = this.buildPrompt(params);

    // LLMを呼び出し
    const response = await this.callLLM(prompt, this.config.reflectionModel);

    // レスポンスをパース
    const parsed = this.parseResponse(response);

    // トークン数を計算
    const tokenCount = countTokens(parsed.content);
    const tokensSaved = countTokens(params.targetContent) - tokenCount;

    const processingTimeMs = Date.now() - startTime;

    return {
      content: parsed.content,
      tokenCount,
      tokensSaved,
      reductionRatio: tokenCount > 0 ? tokensSaved / (tokensSaved + tokenCount) : 0,
      wasteTypes: parsed.wasteTypes,
      processingTimeMs,
      reflectionModel: this.config.reflectionModel,
    };
  }

  /**
   * プロンプトを構築
   * @summary テンプレートに値を埋め込み
   * @param params パラメータ
   * @returns 構築されたプロンプト
   */
  private buildPrompt(params: ReflectionPromptParams): string {
    const contextSteps = params.contextSteps
      .map((s) => serializeStepForReflection(s))
      .join("\n\n");

    const windowStart = params.contextSteps[0]?.step ?? 1;
    const windowEnd = params.contextSteps[params.contextSteps.length - 1]?.step ?? 1;

    return REFLECTION_PROMPT_TEMPLATE
      .replace("{windowStart}", String(windowStart))
      .replace("{windowEnd}", String(windowEnd))
      .replace("{contextSteps}", contextSteps)
      .replace(/{targetStep}/g, String(params.targetStepNumber))
      .replace("{targetContent}", params.targetContent);
  }

  /**
   * LLMレスポンスをパース
   * @summary レスポンスから圧縮内容と廃棄タイプを抽出
   * @param response LLMレスポンス
   * @returns パース結果
   */
  private parseResponse(response: string): {
    content: string;
    wasteTypes: WasteType[];
  } {
    // デフォルト値
    let content = response;
    let wasteTypes: WasteType[] = [];

    // コードブロックを抽出
    const codeBlockMatch = response.match(/```\s*\n([\s\S]*?)\n```/);
    if (codeBlockMatch) {
      content = codeBlockMatch[1];
    }

    // WASTE_TYPESを抽出
    const wasteTypesMatch = content.match(/WASTE_TYPES:\s*\[([^\]]*)\]/);
    if (wasteTypesMatch) {
      const typesStr = wasteTypesMatch[1];
      wasteTypes = typesStr
        .split(",")
        .map((t) => t.trim().toLowerCase() as WasteType)
        .filter((t) => ["useless", "redundant", "expired"].includes(t));
    }

    // CONTENTセクションを抽出
    const contentMatch = content.match(/CONTENT:\s*\n([\s\S]*?)$/);
    if (contentMatch) {
      content = contentMatch[1].trim();
    }

    // 廃棄タイプが検出されなかった場合の推測
    if (wasteTypes.length === 0 && content.includes("...")) {
      if (content.includes("重複") || content.includes("同じ")) {
        wasteTypes.push("redundant");
      }
      if (content.includes("古い") || content.includes("期限切れ")) {
        wasteTypes.push("expired");
      }
      if (content.includes("不要") || content.includes("無駄")) {
        wasteTypes.push("useless");
      }
      // デフォルトはuseless
      if (wasteTypes.length === 0) {
        wasteTypes.push("useless");
      }
    }

    return { content, wasteTypes };
  }

  /**
   * 圧縮結果が有効か検証
   * @summary 圧縮結果の妥当性チェック
   * @param original 元のコンテンツ
   * @param result 圧縮結果
   * @returns 有効な場合はtrue
   */
  validateReduction(original: string, result: ReductionResult): boolean {
    // 圧縮後が空の場合は無効
    if (!result.content || result.content.trim().length === 0) {
      return false;
    }

    // 削減が閾値以下の場合は無効
    if (result.tokensSaved < this.config.threshold) {
      return false;
    }

    // 圧縮後が元より長い場合は無効
    if (result.tokenCount >= countTokens(original)) {
      return false;
    }

    return true;
  }
}

/**
 * モックLLM呼び出し（テスト用）
 * @summary テスト用のモック関数
 * @param prompt プロンプト
 * @param model モデル名
 * @returns モックレスポンス
 */
export async function mockCallLLM(prompt: string, model: string): Promise<string> {
  // 簡易的な圧縮をシミュレート
  const targetMatch = prompt.match(/ステップ(\d+):\n([\s\S]*?)(?=\n## 出力形式|$)/);

  if (!targetMatch) {
    return "WASTE_TYPES: []\nCONTENT: ... (compression failed)";
  }

  const content = targetMatch[2];

  // 長いテスト出力を圧縮
  if (content.includes("PASSED") && content.length > 500) {
    const failedTests = content.match(/FAILED.*$/gm);
    if (failedTests && failedTests.length > 0) {
      return `WASTE_TYPES: [useless]
CONTENT:
... テスト実行結果（${content.split("\n").length}行中、失敗: ${failedTests.length}件）

失敗したテスト:
${failedTests.join("\n")}`;
    }
    return `WASTE_TYPES: [useless]
CONTENT:
... テスト実行結果（すべてパス）`;
  }

  // 重複するファイル読み込みを圧縮
  if (content.includes("read") || content.includes("cat ")) {
    return `WASTE_TYPES: [redundant]
CONTENT:
... ファイル内容（既読）`;
  }

  // その他はそのまま
  return `WASTE_TYPES: []
CONTENT:
${content.slice(0, 200)}...`;
}

/**
 * リフレクションモジュールを作成
 * @summary ファクトリー関数
 * @param config 設定
 * @param callLLM LLM呼び出し関数
 * @returns モジュールインスタンス
 */
export function createReflectionModule(
  config: TrajectoryReductionConfig,
  callLLM: (prompt: string, model: string) => Promise<string>
): ReflectionModule {
  return new ReflectionModule(config, callLLM);
}
