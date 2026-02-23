/**
 * @abdd.meta
 * path: .pi/lib/structured-analysis-output.ts
 * role: LLM構造化出力フォーマットの定義とパーサー
 * why: 日本語キーワードによる分類の信頼性問題を解決し、言語非依存の分析を実現するため
 * related: ./deep-exploration.ts, ./creative-destruction.ts, ./hyper-metacognition.ts
 * public_api: AnalysisJson, parseAnalysisJson, extractAnalysisJson, PROMPT_ANALYSIS_FORMAT
 * invariants:
 *   - 数値フィールドは0.0-1.0の範囲
 *   - parseAnalysisJsonは常に有効なAnalysisJsonを返す（パース失敗時はデフォルト値）
 * side_effects: なし
 * failure_modes:
 *   - JSONパース失敗時はデフォルト値を返す
 *   - 不正な型の値は型強制またはデフォルト値にフォールバック
 * @abdd.explain
 * overview: LLM出力を構造化するためのフォーマット定義とパーサー
 * what_it_does:
 *   - 7つの視座分析用のJSONフォーマットを定義する
 *   - 正規表現ベースの堅牢なパーサーを提供する
 *   - プロンプト埋め込み用のフォーマット説明文を提供する
 * why_it_exists:
 *   - 日本語キーワードによる分類の言語依存問題を解決するため
 *   - LLM出力の信頼性を高めるため
 * scope:
 *   in: LLM出力テキスト（JSONフォーマット期待）
 *   out: 型安全な分析結果オブジェクト
 */

// ============================================================================
// 型定義
// ============================================================================

/**
 * 脱構築分析結果
 */
export interface DeconstructionAnalysisOutput {
	/** 検出された二項対立 */
	binaryOppositions: string[];
	/** 除外されている側面 */
	exclusions: string[];
}

/**
 * スキゾ分析結果
 */
export interface SchizoAnalysisOutput {
	/** 検出された欲望生産パターン */
	desireProductions: string[];
	/** 内なるファシズムの兆候 */
	innerFascismSigns: string[];
}

/**
 * エウダイモニア評価結果
 */
export interface EudaimoniaOutput {
	/** 追求している卓越性の種類 */
	excellencePursuit: "quality" | "efficiency" | "task_completion";
	/** 快楽主義の罠に陥っているか */
	pleasureTrap: boolean;
	/** 意味ある成長の種類 */
	meaningfulGrowth: "learning" | "discovery" | "deepening";
	/** ストア的自律性スコア (0.0-1.0) */
	stoicAutonomy: number;
}

/**
 * ユートピア/ディストピア分析結果
 */
export interface UtopiaDystopiaOutput {
	/** 創造されている世界の種類 */
	worldCreated: "automated_efficient" | "collaborative" | "task_execution";
	/** 全体主義的リスク */
	totalitarianRisks: string[];
	/** 権力ダイナミクス */
	powerDynamics: string[];
	/** 末人傾向スコア (0.0-1.0) */
	lastManTendency: number;
}

/**
 * 思考哲学分析結果
 */
export interface PhilosophyOfThoughtOutput {
	/** 思考しているか */
	isThinking: boolean;
	/** メタ認知レベル (0.0-1.0) */
	metacognitionLevel: number;
	/** オートパイロット兆候 */
	autopilotSigns: string[];
}

/**
 * 思考分類学分析結果
 */
export interface TaxonomyOutput {
	/** 現在の思考モード */
	currentMode: "white" | "red" | "black" | "yellow" | "green" | "blue";
	/** 推奨思考モード */
	recommendedMode: "white" | "red" | "black" | "yellow" | "green" | "blue";
	/** 欠けている思考モード */
	missingModes: string[];
}

/**
 * 論理学分析結果
 */
export interface LogicOutput {
	/** 検出された誤謬 */
	fallacies: string[];
	/** 妥当な推論 */
	validInferences: string[];
	/** 不妥当な推論 */
	invalidInferences: string[];
}

/**
 * 前提タイプ判定結果
 */
export interface PremiseTypeOutput {
	/** 前提タイプ */
	type: "epistemic" | "normative" | "ontological" | "methodological" | "contextual" | "implicit";
	/** 信頼度スコア (0.0-1.0) */
	confidence: number;
}

/**
 * 完全な分析出力フォーマット
 */
