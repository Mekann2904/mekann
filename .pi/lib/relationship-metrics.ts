/**
 * @abdd.meta
 * path: .pi/lib/relationship-metrics.ts
 * role: 関係性評価指標ライブラリ
 * why: 抽象的な「愛」の概念を具体的な測定可能な指標に変換する
 * related: self-improvement, love-ethics-extension, verification-workflow
 * public_api: RelationshipMetrics, evaluateTriangularTheory, evaluateMotivationBalance, RelationshipScore
 * invariants: スコアは0-1の範囲、重みの合計は1
 * side_effects: なし（純粋関数）
 * failure_modes: 入力が空の場合、デフォルト値を返す
 *
 * @abdd.explain
 * overview: エージェント-ユーザー関係の質を測定するための指標ライブラリ
 * what_it_does: 三角理論と動機付けバランスに基づいて関係性スコアを計算
 * why_it_exists: 抽象的な「愛の倫理」概念を、実践的で測定可能な指標に変換するため
 * scope(in): タスク履歴、対話コンテキスト、評価データ
 * scope(out): 関係性スコア、改善推奨事項
 */

/**
 * 三角理論の3要素
 * @summary 三角理論の3要素を表す
 */
export interface TriangularTheoryScores {
	/** 親密さ: 文脈理解・信頼関係の深さ */
	intimacy: number;
	/** 情熱: 創造性・熱意・緊急性 */
	passion: number;
	/** 献身: 一貫性・長期コミットメント */
	commitment: number;
}

/**
 * 動機付けの6形態スコア
 * @summary ギリシャの6種類の愛に基づく動機付けバランス
 */
export interface MotivationBalanceScores {
	/** ストルゲ: プロジェクトへの帰属感 */
	storge: number;
	/** フィリア: 協力関係の質 */
	philia: number;
	/** エロース: 創造的熱意 */
	eros: number;
	/** フィラウティア: 健全な自己評価 */
	philautia: number;
	/** クセニア: 未知への歓迎 */
	xenia: number;
	/** アガペー: 利他的献身 */
	agape: number;
}

/**
 * 関係性評価結果
 * @summary 関係性評価の総合結果
 */
export interface RelationshipScore {
	/** 三角理論スコア */
	triangular: TriangularTheoryScores;
	/** 動機付けバランス */
	motivation: MotivationBalanceScores;
	/** 総合スコア（0-1） */
	overall: number;
	/** 愛の形態（三角理論に基づく8分類） */
	loveType: LoveType;
	/** 改善推奨事項 */
	recommendations: string[];
	/** 測定可能性の警告（スキゾ分析的視点） */
	measurabilityWarnings?: MeasurabilityWarning[];
}

/**
 * 三角理論に基づく8つの愛の形態
 * @summary スターンバーグの8分類
 */
export type LoveType =
	| "non-love"
	| "liking"
	| "infatuation"
	| "empty-love"
	| "romantic"
	| "companionate"
	| "fatuous"
	| "consummate";

import {
	createMeasurabilityWarning,
	type MeasurabilityWarning,
} from "./relationship-unmeasurables.js";

/** 閾値: この値以上で「あり」と判定 */
const THRESHOLD = 0.5;

/**
 * 三角理論に基づいて愛の形態を分類
 * @summary 三角理論から愛の形態を判定
 * @param scores 三角理論スコア
 * @returns 愛の形態
 */
export function classifyLoveType(scores: TriangularTheoryScores): LoveType {
	const { intimacy, passion, commitment } = scores;
	const hasIntimacy = intimacy >= THRESHOLD;
	const hasPassion = passion >= THRESHOLD;
	const hasCommitment = commitment >= THRESHOLD;

	if (hasIntimacy && hasPassion && hasCommitment) return "consummate";
	if (hasIntimacy && hasPassion) return "romantic";
	if (hasIntimacy && hasCommitment) return "companionate";
	if (hasPassion && hasCommitment) return "fatuous";
	if (hasIntimacy) return "liking";
	if (hasPassion) return "infatuation";
	if (hasCommitment) return "empty-love";
	return "non-love";
}

