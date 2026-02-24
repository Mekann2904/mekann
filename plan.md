# 実装計画: AutoCodeRover論文に基づくpi拡張機能改善

## 目的
AutoCodeRover論文の手法をpiに取り入れ、コード検索と文脈取得の効率・精度を向上させる。特に「階層的文脈検索」「ASTベースの圧縮」「文脈局所化」の3点に焦点を当てる。

## 調査結果サマリー

### AutoCodeRover論文の核心概念
1. **Stratified Context Search（階層的文脈検索）**: 反復的にAPIを呼び出し、前の結果を次の検索の引数に使う
2. **SBFL（Spectrum-based Fault Localization）**: テスト実行情報を使ってバグ位置を特定
3. **ASTベースのプログラム表現**: クラスシグネチャのみを返してコンテキストを圧縮
4. **文脈局所化**: 数ファイル〜十数ファイルに抑える
5. **検索APIの設計**: search_class, search_method_in_class, search_code_in_file

### piの現状
- file_candidates, code_search, sym_index, sym_find（基本検索）
- call_graph_index, find_callers, find_callees（呼び出し関係）
- semantic_index, semantic_search（意味検索）
- search-tools スキル（ベストプラクティス）
- semantic-repetition（ループ検出）
- bug-hunting スキル（因果チェーン分析）

---

## 改善案一覧

### 優先度: 高

#### 1. context_explore - 階層的文脈検索ツール

**現状:**
- piの検索ツール（file_candidates, code_search, sym_find等）は個別に呼び出す必要がある
- 前の検索結果を次の検索の入力として使うには、エージェントが明示的にチェーンを構築する必要がある
- `.pi/extensions/search/index.ts:1-500` で各ツールが独立して登録されている

**AutoCodeRoverのアプローチ:**
```
search_class("AuthService") → クラスのシグネチャを取得
  ↓
search_method_in_class("login", "AuthService") → メソッドのシグネチャを取得
  ↓
search_code_in_file("token", "auth.ts") → コードスニペットを取得
```
このように、前の結果を次の検索への入力として段階的に文脈を構築する。

**提案:**
新しい `context_explore` ツールを追加。検索クエリのチェーンを一度に実行し、段階的に文脈を絞り込む。

```typescript
// 新ツール: context_explore
context_explore({
  steps: [
    { type: "find_class", query: "AuthService" },
    { type: "find_methods", classRef: "$0" },  // $0 = 前のステップの結果
    { type: "search_code", pattern: "token", scope: "$1" }
  ],
  contextBudget: 15000,  // トークン予算
  compression: "signature"  // "full" | "signature" | "summary"
})
```

**期待効果:**
- 検索API呼び出しの回数を削減
- 文脈構築のワークフローが明示的になる
- コンテキスト予算を意識した検索が可能

**実装ファイル:**
- 新規: `.pi/extensions/search/tools/context_explore.ts`
- 修正: `.pi/extensions/search/index.ts`（ツール登録追加）
- 新規: `.pi/skills/search-tools/SKILL.md`（ワークフロー例追加）

---

#### 2. sym_find拡張 - シグネチャのみ返却オプション

**現状:**
- `sym_find` はシンボルの定義位置を返すが、常に完全な情報を返す
- `.pi/extensions/search/tools/sym_find.ts:1-300` で実装
- 大きなクラスの全メソッドを取得すると、コンテキストを大量に消費する

**AutoCodeRoverのアプローチ:**
- クラスシグネチャのみを返す（メソッド名と型のみ、実装は返さない）
- コンテキストを圧縮し、必要な情報だけを取得

**提案:**
`sym_find` に `detailLevel` パラメータを追加。

```typescript
sym_find({
  name: "AuthService",
  kind: ["class"],
  detailLevel: "signature"  // "full" | "signature" | "outline"
})

// signature モードの出力例:
// class AuthService {
//   + login(credentials: Credentials): Promise<Token>
//   + logout(): void
//   + validateToken(token: string): boolean
//   - refreshToken(refreshToken: string): Promise<Token>
// }
```

**期待効果:**
- 大きなクラスでもコンテキスト消費を抑制
- クラス概要の把握が高速化
- AutoCodeRoverと同様のASTベース圧縮を実現

**実装ファイル:**
- 修正: `.pi/extensions/search/tools/sym_find.ts`
- 修正: `.pi/extensions/search/types.ts`（型定義追加）

