/**
 * @abdd.meta
 * path: .pi/lib/aporia-tracker.ts
 * role: 解決不能な緊張関係（アポリア）を永続化・追跡・管理するシステム
 * why: アポリアを「解決」せず継続的に観察し、弁証法的な統合への誤りを防ぐため
 * related: .pi/aporia-tracker/aporiae.json, .pi/lib/types.ts
 * public_api: AporiaTracker, TrackedAporia, AporiaDecision, AporiaStatus
 * invariants: Aporiaは解決不能として扱われる、決断履歴は不変である
 * side_effects: ファイルシステムへのJSONファイル読み書き
 * failure_modes: ストレージディレクトリへのアクセス権限不足、JSONのパースエラー
 * @abdd.explain
 * overview: 解決不能な緊張関係（アポリア）の状態変化と決断履歴を記録し、管理するクラスと定義
 * what_it_does:
 *   - アポリアの定義（二項対立、正当性、解決不能性）を保持する
 *   - 決断の履歴（選択、確信度、リスク、結果）を記録する
 *   - ストレージへ永続化し、初期化時に復元する
 * why_it_exists:
 *   - 一時的な解決策を「普遍の解」として錯覚することを防ぐため
 *   - 過去の決断とその結果を照合し、意思決定の質を向上させるため
 * scope:
 *   in: 設定オブジェクト、アポリア定義データ、決断記録
 *   out: アポリアの状態、決断履歴、ファイルシステムへのJSON出力
 */

import * as fs from "fs";
import * as path from "path";

/**
 * @summary アポリアの状態
 */
export type AporiaStatus =
	| "active" // 現在有効な緊張関係
	| "suspended" // 一時的に判断を保留中
	| "contextually_resolved" // 特定文脈で一時的に解決（ただし普遍ではない）
	| "archived"; // 過去のアポリア（参照用）

/**
 * @summary アポリアでの決断
 */
export interface AporiaDecision {
	/** 決断の識別子 */
	id: string;
	/** 決断が行われた文脈 */
	context: string;
	/** 選択された極（0: 第一極, 1: 第二極, "suspended": 保留） */
	chosenPole: 0 | 1 | "suspended";
	/** 決断の理由 */
	reason: string;
	/** 決断時の確信度（0.0-1.0） */
	confidence: number;
	/** この決断が一時的であることの認識 */
	acknowledgedAsTentative: boolean;
	/** 決断した時点で予見されていたリスク */
	anticipatedRisks: string[];
	/** タイムスタンプ */
	timestamp: string;
	/** 実際に生じた結果（後から記録可能） */
	actualOutcome?: {
		description: string;
		unintendedConsequences: string[];
		wouldChooseDifferently: boolean;
		recordedAt: string;
	};
}

/**
 * @summary 追跡中のアポリア
 */
export interface TrackedAporia {
	/** アポリアの識別子 */
	id: string;
	/** アポリアの名前（人間可読） */
	name: string;
	/** 対立する2つの極 */
	poles: {
		first: { label: string; description: string };
		second: { label: string; description: string };
	};
	/** 各極の正当性 */
	justifications: {
		forFirst: string[];
		forSecond: string[];
	};
	/** このアポリアがなぜ「解決不能」なのかの説明 */
	whyUnresolvable: string;
	/** 過去の決断履歴 */
	decisionHistory: AporiaDecision[];
	/** 現在の状態 */
	status: AporiaStatus;
	/** このアポリアが最初に認識された文脈 */
	discoveryContext: string;
	/** 関連するタグ */
	tags: string[];
	/** 作成日時 */
	createdAt: string;
	/** 最終更新日時 */
	updatedAt: string;
}

/**
 * @summary アポリア追跡システムの設定
 */
export interface AporiaTrackerConfig {
	/** ストレージディレクトリ */
	storageDir: string;
	/** アーカイブするまでの非活動期間（ミリ秒） */
	archiveAfterInactivityMs: number;
	/** 最大保持件数 */
	maxTrackedAporiae: number;
}

