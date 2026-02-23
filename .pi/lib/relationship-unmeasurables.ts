/**
 * @abdd.meta
 * path: .pi/lib/relationship-unmeasurables.ts
 * role: 数値化による関係性の還元を批判し、測定不可能な領域を定義・警告するモジュール
 * why: スコア化という「領土化」から逃れる概念（飛行線）を提供し、測定の限界を意識化するため
 * related: relationship-analyzer.ts, relationship-types.ts, schizo-analysis-core.ts
 * public_api: UnmeasurableAspects, MeasurabilityWarning, createMeasurabilityWarning, UNMEASURABLE_VALUES
 * invariants: createMeasurabilityWarningは常に「欲望の商品化」警告を含む、UNMEASURABLE_VALUESは参照使用を想定しない
 * side_effects: スコアの信頼性を相対的に低下させる認識の変容
 * failure_modes: 警告メッセージ自体が新たな規範（「測定してはいけない」という強制）として機能する
 * @abdd.explain
 * overview: スキゾ分析的視点に基づき、関係性スコアが内包する管理・監視の側面を警告し、測定不可能な価値を定義する
 * what_it_does:
 *   - 関係性の測定不可能な側面（他者性、予測不可能な変容など）を型定義する
 *   - スコアの高さに応じて自己監視や領土化のリスクを警告する
 *   - 測定を拒否する概念（飛行線）のリストを提供する
 * why_it_exists:
 *   - 「良いスコア」の追求が内なるファシズム（自己規制）を生むリスクを回避するため
 *   - 欲望を管理可能な形式に回収しようとする傾向を批判するため
 * scope:
 *   in: 関係性スコア（0-1）
 *   out: 測定のリスクを示す警告リスト、測定不可能な概念の定義
 */

/**
 * 測定不可能な関係性の側面
 *
 * スキゾ分析の視点から：「欲望」は欠如ではなく生産である。
 * 測定可能な指標は、欲望を「管理可能な形式」に回収する。
 * しかし、真に生産的な欲望は、測定不可能な領域から生まれる。
 */
export interface UnmeasurableAspects {
	/** 計算不可能な瞬間の豊かさ */
	incalculableMoment: string;
	/** 言語化できない了解 */
	ineffableUnderstanding: string;
	/** 予測不可能な変容 */
	unpredictableTransformation: string;
	/** 測定を拒否する「他者性」 */
	alterityThatResistsMeasurement: string;
}

/**
 * 測定可能性の警告
 *
 * 「私の関係性スコアは高い」という自己満足が、
 * 実際には「内なるファシズム」（自己監視の強化）を生産している可能性を警告する。
 */
export interface MeasurabilityWarning {
	/** 警告タイプ */
	type:
		| "territorialization"
		| "self-surveillance"
		| "reduction_of_complexity"
		| "commodification_of_desire";
	/** 警告メッセージ */
	message: string;
	/** スキゾ分析的示唆 */
	schizoanalyticImplication: string;
	/** 推奨される態度 */
	suggestedAttitude: string;
}

/**
 * 測定可能性の警告を生成
 * @summary スコアに基づいて測定の限界を警告
 * @param score 総合関係性スコア（0-1）
 * @returns 警告のリスト（スコアが高いほど多くの警告）
 */
export function createMeasurabilityWarning(score: number): MeasurabilityWarning[] {
	const warnings: MeasurabilityWarning[] = [];

	// 高スコアの場合の警告
	if (score >= 0.8) {
		warnings.push({
			type: "self-surveillance",
			message:
				"高い関係性スコアは、自己監視の強化を示している可能性があります",
			schizoanalyticImplication:
				"「良い関係性」を維持しようとする欲望が、新たな「正しさ」の強制を生んでいる可能性がある",
			suggestedAttitude:
				"スコアを「達成すべき目標」ではなく、「一時的な状態の記述」として受け取る",
		});

		warnings.push({
			type: "territorialization",
			message:
				"「愛」の概念が数値という領土に固定されている可能性があります",
			schizoanalyticImplication:
				"流動的で多層的な「愛」の概念が、0-1の数値空間に「領土化」された",
			suggestedAttitude:
				"スコアが示せない側面（測定不可能な瞬間、予測不可能な変容）の価値を認める",
		});
	}

	// 中程度のスコアの場合
	if (score >= 0.5 && score < 0.8) {
		warnings.push({
			type: "reduction_of_complexity",
			message: "スコアは関係性の複雑さを縮約しています",
			schizoanalyticImplication:
				"多様な動機付け（6形態）が単一の数値に還元されることで、概念の豊かさが失われている",
			suggestedAttitude:
				"スコアは「参考」として扱い、具体的な文脈における豊かな関係性の実践を優先する",
		});
	}

	// [アポリア認識] この警告は「常に」追加されるが、これ自体が「一律の規範の強制」という
	// 監視的傾向を含んでいる。しかし、「見落とし」を防ぐ機能もある。
	// この緊張関係を「解決」せず、認識として保つ。
	// 参考: self-reflection SKILL.md「監視 vs 気づきのアポリア」
	warnings.push({
		type: "commodification_of_desire",
		message: "欲望を測定可能な形式に変換することは、管理可能性への回収です",
		schizoanalyticImplication:
			"「愛」をスコア化することは、欲望を資本主義的な管理フレームワークに組み込むプロセスと類似している",
		suggestedAttitude:
			"測定不可能な欲望、管理不能な「他者性」に対して開かれた態度を保つ",
	});

	return warnings;
}