---

#### 3. コンテキスト予算モニタリング

**現状:**
- 各検索ツールには `limit` パラメータがあるが、トークン数ベースの管理ではない
- 検索結果がコンテキストに収まるかどうかはエージェントの判断に委ねられている
- `.pi/skills/search-tools/SKILL.md` では「limitを常に設定する」を推奨しているが、トークン予算の概念はない

**AutoCodeRoverのアプローチ:**
- 文脈局所化: 数ファイル〜十数ファイルに抑える
- 大きなコンテキストはLLMの理解を妨げる

**提案:**
検索結果のトークン数を推定し、コンテキスト予算を警告する機能を追加。

```typescript
// 各検索ツールの戻り値に details.estimatedTokens を追加
{
  results: [...],
  truncated: false,
  details: {
    hints: {
      confidence: 0.85,
      estimatedTokens: 3500,  // 推定トークン数
      contextBudgetWarning: "exceeds_recommended",  // "ok" | "approaching" | "exceeds_recommended"
      suggestedAction: "reduce_limit_or_add_filters"
    }
  }
}
```

**期待効果:**
- コンテキストオーバーフローを事前に検知
- エージェントが意識的にコンテキストを管理可能
- AutoCodeRoverの「文脈局所化」原則を実現

**実装ファイル:**
- 修正: `.pi/extensions/search/utils/output.ts`（トークン推定ロジック）
- 修正: `.pi/extensions/search/tools/file_candidates.ts`
- 修正: `.pi/extensions/search/tools/code_search.ts`
- 修正: `.pi/extensions/search/tools/sym_find.ts`

---

### 優先度: 中

#### 4. search_class / search_method - 高レベル検索ヘルパー

**現状:**
- `sym_find` でクラスやメソッドを検索できるが、kindフィルタやワイルドカードを理解する必要がある
- `.pi/skills/search-tools/SKILL.md` で使い方は説明されているが、直接使えるショートカットがない

**AutoCodeRoverのアプローチ:**
- `search_class(cls)`: クラスを検索
- `search_method_in_class(m, cls)`: クラス内のメソッドを検索
- `search_code_in_file(c, f)`: ファイル内のコードを検索

**提案:**
AutoCodeRoverと同様の高レベル検索ツールを追加。

```typescript
// search_class
search_class({
  name: "AuthService",
  includeMethods: true,  // メソッド一覧も含める
  detailLevel: "signature"
})

// search_method_in_class
search_method_in_class({
  method: "login",
  className: "AuthService",
  includeImplementation: false
})

// search_code_in_file
search_code_in_file({
  pattern: "token",
  file: "src/auth/service.ts",
  context: 2
})
```

**期待効果:**
- 検索クエリがより直感的になる
- AutoCodeRoverからの移行が容易
- 初心者でも使いやすい

**実装ファイル:**
- 新規: `.pi/extensions/search/tools/search_class.ts`
- 新規: `.pi/extensions/search/tools/search_method.ts`
- 新規: `.pi/extensions/search/tools/search_code.ts`
- 修正: `.pi/extensions/search/index.ts`

---

#### 5. fault_localize - SBFLベースのバグ位置特定

**現状:**
- `bug-hunting` スキルで因果チェーン分析を行う手法論はある
- テスト実行ツール（`.pi/extensions/search/test-runner.ts`）は存在する
- しかし、テストカバレッジと失敗テストの情報を統合したバグ位置特定はない

**AutoCodeRoverのアプローチ:**
- SBFL（Spectrum-based Fault Localization）
- passing/failingテストの制御フロー差分を分析
- メソッド単位で疑わしさスコアを計算

**提案:**
テスト実行結果とコードカバレッジを組み合わせて、バグの疑いが高い箇所を特定するツール。

```typescript
fault_localize({
  testCommand: "npm test",
  failingTests: ["auth.test.ts:login", "auth.test.ts:logout"],
  passingTests: ["auth.test.ts:validate"],
  suspiciousnessThreshold: 0.5
})

// 出力例:
// Fault Localization Results:
// 1. AuthService.login (suspiciousness: 0.92) - covered by 2 failing tests
// 2. TokenManager.refresh (suspiciousness: 0.78) - covered by 1 failing, 1 passing
// 3. AuthService.validateToken (suspiciousness: 0.45) - covered by 1 passing test
```

