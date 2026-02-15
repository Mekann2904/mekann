# Clean Architecture 原則要約

## 4層レイヤー構造

| レイヤー | DDD対応 | 含む概念 |
|---------|---------|---------|
| Enterprise Business Rules | ドメイン層 | Entities, Domain Service, Value Object |
| Application Business Rules | アプリケーション層 | Use Cases, Interactor, Repository IF |
| Interface Adapters | - | Controllers, Presenters, Gateways |
| Frameworks & Drivers | インフラ層 | Web, UI, DB, External APIs |

### 依存ルール

**ソースコードは内側に向かってのみ依存する**

```
Frameworks → Adapters → Application → Enterprise
   (外側)                          (内側)
```

### レイヤー責務

| レイヤー | 責務 |
|---------|------|
| Enterprise | ビジネス概念、ビジネスルール、ビジネス状況 |
| Application | ユースケース、エンティティのデータフロー調整 |
| Adapters | 内部形式⇔外部形式のデータ変換 |
| Frameworks | フレームワーク、DB、Web、UI等の詳細 |

---

## レイヤー別用語対応

### Enterprise Business Rules

| 用語 | 説明 |
|------|------|
| Entity | ビジネスルールとデータをカプセル化（DDD: Entity + Value Object） |
| Value Object | 不変、属性で定義（DDD由来） |
| Domain Service | ステートレスな操作、どのEntityにも紐付かない機能 |

### Application Business Rules

| 用語 | 説明 |
|------|------|
| Use Case | ユースケースを表すインターフェース |
| Interactor | Use Caseの実装 |
| Input Boundary | Use Caseの入力インターフェース |
| Output Boundary | Presenterのインターフェース |
| Input/Output Data | データ転送オブジェクト |

### Interface Adapters

| 用語 | 説明 |
|------|------|
| Controller | 外部入力をUse Caseに渡す形式に変換 |
| Presenter | Use Case出力をView用に変換 |
| Gateway | 外部リソースの抽象化（Repository含む） |

### Frameworks & Drivers

| 用語 | 説明 |
|------|------|
| Web | Webフレームワーク（Spring, Rails等） |
| DB | データベース（MySQL, MongoDB等） |
| UI | UIフレームワーク（React, Android等） |
| Adapter | 具体的な処理、Translator使用 |
| Translator | 型変換（json→ドメインモデル等） |

---

## 実装時の確認事項

| 項目 | ガイドライン |
|------|-------------|
| リポジトリIF | ドメイン層で使うならドメイン層、アプリ層のみならアプリ層で定義 |
| リポジトリ使用 | 集約内部からは避ける、ドメインサービスでは可 |
| Gateway粒度 | 完全抽象化は現実的でない、利用技術に適した粒度で |
| ORM | 完全に永続化を隠蔽するならDomain Modelとして扱える可能性 |
| Input/Output Boundary | Use Case→Presenter または Presenter→Use Case、統一する |

---

## 凝集度3原則（コンポーネントのまとめ方）

| 原則 | 略称 | 日本語名 | 核心 |
|------|------|---------|------|
| Reuse/Release Equivalence Principle | REP | 再利用・リリース等価 | 再利用単位 = リリース単位 |
| Common Closure Principle | CCP | 閉鎖性共通 | 同じ理由で変更されるものをまとめる |
| Common Reuse Principle | CRP | 全再利用 | コンポーネント全体を使うか、使わないなら依存しない |

### トレードオフ三角形

```
           REP
          /\
         /  \
        /    \
       /      \
      /________\
    CCP        CRP
```

- REP重視 → CCP軽視 → コンポーネントが頻繁に変更される
- CCP重視 → REP軽視 → リリース・再利用が難しい
- CRP重視 → REP軽視 → コンポーネント数が増える

---

## 結合3原則（コンポーネントのつなぎ方）

| 原則 | 略称 | 日本語名 | 核心 |
|------|------|---------|------|
| Acyclic Dependencies Principle | ADP | 非循環依存関係 | 循環依存を禁止 |
| Stable Dependencies Principle | SDP | 安定依存 | 不安定→安定へ依存 |
| Stable Abstractions Principle | SAP | 安定度・抽象度等価 | 安定度 = 抽象度 |

### 安定度の定義

- **安定:** 多くから依存される（変更コストが高い）
- **不安定:** 多くに依存する（変更しやすい）

### 抽象度の定義

- **抽象:** インターフェース、抽象クラス
- **具象:** 実装クラス

### SAPの対応

| 安定度 | 抽象度 | 内容 |
|--------|--------|------|
| 高い | 高い | インターフェース、ビジネスルール |
| 低い | 低い | 実装詳細、UI、DB |

---

## 開発フェーズごとの指針

| フェーズ | 重視する原則 | 理由 |
|---------|------------|------|
| 開発初期 | CCP + CRP | 仕様不安定、変更局所化が優先 |
| 開発中盤以降 | REP + CRP | 仕様安定、再利用で効率化 |

---

## 基本的な依存の方向

```
┌─────────────────┐
│   インターフェース  │ ← 最も安定・抽象
└────────┬────────┘
         │ 依存
┌────────▼────────┐
│    ユースケース    │
└────────┬────────┘
         │ 依存
┌────────▼────────┐
│     実装詳細      │ ← 最も不安定・具象
└─────────────────┘

※ 矢印は依存の方向（不安定→安定）
```

---

## クイックチェック

### このコンポーネント分割でいいか？

1. 変更理由は1つか？ → CCP
2. 再利用単位と一致するか？ → REP
3. 使わないものへの依存はないか？ → CRP

### この依存関係でいいか？

1. 循環していないか？ → ADP
2. 不安定→安定の方向か？ → SDP
3. 抽象度と安定度が一致しているか？ → SAP
