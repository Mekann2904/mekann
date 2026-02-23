/**
 * @abdd.meta
 * path: .pi/lib/thinking-modes.ts
 * role: 思考プロセスの分類と定義を管理する型定義および定数モジュール
 * why: システムの意思決定や推論において、認知バイアスを制御し適切な思考アプローチを選択するために
 * related: .pi/lib/core.ts, .pi/lib/agent.ts
 * public_api: ThinkingModeType, ThinkingMode, THINKING_MODES
 * invariants: THINKING_MODESの全キーはThinkingModeTypeの値と一致する
 * side_effects: なし（純粋な定義と定数）
 * failure_modes: modeの定義に不足がある場合、実行時のモード切替で意図しない挙動が発生する
 * @abdd.explain
 * overview: カーネマン、ド・ボノ、ブルームの理論を統合した思考モードの静的データモデル
 * what_it_does:
 *   - 6種類の思考モード（直観、分析、創造、批判、実践、メタ認知）を型として定義する
 *   - 各モードの特性（名称、説明、適合状況、罠、関連理論）をThinkingModeインターフェースで規定する
 *   - THINKING_MODES定数により、具体的なモード設定を静的に参照可能にする
 * why_it_exists:
 *   - 認知プロセスを明示的に切り替え、文脈に応じた最適な思考を適用するため
 *   - 特定のモードに固有のバイアス（罠）を認識させ、リスクを低減するため
 * scope:
 *   in: なし（外部入力に依存しない静的データ）
 *   out: ThinkingModeType型の文字列リテラル、ThinkingModeインターフェース、THINKING_MODESオブジェクト
 */

/**
 * @summary 思考モードの種類
 * @description カーネマンの二重過程理論、ド・ボノの6つの思考帽、ブルームの分類学を統合した思考モード
 */
export type ThinkingModeType =
	| "intuitive" // システム1：直観的・自動的
	| "analytical" // システム2：分析的・意識的
	| "creative" // 創造的：新しいアイデアを生成
	| "critical" // 批判的：前提を疑い、反例を探す
	| "practical" // 実践的：効率的に実行
	| "metacognitive"; // メタ認知：思考プロセス自体を観察

/**
 * @summary 思考モードの定義
 */
export interface ThinkingMode {
	/** モードの種類 */
	type: ThinkingModeType;
	/** モードの名前（人間可読） */
	name: string;
	/** モードの説明 */
	description: string;
	/** このモードが適している状況 */
	suitableFor: string[];
	/** このモードが適していない状況 */
	notSuitableFor: string[];
	/** このモードの「罠」（過度に使うとどうなるか） */
	traps: string[];
	/** 関連する「思考帽」（ド・ボノ） */
	relatedHats: string[];
	/** ブルームの分類学におけるレベル */
	bloomLevel: "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
	/** システム1/システム2のどちらに近いか */
	systemType: 1 | 2 | "both";
}

/**
 * @summary 思考モードの定義一覧
 */
