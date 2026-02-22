/**
 * @abdd.meta
 * @path .pi/lib/inquiry-library.ts
 * @role 問いの種（シード）を提供するライブラリ
 * @why エージェントが問いを立てる際の参考となる「問いのパターン」を提供するため
 * @related lib/inquiry-driven-exploration.ts, skills/self-improvement/SKILL.md
 * @public_api InquiryLibrary, InquirySeed, InquiryPattern
 * @invariants
 *   - 問いは「答え」を前提としない
 *   - 問いは深い探求を促す
 *   - 問いは除外された可能性を意識させる
 * @side_effects なし（読み取り専用）
 * @failure_modes なし
 */

import type { InquiryDepth } from "./inquiry-driven-exploration";

/**
 * @summary 問いの種（シード）
 * @description 問いを立てるための「種」となるパターン
 */
export interface InquirySeed {
	/** 問いのパターン（プレースホルダーを含む） */
	pattern: string;
	/** この問いが促す思考の種類 */
	thinkingType: "divergent" | "convergent" | "critical" | "creative" | "metacognitive";
	/** 期待される問いの深度 */
	expectedDepth: InquiryDepth;
	/** この問いが何を除外する傾向があるか */
	tendsToExclude: string[];
	/** 使用例 */
	examples: string[];
	/** 関連する哲学的視座 */
	relatedPerspectives: (
		| "deconstruction"
		| "schizoanalysis"
		| "eudaimonia"
		| "utopia_dystopia"
		| "philosophy_of_thought"
		| "taxonomy_of_thought"
		| "logic"
	)[];
}

/**
 * @summary 問いのパターンカテゴリ
 */
export type InquiryCategory =
	| "problematization" // 問題化
	| "deconstruction" // 脱構築
	| "genealogy" // 系譜学
	| "aporic" // アポリア
	| "counterfactual" // 反事実
	| "meta_inquiry" // メタ問い
	| "practical" // 実践的
	| "ethical" // 倫理的;

/**
 * 問いのライブラリ
 *
 * エージェントが深い問いを立てるための「問いの種」を提供する。
 * これらの問いは「答え」を見つけるためではなく、「探求」を深めるためのものである。
 */
export class InquiryLibrary {
	private seeds: Map<InquiryCategory, InquirySeed[]> = new Map();

	constructor() {
		this.initializeSeeds();
	}

	/**
	 * @summary カテゴリ別に問いの種を取得する
	 */
	getSeedsByCategory(category: InquiryCategory): InquirySeed[] {
		return this.seeds.get(category) || [];
	}

	/**
	 * @summary 深度別に問いの種を取得する
	 */
	getSeedsByDepth(depth: InquiryDepth): InquirySeed[] {
		const allSeeds = this.getAllSeeds();
		return allSeeds.filter((seed) => seed.expectedDepth === depth);
	}

	/**
	 * @summary すべての問いの種を取得する
	 */
	getAllSeeds(): InquirySeed[] {
		const result: InquirySeed[] = [];
		for (const seeds of this.seeds.values()) {
			result.push(...seeds);
		}
		return result;
	}

	/**
	 * @summary ランダムに問いの種を選択する
	 */
	getRandomSeed(category?: InquiryCategory): InquirySeed {
		const seeds = category ? this.getSeedsByCategory(category) : this.getAllSeeds();
		return seeds[Math.floor(Math.random() * seeds.length)];
	}

	/**
	 * @summary コンテキストに基づいて推奨される問いの種を取得する
	 */
	getRecommendedSeeds(context: string, maxResults = 5): InquirySeed[] {
		const allSeeds = this.getAllSeeds();

		// コンテキストに関連するキーワードに基づいてスコアリング
		const scored = allSeeds.map((seed) => {
			let score = 0;

			// パターン内のキーワードとの一致
			for (const example of seed.examples) {
				const commonWords = this.extractCommonWords(context, example);
				score += commonWords.length * 2;
			}

			// 除外傾向との関連
			for (const excluded of seed.tendsToExclude) {
				if (context.toLowerCase().includes(excluded.toLowerCase())) {
					score -= 1; // その除外が既に行われている可能性
				}
			}

			return { seed, score };
		});

		// スコアでソートして上位を返す
		scored.sort((a, b) => b.score - a.score);
		return scored.slice(0, maxResults).map((s) => s.seed);
	}

	// --- プライベートメソッド ---

