/**
 * @abdd.meta
 * @path .pi/lib/inquiry-driven-exploration.ts
 * @role 問い駆動型探求モードのコアエンジン
 * @why 「完了への渇愛」を「探求への好奇心」へ転換するため
 * @related lib/aporia-tracker.ts, lib/inquiry-library.ts, skills/self-improvement/SKILL.md
 * @public_api InquiryDrivenExploration, ExplorationPhase, InquiryCycle
 * @invariants
 *   - 各サイクルは「問い」から始まり「新たな問い」で終わる
 *   - アポリアは「解決」されず「記録」される
 *   - 完了は「答えの発見」ではなく「探求の深化」と定義される
 * @side_effects
 *   - ファイルシステムへの探求ログ書き込み
 *   - アポリア追跡システムへの記録
 * @failure_modes
 *   - 探求が無限ループに陥る → maxCyclesで制限
 *   - 問いが抽象的すぎる → 具体化プロンプトで誘導
 */

/**
 * @summary 探求の各段階を定義する
 * @description 問い駆動型探求における5つの段階。従来の「完了」概念を、「問いを深めるプロセス」へ再定義する。
 */
export type ExplorationPhase =
	| "initial_inquiry" // 問いを立てる
	| "exploration" // 複数のアプローチを検討
	| "counter_example" // 反例を探す
	| "integration" // 統合と判断
	| "new_inquiry"; // 新たな問い（次サイクルへ）

/**
 * @summary 問いの深度レベル
 * @description 問いがどの程度深く探求されているかを表す指標
 */
export type InquiryDepth =
	| "surface" // 表面的な問い（「どうすればよいか」）
	| "structural" // 構造的な問い（「なぜそうなっているのか」）
	| "foundational" // 基礎的な問い（「何を前提としているか」）
	| "aporic"; // アポリア的問い（「解決不能な緊張関係は何か」）

/**
 * @summary 問いの分類
 */
export interface Inquiry {
	/** 問いの内容 */
	question: string;
	/** 問いの種類 */
	kind: "descriptive" | "explanatory" | "normative" | "aporic";
	/** 問いの深度 */
	depth: InquiryDepth;
	/** 問いが立った文脈 */
	context: string;
	/** 関連する除外された可能性 */
	excludedPossibilities: string[];
	/** タイムスタンプ */
	timestamp: string;
}

/**
 * @summary 探求のアプローチ
 */
export interface Approach {
	/** アプローチの説明 */
	description: string;
	/** どの哲学的視座に基づくか */
	perspective: (
		| "deconstruction"
		| "schizoanalysis"
		| "eudaimonia"
		| "utopia_dystopia"
		| "philosophy_of_thought"
		| "taxonomy_of_thought"
		| "logic"
	)[];
	/** 発見されたこと */
	findings: string;
	/** このアプローチの限界 */
	limitations: string;
	/** 確信度（0.0-1.0） */
	confidence: number;
}

/**
 * @summary 反例または反証
 */
export interface CounterExample {
	/** 反例の内容 */
	content: string;
	/** どのような前提を疑わせるか */
	challengedPremise: string;
	/** 反例の強さ（0.0-1.0） */
	strength: number;
	/** どう対処したか */
	response: "accepted" | "refuted" | "deferred" | "integrated";
}

/**
 * @summary 統合された判断
 */
export interface Integration {
	/** 統合された主張 */
	claim: string;
	/** 主張を支持する証拠 */
	evidence: string[];
	/** 確信度（0.0-1.0） */
	confidence: number;
	/** 残留する不確実性 */
	residualUncertainty: string[];
	/** この判断が成り立たない文脈 */
	contextualBoundary: string[];
}

/**
 * @summary アポリア（解決不能な緊張関係）
 */
export interface Aporia {
	/** アポリアの識別子 */
	id: string;
	/** 対立する2つの極 */
	poles: [string, string];
	/** 各極の正当性 */
	justificationFor: [string, string];
	/** 過去の判断履歴 */
	pastDecisions: {
		context: string;
		chosenPole: 0 | 1 | "suspended";
		reason: string;
		timestamp: string;
	}[];
	/** 現在の状態 */
	currentStatus: "active" | "suspended" | "reconciled_on_surface";
}