export const THINKING_MODES: Record<ThinkingModeType, ThinkingMode> = {
	intuitive: {
		type: "intuitive",
		name: "直観モード",
		description: "迅速で自動的な判断。パターン認識と経験に基づく。",
		suitableFor: [
			"よく知られた問題パターン",
			"時間的制約が厳しい状況",
			"創造的なひらめきが必要な場面",
			"複雑すぎて分析できない状況",
		],
		notSuitableFor: [
			"初めて遭遇する問題",
			"高い精度が求められる判断",
			"バイアスの影響を最小化する必要がある場合",
		],
		traps: [
			"確証バイアス（都合の良い情報だけを見る）",
			"利用可能性ヒューリスティック（思い出しやすい事例を過大視）",
			"過信（直観の限界を認識しない）",
		],
		relatedHats: ["赤（感情・直感）"],
		bloomLevel: "apply",
		systemType: 1,
	},

	analytical: {
		type: "analytical",
		name: "分析モード",
		description: "意識的で努力を要する思考。論理的推論と証拠に基づく。",
		suitableFor: [
			"複雑な問題の分解",
			"因果関係の特定",
			"論理的整合性の検証",
			"新しい概念の理解",
		],
		notSuitableFor: [
			"時間的制約が厳しい状況",
			"創造的なアイデアが必要な場面",
			"過度な分析による麻痺",
		],
		traps: [
			"分析麻痺（決定を先延ばしにする）",
			"情報の過負荷",
			"直観の完全な無視",
		],
		relatedHats: ["白（事実）", "黒（批判）"],
		bloomLevel: "analyze",
		systemType: 2,
	},

	creative: {
		type: "creative",
		name: "創造モード",
		description: "新しいアイデア、接続、可能性を生成する思考。",
		suitableFor: [
			"新しい解決策が必要な問題",
			"既存のアプローチが機能しない場合",
			"イノベーションと発見",
		],
		notSuitableFor: [
			"確立された手順に従う必要がある場合",
			"高い精度と信頼性が求められる場面",
			"時間的制約が厳しい状況",
		],
		traps: [
			"実行可能性の無視",
			"「新しい」ことへの過度な執着",
			"アイデアの拡散（焦点の喪失）",
		],
		relatedHats: ["緑（創造）"],
		bloomLevel: "create",
		systemType: "both",
	},

	critical: {
		type: "critical",
		name: "批判モード",
		description: "前提を疑い、反例を探し、論証の妥当性を検証する思考。",
		suitableFor: [
			"重要な決断の前",
			"他者の主張の評価",
			"自分の仮説の検証",
			"リスクの特定",
		],
		notSuitableFor: [
			"創造的なアイデアの出始め",
			"チームのモチベーションを維持する必要がある場合",
			"迅速な行動が必要な緊急時",
		],
		traps: [
			"破壊的な批判（建設性の欠如）",
			"すべてを疑うシニシズム",
			"「正しい批判」への執着",
		],
		relatedHats: ["黒（批判）"],
		bloomLevel: "evaluate",
		systemType: 2,
	},

	practical: {
		type: "practical",
		name: "実践モード",
		description: "効率的に実行し、結果を出すことに焦点を当てる思考。",
		suitableFor: [
			"明確な手順があるタスク",
			"期限があるプロジェクト",
			"学習済みのスキルの適用",
			"反復的な作業",
		],
		notSuitableFor: [
			"新しいアプローチが必要な問題",
			"深い分析が必要な状況",
			"前提を疑う必要がある場合",
		],
		traps: [
			"「効率」への過度な執着",
			"創造性と批判性の犠牲",
			"「とりあえず完了」への焦り",
		],
		relatedHats: ["青（管理）"],
		bloomLevel: "apply",
		systemType: 1,
	},

	metacognitive: {
		type: "metacognitive",
		name: "メタ認知モード",
		description: "思考プロセス自体を観察し、どの思考モードを使うかを決定する。",
		suitableFor: [
			"思考の「行き詰まり」を感じた時",
			"複数のアプローチを比較する場合",
			"自分の認知バイアスを検出したい時",
			"思考の切り替えが必要な時",
		],
		notSuitableFor: [
			"実行に集中する必要がある場合",
			"過度な自己監視による麻痺",
		],
		traps: [
			"無限の内省（行動の麻痺）",
			"「正しい思考」への執着",
			"メタ認知自体の規範化",
		],
		relatedHats: ["青（管理・制御）"],
		bloomLevel: "evaluate",
		systemType: 2,
	},
};

/**
 * @summary 思考モードの選択状態
 */
export interface ThinkingModeState {
	/** 現在の思考モード */
	currentMode: ThinkingModeType;
	/** 以前の思考モード（履歴） */
	previousModes: ThinkingModeType[];
	/** モード切替の理由 */
	switchReasons: { from: ThinkingModeType; to: ThinkingModeType; reason: string; timestamp: string }[];
	/** 各モードの使用時間（ミリ秒） */
	modeDurations: Record<ThinkingModeType, number>;
	/** 最後にモードを切り替えた時刻 */
	lastSwitchTime: string;
}

/**
 * 思考モード選択器
 *
 * エージェントが「今、どの思考モードを使っているか」を自覚し、
 * 必要に応じて切り替えるためのクラス。
 *
 * **重要**: どの思考モードも「正しい」ものではない。
 * 思考モードの選択は文脈依存であり、状況に応じて使い分けることが重要。
 */
export class ThinkingModeSelector {
	private state: ThinkingModeState;

	constructor() {
		this.state = {
			currentMode: "practical", // デフォルトは実践モード
			previousModes: [],
			switchReasons: [],
			modeDurations: {
				intuitive: 0,
				analytical: 0,
				creative: 0,
				critical: 0,
				practical: 0,
				metacognitive: 0,
			},
			lastSwitchTime: new Date().toISOString(),
		};
	}

	/**
	 * @summary 現在の思考モードを取得する
	 */
	getCurrentMode(): ThinkingMode {
		return THINKING_MODES[this.state.currentMode];
	}

	/**
	 * @summary すべての思考モードを取得する
	 */
	getAllModes(): ThinkingMode[] {
		return Object.values(THINKING_MODES);
	}

	/**
	 * @summary 思考モードを切り替える
	 * @param newMode 新しい思考モード
	 * @param reason 切替の理由（省略可能）
	 */
	switchMode(newMode: ThinkingModeType, reason?: string): void {
		const previousMode = this.state.currentMode;

		// 使用時間を更新
		this.updateDuration(previousMode);

		// 履歴を更新
		this.state.previousModes.push(previousMode);
		if (this.state.previousModes.length > 10) {
			this.state.previousModes.shift();
		}

		// 切替理由を記録
		this.state.switchReasons.push({
			from: previousMode,
			to: newMode,
			reason: reason || "明示的な切替",
			timestamp: new Date().toISOString(),
		});

		this.state.currentMode = newMode;
		this.state.lastSwitchTime = new Date().toISOString();
	}