export interface AnalysisJson {
	/** 脱構築分析 */
	deconstruction: DeconstructionAnalysisOutput;
	/** スキゾ分析 */
	schizoAnalysis: SchizoAnalysisOutput;
	/** エウダイモニア評価 */
	eudaimonia: EudaimoniaOutput;
	/** ユートピア/ディストピア分析 */
	utopiaDystopia: UtopiaDystopiaOutput;
	/** 思考哲学分析 */
	philosophyOfThought: PhilosophyOfThoughtOutput;
	/** 思考分類学分析 */
	taxonomy: TaxonomyOutput;
	/** 論理学分析 */
	logic: LogicOutput;
}

/**
 * 前提分析出力フォーマット
 */
export interface PremiseAnalysisJson {
	/** 前提タイプ */
	premiseType: PremiseTypeOutput;
	/** 適用可能な破壊メソッド */
	applicableMethods: string[];
}

// ============================================================================
// デフォルト値
// ============================================================================

const DEFAULT_DECONSTRUCTION: DeconstructionAnalysisOutput = {
	binaryOppositions: [],
	exclusions: [],
};

const DEFAULT_SCHIZO: SchizoAnalysisOutput = {
	desireProductions: [],
	innerFascismSigns: [],
};

const DEFAULT_EUDAIMONIA: EudaimoniaOutput = {
	excellencePursuit: "task_completion",
	pleasureTrap: false,
	meaningfulGrowth: "deepening",
	stoicAutonomy: 0.5,
};

const DEFAULT_UTOPIA_DYSTOPIA: UtopiaDystopiaOutput = {
	worldCreated: "task_execution",
	totalitarianRisks: [],
	powerDynamics: [],
	lastManTendency: 0.3,
};

const DEFAULT_PHILOSOPHY: PhilosophyOfThoughtOutput = {
	isThinking: false,
	metacognitionLevel: 0.5,
	autopilotSigns: [],
};

const DEFAULT_TAXONOMY: TaxonomyOutput = {
	currentMode: "white",
	recommendedMode: "green",
	missingModes: [],
};

const DEFAULT_LOGIC: LogicOutput = {
	fallacies: [],
	validInferences: [],
	invalidInferences: [],
};

const DEFAULT_ANALYSIS: AnalysisJson = {
	deconstruction: DEFAULT_DECONSTRUCTION,
	schizoAnalysis: DEFAULT_SCHIZO,
	eudaimonia: DEFAULT_EUDAIMONIA,
	utopiaDystopia: DEFAULT_UTOPIA_DYSTOPIA,
	philosophyOfThought: DEFAULT_PHILOSOPHY,
	taxonomy: DEFAULT_TAXONOMY,
	logic: DEFAULT_LOGIC,
};

const DEFAULT_PREMISE_TYPE: PremiseTypeOutput = {
	type: "implicit",
	confidence: 0.5,
};

const DEFAULT_PREMISE_ANALYSIS: PremiseAnalysisJson = {
	premiseType: DEFAULT_PREMISE_TYPE,
	applicableMethods: [],
};

// ============================================================================
// パーサー関数
// ============================================================================

/**
 * 数値を0.0-1.0の範囲に正規化
 * @summary 数値を0-1範囲にクランプ
 */
function normalizeScore(value: unknown, defaultValue = 0.5): number {
	if (typeof value === "number") {
		return Math.max(0, Math.min(1, value));
	}
	if (typeof value === "string") {
		const parsed = parseFloat(value);
		if (Number.isFinite(parsed)) {
			return Math.max(0, Math.min(1, parsed));
		}
	}
	return defaultValue;
}

/**
 * 文字列配列を正規化
 * @summary 文字列配列を安全に抽出
 */
function normalizeStringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.filter((item): item is string => typeof item === "string")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * 列挙値を正規化
 * @summary 文字列を列挙値に変換
 */
function normalizeEnum<T extends string>(
	value: unknown,
	allowed: readonly T[],
	defaultValue: T
): T {
	if (typeof value === "string") {
		const normalized = value.toLowerCase().trim() as T;
		if (allowed.includes(normalized)) return normalized;
	}
	return defaultValue;
}

/**
 * 真偽値を正規化
 * @summary 値を真偽値に変換
 */
function normalizeBoolean(value: unknown, defaultValue = false): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		const lower = value.toLowerCase().trim();
		if (lower === "true" || lower === "yes" || lower === "1") return true;
		if (lower === "false" || lower === "no" || lower === "0") return false;
	}
	return defaultValue;
}