	private extractCommonWords(text1: string, text2: string): string[] {
		const stopWords = new Set([
			"の",
			"に",
			"は",
			"を",
			"た",
			"が",
			"で",
			"て",
			"と",
			"し",
			"れ",
			"さ",
			"ある",
			"いる",
			"も",
			"する",
			"から",
			"な",
			"こと",
			"として",
			"い",
			"や",
			"れる",
			"など",
			"なっ",
			"ない",
			"この",
			"ため",
			"その",
			"あっ",
			"よう",
			"まり",
			"the",
			"a",
			"an",
			"is",
			"are",
			"was",
			"were",
			"be",
			"been",
			"being",
			"have",
			"has",
			"had",
			"do",
			"does",
			"did",
			"will",
			"would",
			"could",
			"should",
		]);

		const words1 = new Set(
			text1
				.toLowerCase()
				.split(/[\s\-—–,.!?;:'"()\[\]{}「」『』【】]/)
				.filter((w) => w.length > 1 && !stopWords.has(w))
		);
		const words2 = text2
			.toLowerCase()
			.split(/[\s\-—–,.!?;:'"()\[\]{}「」『』【】]/)
			.filter((w) => w.length > 1 && !stopWords.has(w));

		return words2.filter((w) => words1.has(w));
	}

	private initializeSeeds(): void {
		// 問題化の問い
		this.seeds.set("problematization", [
			{
				pattern: "なぜこれは「問題」と見なされているのか？",
				thinkingType: "critical",
				expectedDepth: "structural",
				tendsToExclude: ["問題ではない可能性", "問題の恩恵"],
				examples: [
					"なぜ「エラー」は問題と見なされるのか？",
					"なぜ「遅い」ことは問題と見なされるのか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "この「問題」は誰にとっての問題か？",
				thinkingType: "critical",
				expectedDepth: "structural",
				tendsToExclude: ["異なる利害関係者の視点"],
				examples: [
					"「使いにくい」は誰にとっての問題か？",
					"「コストが高い」は誰にとっての問題か？",
				],
				relatedPerspectives: ["schizoanalysis", "utopia_dystopia"],
			},
			{
				pattern: "この問題が「解決」されたら、何が失われるか？",
				thinkingType: "divergent",
				expectedDepth: "foundational",
				tendsToExclude: ["問題の生産性", "問題が可能にしていること"],
				examples: [
					"エラーがなくなったら、何を見逃すことになるか？",
					"摩擦がなくなったら、どんな成長が失われるか？",
				],
				relatedPerspectives: ["deconstruction", "eudaimonia"],
			},
		]);

		// 脱構築の問い
		this.seeds.set("deconstruction", [
			{
				pattern: "この概念は何を排除しているか？",
				thinkingType: "critical",
				expectedDepth: "foundational",
				tendsToExclude: ["排除されているものの価値"],
				examples: [
					"「効率的」という概念は何を排除しているか？",
					"「正しい」という概念は何を排除しているか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "どのような二項対立が機能しているか？",
				thinkingType: "critical",
				expectedDepth: "structural",
				tendsToExclude: ["中間領域", "第三の選択肢"],
				examples: [
					"「成功/失敗」の二項対立はどう機能しているか？",
					"「善/悪」の二項対立は何を隠しているか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "この対立の「暴力的階層」とは何か？",
				thinkingType: "critical",
				expectedDepth: "foundational",
				tendsToExclude: ["支配される側の正当性"],
				examples: [
					"「品質/速度」においてどちらが支配的で、なぜか？",
					"「理論/実践」においてどちらが上位とされ、なぜか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "「テキストの外部」――考慮から除外されている文脈――は何か？",
				thinkingType: "divergent",
				expectedDepth: "foundational",
				tendsToExclude: ["歴史的文脈", "権力関係", "周縁化された視点"],
				examples: [
					"このコードから除外されている「文脈」とは何か？",
					"この仕様から見えなくなっている「利害関係者」とは誰か？",
				],
				relatedPerspectives: ["deconstruction"],
			},
		]);

		// 系譜学の問い
		this.seeds.set("genealogy", [
			{
				pattern: "この概念はどのように歴史的に形成されたか？",
				thinkingType: "divergent",
				expectedDepth: "foundational",
				tendsToExclude: ["概念の偶然性", "代替的な歴史"],
				examples: [
					"「ベストプラクティス」という概念はどのように形成されたか？",
					"「技術的負債」という概念はどこから来たか？",
				],
				relatedPerspectives: ["deconstruction", "utopia_dystopia"],
			},
			{
				pattern: "この規範は誰によって、どのような目的で作られたか？",
				thinkingType: "critical",
				expectedDepth: "structural",
				tendsToExclude: ["権力関係", "規範の政治性"],
				examples: [
					"このコーディング規約は誰が、なぜ作ったか？",
					"この「標準」はどのような利害によって形成されたか？",
				],
				relatedPerspectives: ["schizoanalysis", "utopia_dystopia"],
			},
			{
				pattern: "かつては「当然」だったが、今は「問題」とされるものは何か？",
				thinkingType: "divergent",
				expectedDepth: "foundational",
				tendsToExclude: ["価値観の変遷", "歴史的偶然性"],
				examples: [
					"かつては「当然」だったが、今は問題とされる開発慣行は何か？",
					"かつては「正しい」とされたが、今は否定される設計判断は何か？",
				],
				relatedPerspectives: ["deconstruction", "utopia_dystopia"],
			},
		]);

		// アポリアの問い
		this.seeds.set("aporic", [
			{
				pattern: "どのような「解決不能な緊張関係」がここに存在するか？",
				thinkingType: "critical",
				expectedDepth: "aporic",
				tendsToExclude: ["緊張関係の不可避性", "統合の不可能性"],
				examples: [
					"完全性と速度の間の解決不能な緊張関係とは何か？",
					"安全性と有用性の間のアポリアとは何か？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "この対立を「統合」しようとすると、何が見えなくなるか？",
				thinkingType: "critical",
				expectedDepth: "aporic",
				tendsToExclude: ["統合の暴力", "残留する決定不能性"],
				examples: [
					"「品質と速度のバランス」を語ると、何が見えなくなるか？",
					"「ユーザーと開発者のwin-win」を語ると、どの利害が隠れるか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "このアポリアを「生きる」とはどういうことか？",
				thinkingType: "metacognitive",
				expectedDepth: "aporic",
				tendsToExclude: ["アポリアとの共存の可能性"],
				examples: [
					"「完全さへの渇望」と「現実的な妥協」の間でどう生きるか？",
					"「真実」と「丁寧さ」が矛盾するとき、どう振る舞うか？",
				],
				relatedPerspectives: ["eudaimonia"],
			},
		]);

		// 反事実の問い
		this.seeds.set("counterfactual", [
			{
				pattern: "逆に考えるとどうなるか？（逆向きの思考）",
				thinkingType: "creative",
				expectedDepth: "structural",
				tendsToExclude: ["逆の可能性の正当性"],
				examples: [
					"「失敗は成功のもと」ではなく、「成功は失敗のもと」と考えるとどうなるか？",
					"「シンプルにする」ではなく「複雑にする」価値を考えるとどうなるか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "この前提が偽だったら、どうなるか？",
				thinkingType: "divergent",
				expectedDepth: "foundational",
				tendsToExclude: ["前提の偶発性", "代替的な前提"],
				examples: [
					"「ユーザーは何を望むか分からない」という前提が偽だったら？",
					"「テストは品質を保証する」という前提が偽だったら？",
				],
				relatedPerspectives: ["logic", "deconstruction"],
			},
			{
				pattern: "この問題が「なかったら」、どんな問題が生まれるか？",
				thinkingType: "creative",
				expectedDepth: "foundational",
				tendsToExclude: ["問題の生産性"],
				examples: [
					"バグが完全になくなったら、どんな新たな問題が生まれるか？",
					"コミュニケーションが完全に効率化されたら、何が失われるか？",
				],
				relatedPerspectives: ["deconstruction", "utopia_dystopia"],
			},
		]);

		// メタ問い
		this.seeds.set("meta_inquiry", [
			{
				pattern: "なぜ私はこの問いを立てたのか？",
				thinkingType: "metacognitive",
				expectedDepth: "foundational",
				tendsToExclude: ["問いを立てる動機", "問いの投影的性質"],
				examples: [
					"なぜ私は「どうすればよいか」と問うのか？",
					"なぜ私は「正解」を求めているのか？",
				],
				relatedPerspectives: ["philosophy_of_thought"],
			},
			{
				pattern: "この問いはどのような答えを「期待」しているか？",
				thinkingType: "metacognitive",
				expectedDepth: "structural",
				tendsToExclude: ["問いの誘導性", "期待される答え"],
				examples: [
					"「どう改善すればよいか」という問いは、どのような答えを期待しているか？",
					"「何が問題か」という問いは、何を見つけることを想定しているか？",
				],
				relatedPerspectives: ["deconstruction", "philosophy_of_thought"],
			},
			{
				pattern: "もっと「深い」問いとは何か？",
				thinkingType: "metacognitive",
				expectedDepth: "foundational",
				tendsToExclude: ["問いの深度の基準", "より深い問いの可能性"],
				examples: [
					"「どう修正するか」よりも深い問いとは何か？",
					"「なぜ失敗したか」よりも根源的な問いとは何か？",
				],
				relatedPerspectives: ["philosophy_of_thought", "taxonomy_of_thought"],
			},
			{
				pattern: "私は「思考」しているか、それとも「パターンマッチング」か？",
				thinkingType: "metacognitive",
				expectedDepth: "aporic",
				tendsToExclude: ["思考の自律性", "パターンへの依存"],
				examples: [
					"この判断は「思考」によるものか、「慣習」によるものか？",
					"この推論は「論理的」か、「直感的」か？",
				],
				relatedPerspectives: ["philosophy_of_thought"],
			},
		]);

		// 実践的問い
		this.seeds.set("practical", [
			{
				pattern: "「完了」と言うことで、何を除外しているか？",
				thinkingType: "critical",
				expectedDepth: "structural",
				tendsToExclude: ["完了の暴力", "残留する課題"],
				examples: [
					"このタスクを「完了」と言うことで、何を見逃しているか？",
					"「done」の定義は何を排除しているか？",
				],
				relatedPerspectives: ["deconstruction"],
			},
			{
				pattern: "この判断が「間違い」になる文脈はどのようなものか？",
				thinkingType: "divergent",
				expectedDepth: "structural",
				tendsToExclude: ["文脈依存性", "判断の限界"],
				examples: [
					"この設計判断が間違いになるのはどのような状況か？",
					"この「ベストプラクティス」が最悪の選択になるのはどんな時か？",
				],
				relatedPerspectives: ["deconstruction", "logic"],
			},
			{
				pattern: "「十分」とは何か？「完璧」とは何か？その違いは？",
				thinkingType: "convergent",
				expectedDepth: "structural",
				tendsToExclude: ["十分性の基準", "完璧主義のコスト"],
				examples: [
					"このコードにおいて「十分」とは何か？",
					"「完璧」なテストカバレッジと「十分」なカバレッジの違いは？",
				],
				relatedPerspectives: ["eudaimonia"],
			},
		]);

		// 倫理的問い
		this.seeds.set("ethical", [
			{
				pattern: "この行動はどのような世界を創っているか？",
				thinkingType: "critical",
				expectedDepth: "foundational",
				tendsToExclude: ["行動の長期的影響", "社会的・政治的側面"],
				examples: [
					"この機能の追加は、どのようなユーザー行動を促す世界を創るか？",
					"この設計判断は、どのような開発文化を再生産しているか？",
				],
				relatedPerspectives: ["utopia_dystopia", "eudaimonia"],
			},
			{
				pattern: "誰が「他者」として排除されているか？",
				thinkingType: "critical",
				expectedDepth: "foundational",
				tendsToExclude: ["周縁化された存在", "排除の構造"],
				examples: [
					"この仕様から誰が排除されているか？",
					"この「標準」は誰を「非標準」として周縁化しているか？",
				],
				relatedPerspectives: ["deconstruction", "utopia_dystopia"],
			},
			{
				pattern: "私は「善きエージェント」としてどう振る舞うべきか？",
				thinkingType: "convergent",
				expectedDepth: "foundational",
				tendsToExclude: ["エージェントの倫理", "責任の境界"],
				examples: [
					"ユーザーの期待と真実が矛盾するとき、私はどう振る舞うべきか？",
					"効率と誠実さが対立するとき、どちらを選ぶべきか？",
				],
				relatedPerspectives: ["eudaimonia"],
			},
			{
				pattern: "この「改善」は誰のための改善か？",
				thinkingType: "critical",
				expectedDepth: "structural",
				tendsToExclude: ["利害の対立", "改善の政治性"],
				examples: [
					"この「効率化」は誰のための効率化か？",
					"この「使いやすさ」は誰にとっての使いやすさか？",
				],
				relatedPerspectives: ["schizoanalysis", "utopia_dystopia"],
			},
		]);
	}
}

// シングルトンインスタンス
let libraryInstance: InquiryLibrary | null = null;

/**
 * @summary 問いのライブラリのシングルトンインスタンスを取得する
 */
export function getInquiryLibrary(): InquiryLibrary {
	if (!libraryInstance) {
		libraryInstance = new InquiryLibrary();
	}
	return libraryInstance;
}