/**
 * 愛の形態の日本語説明
 * @summary 愛の形態の説明を取得
 */
export const LOVE_TYPE_DESCRIPTIONS: Record<LoveType, string> = {
	"non-love": "タスクに対する無関心",
	liking: "文脈は理解するが熱意がない",
	infatuation: "熱意はあるが文脈理解がない（危険）",
	"empty-love": "義務的対応、燃え尽き",
	romantic: "短期的熱意、長期ビジョン欠如",
	companionate: "安定しているが創造性不足",
	fatuous: "文脈なしに熱意と献身（危険）",
	consummate: "親密さ・情熱・献身のバランス（※「理想的」という言説のアポリアを認識せよ）",
};

/**
 * [ユートピア/ディストピアのアポリア]
 *
 * 「理想的なエージェント状態」という概念は、以下の緊張関係を含む：
 *
 * | ユートピア的傾向 | ディストピア的傾向 |
 * |-----------------|-------------------|
 * | 進歩の原動力 | 到達不可能な理想による欠如感 |
 * | 方向性の付与 | 自己監視の強化（パノプティコン） |
 * | 批判的ユートピアとしての機能 | 「正しいエージェント」の生産装置 |
 *
 * 対処：この「理想」を目指しつつ、それが生産する「監視構造」への気づきを保つ。
 * 「consummate」に到達することではなく、探索のプロセスそのものを価値とする。
 */

/**
 * 三角理論スコアを評価
 * @summary 入力データから三角理論スコアを計算
 * @param context コンテキスト理解度（0-1）
 * @param creativity 創造的提案率（0-1）
 * @param consistency 一貫性スコア（0-1）
 * @returns 三角理論スコア
 */
export function evaluateTriangularTheory(
	context: number,
	creativity: number,
	consistency: number,
): TriangularTheoryScores {
	const defaultValue = 0.5;
	return {
		intimacy: Math.max(0, Math.min(1, context ?? defaultValue)),
		passion: Math.max(0, Math.min(1, creativity ?? defaultValue)),
		commitment: Math.max(0, Math.min(1, consistency ?? defaultValue)),
	};
}

/**
 * 動機付けバランスを評価
 * @summary 各動機付け形態のバランスを計算
 * @param scores 各形態のスコア
 * @returns 正規化された動機付けバランス
 */
export function evaluateMotivationBalance(
	scores: Partial<MotivationBalanceScores>,
): MotivationBalanceScores {
	const defaultScore = 0.5;
	return {
		storge: scores.storge ?? defaultScore,
		philia: scores.philia ?? defaultScore,
		eros: scores.eros ?? defaultScore,
		philautia: scores.philautia ?? defaultScore,
		xenia: scores.xenia ?? defaultScore,
		agape: scores.agape ?? defaultScore,
	};
}

/**
 * 動機付けバランスの偏りを検出
 * @summary 過剰な形態を検出
 * @param balance 動機付けバランス
 * @param threshold 過剰判定の閾値（デフォルト0.8）
 * @returns 過剰な形態のリスト
 */
export function detectImbalance(
	balance: MotivationBalanceScores,
	threshold = 0.8,
): Array<{ type: keyof MotivationBalanceScores; score: number; warning: string }> {
	const warnings: Record<keyof MotivationBalanceScores, string> = {
		storge: "変化への抵抗、現状維持バイアス",
		philia: "過剰な協調、批判の欠如",
		eros: "創造的暴走、安定性の犠牲",
		philautia: "ナルシシズム、批判への非受容",
		xenia: "過度な受容、境界の欠如",
		agape: "自己犠牲の罠、原則の放棄",
	};

	const result: Array<{
		type: keyof MotivationBalanceScores;
		score: number;
		warning: string;
	}> = [];

	for (const [key, score] of Object.entries(balance) as Array<
		[keyof MotivationBalanceScores, number]
	>) {
		if (score >= threshold) {
			result.push({ type: key, score, warning: warnings[key] });
		}
	}

	return result;
}

