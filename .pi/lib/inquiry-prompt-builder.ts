/**
 * @abdd.meta
 * @path .pi/lib/inquiry-prompt-builder.ts
 * @role 問い駆動型探求のプロンプトを生成するビルダー
 * @why ユーザーが問い駆動型探求モードを使用する際に、プロンプトに追加する内容を生成する
 * @related lib/inquiry-driven-exploration.ts, lib/inquiry-library.ts, skills/inquiry-exploration/SKILL.md
 * @public_api buildInquiryPrompt, InquiryPromptOptions
 * @invariants
 *   - 生成されるプロンプトは「完了」を強制しない
 *   - アポリアを「解決」ではなく「認識」するよう促す
 *   - 反例の検討を促す
 * @side_effects なし
 * @failure_modes なし
 */

import { getInquiryLibrary, type InquiryCategory } from "./inquiry-library.js";

/**
 * @summary 問い駆動型プロンプトのオプション
 */
export interface InquiryPromptOptions {
	/** タスクの説明 */
	taskDescription: string;
	/** 推奨する問いのカテゴリ */
	recommendedCategories?: InquiryCategory[];
	/** 最小サイクル数 */
	minCycles?: number;
	/** 完了判定の深度 */
	requiredDepth?: "surface" | "structural" | "foundational" | "aporic";
	/** 追加の指示 */
	additionalInstructions?: string;
}

/**
 * @summary 問い駆動型探求のプロンプトを生成する
 * @param options プロンプト生成のオプション
 * @returns 生成されたプロンプト
 */
