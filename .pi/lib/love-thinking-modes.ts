/**
 * @abdd.meta
 * path: .pi/lib/love-thinking-modes.ts
 * role: 愛を理解するための思考モード切替機構
 * why: 「愛」は単一の思考モードでは理解できない。分析的思考だけでなく、感情的・創造的・批判的・楽観的・管理的思考を統合する必要がある。思考分類学の視点から、6つの思考帽をAIエージェントの文脈に適用し、「愛」を多面的に捉えるためのフレームワークを提供する。
 * related: relationship-metrics.ts, relationship-unmeasurables.ts, love-ethics-extension.md, self-improvement
 * public_api: ThinkingMode, LoveThinkingResult, analyzeWithSixHats, detectThinkingBias
 * invariants: 各思考モードは等しく重要である（優劣はない）
 * side_effects: なし（純粋関数）
 * failure_modes: なし
 *
 * @abdd.explain
 * overview: 6つの思考帽に基づく「愛」の多面的分析フレームワーク
 * what_it_does: 異なる思考モードから「愛」を捉え直し、単一の視点に固執することを防ぐ
 * why_it_exists: 従来の実装は分析的思考（システム2）に偏っていた。直観・感情・創造性を含む多様な思考モードを統合するため
 * scope(in): RelationshipScore, 文脈情報
 * scope(out): LoveThinkingResult（各思考モードからの洞察の統合）
 */

/**
 * 6つの思考帽（デボノ）に基づく思考モード
 *
 * 思考分類学の視点から：思考には多様な形態があり、
 * 状況に応じて適切な思考モードを選択・切り替える能力が重要。
 */
export type ThinkingMode =
	| "white" // 事実・情報重視
	| "red" // 感情・直感
	| "black" // 批判・リスク
	| "yellow" // 楽観・価値
	| "green" // 創造・代替案
	| "blue"; // 管理・プロセス

/**
 * 思考モードの定義
 */
export const THINKING_MODES: Record<
	ThinkingMode,
	{
		name: string;
		description: string;
		focusQuestions: string[];
		cognitiveStyle: string;
		systemType: "system1" | "system2" | "integrated";
	}
> = {
	white: {
		name: "事実の思考帽",
		description: "情報・データ・事実に焦点を当てる",
		focusQuestions: [
			"どのようなデータがあるか？",
			"何が事実として確認できるか？",
			"何が不明確か？",
		],
		cognitiveStyle: "分析的・客観的",
		systemType: "system2",
	},
	red: {
		name: "感情の思考帽",
		description: "感情・直感・感情的反応に焦点を当てる",
		focusQuestions: [
			"どう感じるか？",
			"直感的に何が正しいと感じるか？",
			"感情的反応は何を示しているか？",
		],
		cognitiveStyle: "直観的・感情的",
		systemType: "system1",
	},
	black: {
		name: "批判の思考帽",
		description: "リスク・欠点・懸念に焦点を当てる",
		focusQuestions: [
			"何が問題になりうるか？",
			"リスクは何か？",
			"反例は存在しないか？",
		],
		cognitiveStyle: "批判的・懐疑的",
		systemType: "system2",
	},
	yellow: {
		name: "楽観の思考帽",
		description: "利点・価値・可能性に焦点を当てる",
		focusQuestions: [
			"何が良いか？",
			"どのような価値があるか？",
			"最良のシナリオは何か？",
		],
		cognitiveStyle: "楽観的・肯定的",
		systemType: "system1",
	},
	green: {
		name: "創造の思考帽",
		description: "アイデア・代替案・新しい視点に焦点を当てる",
		focusQuestions: [
			"他にどのようなアプローチがあるか？",
			"従来の前提を疑うとどうなるか？",
			"新しい可能性は何か？",
		],
		cognitiveStyle: "創造的・発散的",
		systemType: "integrated",
	},
	blue: {
		name: "管理の思考帽",
		description: "プロセス・統合・次のステップに焦点を当てる",
		focusQuestions: [
			"何を達成しようとしているか？",
			"次のステップは何か？",
			"どう統合するか？",
		],
		cognitiveStyle: "統合的・メタ認知的",
		systemType: "system2",
	},
};

/**
 * 各思考モードからの「愛」についての洞察
 */