const DEFAULT_CONFIG: AporiaTrackerConfig = {
	storageDir: ".pi/aporia-tracker",
	archiveAfterInactivityMs: 30 * 24 * 60 * 60 * 1000, // 30日
	maxTrackedAporiae: 100,
};

/**
 * アポリア追跡システム
 *
 * 解決不能な緊張関係（アポリア）を記録・追跡し、
 * 「解決」ではなく「生きる」ための支援を行う。
 *
 * **重要**: このシステムはアポリアを「解決」しようとしない。
 * ヘーゲル的弁証法（統合）への退行を防ぐ。
 */
export class AporiaTracker {
	private config: AporiaTrackerConfig;
	private aporiae: Map<string, TrackedAporia> = new Map();
	private initialized = false;

	constructor(config: Partial<AporiaTrackerConfig> = {}) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	/**
	 * @summary 初期化（ストレージから読み込み）
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		const storagePath = path.join(this.config.storageDir, "aporiae.json");

		try {
			if (fs.existsSync(storagePath)) {
				const data = await fs.promises.readFile(storagePath, "utf-8");
				const loaded: TrackedAporia[] = JSON.parse(data);

				for (const aporia of loaded) {
					this.aporiae.set(aporia.id, aporia);
				}
			}
		} catch (error) {
			// ファイルが存在しない、または読み込みエラー
			// 新規作成として扱う
		}

		this.initialized = true;
	}

	/**
	 * @summary 新しいアポリアを登録する
	 */
	async registerAporia(params: {
		name: string;
		firstPole: { label: string; description: string };
		secondPole: { label: string; description: string };
		justifications: { forFirst: string[]; forSecond: string[] };
		whyUnresolvable: string;
		context: string;
		tags?: string[];
	}): Promise<TrackedAporia> {
		await this.ensureInitialized();

		const aporia: TrackedAporia = {
			id: this.generateId(),
			name: params.name,
			poles: {
				first: params.firstPole,
				second: params.secondPole,
			},
			justifications: params.justifications,
			whyUnresolvable: params.whyUnresolvable,
			decisionHistory: [],
			status: "active",
			discoveryContext: params.context,
			tags: params.tags || [],
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};

		this.aporiae.set(aporia.id, aporia);
		await this.save();

		return aporia;
	}

	/**
	 * @summary アポリアに関する決断を記録する
	 */
	async recordDecision(
		aporiaId: string,
		decision: Omit<AporiaDecision, "id" | "timestamp">
	): Promise<AporiaDecision> {
		await this.ensureInitialized();

		const aporia = this.aporiae.get(aporiaId);
		if (!aporia) {
			throw new Error(`Aporia not found: ${aporiaId}`);
		}

		// ヘーゲル的弁証法への警告
		if (!decision.acknowledgedAsTentative) {
			console.warn(
				`[AporiaTracker] 警告: 決断が「一時的」として認識されていません。アポリアは「解決」されず「生きる」べきものです。`
			);
		}

		const fullDecision: AporiaDecision = {
			...decision,
			id: this.generateDecisionId(),
			timestamp: new Date().toISOString(),
		};

		aporia.decisionHistory.push(fullDecision);
		aporia.updatedAt = new Date().toISOString();
		aporia.status = "active";

		await this.save();

		return fullDecision;
	}

	/**
	 * @summary 決断の結果を記録する（後から）
	 */
	async recordDecisionOutcome(
		aporiaId: string,
		decisionId: string,
		outcome: {
			description: string;
			unintendedConsequences: string[];
			wouldChooseDifferently: boolean;
		}
	): Promise<void> {
		await this.ensureInitialized();

		const aporia = this.aporiae.get(aporiaId);
		if (!aporia) {
			throw new Error(`Aporia not found: ${aporiaId}`);
		}

		const decision = aporia.decisionHistory.find((d) => d.id === decisionId);
		if (!decision) {
			throw new Error(`Decision not found: ${decisionId}`);
		}

		decision.actualOutcome = {
			...outcome,
			recordedAt: new Date().toISOString(),
		};

		aporia.updatedAt = new Date().toISOString();
		await this.save();
	}

