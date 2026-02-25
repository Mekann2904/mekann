/**
 * @abdd.meta
 * path: .pi/extensions/self-improvement-dev-analyzer.ts
 * role: Philosophical perspective to development concept translator
 * why: Bridge abstract philosophy with concrete development practices
 * related: self-improvement-loop.ts, self-improvement/SKILL.md
 * public_api: DevPerspectiveTranslation, DEV_PERSPECTIVE_TRANSLATIONS, analyzeCodeFromPerspective
 * invariants: All 7 perspectives must have dev translation
 * side_effects: None (pure translation)
 * failure_modes: Invalid perspective name, missing translation
 * @abdd.explain
 * overview: Translates 7 philosophical perspectives into developer-friendly concepts for practical code analysis
 * what_it_does:
 *   - Maps philosophical terms (deconstruction, schizoanalysis, etc.) to development concepts
 *   - Provides code analysis prompts for each perspective
 *   - Generates developer-friendly output formats
 * why_it_exists: Enables developers to apply philosophical self-improvement concepts without deep philosophical knowledge
 * scope:
 *   in: PerspectiveName, code context (file path, snippet, change type)
 *   out: DevPerspectiveTranslation, analysis results with refactoring suggestions
 */

/**
 * 哲学的視座の名称（self-improvement-loop.tsと同期）
 * @summary Philosophical perspective name type
 */
export type PerspectiveName =
  | "deconstruction"
  | "schizoanalysis"
  | "eudaimonia"
  | "utopia_dystopia"
  | "thinking_philosophy"
  | "thinking_taxonomy"
  | "logic";

/**
 * 開発者向け視座翻訳定義
 * @summary Maps philosophical perspectives to dev concepts
 */
export interface DevPerspectiveTranslation {
  /** 哲学的視座名 */
  perspective: PerspectiveName;
  /** 開発者向け名称 */
  devName: string;
  /** 開発者向け説明 */
  devDescription: string;
  /** コード分析用プロンプト */
  codeAnalysisPrompts: string[];
  /** 出力フォーマット */
  outputFormat: string;
  /** 関連メトリクス（オプション） */
  metrics?: string[];
}

/**
 * 7つの哲学的視座の開発者向け翻訳定義
 *
 * 各視座をソフトウェア開発の文脈で理解しやすい概念に翻訳し、
 * コード分析のための具体的なプロンプトと出力フォーマットを提供する。
 *
 * @summary Developer-friendly translations for 7 philosophical perspectives
 */
