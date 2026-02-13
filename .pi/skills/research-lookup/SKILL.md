---
name: research-lookup
description: "PerplexityのSonar Pro SearchまたはSonar Reasoning Proモデルを使用してOpenRouter経由で最新の研究情報を検索。クエリの複雑さに基づいて最適なモデルを自動選択。学術論文、最近の研究、技術文書、一般的な研究情報を引用付きで検索。"
allowed-tools: [Read, Write, Edit, Bash]
metadata:
  skill-author: "Mekann"
  reference: "https://github.com/K-Dense-AI/claude-scientific-skills"
---

# 研究情報検索（Research Information Lookup）

> **参考実装:** このスキルは [K-Dense AI Claude Scientific Skills](https://github.com/K-Dense-AI/claude-scientific-skills/tree/main/scientific-skills/research-lookup) を参考に作成されました。

## 概要

このスキルは、OpenRouter経由でPerplexityのSonarモデルを使用してリアルタイムの研究情報検索を可能にします。クエリの複雑さに基づいて**Sonar Pro Search**（高速・効率的な検索）と**Sonar Reasoning Pro**（深い分析的推論）をインテリジェントに選択します。適切な引用と出典明記により、現在の学術文献、最新研究、技術文書、一般的な研究情報へのアクセスを提供します。

## このスキルを使用するタイミング

以下が必要な場合にこのスキルを使用：

- **最新の研究情報**：特定分野の最新の研究、論文、発見
- **文献検証**：事実、統計、主張を現在の研究と照合
- **背景調査**：科学的執筆のためのコンテキストと裏付け証拠の収集
- **引用ソース**：原稿で引用する関連論文と研究の発見
- **技術文書**：仕様、プロトコル、方法論の検索
- **最近の動向**：新興トレンドと画期的発見の最新把握
- **統計データ**：最近の統計、調査結果、研究発見の検索
- **専門家の意見**：最近のインタビュー、レビュー、解説からの洞察へのアクセス

## 科学的図表による視覚的強化

**このスキルでドキュメントを作成する際は、常に科学的ダイアグラムと概略図を追加して視覚的コミュニケーションを強化することを検討してください。**

ドキュメントにまだ図表やダイアグラムが含まれていない場合：
- **scientific-schematics**スキルを使用してAI駆動の出版品質ダイアグラムを生成
- 自然言語で希望するダイアグラムを記述するだけで、自動的に生成・レビュー・改善されます

**新規ドキュメントの場合**：科学的図表はデフォルトで生成し、テキストで説明される主要概念、ワークフロー、アーキテクチャ、関係を視覚的に表現すべきです。

**概略図の生成方法：**
```bash
python scripts/generate_schematic.py "図表の説明" -o figures/output.png
```

AIは自動的に以下を行います：
- 適切なフォーマットで出版品質の画像を作成
- 複数の反復を通じてレビューと改善
- アクセシビリティを確保（色覚障害対応、高コントラスト）
- 出力をfigures/ディレクトリに保存

**概略図を追加するタイミング：**
- 研究情報フロー図
- クエリ処理ワークフローのイラスト
- モデル選定決定木
- システム統合アーキテクチャ図
- 情報検索パイプライン可視化
- 知識統合フレームワーク
- 可視化の恩恵を受ける複雑な概念

概略図作成の詳細なガイダンスについては、scientific-schematicsスキルのドキュメントを参照してください。

---

## コア機能

### 1. 学術研究クエリ

**学術文献検索**：特定領域の最近の論文、研究、レビューをクエリ：

```
クエリ例：
- "Recent advances in CRISPR gene editing 2024"（CRISPR遺伝子編集の最近の進展 2024）
- "Latest clinical trials for Alzheimer's disease treatment"（アルツハイマー病治療の最新臨床試験）
- "Machine learning applications in drug discovery systematic review"（創薬における機械学習応用のシステマティックレビュー）
- "Climate change impacts on biodiversity meta-analysis"（気候変動の生物多様性への影響メタ分析）
```

**期待される応答形式**：
- 最近の文献からの主要発見の要約
- 著者、タイトル、ジャーナル、年を含む3-5の最も関連性の高い論文の引用
- 強調された主要統計または発見
- 研究ギャップまたは論争の特定
- 利用可能な場合の完全論文へのリンク

### 2. 技術・方法論情報

**プロトコル・方法検索**：詳細な手順、仕様、方法論を検索：

```
クエリ例：
- "Western blot protocol for protein detection"（タンパク質検出のウェスタンブロットプロトコル）
- "RNA sequencing library preparation methods"（RNAシーケンスライブラリ調製方法）
- "Statistical power analysis for clinical trials"（臨床試験の統計的検出力分析）
- "Machine learning model evaluation metrics"（機械学習モデル評価メトリクス）
```

**期待される応答形式**：
- ステップバイステップのプロシージャまたはプロトコル
- 必要な材料と機器
- 重要なパラメータと考慮事項
- 一般的な問題のトラブルシューティング
- 標準プロトコルまたは画期的論文への参照

### 3. 統計・データ情報

**研究統計**：現在の統計、調査結果、研究データを検索：

```
クエリ例：
- "Prevalence of diabetes in US population 2024"（米国人口の糖尿病有病率 2024）
- "Global renewable energy adoption statistics"（世界の再生可能エネルギー採用統計）
- "COVID-19 vaccination rates by country"（国別COVID-19ワクチン接種率）
- "AI adoption in healthcare industry survey"（医療業界におけるAI採用調査）
```

**期待される応答形式**：
- 日付とソース付きの現在の統計
- データ収集の方法論
- 利用可能な場合の信頼区間または誤差範囲
- 前年またはベンチマークとの比較
- 元の調査または研究への引用

### 4. 引用・参考文献支援

**引用検索**：信頼できる著者と権威ある会場から最も影響力のある、高引用論文を特定：

```
クエリ例：
- "Foundational papers on transformer architecture"（トランスフォーマーアーキテクチャに関する基礎論文）（期待：NeurIPSのVaswani et al. 2017、90,000+引用）
- "Seminal works in quantum computing"（量子コンピューティングにおける重要著作）（期待：Nature、Scienceの主要研究者による論文）
- "Key studies on climate change mitigation"（気候変動緩和に関する主要研究）（期待：IPCC引用論文、Nature Climate Change）
- "Landmark trials in cancer immunotherapy"（がん免疫療法における画期的試験）（期待：NEJM、Lancet試験、1000+引用）
```

**期待される応答形式**：
- **影響と関連性でランク付けされた**5-10の最も影響力のある論文
- 完全な引用情報（著者、タイトル、ジャーナル、年、DOI）
- 各論文の**引用数**（正確な値がない場合は概算）
- **会場ティア**表示（Nature、Science、Cell = Tier 1など）
- 各論文の貢献の簡潔な説明
- 注目すべき場合の**著者の資格**（例：「Hintonラボから」「ノーベル賞受賞者」）
- 関連する場合のジャーナルインパクトファクター

**引用選定の品質基準**：
- **100+引用**の論文を優先（3年以上前の論文の場合）
- **Tier-1ジャーナル**（Nature、Science、Cell、NEJM、Lancet）を優先
- 分野の**認められたリーダー**の研究を含める
- **基礎論文**（高引用、古い）と**最近の進展**（新興、高インパクト会場）のバランス

## 自動モデル選択

このスキルは、クエリの複雑さに基づいて**インテリジェントなモデル選択**を行います：

### モデルタイプ

**1. Sonar Pro Search** (`perplexity/sonar-pro-search`)
- **用途**：わかりやすい情報検索
- **最適**：
  - 単純な事実確認クエリ
  - 最近の出版物検索
  - 基本的なプロトコル検索
  - 統計データ取得
- **速度**：高速応答
- **コスト**：クエリあたりのコストが低い

**2. Sonar Reasoning Pro** (`perplexity/sonar-reasoning-pro`)
- **用途**：深い推論を必要とする複雑な分析クエリ
- **最適**：
  - 比較分析（「X vs Yを比較」）
  - 複数研究の統合
  - トレードオフまたは論争の評価
  - メカニズムまたは関係の説明
  - 批判的分析と解釈
- **速度**：より遅いがより徹底的
- **コスト**：クエリあたりのコストが高いが、より深い洞察を提供

### 複雑さ評価

スキルは以下の指標を使用してクエリの複雑さを自動検出します：

**推論キーワード**（Sonar Reasoning Proをトリガー）：
- 分析的：`compare`、`contrast`、`analyze`、`analysis`、`evaluate`、`critique`
- 比較的：`versus`、`vs`、`vs.`、`compared to`、`differences between`、`similarities`
- 統合的：`meta-analysis`、`systematic review`、`synthesis`、`integrate`
- 因果的：`mechanism`、`why`、`how does`、`how do`、`explain`、`relationship`、`causal relationship`、`underlying mechanism`
- 理論的：`theoretical framework`、`implications`、`interpret`、`reasoning`
- 議論的：`controversy`、`conflicting`、`paradox`、`debate`、`reconcile`
- トレードオフ：`pros and cons`、`advantages and disadvantages`、`trade-off`、`tradeoff`、`trade offs`
- 複雑性：`multifaceted`、`complex interaction`、`critical analysis`

**複雑さスコアリング**：
- 推論キーワード：各3ポイント（高加重）
- 複数の質問：疑問符ごとに2ポイント
- 複雑な文構造：節インジケーターごとに1.5ポイント（and、or、but、however、whereas、although）
- 非常に長いクエリ：150文字を超える場合1ポイント
- **閾値**：3ポイント以上のクエリはSonar Reasoning Proをトリガー

**実際の結果**：単一の強力な推論キーワード（compare、explain、analyzeなど）でも、より強力なSonar Reasoning Proモデルがトリガーされ、必要なときに深い分析が得られます。

**クエリ分類例**：

✅ **Sonar Pro Search**（わかりやすい検索）：
- "Recent advances in CRISPR gene editing 2024"
- "Prevalence of diabetes in US population"
- "Western blot protocol for protein detection"

✅ **Sonar Reasoning Pro**（複雑な分析）：
- "Compare and contrast mRNA vaccines vs traditional vaccines for cancer treatment"
- "Explain the mechanism underlying the relationship between gut microbiome and depression"
- "Analyze the controversy surrounding AI in medical diagnosis and evaluate trade-offs"

### 手動オーバーライド

`force_model`パラメータを使用して特定のモデルを強制できます：

```python
# 高速検索のためにSonar Pro Searchを強制
research = ResearchLookup(force_model='pro')

# 深い分析のためにSonar Reasoning Proを強制
research = ResearchLookup(force_model='reasoning')

# 自動選択（デフォルト）
research = ResearchLookup()
```

コマンドライン使用：
```bash
# Sonar Pro Searchを強制
python research_lookup.py "クエリ" --force-model pro

# Sonar Reasoning Proを強制
python research_lookup.py "クエリ" --force-model reasoning

# 自動（フラグなし）
python research_lookup.py "クエリ"

# 出力をファイルに保存
python research_lookup.py "クエリ" -o results.txt

# JSONとして出力（プログラムアクセスに有用）
python research_lookup.py "クエリ" --json

# 組み合わせ：JSON出力をファイルに保存
python research_lookup.py "クエリ" --json -o results.json
```

## 技術統合

### OpenRouter API設定

このスキルはOpenRouter（openrouter.ai）と統合してPerplexityのSonarモデルにアクセスします：

**モデル仕様**：
- **モデル**：
  - `perplexity/sonar-pro-search`（高速検索）
  - `perplexity/sonar-reasoning-pro-online`（深い分析）
- **検索モード**：学術/学者モード（査読付きソースを優先）
- **検索コンテキスト**：より深く包括的な研究結果のために常に`high`検索コンテキストを使用
- **コンテキストウィンドウ**：包括的研究のために200K+トークン
- **機能**：学術論文検索、引用生成、学者分析
- **出力**：学術データベースからの引用とソースリンクを含む豊かな応答

**API要件**：
- OpenRouter APIキー（`OPENROUTER_API_KEY`環境変数として設定）
- 研究クエリに十分なクレジットを持つアカウント
- 適切な帰属とソースの引用

**学術モード設定**：
- 学者ソースを優先するように設定されたシステムメッセージ
- 査読付きジャーナルと学術出版物に焦点を当てた検索
- 学術参照のための強化された引用抽出
- 最近の学術文献（2020-2024）への優先
- 学術データベースとリポジトリへの直接アクセス

### 応答品質と信頼性

**ソース検証**：スキルは以下を優先：
- 査読付き学術論文とジャーナル
- 信頼できる機関ソース（大学、政府機関、NGO）
- 最近の出版物（過去2-3年を優先）
- 高インパクトジャーナルと会議
- 二次ソースよりも一次研究

**引用基準**：すべての応答に含まれる：
- 完全な書誌情報
- 利用可能な場合のDOIまたは安定URL
- ウェブソースのアクセス日
- 直接引用またはデータの明確な帰属

## 論文品質と人気度の優先

**重要**：論文を検索する際は、常に不明瞭または低インパクト出版物よりも高品質で影響力のある論文を優先してください。品質は量よりも重要です。

### 引用ベースのランク付け

年齢に対する引用数に基づいて論文を優先：

| 論文の年齢 | 引用閾値 | 分類 |
|-----------|---------|------|
| 0-3年 | 20+引用 | 注目に値する |
| 0-3年 | 100+引用 | 高度に影響力あり |
| 3-7年 | 100+引用 | 重要 |
| 3-7年 | 500+引用 | 画期的論文 |
| 7+年 | 500+引用 | 重要著作 |
| 7+年 | 1000+引用 | 基礎的 |

**引用を報告する際**：既知の場合は常に概算引用数を示してください（例：「500+回引用」または「高引用」）。

### 会場品質ティア

より高いティアの会場からの論文を優先：

**Tier 1 - 最高峰会場**（常に優先）：
- **一般科学**：Nature、Science、Cell、PNAS
- **医学**：NEJM、Lancet、JAMA、BMJ
- **分野別旗艦**：Nature Medicine、Nature Biotechnology、Nature Methods、Nature Genetics、Cell Stem Cell、Immunity
- **トップCS/AI**：NeurIPS、ICML、ICLR、ACL、CVPR（ML/AIトピック）

**Tier 2 - 高インパクト専門**（強い優先）：
- インパクトファクター>10のジャーナル
- サブフィールドのトップ会議（例：EMNLP、NAACL、ECCV、MICCAI）
- 学会旗艦ジャーナル（例：Blood、Circulation、Gastroenterology）

**Tier 3 - 尊敬される専門**（関連する場合に含める）：
- インパクトファクター5-10のジャーナル
- 分野の確立された会議
- よくインデックスされた専門ジャーナル

**Tier 4 - その他の査読付き**（控えめに使用）：
- 低インパクトジャーナル、直接関連しより良いソースがない場合のみ

### 著者評価指標

確立された評判の良い研究者からの論文を優先：

- **高h-indexを持つシニア著者**（確立された分野で>40）
- **Tier-1会場での複数出版物**
- **認識された研究機関でのリーダーシップポジション**
- **認められた専門知識**：賞、編集委員、学会フェロー
- **分野の画期的論文の第一/最終著者**

### 直接的関連性スコアリング

研究質問に直接対処する論文を常に優先：

1. **第一次優先**：正確な研究質問に直接対処する論文
2. **第二次優先**：適用可能な方法、データ、または概念フレームワークを持つ論文
3. **第三次優先**：接線的に関連する論文（Tier-1会場からまたは高引用の場合のみ含める）

### 実践的応用

研究検索を行う際：

1. **最も影響力のある論文から始める** - 高引用、基礎的研究を最初に探す
2. **Tier-1会場を優先** - 医学トピックにはNature、Science、Cellファミリージャーナル、NEJM、Lancet
3. **著者の資格を確認** - 確立された研究グループからの研究を優先
4. **鮮度とインパクトのバランス** - 最近の高引用論文 > 古い不明瞭な論文 > 最近の無引用論文
5. **品質指標を報告** - 応答に引用数、ジャーナル名、著者所属を含める

**品質重視クエリ応答例**：
```
高インパクト文献からの主要発見：

1. Smith et al. (2023), Nature Medicine (IF: 82.9, 450+回引用)
   - シニア著者：Prof. John Smith, Harvard Medical School
   - 主要発見：[発見]

2. Johnson & Lee (2024), Cell (IF: 64.5, 120+回引用)
   - Stanfordの著名なLee Labから
   - 主要発見：[発見]

3. Chen et al. (2022), NEJM (IF: 158.5, 890+回引用)
   - 画期的臨床試験 (N=5,000)
   - 主要発見：[発見]
```

## クエリベストプラクティス

### 1. モデル選択戦略

**単純な検索用（Sonar Pro Search）**：
- 特定トピックの最近の論文
- 統計データまたは有病率
- 標準プロトコルまたは方法論
- 特定論文の引用検索
- 事実情報の取得

**複雑な分析用（Sonar Reasoning Pro）**：
- 比較研究と統合
- メカニズムの説明
- 論争の評価
- トレードオフ分析
- 理論フレームワーク
- 多面的な関係

**プロのコツ**：自動選択はほとんどの使用ケースに最適化されています。特定の要件がある場合、またはクエリが検出されたよりも深い推論を必要とすることがわかっている場合のみ`force_model`を使用してください。

### 2. 具体的で焦点を絞ったクエリ

**良いクエリ**（適切なモデルをトリガー）：
- "Randomized controlled trials of mRNA vaccines for cancer treatment 2023-2024" → Sonar Pro Search
- "Compare the efficacy and safety of mRNA vaccines vs traditional vaccines for cancer treatment" → Sonar Reasoning Pro
- "Explain the mechanism by which CRISPR off-target effects occur and strategies to minimize them" → Sonar Reasoning Pro

**悪いクエリ**：
- "Tell me about AI"（広すぎる）
- "Cancer research"（具体性がない）
- "Latest news"（曖昧すぎる）

### 3. 構造化クエリ形式

**推奨構造**：
```
[トピック] + [特定側面] + [期間] + [情報タイプ]
```

**例**：
- "CRISPR gene editing + off-target effects + 2024 + clinical trials"
- "Quantum computing + error correction + recent advances + review papers"
- "Renewable energy + solar efficiency + 2023-2024 + statistical data"

### 4. フォローアップクエリ

**効果的なフォローアップ**：
- "Show me the full citation for the Smith et al. 2024 paper"
- "What are the limitations of this methodology?"
- "Find similar studies using different approaches"
- "What controversies exist in this research area?"

## 科学的執筆との統合

このスキルは以下を提供して科学的執筆を強化します：

1. **文献レビューサポート**：序論と考察セクションの現在の研究を収集
2. **方法検証**：プロトコルと手順を現在の基準と照合
3. **結果のコンテキスト化**：発見を最近の類似研究と比較
4. **考察の強化**：最新の証拠で議論をサポート
5. **引用管理**：複数スタイルで適切にフォーマットされた引用を提供

## エラー処理と制限

**既知の制限**：
- 情報のカットオフ：応答はトレーニングデータに制限（通常2023-2024）
- ペイウォールコンテンツ：ペイウォールの背後の全文にアクセスできない場合がある
- 新興研究：まだインデックスされていない非常に最近の論文を見逃す可能性
- 専門データベース：独自または制限されたデータベースにアクセスできない

**エラー条件**：
- APIレート制限またはクォータ超過
- ネットワーク接続の問題
- 不正形式または曖昧なクエリ
- モデル利用不可能またはメンテナンス

**フォールバック戦略**：
- より良い明確さのためにクエリを言い換える
- 複雑なクエリをより単純なコンポーネントに分割
- 最近のデータが利用できない場合はより広い期間を使用
- 複数のクエリバリエーションで相互参照

## 使用例

### 例1：単純な文献検索（Sonar Pro Search）

**クエリ**："Recent advances in transformer attention mechanisms 2024"

**選択されたモデル**：Sonar Pro Search（わかりやすい検索）

**応答に含まれる**：
- 2024年の5つの主要論文の要約
- DOI付き完全引用
- 主要な革新と改善
- パフォーマンスベンチマーク
- 今後の研究方向

### 例2：比較分析（Sonar Reasoning Pro）

**クエリ**："Compare and contrast the advantages and limitations of transformer-based models versus traditional RNNs for sequence modeling"

**選択されたモデル**：Sonar Reasoning Pro（複雑な分析が必要）

**応答に含まれる**：
- 複数次元にわたる詳細な比較
- アーキテクチャの違いの分析
- 計算効率対パフォーマンスのトレードオフ
- 使用ケースの推奨
- 複数研究からの証拠の統合
- 分野の継続的な議論

### 例3：方法検証（Sonar Pro Search）

**クエリ**："Standard protocols for flow cytometry analysis"

**選択されたモデル**：Sonar Pro Search（プロトコル検索）

**応答に含まれる**：
- 最近のレビューからのステップバイステッププロトコル
- 必要なコントロールとキャリブレーション
- 一般的な落とし穴とトラブルシューティング
- 決定的な方法論論文への参照
- 長所/短所付きの代替アプローチ

### 例4：メカニズム説明（Sonar Reasoning Pro）

**クエリ**："Explain the underlying mechanism of how mRNA vaccines trigger immune responses and why they differ from traditional vaccines"

**選択されたモデル**：Sonar Reasoning Pro（因果推論が必要）

**応答に含まれる**：
- 詳細なメカニズムの説明
- ステップバイステップの生物プロセス
- 従来ワクチンとの比較分析
- 分子レベルの相互作用
- 免疫学と薬理学概念の統合
- 最近の研究からの証拠

### 例5：統計データ（Sonar Pro Search）

**クエリ**："Global AI adoption in healthcare statistics 2024"

**選択されたモデル**：Sonar Pro Search（データ検索）

**応答に含まれる**：
- 地域別現在の採用率
- 市場規模と成長予測
- 調査方法論とサンプルサイズ
- 前年との比較
- 市場調査レポートへの引用

## パフォーマンスとコスト考慮

### 応答時間

**Sonar Pro Search**：
- 典型的な応答時間：5-15秒
- 迅速な情報収集に最適
- バッチクエリに適している

**Sonar Reasoning Pro**：
- 典型的な応答時間：15-45秒
- 複雑な分析クエリには待つ価値がある
- より徹底的な推論と統合を提供

### コスト最適化

**自動選択の利点**：
- わかりやすいクエリにSonar Pro Searchを使用してコストを節約
- より深い分析から真に恩恵を受けるクエリにSonar Reasoning Proを確保
- コストと品質のバランスを最適化

**手動オーバーライドの使用ケース**：
- 予算が制約され速度が優先の場合にSonar Pro Searchを強制
- 最大深度を必要とする重要研究の場合にSonar Reasoning Proを強制
- 論文の特定セクションに使用（例：方法はPro Search、考察はReasoning）

**ベストプラクティス**：
1. ほとんどの使用ケースで自動選択を信頼
2. クエリ結果をレビュー - Sonar Pro Searchが十分な深度を提供しない場合、推論キーワードで言い換え
3. バッチクエリを戦略的に使用 - 単純な検索を組み合わせて総クエリ数を最小化
4. 文献レビューには、Sonar Pro Searchで幅を広く開始し、統合にSonar Reasoning Proを使用

## セキュリティと倫理的考慮

**責任ある使用**：
- 可能な場合は常に一次ソースに対してすべての情報を検証
- すべてのデータと引用を元のソースに明確に帰属
- AI生成要約を独自研究として提示しない
- 著作権とライセンス制限を尊重
- ペイウォールまたはサブスクリプションを回避するためではなく、研究支援として使用

**学術的誠実性**：
- AIツールではなく、常に元のソースを引用
- 文献検索の出発点として使用
- AIツール使用に関する機関ガイドラインに従う
- 研究方法について透明性を維持

## 補完ツール

research-lookupに加えて、科学ライターは**WebSearch**にアクセスできます：

- **迅速なメタデータ検証**：DOI、出版年、ジャーナル名、巻/ページ番号を検索
- **非学術ソース**：ニュース、ブログ、技術文書、時事
- **一般情報**：会社情報、製品詳細、現在の統計
- **相互参照**：research-lookupで見つかった引用詳細を検証

**どのツールを使用するか**：
| タスク | ツール |
|--------|--------|
| 学術論文を探す | research-lookup |
| 文献検索 | research-lookup |
| 深い分析/比較 | research-lookup (Sonar Reasoning Pro) |
| DOI/メタデータを検索 | WebSearch |
| 出版年を確認 | WebSearch |
| ジャーナル巻/ページを探す | WebSearch |
| 時事/ニュース | WebSearch |
| 非学者ソース | WebSearch |

## まとめ

このスキルは、インテリジェントなデュアルモデル選択を備えた強力な研究アシスタントとして機能します：

- **自動インテリジェンス**：クエリの複雑さを分析し、最適なモデル（Sonar Pro SearchまたはSonar Reasoning Pro）を選択
- **コスト効率**：わかりやすい検索にはより速くて安価なSonar Pro Searchを使用
- **深い分析**：複雑な比較、分析、理論クエリには自動的にSonar Reasoning Proを使用
- **柔軟な制御**：必要な分析レベルが正確にわかっている場合に手動オーバーライドが利用可能
- **学術フォーカス**：両モデルとも査読付きソースと学者文献を優先するように設定
- **補完的WebSearch**：メタデータ検証と非学術ソースにはWebSearchと併用

迅速な事実確認でも深い分析的統合でも、このスキルは科学的執筆ニーズに適したレベルの研究サポートを自動的に提供するよう適応します。