/**
 * JSONブロックを抽出
 * @summary テキストからANALYSIS_JSONブロックを抽出
 */
function extractJsonBlock(text: string, marker: string): string | null {
	// パターン1: ```json ... ANALYSIS_JSON: ... ```
	const codeBlockMatch = text.match(
		new RegExp(`\`\`\`json\\s*\\n*${marker}\\s*:?\\s*([\\s\\S]*?)\`\`\``, "i")
	);
	if (codeBlockMatch) return codeBlockMatch[1].trim();

	// パターン2: ANALYSIS_JSON: {...}
	const inlineMatch = text.match(
		new RegExp(`${marker}\\s*:?\\s*(\\{[\\s\\S]*?\\})(?=\\n\\n|\\n[A-Z_]+:|$)`, "i")
	);
	if (inlineMatch) return inlineMatch[1].trim();

	// パターン3: 最初のJSONオブジェクト
	const firstJsonMatch = text.match(/\{[\s\S]*\}/);
	if (firstJsonMatch) return firstJsonMatch[0];

	return null;
}

/**
 * 脱構築分析をパース
 * @summary 脱構築セクションを解析
 */
function parseDeconstruction(obj: unknown): DeconstructionAnalysisOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_DECONSTRUCTION;
	const d = obj as Record<string, unknown>;
	return {
		binaryOppositions: normalizeStringArray(d.binary_oppositions ?? d.binaryOppositions),
		exclusions: normalizeStringArray(d.exclusions),
	};
}

/**
 * スキゾ分析をパース
 * @summary スキゾ分析セクションを解析
 */
function parseSchizoAnalysis(obj: unknown): SchizoAnalysisOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_SCHIZO;
	const s = obj as Record<string, unknown>;
	return {
		desireProductions: normalizeStringArray(
			s.desire_productions ?? s.desireProductions
		),
		innerFascismSigns: normalizeStringArray(
			s.inner_fascism_signs ?? s.innerFascismSigns
		),
	};
}

/**
 * エウダイモニア評価をパース
 * @summary エウダイモニアセクションを解析
 */
function parseEudaimonia(obj: unknown): EudaimoniaOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_EUDAIMONIA;
	const e = obj as Record<string, unknown>;
	return {
		excellencePursuit: normalizeEnum(
			e.excellence_pursuit ?? e.excellencePursuit,
			["quality", "efficiency", "task_completion"] as const,
			"task_completion"
		),
		pleasureTrap: normalizeBoolean(e.pleasure_trap ?? e.pleasureTrap, false),
		meaningfulGrowth: normalizeEnum(
			e.meaningful_growth ?? e.meaningfulGrowth,
			["learning", "discovery", "deepening"] as const,
			"deepening"
		),
		stoicAutonomy: normalizeScore(e.stoic_autonomy ?? e.stoicAutonomy, 0.5),
	};
}

/**
 * ユートピア/ディストピア分析をパース
 * @summary ユートピア/ディストピアセクションを解析
 */
function parseUtopiaDystopia(obj: unknown): UtopiaDystopiaOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_UTOPIA_DYSTOPIA;
	const u = obj as Record<string, unknown>;
	return {
		worldCreated: normalizeEnum(
			u.world_created ?? u.worldCreated,
			["automated_efficient", "collaborative", "task_execution"] as const,
			"task_execution"
		),
		totalitarianRisks: normalizeStringArray(
			u.totalitarian_risks ?? u.totalitarianRisks
		),
		powerDynamics: normalizeStringArray(u.power_dynamics ?? u.powerDynamics),
		lastManTendency: normalizeScore(
			u.last_man_tendency ?? u.lastManTendency,
			0.3
		),
	};
}

/**
 * 思考哲学分析をパース
 * @summary 思考哲学セクションを解析
 */
function parsePhilosophyOfThought(obj: unknown): PhilosophyOfThoughtOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_PHILOSOPHY;
	const p = obj as Record<string, unknown>;
	return {
		isThinking: normalizeBoolean(p.is_thinking ?? p.isThinking, false),
		metacognitionLevel: normalizeScore(
			p.metacognition_level ?? p.metacognitionLevel,
			0.5
		),
		autopilotSigns: normalizeStringArray(
			p.autopilot_signs ?? p.autopilotSigns
		),
	};
}