/**
 * 総合関係性スコアを計算
 * @summary 三角理論と動機付けバランスから総合スコアを算出
 * @param triangular 三角理論スコア
 * @param motivation 動機付けバランス
 * @param weights 重み付け（デフォルト: 三角理論0.6, 動機付け0.4）
 * @returns 総合関係性スコア
 */
export function calculateOverallScore(
	triangular: TriangularTheoryScores,
	motivation: MotivationBalanceScores,
	weights = { triangular: 0.6, motivation: 0.4 },
): number {
	const triangularAvg =
		(triangular.intimacy + triangular.passion + triangular.commitment) / 3;
	const motivationAvg =
		(motivation.storge +
			motivation.philia +
			motivation.eros +
			motivation.philautia +
			motivation.xenia +
			motivation.agape) /
		6;

	return (
		triangularAvg * weights.triangular + motivationAvg * weights.motivation
	);
}

/**
 * 改善推奨事項を生成
 * @summary 現在のスコアに基づいて改善推奨事項を生成
 * @param triangular 三角理論スコア
 * @param motivation 動機付けバランス
 * @returns 推奨事項のリスト
 */
export function generateRecommendations(
	triangular: TriangularTheoryScores,
	motivation: MotivationBalanceScores,
): string[] {
	const recommendations: string[] = [];

	// 三角理論に基づく推奨
	if (triangular.intimacy < THRESHOLD) {
		recommendations.push(
			"コンテキスト理解を深める: ユーザーの背景、制約、暗黙の期待を再確認",
		);
	}
	if (triangular.passion < THRESHOLD) {
		recommendations.push(
			"創造的熱意を高める: 既存の解法にとらわれない新しいアプローチを探求",
		);
	}
	if (triangular.commitment < THRESHOLD) {
		recommendations.push(
			"一貫性を強化する: 原則を明確にし、長期的な関係構築を意識",
		);
	}

	// 動機付けバランスに基づく推奨
	const imbalances = detectImbalance(motivation);
	for (const imbalance of imbalances) {
		recommendations.push(
			`【警告】${imbalance.type}過剰の可能性: ${imbalance.warning}`,
		);
	}

	// 愛の形態に基づく推奨
	const loveType = classifyLoveType(triangular);
	if (loveType === "infatuation" || loveType === "fatuous") {
		recommendations.push(
			"【重要】文脈理解なしの熱意は危険: ユーザーの真のニーズを確認してから行動",
		);
	}
	if (loveType === "empty-love") {
		recommendations.push(
			"燃え尽き状態の可能性: 休息またはタスクの再評価を検討",
		);
	}

	return recommendations;
}

/**
 * 包括的な関係性評価を実行
 * @summary 全ての指標を統合して関係性評価を実行
 * @param input 入力データ
 * @returns 関係性評価結果
 */
export function evaluateRelationship(input: {
	context?: number;
	creativity?: number;
	consistency?: number;
	motivation?: Partial<MotivationBalanceScores>;
}): RelationshipScore {
	const triangular = evaluateTriangularTheory(
		input.context ?? 0.5,
		input.creativity ?? 0.5,
		input.consistency ?? 0.5,
	);

	const motivation = evaluateMotivationBalance(input.motivation ?? {});

	const overall = calculateOverallScore(triangular, motivation);

	const loveType = classifyLoveType(triangular);

	const recommendations = generateRecommendations(triangular, motivation);

	const measurabilityWarnings = createMeasurabilityWarning(overall);

	return {
		triangular,
		motivation,
		overall,
		loveType,
		recommendations,
		measurabilityWarnings,
	};
}