export const DEV_PERSPECTIVE_TRANSLATIONS: Record<PerspectiveName, DevPerspectiveTranslation> = {
  deconstruction: {
    perspective: "deconstruction",
    devName: "コード批判的分析 (Code Critical Analysis)",
    devDescription: "前提の問い直し、依存関係の暴露、暗黙の了解を可視化",
    codeAnalysisPrompts: [
      "このコードは何を前提としているか？",
      "どの依存関係が隠れているか？",
      "「当然」と思っている設計判断は何か？",
      "このパターンは何を排除しているか？",
    ],
    outputFormat: `
## 前提の暴露
- [発見された前提]

## 隠れた依存関係
- [依存関係リスト]

## 設計判断の再評価
- [判断と代替案]

## リファクタリング提案
- [具体的な変更案]
`,
    metrics: ["coupling", "hidden_dependencies", "assumption_count"],
  },

  schizoanalysis: {
    perspective: "schizoanalysis",
    devName: "欲望-機能分析 (Desire-Function Analysis)",
    devDescription: "機能が生み出す副作用、隠れた要件、ステークホルダーの欲望を分析",
    codeAnalysisPrompts: [
      "この機能は誰の「欲望」を満たしているか？",
      "この機能は何を「生産」しているか（意図せぬ結果）？",
      "どのステークホルダーが排除されているか？",
      "隠れた副作用は何か？",
    ],
    outputFormat: `
## ステークホルダー分析
- [誰が受益者か]

## 生産される効果
- [意図された効果]
- [意図せぬ副作用]

## 排除された声
- [考慮されていない視点]

## テストケース推奨
- [追加すべきテスト]
`,
    metrics: ["side_effects", "stakeholder_coverage", "edge_case_coverage"],
  },

  eudaimonia: {
    perspective: "eudaimonia",
    devName: "開発者体験 (Developer Experience)",
    devDescription: "保守性、認知負荷、作業の喜びを評価",
    codeAnalysisPrompts: [
      "このコードは理解しやすいか？",
      "将来の開発者はこのコードで「苦しむ」か？",
      "どのような「技術的負債」が蓄積しているか？",
      "このコードは開発者の「成長」を妨げていないか？",
    ],
    outputFormat: `
## 認知負荷評価
- [理解難易度スコア]

## 保守性チェック
- [保守性の問題点]

## 技術的負債
- [負債の種類と程度]

## DX改善提案
- [具体的な改善案]
`,
    metrics: ["cognitive_complexity", "maintainability_index", "tech_debt_ratio"],
  },

  utopia_dystopia: {
    perspective: "utopia_dystopia",
    devName: "アーキテクチャ未来予測 (Architecture Future Forecast)",
    devDescription: "技術的負債の未来影響、スケーラビリティ、長期的リスクを評価",
    codeAnalysisPrompts: [
      "このコードは1年後どうなっているか？",
      "スケールした時にどこが壊れるか？",
      "どのような「ディストピア」を生み出す可能性があるか？",
      "将来の変更に対してどれだけ脆弱か？",
    ],
    outputFormat: `
## 未来シナリオ分析
- [楽観シナリオ]
- [悲観シナリオ]

## スケーラビリティリスク
- [ボトルネック候補]

## 技術的負債の将来コスト
- [推定コスト]

## 予防的リファクタリング
- [今やるべき変更]
`,
    metrics: ["future_change_cost", "scalability_risk", "debt_interest_rate"],
  },

  thinking_philosophy: {
    perspective: "thinking_philosophy",
    devName: "メタプログラミング認識 (Meta-Programming Awareness)",
    devDescription: "自分のコードへの客観視、自動生成コードの品質、自己参照の検出",
    codeAnalysisPrompts: [
      "このコードは「自分自身」をどう見ているか？",
      "メタプログラミングは適切か？",
      "コード生成コードの品質は？",
      "自己参照ループはないか？",
    ],
    outputFormat: `
## メタレベル分析
- [メタプログラミングの程度]

## 自己参照の検出
- [循環参照など]

## 生成コード品質
- [品質評価]

## メタ改善提案
- [改善案]
`,
    metrics: ["meta_complexity", "self_reference_count", "generated_code_quality"],
  },

  thinking_taxonomy: {
    perspective: "thinking_taxonomy",
    devName: "思考モード選択 (Thinking Mode Selection)",
    devDescription: "デバッグ/設計/レビューの思考切り替え、状況に応じたアプローチ選択",
    codeAnalysisPrompts: [
      "この問題にはどの思考モードが適切か？",
      "デバッグモード vs 設計モード？",
      "収束的思考 vs 発散的思考？",
      "システム1（直観）とシステム2（分析）のバランスは？",
    ],
    outputFormat: `
## 推奨思考モード
- [モードと理由]

## 思考の切り替えポイント
- [いつ切り替えるか]

## アプローチ選択
- [推奨アプローチ]

## バランス調整
- [思考の配分]
`,
    metrics: ["thinking_mode_accuracy", "approach_diversity"],
  },

  logic: {
    perspective: "logic",
    devName: "ロジック検証 (Logic Verified)",
    devDescription: "バグの論理的原因、エッジケース、不変条件の検証",
    codeAnalysisPrompts: [
      "このロジックは常に正しいか？",
      "どのような入力で壊れるか？",
      "不変条件は守られているか？",
      "論理的誤謬（off-by-one、境界条件）はないか？",
    ],
    outputFormat: `
## 不変条件検証
- [不変条件と検証結果]

## エッジケース
- [発見されたエッジケース]

## 論理的欠陥
- [欠陥と修正案]

## テストケース追加
- [必須テストケース]
`,
    metrics: ["invariant_violations", "edge_case_coverage", "logic_error_count"],
  },
};

/**
 * コードコンテキストの定義
 * @summary Code context for perspective analysis
 */
export interface CodeContext {
  /** ファイルパス */
  filePath: string;
  /** コードスニペット */
  codeSnippet: string;
  /** 変更タイプ */
  changeType: "add" | "modify" | "delete";
  /** 関連ファイル一覧 */
  relatedFiles: string[];
}

/**
 * コード分析結果
 * @summary Result of perspective-based code analysis
 */
export interface CodeAnalysisResult {
  /** 使用した視座 */
  perspective: PerspectiveName;
  /** 分析結果のテキスト */
  analysis: string;
  /** リファクタリング提案 */
  refactoringSuggestions: string[];
  /** テスト推奨 */
  testRecommendations: string[];
  /** ドキュメント更新推奨 */
  documentationUpdates: string[];
  /** 次のステップ */
  nextSteps: string[];
}

/**
 * コードを特定の視座から分析する
 *
 * 指定された哲学的視座を開発者向けの概念に翻訳し、
 * コードを分析して実践的な改善提案を生成する。
 *
 * @summary Analyzes code from a specific philosophical perspective
 * @param perspective - 使用する哲学的視座
 * @param codeContext - 分析対象のコードコンテキスト
 * @returns 分析結果と改善提案
 *
 * @example
 * ```typescript
 * const result = analyzeCodeFromPerspective("logic", {
 *   filePath: "src/utils.ts",
 *   codeSnippet: "function add(a: number, b: number) { return a + b; }",
 *   changeType: "add",
 *   relatedFiles: []
 * });
 * console.log(result.testRecommendations);
 * ```
 */