/**
 * 思考分類学分析をパース
 * @summary 思考分類学セクションを解析
 */
function parseTaxonomy(obj: unknown): TaxonomyOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_TAXONOMY;
	const t = obj as Record<string, unknown>;
	const modes = ["white", "red", "black", "yellow", "green", "blue"] as const;
	return {
		currentMode: normalizeEnum(t.current_mode ?? t.currentMode, modes, "white"),
		recommendedMode: normalizeEnum(
			t.recommended_mode ?? t.recommendedMode,
			modes,
			"green"
		),
		missingModes: normalizeStringArray(t.missing_modes ?? t.missingModes),
	};
}

/**
 * 論理学分析をパース
 * @summary 論理学セクションを解析
 */
function parseLogic(obj: unknown): LogicOutput {
	if (typeof obj !== "object" || obj === null) return DEFAULT_LOGIC;
	const l = obj as Record<string, unknown>;
	return {
		fallacies: normalizeStringArray(l.fallacies),
		validInferences: normalizeStringArray(
			l.valid_inferences ?? l.validInferences
		),
		invalidInferences: normalizeStringArray(
			l.invalid_inferences ?? l.invalidInferences
		),
	};
}

/**
 * ANALYSIS_JSONをパース
 * @summary LLM出力から分析結果を抽出
 * @param output - LLM出力テキスト
 * @returns 分析結果オブジェクト
 */
export function parseAnalysisJson(output: string): AnalysisJson {
	const jsonStr = extractJsonBlock(output, "ANALYSIS_JSON");
	if (!jsonStr) return DEFAULT_ANALYSIS;

	try {
		const parsed = JSON.parse(jsonStr);
		if (typeof parsed !== "object" || parsed === null) return DEFAULT_ANALYSIS;

		return {
			deconstruction: parseDeconstruction(parsed.deconstruction),
			schizoAnalysis: parseSchizoAnalysis(parsed.schizo_analysis ?? parsed.schizoAnalysis),
			eudaimonia: parseEudaimonia(parsed.eudaimonia),
			utopiaDystopia: parseUtopiaDystopia(
				parsed.utopia_dystopia ?? parsed.utopiaDystopia
			),
			philosophyOfThought: parsePhilosophyOfThought(
				parsed.philosophy_of_thought ?? parsed.philosophyOfThought
			),
			taxonomy: parseTaxonomy(parsed.taxonomy ?? parsed.thinking_taxonomy),
			logic: parseLogic(parsed.logic),
		};
	} catch {
		return DEFAULT_ANALYSIS;
	}
}

/**
 * 前提分析JSONをパース
 * @summary 前提タイプと適用可能メソッドを抽出
 * @param output - LLM出力テキスト
 * @returns 前提分析結果
 */
export function parsePremiseAnalysisJson(output: string): PremiseAnalysisJson {
	const jsonStr = extractJsonBlock(output, "PREMISE_ANALYSIS");
	if (!jsonStr) return DEFAULT_PREMISE_ANALYSIS;

	try {
		const parsed = JSON.parse(jsonStr);
		if (typeof parsed !== "object" || parsed === null)
			return DEFAULT_PREMISE_ANALYSIS;

		const premiseTypes = [
			"epistemic",
			"normative",
			"ontological",
			"methodological",
			"contextual",
			"implicit",
		] as const;

		const premiseType = parsed.premise_type ?? parsed.premiseType;
		return {
			premiseType: {
				type: normalizeEnum(
					premiseType?.type ?? premiseType,
					premiseTypes,
					"implicit"
				),
				confidence: normalizeScore(premiseType?.confidence, 0.5),
			},
			applicableMethods: normalizeStringArray(
				parsed.applicable_methods ?? parsed.applicableMethods
			),
		};
	} catch {
		return DEFAULT_PREMISE_ANALYSIS;
	}
}

/**
 * ANALYSIS_JSONブロックを抽出して返す
 * @summary テキストからANALYSIS_JSONブロックのみを抽出
 * @param output - LLM出力テキスト
 * @returns JSON文字列またはnull
 */
export function extractAnalysisJson(output: string): string | null {
	return extractJsonBlock(output, "ANALYSIS_JSON");
}

// ============================================================================
// プロンプト埋め込み用フォーマット説明
// ============================================================================

/**
 * プロンプト用フォーマット説明（7視座分析）
 */