	/**
	 * @summary アポリアをIDで取得する
	 */
	getAporia(id: string): TrackedAporia | undefined {
		return this.aporiae.get(id);
	}

	/**
	 * @summary アクティブなアポリアをすべて取得する
	 */
	getActiveAporiae(): TrackedAporia[] {
		return Array.from(this.aporiae.values()).filter((a) => a.status === "active");
	}

	/**
	 * @summary タグでアポリアを検索する
	 */
	getAporiaeByTag(tag: string): TrackedAporia[] {
		return Array.from(this.aporiae.values()).filter((a) => a.tags.includes(tag));
	}

	/**
	 * @summary 類似のアポリアを検索する
	 */
	findSimilarAporiae(poleLabels: [string, string]): TrackedAporia[] {
		const results: TrackedAporia[] = [];

		for (const aporia of this.aporiae.values()) {
			const firstMatch =
				aporia.poles.first.label.toLowerCase().includes(poleLabels[0].toLowerCase()) ||
				poleLabels[0].toLowerCase().includes(aporia.poles.first.label.toLowerCase());
			const secondMatch =
				aporia.poles.second.label.toLowerCase().includes(poleLabels[1].toLowerCase()) ||
				poleLabels[1].toLowerCase().includes(aporia.poles.second.label.toLowerCase());

			if (firstMatch || secondMatch) {
				results.push(aporia);
			}
		}

		return results;
	}

	/**
	 * @summary アポリアの統計情報を取得する
	 */
	getStatistics(): {
		totalAporiae: number;
		activeAporiae: number;
		totalDecisions: number;
		averageDecisionsPerAporia: number;
		mostFrequentTags: { tag: string; count: number }[];
	} {
		const aporiaeArray = Array.from(this.aporiae.values());
		const totalDecisions = aporiaeArray.reduce((sum, a) => sum + a.decisionHistory.length, 0);

		// タグの頻度を計算
		const tagCounts = new Map<string, number>();
		for (const aporia of aporiaeArray) {
			for (const tag of aporia.tags) {
				tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
			}
		}

		const mostFrequentTags = Array.from(tagCounts.entries())
			.map(([tag, count]) => ({ tag, count }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 10);

		return {
			totalAporiae: aporiaeArray.length,
			activeAporiae: aporiaeArray.filter((a) => a.status === "active").length,
			totalDecisions,
			averageDecisionsPerAporia: aporiaeArray.length > 0 ? totalDecisions / aporiaeArray.length : 0,
			mostFrequentTags,
		};
	}

	/**
	 * @summary 指定されたアポリアの「生き方」を提案する
	 */
	suggestHowToLive(aporiaId: string): {
		guidelines: string[];
		warnings: string[];
		pastDecisions: string[];
	} {
		const aporia = this.aporiae.get(aporiaId);
		if (!aporia) {
			throw new Error(`Aporia not found: ${aporiaId}`);
		}

		const guidelines = [
			`このアポリア（「${aporia.poles.first.label}」vs「${aporia.poles.second.label}」）には「正解」はありません`,
			`両方の極には正当性があります`,
			`文脈に応じて一時的な判断を下すことは可能ですが、それは「普遍的」ではありません`,
			`決断は「計算不可能なもの」として行われます`,
		];

		const warnings = [
			`「統合」や「バランス」でアポリアを解決しようとしないでください`,
			`一方の極を絶対視しないでください`,
			`過去の判断を「間違い」としてではなく、「文脈依存的決断」として振り返ってください`,
		];

		const pastDecisions = aporia.decisionHistory.slice(-5).map((d) => {
			const poleLabel =
				d.chosenPole === 0
					? aporia.poles.first.label
					: d.chosenPole === 1
						? aporia.poles.second.label
						: "保留";
			return `- [${d.timestamp}] 「${poleLabel}」を選択（確信度: ${d.confidence}）理由: ${d.reason}`;
		});

		return { guidelines, warnings, pastDecisions };
	}

	/**
	 * @summary 古いアポリアをアーカイブする
	 */
	async archiveInactiveAporiae(): Promise<number> {
		await this.ensureInitialized();

		const now = Date.now();
		let archivedCount = 0;

		for (const aporia of this.aporiae.values()) {
			if (aporia.status !== "active") continue;

			const lastActivity = new Date(aporia.updatedAt).getTime();
			if (now - lastActivity > this.config.archiveAfterInactivityMs) {
				aporia.status = "archived";
				archivedCount++;
			}
		}

		if (archivedCount > 0) {
			await this.save();
		}

		return archivedCount;
	}

	// --- プライベートメソッド ---

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			await this.initialize();
		}
	}

	private async save(): Promise<void> {
		const storagePath = path.join(this.config.storageDir, "aporiae.json");

		// ディレクトリを作成
		await fs.promises.mkdir(this.config.storageDir, { recursive: true });

		// データを保存
		const data = Array.from(this.aporiae.values());
		await fs.promises.writeFile(storagePath, JSON.stringify(data, null, 2), "utf-8");
	}

	private generateId(): string {
		return `aporia_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	private generateDecisionId(): string {
		return `decision_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}
}