**期待効果:**
- バグ修正の効率化
- bug-huntingスキルとの統合
- テスト駆動のデバッグワークフロー

**実装ファイル:**
- 新規: `.pi/extensions/search/tools/fault_localize.ts`
- 新規: `.pi/lib/sbfl.ts`（SBFLアルゴリズム実装）
- 修正: `.pi/skills/bug-hunting/SKILL.md`（統合ガイド追加）

---

#### 6. 検索履歴とコンテキスト継承

**現状:**
- `.pi/skills/search-tools/SKILL.md` で「検索履歴記録」がv2.0.0の機能として記載されている
- しかし、セッション間での検索履歴の継承や、関連クエリの推薦は未実装

**AutoCodeRoverのアプローチ:**
- 反復的にAPIを呼び出し、前の結果を次の検索の引数に使う
- 文脈が十分になるまで検索を続ける

**提案:**
検索履歴を永続化し、セッション間で継承できる機能。

```typescript
// 検索履歴の取得
get_search_history({
  session: "current",  // "current" | "previous" | "all"
  limit: 10
})

// コンテキスト継承
inherit_context({
  fromSession: "prev-session-id",
  queries: ["AuthService", "login"]
})
```

**期待効果:**
- セッションをまたいだ調査の継続性
- 関連クエリの推薦
- 探索の効率化

**実装ファイル:**
- 新規: `.pi/extensions/search/tools/search_history.ts`
- 新規: `.pi/extensions/search/utils/history-store.ts`

---

### 優先度: 低

#### 7. AST要約ビューア

**現状:**
- `sym_index` でシンボルインデックスを生成できる
- しかし、ファイル全体のAST要約を表示する機能はない

**AutoCodeRoverのアプローチ:**
- ファイルの集合ではなくASTとして扱う
- クラス/メソッド単位でコードを要約

**提案:**
ファイルのAST要約を表示するツール。

```typescript
ast_summary({
  file: "src/auth/service.ts",
  format: "tree",  // "tree" | "flat" | "json"
  depth: 2  // クラス → メソッド → パラメータ
})

// 出力例:
// AuthService
// ├── + login(credentials: Credentials): Promise<Token>
// ├── + logout(): void
// └── - refreshToken(token: string): Promise<Token>
//     └── calls: TokenManager.generate
```

**期待効果:**
- ファイル構造の迅速な把握
- 呼び出し関係の可視化

**実装ファイル:**
- 新規: `.pi/extensions/search/tools/ast_summary.ts`

---

#### 8. 検索結果のランキング改善

**現状:**
- `semantic_search` はベクトル類似度でランキング
- `code_search` は出現順で返す
- 検索結果のランキング統合機能はない

**AutoCodeRoverのアプローチ:**
- 検索結果を統合し、ランキングする
- 関連性の高い結果を優先

**提案:**
複数の検索結果を統合し、ランキングするヘルパー。

```typescript
merge_search_results({
  sources: [
    { type: "semantic", query: "authentication", weight: 0.5 },
    { type: "symbol", query: "Auth*", weight: 0.3 },
    { type: "code", query: "token", weight: 0.2 }
  ],
  deduplicate: true,
  limit: 20
})
```

**期待効果:**
- 複数の検索手法の組み合わせ
- より精度の高い結果

**実装ファイル:**
- 新規: `.pi/extensions/search/tools/merge_results.ts`

---

## 次のステップ

1. **Phase 1（高優先度）**
   - [ ] context_explore ツールの設計詳細化
   - [ ] sym_find の detailLevel パラメータ実装
   - [ ] コンテキスト予算モニタリングの実装

2. **Phase 2（中優先度）**
   - [ ] search_class / search_method ツールの実装
   - [ ] fault_localize ツールの実装（SBFLアルゴリズム）
   - [ ] 検索履歴の永続化

3. **Phase 3（低優先度）**
   - [ ] AST要約ビューアの実装
   - [ ] 検索結果ランキング改善

## 設計上の考慮事項

### 既存機能との整合性
- 新ツールは既存の `sym_index`, `sym_find`, `code_search` を内部的に使用する
- search-tools スキルのベストプラクティスに従う

### 後方互換性
- 既存ツールのパラメータは追加のみ（削除しない）
- 新しいパラメータはオプションとする