export function analyzeCodeFromPerspective(
  perspective: PerspectiveName,
  codeContext: CodeContext
): CodeAnalysisResult {
  const translation = DEV_PERSPECTIVE_TRANSLATIONS[perspective];

  if (!translation) {
    return {
      perspective,
      analysis: `Unknown perspective: ${perspective}`,
      refactoringSuggestions: [],
      testRecommendations: [],
      documentationUpdates: [],
      nextSteps: [],
    };
  }

  // 基本的な分析結果を生成
  const analysis = generateAnalysisText(translation, codeContext);
  const refactoringSuggestions = generateRefactoringHints(translation, codeContext);
  const testRecommendations = generateTestHints(translation, codeContext);
  const documentationUpdates = generateDocHints(translation, codeContext);
  const nextSteps = generateNextSteps(translation, codeContext);

  return {
    perspective,
    analysis,
    refactoringSuggestions,
    testRecommendations,
    documentationUpdates,
    nextSteps,
  };
}

/**
 * 分析テキストを生成する
 * @summary Generates analysis text based on perspective
 */
function generateAnalysisText(
  translation: DevPerspectiveTranslation,
  codeContext: CodeContext
): string {
  const lines: string[] = [
    `# ${translation.devName}`,
    "",
    `**ファイル**: ${codeContext.filePath}`,
    `**変更タイプ**: ${codeContext.changeType}`,
    "",
    "## 分析プロンプトへの回答",
    "",
  ];

  // 各プロンプトに対する分析セクションを生成
  for (const prompt of translation.codeAnalysisPrompts) {
    lines.push(`### ${prompt}`);
    lines.push("");
    lines.push(`[${translation.devName}の観点から分析が必要]`);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * リファクタリングヒントを生成する
 * @summary Generates refactoring hints
 */
function generateRefactoringHints(
  translation: DevPerspectiveTranslation,
  codeContext: CodeContext
): string[] {
  const hints: string[] = [];

  // 視座に応じたリファクタリングヒントを生成
  switch (translation.perspective) {
    case "deconstruction":
      hints.push(`${codeContext.filePath}: 前提条件を明示的なパラメータとして抽出することを検討`);
      hints.push(`隠れた依存関係をインターフェースとして抽象化`);
      break;
    case "eudaimonia":
      hints.push(`${codeContext.filePath}: 認知負荷を下げるためにメソッドを分割`);
      hints.push(`自己文書化変数名の使用を検討`);
      break;
    case "logic":
      hints.push(`${codeContext.filePath}: 境界条件の検証を追加`);
      hints.push(`不変条件のアサーションを追加`);
      break;
    case "utopia_dystopia":
      hints.push(`${codeContext.filePath}: 将来の拡張性を考慮したインターフェース設計`);
      hints.push(`技術的負債の文書化を追加`);
      break;
    default:
      hints.push(`${codeContext.filePath}: ${translation.devName}の観点から改善を検討`);
  }

  return hints;
}

/**
 * テストヒントを生成する
 * @summary Generates test hints
 */
function generateTestHints(
  translation: DevPerspectiveTranslation,
  codeContext: CodeContext
): string[] {
  const hints: string[] = [];

  switch (translation.perspective) {
    case "logic":
      hints.push(`エッジケース: 境界値、空入力、null/undefined`);
      hints.push(`不変条件テスト: プロパティベーステストの追加`);
      break;
    case "schizoanalysis":
      hints.push(`副作用テスト: 状態変更の検証`);
      hints.push(`ステークホルダー別の受入テスト`);
      break;
    case "utopia_dystopia":
      hints.push(`スケーラビリティテスト: 負荷テストの追加`);
      hints.push(`将来互換性テスト: バージョン間の互換性確認`);
      break;
    default:
      hints.push(`${translation.devName}の観点からのテストケースを追加`);
  }

  return hints;
}

/**
 * ドキュメントヒントを生成する
 * @summary Generates documentation hints
 */
function generateDocHints(
  translation: DevPerspectiveTranslation,
  codeContext: CodeContext
): string[] {
  const hints: string[] = [];

  switch (translation.perspective) {
    case "deconstruction":
      hints.push(`README.md: 前提条件と制約のセクションを追加`);
      hints.push(`コードコメント: 「当然」と思われる判断に理由を記載`);
      break;
    case "eudaimonia":
      hints.push(`CONTRIBUTING.md: 開発者体験のノートを追加`);
      hints.push(`JSDoc: 複雑なロジックに説明を追加`);
      break;
    case "utopia_dystopia":
      hints.push(`ARCHITECTURE.md: 将来の拡張計画を文書化`);
      hints.push(`CHANGELOG.md: 技術的負債の記録を追加`);
      break;
    default:
      hints.push(`${translation.devName}の観点からドキュメントを更新`);
  }

  return hints;
}

/**
 * 次のステップを生成する
 * @summary Generates next steps
 */
function generateNextSteps(
  translation: DevPerspectiveTranslation,
  codeContext: CodeContext
): string[] {
  const steps: string[] = [];

  steps.push(`1. ${translation.devName}のプロンプトに回答する`);
  steps.push(`2. ${codeContext.filePath}の該当箇所を特定する`);
  steps.push(`3. 提案された改善策を優先度順に実装する`);
  steps.push(`4. 変更後のスコアを再評価する`);

  return steps;
}