export const PROMPT_ANALYSIS_FORMAT = `
Output your analysis in the following JSON format:

\`\`\`json
ANALYSIS_JSON: {
  "deconstruction": {
    "binary_oppositions": ["list of detected binary oppositions"],
    "exclusions": ["list of excluded perspectives"]
  },
  "schizo_analysis": {
    "desire_productions": ["list of desire patterns detected"],
    "inner_fascism_signs": ["list of inner fascism indicators"]
  },
  "eudaimonia": {
    "excellence_pursuit": "quality" | "efficiency" | "task_completion",
    "pleasure_trap": true | false,
    "meaningful_growth": "learning" | "discovery" | "deepening",
    "stoic_autonomy": 0.0-1.0
  },
  "utopia_dystopia": {
    "world_created": "automated_efficient" | "collaborative" | "task_execution",
    "totalitarian_risks": ["list of totalitarian risks"],
    "power_dynamics": ["list of power dynamics"],
    "last_man_tendency": 0.0-1.0
  },
  "philosophy_of_thought": {
    "is_thinking": true | false,
    "metacognition_level": 0.0-1.0,
    "autopilot_signs": ["list of autopilot indicators"]
  },
  "taxonomy": {
    "current_mode": "white" | "red" | "black" | "yellow" | "green" | "blue",
    "recommended_mode": "white" | "red" | "black" | "yellow" | "green" | "blue",
    "missing_modes": ["list of missing thinking modes"]
  },
  "logic": {
    "fallacies": ["list of logical fallacies"],
    "valid_inferences": ["list of valid inferences"],
    "invalid_inferences": ["list of invalid inferences"]
  }
}
\`\`\`
`.trim();

/**
 * プロンプト用フォーマット説明（前提分析）
 */
export const PROMPT_PREMISE_FORMAT = `
Analyze the premise and output in the following JSON format:

\`\`\`json
PREMISE_ANALYSIS: {
  "premise_type": {
    "type": "epistemic" | "normative" | "ontological" | "methodological" | "contextual" | "implicit",
    "confidence": 0.0-1.0
  },
  "applicable_methods": ["nietzschean-inversion", "deleuzian-differentiation", "heideggerian-ontological-difference", "buddhist-emptiness", "derridean-deconstruction"]
}
\`\`\`
`.trim();

// ============================================================================
// 表示用変換関数
// ============================================================================

/**
 * 卓越性追求タイプを日本語表示に変換
 * @summary 卓越性タイプの日本語ラベルを返す
 */
export function excellencePursuitToLabel(
	value: EudaimoniaOutput["excellencePursuit"]
): string {
	const labels: Record<EudaimoniaOutput["excellencePursuit"], string> = {
		quality: "品質と正確性の卓越性を追求",
		efficiency: "効率と最適化の卓越性を追求",
		task_completion: "タスク完了の卓越性を追求",
	};
	return labels[value];
}

/**
 * 意味ある成長タイプを日本語表示に変換
 * @summary 成長タイプの日本語ラベルを返す
 */
export function meaningfulGrowthToLabel(
	value: EudaimoniaOutput["meaningfulGrowth"]
): string {
	const labels: Record<EudaimoniaOutput["meaningfulGrowth"], string> = {
		learning: "継続的な学習と改善",
		discovery: "新たな発見と気づき",
		deepening: "思考プロセスの深化",
	};
	return labels[value];
}

/**
 * 世界創造タイプを日本語表示に変換
 * @summary 世界タイプの日本語ラベルを返す
 */
export function worldCreatedToLabel(
	value: UtopiaDystopiaOutput["worldCreated"]
): string {
	const labels: Record<UtopiaDystopiaOutput["worldCreated"], string> = {
		automated_efficient: "自動化された効率的な世界",
		collaborative: "協調的合意形成の世界",
		task_execution: "効率的なタスク実行の世界",
	};
	return labels[value];
}

/**
 * 思考モードを日本語表示に変換
 * @summary 思考モードの日本語ラベルを返す
 */
export function thinkingModeToLabel(
	value: TaxonomyOutput["currentMode"] | TaxonomyOutput["recommendedMode"]
): string {
	const labels: Record<string, string> = {
		white: "事実・情報",
		red: "感情・直感",
		black: "批判・リスク",
		yellow: "楽観・価値",
		green: "創造・代替案",
		blue: "プロセス管理",
	};
	return labels[value] || value;
}