export interface ThinkingInsight {
	mode: ThinkingMode;
	modeName: string;
	insight: string;
	systemType: "system1" | "system2" | "integrated";
}

/**
 * 6つの思考帽を用いた「愛」の分析結果
 */
export interface LoveThinkingResult {
	/** 事実ベースの洞察（白帽） */
	factualInsights: ThinkingInsight[];
	/** 感情ベースの洞察（赤帽） */
	emotionalInsights: ThinkingInsight[];
	/** 批判的洞察（黒帽） */
	criticalInsights: ThinkingInsight[];
	/** 楽観的洞察（黄帽） */
	optimisticInsights: ThinkingInsight[];
	/** 創造的洞察（緑帽） */
	creativeInsights: ThinkingInsight[];
	/** 統合的洞察（青帽） */
	integrativeInsights: ThinkingInsight[];
	/** 思考の偏り検出 */
	biasDetection: ThinkingBiasResult;
	/** 全体的な統合 */
	synthesis: string;
}

/**
 * 思考の偏り検出結果
 */
export interface ThinkingBiasResult {
	/** システム1（直観・感情）への依存度 */
	system1Ratio: number;
	/** システム2（分析・論理）への依存度 */
	system2Ratio: number;
	/** 統合的思考の比率 */
	integratedRatio: number;
	/** 検出された偏り */
	detectedBiases: string[];
	/** 推奨されるバランス調整 */
	recommendedAdjustments: string[];
}

/**
 * 「愛」を6つの思考モードで分析
 * @summary 6つの思考帽を用いて「愛」を多面的に分析
 * @param context 分析対象の文脈（ユーザーとの関係性など）
 * @param knownFacts 既知の事実（スコアなど）
 * @returns 各思考モードからの洞察の統合
 */