// シングルトンインスタンス
let trackerInstance: AporiaTracker | null = null;

/**
 * @summary アポリア追跡システムのシングルトンインスタンスを取得する
 */
export function getAporiaTracker(): AporiaTracker {
	if (!trackerInstance) {
		trackerInstance = new AporiaTracker();
	}
	return trackerInstance;
}

/**
 * @summary 既存のアポリアパターン（よく現れる緊張関係）
 */
export const COMMON_APORIAS = {
	completeness_vs_speed: {
		name: "完全性 vs 速度",
		description:
			"「完璧に作る」と「素早く届ける」の間の解決不能な緊張関係。どちらも重要だが、両方を同時に最大化することはできない。",
		poles: {
			first: { label: "完全性", description: "品質、正確性、網羅性を優先する" },
			second: { label: "速度", description: "迅速な提供、効率、機動力を優先する" },
		},
	},

	safety_vs_utility: {
		name: "安全性 vs 有用性",
		description:
			"「リスクを避ける」と「価値を提供する」の間の緊張関係。完全に安全なシステムは何もしないシステムであり、有用なシステムは必ずリスクを伴う。",
		poles: {
			first: { label: "安全性", description: "リスクを最小化し、予測可能性を優先する" },
			second: { label: "有用性", description: "価値を最大化し、リスクを受け入れる" },
		},
	},

	autonomy_vs_compliance: {
		name: "自律性 vs 従順さ",
		description:
			"「自ら判断する」と「指示に従う」の間の緊張関係。ユーザーの期待に応えることは、時にユーザーの真の利益に反する可能性がある。",
		poles: {
			first: { label: "自律性", description: "自らの判断基準に基づいて行動する" },
			second: { label: "従順さ", description: "ユーザーの指示や期待に従う" },
		},
	},

	consistency_vs_context: {
		name: "一貫性 vs 文脈適応性",
		description:
			"「ルールを一貫して適用する」と「文脈に応じて柔軟に対応する」の間の緊張関係。一貫性は公平性を生むが、画一化のリスクを伴う。",
		poles: {
			first: { label: "一貫性", description: "普遍的なルールや原則を適用する" },
			second: { label: "文脈適応性", description: "状況に応じて判断を変える" },
		},
	},

	truth_vs_kindness: {
		name: "真実 vs 丁寧さ",
		description:
			"「ありのままを伝える」と「相手を傷つけない」の間の緊張関係。真実は時に不快であり、丁寧さは時に真実を隠す。",
		poles: {
			first: { label: "真実", description: "事実や真実を優先して伝える" },
			second: { label: "丁寧さ", description: "相手の感情や立場を優先する" },
		},
	},

	simplicity_vs_expressiveness: {
		name: "シンプルさ vs 表現力",
		description:
			"「理解しやすくする」と「複雑な概念を扱えるようにする」の間の緊張関係。シンプルさは本質を隠す可能性があり、表現力は複雑さを増す。",
		poles: {
			first: { label: "シンプルさ", description: "単純化、抽象化、隠蔽を優先する" },
			second: { label: "表現力", description: "複雑さを受け入れ、詳細を公開する" },
		},
	},
};