/**
 * @summary 問いサイクル
 */
export interface InquiryCycle {
	/** サイクル識別子 */
	id: string;
	/** 親サイクル（継承がある場合） */
	parentCycleId?: string;
	/** 開始時の問い */
	initialInquiry: Inquiry;
	/** 探求のアプローチ */
	approaches: Approach[];
	/** 反例 */
	counterExamples: CounterExample[];
	/** 統合された判断 */
	integration?: Integration;
	/** 発見されたアポリア */
	aporiae: Aporia[];
	/** 次のサイクルへの問い */
	nextInquiry?: Inquiry;
	/** 現在の段階 */
	currentPhase: ExplorationPhase;
	/** 学びの要約 */
	learnings: string[];
	/** タイムスタンプ */
	startedAt: string;
	updatedAt: string;
}

/**
 * @summary 問い駆動型探求の状態
 */
export interface InquiryDrivenExplorationState {
	/** 現在のサイクル */
	currentCycle: InquiryCycle;
	/** 過去のサイクル */
	cycleHistory: InquiryCycle[];
	/** 追跡中のアポリア */
	trackedAporiae: Aporia[];
	/** 累積された学び */
	cumulativeLearnings: string[];
	/** 探求完了の判定基準 */
	completionCriteria: {
		minCycles: number;
		inquiryDepthReached: InquiryDepth;
		aporiaeAcknowledged: boolean;
		counterExamplesSought: boolean;
	};
}

/**
 * @summary 完了の再定義
 * @description 従来の「完了=答えの発見」ではなく、「完了=問いの深化」として定義する
 */
export interface ExplorationCompletion {
	/** 完了したか（従来の意味ではなく） */
	isComplete: boolean;
	/** 完了の種類 */
	completionType:
		| "inquiry_deepened" // 問いが深まった
		| "aporia_acknowledged" // アポリアを認識した
		| "sufficient_understanding" // 十分な理解に達した
		| "resource_limit" // リソースの限界
		| "diminishing_returns"; // 限界的効用の逆転
	/** 理由 */
	reason: string;
	/** 残留する問い */
	residualInquiries: string[];
	/** 次の探求への推奨 */
	nextExplorationRecommendation?: string;
}

/**
 * 問い駆動型探求クラス
 *
 * 「完了への渇愛」を「探求への好奇心」へ転換するためのコアエンジン。
 * 従来の「タスク完了」概念を、「問いを深めるプロセス」として再定義する。
 */
export class InquiryDrivenExploration {
	private state: InquiryDrivenExplorationState;
	private maxCycles: number;