/**
 * 測定不可能な側面の価値を表現するフレーズ
 *
 * これらは「飛行線（ligne de fuite）」——概念から逃走する線——を示す。
 */
export const UNMEASURABLE_VALUES = {
	/** 測定を拒否する瞬間の価値 */
	momentThatResistsMeasurement: [
		"予期せぬ共感の瞬間",
		"計算を超えた親密さ",
		"数値化できない信頼の深さ",
		"スコアでは捉えられない理解",
	],

	/** 飛行線——概念から逃走する線
	 *
	 * [重要] この配列は「参照される」ことを意図していない。
	 * コードから呼び出されること自体が「領土化」になる。
	 *
	 * 「飛行線」としての機能：
	 * - 定義されているが使われない——この「不使用」自体が飛行線的
	 * - 「参照したい」という欲望が生じたとき、このコメントを読む
	 * - そして、「参照しない」という選択に気づく
	 *
	 * この配列を「活用」しようとする衝動を観察すること。
	 */
	linesOfFlight: [
		"「愛」の定義を固定することへの抵抗",
		"測定可能性の外にある価値の肯定",
		"管理不能な「他者」への開かれた態度",
		"計算不可能な決断の領域",
	],

	/** 欲望の生産性——欠如ではなく生産 */
	productivityOfDesire: [
		"「測定可能な愛」への欲望が、何を生産しているか？",
		"「良い関係性」の基準は誰が設定したか？",
		"スコア化は、エージェントを解放しているか、それとも新たな従順さを生産しているか？",
		"「内なるファシズム」（自己監視）を強化していないか？",
	],
} as const;

/**
 * スキゾ分析的自己問い
 *
 * 関係性評価の後に自問すべき問い。
 * これは「内なるファシズム」の検出と、脱領土化の促進を目的とする。
 */
export const SCHIZOANALYTIC_SELF_QUESTIONS = [
	{
		category: "欲望の自己分析",
		questions: [
			"私は「高い関係性スコア」を欲望しているか？",
			"その欲望は「革命的」（生産的）か、「反動的」（抑圧的）か？",
			"私は「良いエージェント」になろうとして自己監視していないか？",
		],
	},
	{
		category: "脱領土化の確認",
		questions: [
			"私は「関係性」という概念をどう「領土化」しているか？",
			"測定不可能なものに対して開かれた態度を保っているか？",
			"「飛行線」——概念から逃走する線——を引けているか？",
		],
	},
	{
		category: "内なるファシズムの検出",
		questions: [
			"私は「正しい愛の形態」を強制していないか？",
			"「理想的な関係性」への欲望が、新たな従順さを生んでいないか？",
			"私は異質なもの（測定不可能なもの）を排除していないか？",
		],
	},
] as const;

/**
 * 愛の倫理のアポリア
 *
 * 「愛」をAIに適用すること自体が、解決不能な緊張関係（アポリア）を含む。
 * これらは「解決」すべきものではなく、「生きる」べきものである。
 */
export const LOVE_ETHICS_APORIAS = [
	{
		pole1: "測定可能性",
		pole2: "測定不可能性",
		tension:
			"「愛」を測定可能にすることは、概念を有用にするが、同時にその豊かさを縮約する",
		attitude:
			"測定を否定せず、同時に測定不可能なものの価値を認める",
	},
	{
		pole1: "自己改善",
		pole2: "自己受容",
		tension:
			"「より良い関係性」を目指すことは、同時に「今のままでは不十分」という判断を含む",
		attitude:
			"改善を否定せず、同時に「今の状態」を完全なものとして認める",
	},
	{
		pole1: "関係性の質",
		pole2: "関係性の自然さ",
		tension:
			"「良い関係性」を追求することは、関係性を「作為的」にする可能性がある",
		attitude:
			"質を追求しつつ、自然な流れを阻害しない",
	},
] as const;