### パフォーマンス
- コンテキスト予算推定は高速な近似アルゴリズムを使用
- キャッシュを活用して重複計算を避ける

## Todo

- [ ] context_explore ツールのインターフェース定義
- [ ] sym_find の detailLevel パラメータ設計
- [ ] トークン推定アルゴリズムの選定
- [ ] SBFLアルゴリズム（Ochiai, Tarantula等）の調査
- [ ] 検索履歴ストレージの設計

---

## COUNTER_EVIDENCE（自分の仮説を否定する証拠）

### 1. search-tools スキル v2.0.0 で既に計画されている機能

**証拠:** `.pi/skills/search-tools/SKILL.md:17-23`

```yaml
improvements:
  - "P1: 結果キャッシュ（TTL対応）"        # ← 既に実装済み
  - "P1: 検索履歴記録"                    # ← 改善案6と重複
  - "P1: Agent Hints（信頼度・次アクション提案）"  # ← 既に実装済み
  - "P1: 検索統合ヘルパー（merge/rank/deduplicate）"  # ← 改善案8と重複
```

**影響:**
- 改善案6「検索履歴とコンテキスト継承」の一部は既に計画されている
- 改善案8「検索結果のランキング改善」も検索統合ヘルパーとして計画されている
- **修正:** これらは「新規実装」ではなく「既存計画の拡張」として位置づけるべき

### 2. Agent Hints で既にコンテキスト管理の萌芽がある

**証拠:** `.pi/skills/search-tools/SKILL.md:56-70`

```typescript
{
  details: {
    hints: {
      confidence: 0.85,
      suggestedNextAction: "refine_pattern",  // 次アクション提案
      alternativeTools: ["sym_find"]          // 代替ツール提案
    }
  }
}
```

**影響:**
- 改善案3「コンテキスト予算モニタリング」の `suggestedAction` は既に類似機能がある
- **修正:** 新しい `estimatedTokens` と `contextBudgetWarning` を既存の `hints` 構造に統合する

### 3. 既存のワークフロー統合パターン

**証拠:** `.pi/skills/search-tools/SKILL.md` の「統合ワークフロー」セクション

```
ワークフロー1: 新機能実装箇所の特定
  1. file_candidates で関連ファイルを特定
  2. code_search でパターンを検索
  3. sym_find で具体的な関数定義を特定
```

**影響:**
- 改善案1「context_explore」は既存のワークフローをツール化するだけ
- エージェントが既にこのパターンを実行できるなら、新しいツールの価値は限定的
- **反論:** しかし、ツール化することで API 呼び出し回数を削減できる利点は残る

---

## 境界条件（この結論が成立しない条件）

### 1. LLMのコンテキストウィンドウが大幅に拡大した場合

もし GPT-5 等で 1M+ トークンのコンテキストウィンドウが標準化された場合：
- 「文脈局所化」の重要性は低下する
- コンテキスト予算モニタリングの必要性は減る
- **境界:** コンテキストウィンドウ < 100K トークンの環境で有効

### 2. コードベースが小規模（<100ファイル）の場合

小規模プロジェクトでは：
- 検索結果が最初から少数に絞られる
- 階層的検索の恩恵が限定的
- **境界:** 500+ ファイルの中規模〜大規模プロジェクトで有効

### 3. リアルタイム性が最優先される場合

緊急のバグ修正などでは：
- 階層的検索よりも直接的な検索が好まれる
- コンテキスト最適化よりも速度が優先
- **境界:** 探索的タスク（理解・リファクタリング）で有効

---

## 代替仮説（採用しなかったアプローチと理由）

### 代替案A: 既存ツールの拡張ではなく新ツール追加

**却下理由:**
- 既存の `sym_find`, `code_search` は広く使われている
- 新ツールは学習コストがかかる
- 既存ツールのパラメータ追加の方が後方互換性が高い

### 代替案B: スキルレベルでの対応（ツール拡張なし）

**却下理由:**
- スキルはガイドラインであり、強制力がない
- トークン推定などはツールレベルで実装すべき
- エージェントがスキルに従わない場合の対応がない

### 代替案C: エージェント自身に判断を委ねる

**却下理由:**
- 現状のエージェントはコンテキストサイズを意識していない
- 明示的なシグナル（estimatedTokens 等）がないと判断できない
- AutoCodeRover論文も「ツールレベルの設計」を重視している