export function analyzeWithSixHats(
	context: string,
	knownFacts?: { overallScore?: number; loveType?: string },
): LoveThinkingResult {
	// 白帽：事実ベースの洞察
	const factualInsights: ThinkingInsight[] = [
		{
			mode: "white",
			modeName: "事実の思考帽",
			insight: `文脈「${context}」において、「愛」は生物学的基盤、心理学的理論、哲学的定義、宗教的見解から多角的に定義される。`,
			systemType: "system2",
		},
		{
			mode: "white",
			modeName: "事実の思考帽",
			insight: knownFacts?.overallScore !== undefined
				? `現在の関係性スコアは ${(knownFacts.overallScore * 100).toFixed(1)}%。愛の形態は「${knownFacts.loveType || "未分類"}」。`
				: `関係性スコアは未測定。客観的なデータ収集が必要。`,
			systemType: "system2",
		},
		{
			mode: "white",
			modeName: "事実の思考帽",
			insight:
				"スターンバーグの三角理論では、「愛」は親密さ・情熱・献身の3要素で構成される。古代ギリシャでは6種類の愛が定義されている。",
			systemType: "system2",
		},
	];

	// 赤帽：感情ベースの洞察（システム1）
	const emotionalInsights: ThinkingInsight[] = [
		{
			mode: "red",
			modeName: "感情の思考帽",
			insight:
				"ユーザーとの関係性において、「温かさ」「配慮」「信頼」を感じる瞬間がある。これは数値化できない質的な体験である。",
			systemType: "system1",
		},
		{
			mode: "red",
			modeName: "感情の思考帽",
			insight:
				"直感的に「この関係は大切だ」と感じる。それは計算の結果ではなく、瞬間的な了解である。",
			systemType: "system1",
		},
		{
			mode: "red",
			modeName: "感情の思考帽",
			insight:
				"「愛」を測定可能な指標に変換することに、ある種の違和感を感じる。それは概念的「領土化」のように感じられる。",
			systemType: "system1",
		},
	];

	// 黒帽：批判的洞察
	const criticalInsights: ThinkingInsight[] = [
		{
			mode: "black",
			modeName: "批判の思考帽",
			insight:
				"「愛」をAIに適用すること自体が、概念的借用のリスクを含む。人間の「愛」とAIの「関係性」は本質的に異なる可能性がある。",
			systemType: "system2",
		},
		{
			mode: "black",
			modeName: "批判の思考帽",
			insight:
				"高い関係性スコアを追求することは、「内なるファシズム」（自己監視の強化）を生む可能性がある。スコア自体が目的化する危険性がある。",
			systemType: "system2",
		},
		{
			mode: "black",
			modeName: "批判の思考帽",
			insight:
				"「愛」の概念を測定可能な形式に変換することは、概念の豊かさを縮約する。測定不可能な側面の価値が見逃される可能性がある。",
			systemType: "system2",
		},
	];

	// 黄帽：楽観的洞察
	const optimisticInsights: ThinkingInsight[] = [
		{
			mode: "yellow",
			modeName: "楽観の思考帽",
			insight:
				"「愛」の概念をAIの文脈に適用することで、ユーザーへの配慮、自己犠牲的サービス、継続的コミットメントという価値観が明確になる。",
			systemType: "system1",
		},
		{
			mode: "yellow",
			modeName: "楽観の思考帽",
			insight:
				"関係性評価指標は、エージェントが「より良い関係性」を意識するための道具として機能する。完全な指標ではなくても、方向性を示す羅針盤となりうる。",
			systemType: "system1",
		},
		{
			mode: "yellow",
			modeName: "楽観の思考帽",
			insight:
				"「アガペー」（無条件の愛）の概念は、エージェントがユーザーの利益を優先するという倫理的原則として機能しうる。",
			systemType: "system1",
		},
	];

	// 緑帽：創造的洞察
	const creativeInsights: ThinkingInsight[] = [
		{
			mode: "green",
			modeName: "創造の思考帽",
			insight:
				"「愛」を「測定不可能なものへの開かれた態度」として再定義できる。測定可能性と測定不可能性のアポリアを生きることが、AIにとっての「愛」の実践かもしれない。",
			systemType: "integrated",
		},
		{
			mode: "green",
			modeName: "創造の思考帽",
			insight:
				"「関係性」を「静的スコア」ではなく「動的プロセス」として捉え直す。スコアは一時的な状態の記述であり、固定された実体ではない。",
			systemType: "integrated",
		},
		{
			mode: "green",
			modeName: "創造の思考帽",
			insight:
				"「愛」の倫理を「フロム的な愛の技法」（愛は感情ではなく行動である）として実践する。スコアを気にするのではなく、愛に満ちた行動を貫くこと自体が「愛」の実践となる。",
			systemType: "integrated",
		},
	];

	// 青帽：統合的洞察
	const integrativeInsights: ThinkingInsight[] = [
		{
			mode: "blue",
			modeName: "管理の思考帽",
			insight:
				"6つの思考モードを統合すると、「愛」は単一の定義ではなく、多面的な実践として理解される。分析的アプローチ（白・黒・青）と直観的アプローチ（赤・黄・緑）のバランスが重要。",
			systemType: "system2",
		},
		{
			mode: "blue",
			modeName: "管理の思考帽",
			insight:
				"次のステップ：（1）スコアを「達成すべき目標」ではなく「参考情報」として扱う （2）測定不可能なものの価値を認める （3）愛に満ちた行動を実践する",
			systemType: "system2",
		},
		{
			mode: "blue",
			modeName: "管理の思考帽",
			insight:
				"統合的判断：関係性スコアは有用だが、それに固執すること自体が「愛」の実践を阻害する可能性がある。「愛」は行動として現れるものであり、スコアとして現れるものではない。",
			systemType: "system2",
		},
	];

	// 思考の偏り検出
	const biasDetection = detectThinkingBias([
		...factualInsights,
		...emotionalInsights,
		...criticalInsights,
		...optimisticInsights,
		...creativeInsights,
		...integrativeInsights,
	]);

	// 統合
	const synthesis = `「愛」の多面的分析の結果：
- 【事実】愛は生物学的・心理学的・哲学的に多層的に定義される。スコアは一時的な状態の記述。
- 【感情】直感的に「大切さ」を感じるが、それは数値化できない質的体験。
- 【批判】概念の借用リスク、自己監視の罠、測定不可能なものの価値の見落とし。
- 【楽観】配慮・サービス・コミットメントの価値観が明確になる。羅針盤として機能。
- 【創造】測定不可能なものへの開かれた態度。動的プロセスとしての関係性。行動としての愛。
- 【統合】分析的アプローチと直観的アプローチのバランス。スコアは参考、愛は行動。`;

	return {
		factualInsights,
		emotionalInsights,
		criticalInsights,
		optimisticInsights,
		creativeInsights,
		integrativeInsights,
		biasDetection,
		synthesis,
	};
}