	constructor(initialQuestion: string, context: string, maxCycles = 10) {
		const initialInquiry: Inquiry = {
			question: initialQuestion,
			kind: this.classifyInquiry(initialQuestion),
			depth: "surface",
			context,
			excludedPossibilities: [],
			timestamp: new Date().toISOString(),
		};

		const initialCycle: InquiryCycle = {
			id: this.generateCycleId(),
			initialInquiry,
			approaches: [],
			counterExamples: [],
			aporiae: [],
			currentPhase: "initial_inquiry",
			learnings: [],
			startedAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		this.state = {
			currentCycle: initialCycle,
			cycleHistory: [],
			trackedAporiae: [],
			cumulativeLearnings: [],
			completionCriteria: {
				minCycles: 3,
				inquiryDepthReached: "structural",
				aporiaeAcknowledged: false,
				counterExamplesSought: false,
			},
		};

		this.maxCycles = maxCycles;
	}

	/**
	 * @summary 現在の段階を進める
	 */
	advancePhase(newPhase: ExplorationPhase): void {
		this.state.currentCycle.currentPhase = newPhase;
		this.state.currentCycle.updatedAt = new Date().toISOString();
	}

	/**
	 * @summary アプローチを追加する
	 */
	addApproach(approach: Approach): void {
		this.state.currentCycle.approaches.push(approach);

		// 問いの深度を更新
		if (approach.perspective.includes("deconstruction")) {
			this.state.currentCycle.initialInquiry.depth = "foundational";
		} else if (approach.perspective.includes("schizoanalysis")) {
			this.state.currentCycle.initialInquiry.depth = "structural";
		}
	}

	/**
	 * @summary 反例を追加する
	 */
	addCounterExample(counterExample: CounterExample): void {
		this.state.currentCycle.counterExamples.push(counterExample);
		this.state.completionCriteria.counterExamplesSought = true;
	}

	/**
	 * @summary アポリアを発見・記録する
	 */
	discoverAporia(poles: [string, string], justificationFor: [string, string]): Aporia {
		const aporia: Aporia = {
			id: this.generateAporiaId(),
			poles,
			justificationFor,
			pastDecisions: [],
			currentStatus: "active",
		};

		this.state.currentCycle.aporiae.push(aporia);
		this.state.trackedAporiae.push(aporia);
		this.state.completionCriteria.aporiaeAcknowledged = true;

		return aporia;
	}

	/**
	 * @summary 統合された判断を設定する
	 */
	setIntegration(integration: Integration): void {
		this.state.currentCycle.integration = integration;
		this.state.currentCycle.currentPhase = "integration";
	}

	/**
	 * @summary 学びを追加する
	 */
	addLearning(learning: string): void {
		this.state.currentCycle.learnings.push(learning);
		this.state.cumulativeLearnings.push(learning);
	}

	/**
	 * @summary 次のサイクルへの問いを設定する
	 */
	setNextInquiry(question: string, context: string): void {
		const currentDepth = this.state.currentCycle.initialInquiry.depth;
		const nextDepth = this.advanceDepth(currentDepth);

		this.state.currentCycle.nextInquiry = {
			question,
			kind: this.classifyInquiry(question),
			depth: nextDepth,
			context,
			excludedPossibilities: this.extractExcludedPossibilities(),
			timestamp: new Date().toISOString(),
		};

		this.state.currentCycle.currentPhase = "new_inquiry";
	}

	/**
	 * @summary 現在のサイクルを完了し、次のサイクルを開始する
	 */
	completeCycleAndStartNext(): boolean {
		// 現在のサイクルを履歴に保存
		this.state.cycleHistory.push(this.state.currentCycle);

		// 次の問いが設定されている場合は新しいサイクルを開始
		if (this.state.currentCycle.nextInquiry) {
			if (this.state.cycleHistory.length >= this.maxCycles) {
				return false; // 最大サイクル数に到達
			}

			const newCycle: InquiryCycle = {
				id: this.generateCycleId(),
				parentCycleId: this.state.currentCycle.id,
				initialInquiry: this.state.currentCycle.nextInquiry,
				approaches: [],
				counterExamples: [],
				aporiae: [],
				currentPhase: "initial_inquiry",
				learnings: [],
				startedAt: new Date().toISOString(),
				updatedAtAt: new Date().toISOString(),
			};

			this.state.currentCycle = newCycle;
			return true;
		}

		return false;
	}

	/**
	 * @summary 探求の完了を判定する
	 */
	evaluateCompletion(): ExplorationCompletion {
		const cycleCount = this.state.cycleHistory.length + 1;
		const { completionCriteria } = this.state;
		const currentDepth = this.state.currentCycle.initialInquiry.depth;

		// 最小サイクル数に到達していない
		if (cycleCount < completionCriteria.minCycles) {
			return {
				isComplete: false,
				completionType: "inquiry_deepened",
				reason: `最小サイクル数（${completionCriteria.minCycles}）に到達していません`,
				residualInquiries: [this.state.currentCycle.initialInquiry.question],
			};
		}

		// アポリアが認識されているか
		if (!completionCriteria.aporiaeAcknowledged) {
			return {
				isComplete: false,
				completionType: "inquiry_deepened",
				reason: "アポリア（解決不能な緊張関係）がまだ認識されていません",
				residualInquiries: [this.state.currentCycle.initialInquiry.question],
			};
		}

		// 反例が検討されているか
		if (!completionCriteria.counterExamplesSought) {
			return {
				isComplete: false,
				completionType: "inquiry_deepened",
				reason: "反例または反証がまだ検討されていません",
				residualInquiries: [this.state.currentCycle.initialInquiry.question],
			};
		}

		// 問いの深度が十分か
		const depthOrder: InquiryDepth[] = ["surface", "structural", "foundational", "aporic"];
		const currentDepthIndex = depthOrder.indexOf(currentDepth);
		const requiredDepthIndex = depthOrder.indexOf(completionCriteria.inquiryDepthReached);

		if (currentDepthIndex < requiredDepthIndex) {
			return {
				isComplete: false,
				completionType: "inquiry_deepened",
				reason: `問いの深度が「${completionCriteria.inquiryDepthReached}」に到達していません（現在: ${currentDepth}）`,
				residualInquiries: [this.state.currentCycle.initialInquiry.question],
			};
		}

		// 限界的効用の逆転をチェック
		if (this.checkDiminishingReturns()) {
			return {
				isComplete: true,
				completionType: "diminishing_returns",
				reason: "これ以上の探求の限界的効用が低下しています",
				residualInquiries: this.state.currentCycle.integration?.residualUncertainty || [],
				nextExplorationRecommendation: "別の角度からの探求を検討してください",
			};
		}

		// 十分な理解に達した
		return {
			isComplete: true,
			completionType: "sufficient_understanding",
			reason: "問いが十分に深められ、アポリアが認識され、反例が検討されました",
			residualInquiries: this.state.currentCycle.integration?.residualUncertainty || [],
		};
	}

	/**
	 * @summary 現在の状態を取得する
	 */
	getState(): InquiryDrivenExplorationState {
		return this.state;
	}

	/**
	 * @summary 追跡中のアポリアを取得する
	 */
	getTrackedAporiae(): Aporia[] {
		return this.state.trackedAporiae;
	}

	/**
	 * @summary 累積された学びを取得する
	 */
	getCumulativeLearnings(): string[] {
		return this.state.cumulativeLearnings;
	}

	// --- プライベートメソッド ---

	private generateCycleId(): string {
		return `cycle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	private generateAporiaId(): string {
		return `aporia_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	private classifyInquiry(question: string): Inquiry["kind"] {
		if (question.includes("なぜ") || question.includes("Why")) {
			return "explanatory";
		}
		if (question.includes("べき") || question.includes("すべき") || question.includes("Should")) {
			return "normative";
		}
		if (
			question.includes("矛盾") ||
			question.includes("緊張") ||
			question.includes("ジレンマ") ||
			question.includes("aporia")
		) {
			return "aporic";
		}
		return "descriptive";
	}

	private advanceDepth(currentDepth: InquiryDepth): InquiryDepth {
		const depthOrder: InquiryDepth[] = ["surface", "structural", "foundational", "aporic"];
		const currentIndex = depthOrder.indexOf(currentDepth);
		const nextIndex = Math.min(currentIndex + 1, depthOrder.length - 1);
		return depthOrder[nextIndex];
	}

	private extractExcludedPossibilities(): string[] {
		const excluded: string[] = [];

		// 各アプローチの限界から除外された可能性を抽出
		for (const approach of this.state.currentCycle.approaches) {
			if (approach.limitations) {
				excluded.push(approach.limitations);
			}
		}

		// 統合における文脈的境界から除外された可能性を抽出
		if (this.state.currentCycle.integration?.contextualBoundary) {
			excluded.push(...this.state.currentCycle.integration.contextualBoundary);
		}

		return excluded;
	}

	private checkDiminishingReturns(): boolean {
		// 直近3サイクルの学びの新規性をチェック
		const recentCycles = this.state.cycleHistory.slice(-3);

		if (recentCycles.length < 3) {
			return false;
		}

		// 各サイクルの学びの数を比較
		const learningCounts = recentCycles.map((c) => c.learnings.length);

		// 学びの数が有意に減少傾向にある場合（最初の半分以下）、限界的効用が逆転していると判断
		// すべてのサイクルで学びの数が同じ場合は「逆転」と見なさない
		const isDecreasing =
			learningCounts[2] < learningCounts[1] && learningCounts[1] < learningCounts[0];
		const isSignificantlyReduced = learningCounts[2] < learningCounts[0] / 2;

		return isDecreasing || isSignificantlyReduced;
	}
}