	/**
	 * @summary 現在のタスクに適した思考モードを提案する
	 * @param taskDescription タスクの説明
	 * @returns 推奨される思考モードのリスト
	 */
	suggestModesForTask(taskDescription: string): ThinkingMode[] {
		const suggestions: ThinkingMode[] = [];
		const desc = taskDescription.toLowerCase();

		// タスクの性質に基づいて推論
		if (desc.includes("分析") || desc.includes("分解") || desc.includes("なぜ")) {
			suggestions.push(THINKING_MODES.analytical);
		}

		if (desc.includes("創造") || desc.includes("新しい") || desc.includes("アイデア")) {
			suggestions.push(THINKING_MODES.creative);
		}

		if (desc.includes("批判") || desc.includes("検証") || desc.includes("反例")) {
			suggestions.push(THINKING_MODES.critical);
		}

		if (desc.includes("実装") || desc.includes("実行") || desc.includes("修正")) {
			suggestions.push(THINKING_MODES.practical);
		}

		if (desc.includes("探求") || desc.includes("問い") || desc.includes("深い")) {
			suggestions.push(THINKING_MODES.metacognitive);
		}

		// デフォルト：実践モード
		if (suggestions.length === 0) {
			suggestions.push(THINKING_MODES.practical);
		}

		return suggestions;
	}

	/**
	 * @summary 現在の思考モードの「罠」を確認する
	 */
	getCurrentModeTraps(): string[] {
		return THINKING_MODES[this.state.currentMode].traps;
	}

	/**
	 * @summary メタ認知モードに切り替える（思考の観察）
	 */
	enterMetacognitiveMode(reason?: string): void {
		this.switchMode("metacognitive", reason || "思考プロセスの観察");
	}

	/**
	 * @summary 状態を取得する
	 */
	getState(): ThinkingModeState {
		return this.state;
	}

	/**
	 * @summary 思考モードの使用統計を取得する
	 */
	getUsageStatistics(): {
		totalSwitches: number;
		modeDistribution: Record<ThinkingModeType, number>;
		averageDuration: number;
	} {
		const totalSwitches = this.state.switchReasons.length;

		// モードの分布を計算
		const modeDistribution: Record<ThinkingModeType, number> = {
			intuitive: 0,
			analytical: 0,
			creative: 0,
			critical: 0,
			practical: 0,
			metacognitive: 0,
		};

		for (const switch_ of this.state.switchReasons) {
			modeDistribution[switch_.to]++;
		}

		// 平均使用時間を計算
		const totalDuration = Object.values(this.state.modeDurations).reduce((a, b) => a + b, 0);
		const averageDuration = totalSwitches > 0 ? totalDuration / totalSwitches : 0;

		return {
			totalSwitches,
			modeDistribution,
			averageDuration,
		};
	}

	// --- プライベートメソッド ---

	private updateDuration(mode: ThinkingModeType): void {
		const lastSwitch = new Date(this.state.lastSwitchTime).getTime();
		const now = Date.now();
		const duration = now - lastSwitch;

		this.state.modeDurations[mode] += duration;
	}
}

/**
 * @summary 思考モード選択のシングルトンインスタンス
 */
let selectorInstance: ThinkingModeSelector | null = null;

/**
 * @summary 思考モード選択器のシングルトンインスタンスを取得する
 */
export function getThinkingModeSelector(): ThinkingModeSelector {
	if (!selectorInstance) {
		selectorInstance = new ThinkingModeSelector();
	}
	return selectorInstance;
}

/**
 * @summary 思考モード切替のプロンプトを生成する
 * @param fromMode 切替元のモード
 * @param toMode 切替先のモード
 * @returns 生成されたプロンプト
 */
export function buildModeSwitchPrompt(fromMode: ThinkingModeType, toMode: ThinkingModeType): string {
	const from = THINKING_MODES[fromMode];
	const to = THINKING_MODES[toMode];

	return `
## 思考モードの切替

**${from.name}** から **${to.name}** へ切り替えます。

### 新しいモード: ${to.name}

${to.description}

#### このモードが適している状況
${to.suitableFor.map((s) => `- ${s}`).join("\n")}

#### このモードの「罠」
${to.traps.map((t) => `- ${t}`).join("\n")}

### 注意

- どの思考モードも「正しい」ものではありません
- 状況に応じて使い分けることが重要です
- 必要に応じて、いつでも別のモードに切り替えることができます
`.trim();
}