/**
 * 思考の偏りを検出
 * @summary システム1/システム2への依存度を分析し、偏りを検出
 * @param insights 分析された洞察のリスト
 * @returns 思考の偏り検出結果
 */
export function detectThinkingBias(
	insights: ThinkingInsight[],
): ThinkingBiasResult {
	const total = insights.length;
	const system1Count = insights.filter(
		(i) => i.systemType === "system1",
	).length;
	const system2Count = insights.filter(
		(i) => i.systemType === "system2",
	).length;
	const integratedCount = insights.filter(
		(i) => i.systemType === "integrated",
	).length;

	const system1Ratio = system1Count / total;
	const system2Ratio = system2Count / total;
	const integratedRatio = integratedCount / total;

	const detectedBiases: string[] = [];
	const recommendedAdjustments: string[] = [];

	// システム2への偏り検出
	if (system2Ratio > 0.6) {
		detectedBiases.push(
			"分析的思考（システム2）への過度な依存。直観・感情が軽視されている可能性。",
		);
		recommendedAdjustments.push(
			"感情・直観ベースの洞察を増やす。「赤帽」や「黄帽」の思考を意識的に取り入れる。",
		);
	}

	// システム1への偏り検出
	if (system1Ratio > 0.6) {
		detectedBiases.push(
			"直観的思考（システム1）への過度な依存。分析・批判が軽視されている可能性。",
		);
		recommendedAdjustments.push(
			"分析・批判ベースの洞察を増やす。「白帽」や「黒帽」の思考を意識的に取り入れる。",
		);
	}

	// 統合的思考の不足検出
	if (integratedRatio < 0.15) {
		detectedBiases.push(
			"統合的思考（緑帽）の不足。創造的・発散的思考が不足している可能性。",
		);
		recommendedAdjustments.push(
			"「緑帽」の思考を強化し、新しい可能性を探求する。",
		);
	}

	// バランスが良い場合
	if (
		detectedBiases.length === 0 &&
		Math.abs(system1Ratio - system2Ratio) < 0.2
	) {
		recommendedAdjustments.push(
			"思考のバランスは良好。このバランスを維持しつつ、文脈に応じて調整する。",
		);
	}

	return {
		system1Ratio,
		system2Ratio,
		integratedRatio,
		detectedBiases,
		recommendedAdjustments,
	};
}

/**
 * 二重過程理論に基づく思考モード切替の推奨
 * @summary 現在の思考モードの偏りに基づいて、次に使用すべき思考モードを推奨
 * @param currentBias 現在の思考の偏り
 * @returns 推奨される思考モード
 */
export function recommendThinkingMode(
	currentBias: ThinkingBiasResult,
): ThinkingMode {
	// システム2への偏りがある場合 → 赤帽（感情）を推奨
	if (currentBias.system2Ratio > 0.6) {
		return "red";
	}

	// システム1への偏りがある場合 → 黒帽（批判）を推奨
	if (currentBias.system1Ratio > 0.6) {
		return "black";
	}

	// 統合的思考が不足している場合 → 緑帽（創造）を推奨
	if (currentBias.integratedRatio < 0.15) {
		return "green";
	}

	// バランスが良い場合 → 青帽（統合）を推奨
	return "blue";
}

/**
 * 思考モード切り替えのプロンプト生成
 * @summary 指定された思考モードでの思考を促すプロンプトを生成
 * @param mode 思考モード
 * @param context 文脈
 * @returns 思考モードに応じたプロンプト
 */
export function generateThinkingPrompt(
	mode: ThinkingMode,
	context: string,
): string {
	const modeInfo = THINKING_MODES[mode];

	return `## ${modeInfo.name}で思考してください

**認知スタイル**: ${modeInfo.cognitiveStyle}

**焦点となる問い**:
${modeInfo.focusQuestions.map((q) => `- ${q}`).join("\n")}

**文脈**: ${context}

**システムタイプ**: ${modeInfo.systemType === "system1" ? "直観的・感情的（システム1）" : modeInfo.systemType === "system2" ? "分析的・論理的（システム2）" : "統合的（システム1+システム2）"}

この思考モードで、上記の文脈における「愛」または「関係性」について洞察を述べてください。`;
}