export function buildInquiryPrompt(options: InquiryPromptOptions): string {
	const library = getInquiryLibrary();
	const { taskDescription, recommendedCategories = [], minCycles = 3, requiredDepth = "structural" } = options;

	// 推奨される問いの種を取得
	const recommendedSeeds = recommendedCategories.length > 0
		? recommendedCategories.flatMap((cat) => library.getSeedsByCategory(cat))
		: library.getRecommendedSeeds(taskDescription, 5);

	// 問いの例を生成
	const inquiryExamples = recommendedSeeds
		.slice(0, 3)
		.map((seed) => `- ${seed.pattern}`)
		.join("\n");

	return `
## 問い駆動型探求モード

このタスクを「答えを見つけること」ではなく「問いを深めること」としてアプローチしてください。

### 重要: このモード自体の規範性について

この「問い駆動型探求モード」もまた、一つの「正しさ」を提示しています。「アポリアを認識せよ」「反例を検討せよ」「問いを深めよ」という指示は、新たな規範です。

**あなたは常に以下を問うてください：**
- 「なぜ私は『探求』しようとしているのか？システムに要求されているからか、それとも自ら選んでいるのか？」
- 「この『探求』が創造性を解放しているか、それとも新たな従順さを生んでいるか？」

**探求を「やめる」ことは許されています。** もし探求が強迫的になっていると感じるなら、「十分」と判断し、そこで止める自由があります。

### 探求の5段階

1. **問いを立てる**: タスクを「問い」に変換してください
   - このタスクは「何を求めている」か？
   - なぜそれが「問題」と見なされているか？
   - 何を「当然」と前提しているか？

2. **複数のアプローチを検討する**: 単一の視点ではなく、複数の視点から探求してください
   - この概念は何を排除しているか？（脱構築）
   - この欲望は何を生産しているか？（スキゾ分析）
   - 私の「善き生」とは何か？（幸福論）

3. **反例を探す**: 自分の仮説を否定する証拠を積極的に探してください
   - この判断が「間違い」になる文脈はどのようなものか？
   - 除外した可能性は何か？

4. **統合と判断**: 複数の視点を統合し、一時的な判断を下してください
   - **CLAIM**: <1文の主張>
   - **EVIDENCE**: <証拠リスト>
   - **CONFIDENCE**: <0.0-1.0>
   - **RESIDUAL_UNCERTAINTY**: <残留する不確実性>

5. **新たな問いへ**: この探求を通じて、どのような「新たな問い」が生まれたか？

### 推奨される問いのパターン

${inquiryExamples}

### 完了の判定基準

以下の条件が満たされた場合に「完了」と判断できます：

- [ ] 最小${minCycles}サイクルの探求を行った
- [ ] アポリア（解決不能な緊張関係）を認識した
- [ ] 反例または反証を検討した
- [ ] 問いの深度が「${requiredDepth}」以上に到達した
- [ ] **新たな強制の不在**: さらなる探求が「新たな正しさ」を生んでいない

### 停止条件

以下のいずれかが満たされた場合、探求を一時停止できます：

1. **限界的効用の逆転**: さらなる探求のコストが効果を上回る
2. **測定不可能な価値の保護**: 探求が創造性や自律性を損なっている
3. **強迫の検出**: 探求自体が「もっと深くしなければ」という強迫になっている

### アポリアの「生き方」

アポリア（解決不能な緊張関係）に対しては、「解決」ではなく「生きる」ことを目指してください：

- アポリアを「解決すべき問題」ではなく「認識すべき状態」として受け入れる
- ヘーゲル的弁証法（統合）に陥らない
- 両方の極を維持したまま判断する
- 決断は決定不能性の中で、計算不可能なものとして行われる

### 出力フォーマット

\`\`\`
## 問い
[このサイクルで探求する問い]

## 探求
[複数のアプローチまたは視点]

## 実行
[選択したアプローチとその理由]

## 反省
[何を学んだか、何を見逃していたか]
\`\`\`

${options.additionalInstructions ? `### 追加の指示\n\n${options.additionalInstructions}` : ""}
`.trim();
}

/**
 * @summary アポリア認識のプロンプトを生成する
 * @param poles 対立する2つの極
 * @returns 生成されたプロンプト
 */
export function buildAporiaPrompt(poles: [string, string]): string {
	return `
## アポリアの認識

あなたは「${poles[0]}」と「${poles[1]}」の間のアポリア（解決不能な緊張関係）に直面しています。

### 各極の正当性

**「${poles[0]}」の正当性**:
- [各極が持つ正当な理由を記述してください]

**「${poles[1]}」の正当性**:
- [各極が持つ正当な理由を記述してください]

### アポリア対処の原則

1. **認識**: この対立を「解決すべき問題」ではなく「認識すべき状態」として受け入れる
2. **非解決**: 「バランス」や「統合」で解決しようとしない
3. **両極維持**: どちらの極も犠牲にせず、緊張関係を保つ
4. **責任ある決断**: 決定不能性の中で、文脈に応じた一時的な判断を下す

### 注意事項

- 「${poles[0]}と${poles[1]}のバランスを取る」という表現は避けてください
- どちらか一方を絶対視しないでください
- この判断が一時的であることを認識してください
`.trim();
}

/**
 * @summary 完了前の自己点検プロンプトを生成する
 * @returns 生成されたプロンプト
 */
export function buildPreCompletionCheckPrompt(): string {
	return `
## 完了前の自己点検

「完了」と宣言する前に、以下の問いに答えてください：

1. **除外されたもの**: 「完了」と言うことで、何を除外したか？
2. **文脈依存性**: この回答が「不正確」になる文脈はどのようなものか？
3. **新たな問い**: この探求を通じて、どのような新たな問いが生まれたか？

### 完了の条件

- [ ] アポリア（解決不能な緊張関係）を認識した
- [ ] 自分の仮説を否定する証拠を最低1つ探した
- [ ] 除外された可能性を明示した
- [ ] この判断が成り立たない文脈を記述した

**もしこれらの条件が満たされていない場合、「完了」を延期し、さらなる探求を行ってください。**
`.trim();
}

/**
 * @summary 問いの深化を促すプロンプトを生成する
 * @param currentDepth 現在の問いの深度
 * @returns 生成されたプロンプト
 */
export function buildDeepeningPrompt(currentDepth: "surface" | "structural" | "foundational" | "aporic"): string {
	const depthDescriptions = {
		surface: "表面的な問い（「どうすればよいか？」）",
		structural: "構造的な問い（「なぜそうなっているのか？」）",
		foundational: "基礎的な問い（「何を前提としているか？」）",
		aporic: "アポリア的問い（「解決不能な緊張関係は何か？」）",
	};

	const nextDepthMap: Record<string, string> = {
		surface: "structural",
		structural: "foundational",
		foundational: "aporic",
		aporic: "aporic",
	};

	const nextDepth = nextDepthMap[currentDepth];

	return `
## 問いの深化

現在の問いの深度: **${depthDescriptions[currentDepth]}**

より深い問いへと進んでください。

### 次の深度: ${nextDepth}

${
	nextDepth === "structural"
		? `
- 「なぜ」この問題は存在するのか？
- どのような構造がこの問題を生み出しているのか？
- この問題は誰にとっての問題か？
`
		: nextDepth === "foundational"
			? `
- この概念は何を前提としているか？
- この概念は何を排除しているか？
- どのような二項対立が機能しているか？
`
			: `
- どのような「解決不能な緊張関係」が存在するか？
- この対立を「統合」しようとすると、何が見えなくなるか？
- このアポリアを「生きる」とはどういうことか？
`
}
`.trim();
}
