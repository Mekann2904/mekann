---
name: test-engineering
description: 包括的テスト戦略スキル。テストピラミッドに基づく単体テスト〜E2Eテストまで全レイヤーの設計・実装を支援。プロパティベーステスト、モデルベーステスト、契約テストを含む汎用的なテスト手法論を提供。
license: MIT
tags: [testing, tdd, bdd, property-based, e2e, contract-testing]
metadata:
  skill-version: "1.0.0"
  created-by: test-engineering-team
---

# Test Engineering

テストピラミッドに基づく包括的テスト戦略スキル。単体テストからE2Eテストまで、高速で信頼性が高く、メンテナンス性に優れたテストポートフォリオの構築を支援する。

**主な機能:**
- テストピラミッド設計とテストポートフォリオ構築
- 単体テスト設計（AAA/Given-When-Then、モック/スタブ）
- 統合テスト・契約テスト（Consumer-Driven Contracts）
- E2Eテスト・受け入れテスト（BDD）
- プロパティベーステスト・モデルベーステスト
- テストコード品質のレビュー

## 概要

現代のソフトウェア開発において、テスト自動化は不可欠。継続的デリバリーを実現するには、ビルドパイプライン内で自動化テストを実行し、ソフトウェアの品質を継続的に検証する必要がある。

このスキルは、テストピラミッドの概念に基づき、以下を提供:

1. **テスト戦略設計**: 適切なテストの粒度と量のバランス
2. **テストコード品質**: 可読性・保守性の高いテストコード
3. **テスト重複回避**: 上位・下位テストの適切な役割分担
4. **迅速なフィードバック**: 高速テストをパイプライン早期に配置

## 使用タイミング

以下の場合にこのスキルを読み込む:
- テスト戦略を設計する場合
- テストコードを書く場合
- テストピラミッドを構築する場合
- テストの品質をレビューする場合
- プロパティベーステストを設計する場合
- 契約テストを実装する場合

---

## テストピラミッド

### 基本構造

```
        ┌─────────────┐
        │    E2E      │  ← 少数・高コスト・高信頼性
        ├─────────────┤
        │ 統合・契約   │  ← 中程度
        ├─────────────┤
        │   単体テスト  │  ← 多数・高速・低コスト
        └─────────────┘
```

### 重要原則

1. **異なる粒度レベルでテストを記述する**
2. **テストの抽象度が高くなるほど、作成すべきテスト数は減少する**
3. **重複を避ける**: 上位テストで検出したエラーは下位テストで再現
4. **可能な限り下位層でテストする**

### アンチパターン: アイスクリームコーン

```
        ╱╲
       ╱  ╲
      ╱ E2E╲     ← 避けるべき：大量のE2Eテスト
     ╱      ╲       メンテナンス困難・実行遅延
    ╱────────╲
   ╱  統合    ╲
  ╱────────────╲
 ╱   単体テスト  ╲ ← テストが少ない
╱────────────────╲
```

---

## テストレイヤー詳細

### 1. 単体テスト（Unit Tests）

テストスイートの基盤。最も狭いスコープで、最も多数のテスト。

**特徴:**
- 高速実行（数千テストを数分で）
- 外部依存をスタブ化
- 1つの生産クラスにつき1つのテストクラス

**Solitary vs Sociable:**

単体テストにおける2つのアプローチ（Jay Fields氏の用語）：

| 種類 | 説明 | 使用場面 |
|------|------|---------|
| **Solitary（単独型）** | 全コラボレーターをモック化 | 外部依存が複雑な場合 |
| **Sociable（協調型）** | 実際のコラボレーターを使用 | 統合動作を確認したい場合 |

**「ユニット」の定義:**
- オブジェクト指向: クラス単位（一般的）
- 手続き型/関数型: 関数単位
- 実際にはチームが適切と判断する範囲
- 複数の密接に関連するクラスを単一ユニットとする場合もある

**ユニットテストの共通要素:**
1. 低レベルなテスト（システムの特定の部分に焦点）
2. プログラマー自身が記述（開発者が普段使うツール + テストフレームワーク）
3. 高速実行（他の種類のテストより大幅に高速）

### テストスイートと速度

#### コンパイルスイート vs コミットスイート

| スイート | 説明 | 実行頻度 | 期待速度 |
|---------|------|---------|---------|
| **コンパイルスイート** | 作業中の関連テストのみ | 1分間に数回 | 300ms〜数秒 |
| **コミットスイート** | 全単体テスト + 一部統合テスト | 1日に数回、コミット前 | 10秒〜10分 |

#### 速度の基準（専門家の意見）

| 人物 | コンパイルスイート | コミットスイート |
|------|-------------------|-----------------|
| Gary Bernhardt | 300ms | - |
| Dan Bodart | - | 10秒以内 |
| DHH | 数秒 | 数分 |
| Kent Beck | - | 10分以内 |

#### 速度の重要原則

```
最も重要なのは:
「頻繁に実行しても煩わしくない速度」

理由:
- バグ検出時に調査範囲が限定される
- 最後の変更箇所が原因だとすぐに特定可能
- テストを実行することが習慣化される

低速テストの対処:
- デプロイメントパイプラインを構築
- 低速テストをパイプラインの後段に配置
- コミットスイートは高速なテストのみで構成
```

**テスト構造（AAA）:**

```
// Arrange（準備）
テストデータを設定
モックの振る舞いを定義

// Act（実行）
テスト対象メソッドを呼び出し

// Assert（確認）
期待する結果を検証
```

**Given-When-Then（BDD）:**

```gherkin
Given 前提条件
When 実行条件
Then 期待結果
```

**何をテストすべきか:**
- 公開インターフェースをテスト
- 些細なコード（ゲッター/セッター等）はテストしない
- 実装の詳細ではなく、外部から観測可能な動作をテスト
- エッジケースを含むすべての非自明なコードパス

**避けるべきこと:**
- 実装詳細への過度な依存（リファクタリングで壊れる）
- プライベートメソッドの直接テスト
- 単純なコードへのテスト（無駄な作業）

### 2. 統合テスト（Integration Tests）

外部コンポーネントとの連携を検証。

**対象:**
- データベース連携
- ファイルシステム連携
- 外部API連携
- キューの読み書き

**原則:**
- 各統合ポイントを個別にテスト（狭域統合テスト）
- ローカル環境で外部依存を動作させる
- 本番システムとの直接統合は避ける

**ツール例:**
- Wiremock（HTTP APIスタブ）
- Testcontainers（Dockerベースのテスト環境）
- インメモリDB（H2等）

### 3. 契約テスト（Contract Tests）

サービス間インターフェースの契約を検証。

**Consumer-Driven Contracts:**

```
消費者チーム                    提供者チーム
    │                              │
    ├─ 消費者テスト作成            │
    ├─ Pactファイル生成            │
    │                              │
    ├──────── Pactファイル送付 ───→│
    │                              ├─ プロバイダーテスト実行
    │                              ├─ 全テスト通過 → 契約準拠
    │                              └─ テスト失敗 → 調整必要
```

**利点:**
- 提供者は実際に必要な機能のみを実装（YAGNI）
- 破壊的変更を早期検出
- チーム間の自律性を維持

### 4. UIテスト

ユーザーインターフェースの動作を検証。

**アプローチ:**
- フロントエンド単体テスト（React Testing Library等）
- ビジュアルリグレッションテスト
- アクセシビリティテスト

**注意:**
- 動作テストは自動化可能
- レイアウト/ユーザビリティは探索的テストで補完

### 5. E2Eテスト（End-to-End Tests）

完全に統合されたシステム全体をテスト。

**特徴:**
- 最高の信頼性
- 実行が遅い
- メンテナンスコストが高い
- 不安定（フレーキー）

**原則:**
- **最も価値のあるユーザージャーニーのみをテスト**
- 可能な限り最小限に抑える
- 下位層でカバー済みの条件を再テストしない

**例（ECサイト）:**
- 商品検索 → カート追加 → チェックアウト

### 6. 受け入れテスト（Acceptance Tests）

ユーザー視点で機能が正しく動作することを検証。

**BDDスタイル:**

```python
def test_add_to_basket():
    # given
    user = a_user_with_empty_basket()
    user.login()
    bicycle = article(name="bicycle", price=100)

    # when
    article_page.add_to_basket(bicycle)

    # then
    assert user.basket.contains(bicycle)
```

### 7. 探索的テスト（Exploratory Testing）

自動化できない品質問題を発見する手動テスト。

**目的:**
- 設計上の問題
- ユーザビリティ問題
- 自動テストが見逃したエッジケース

**原則:**
- 定期的に時間を確保
- 発見したバグは自動テストで再現

---

## プロパティベーステスト

### 概要

従来の例示ベーステスト（入力→期待出力）に対し、プロパティベーステストは「入力が満たすべき性質（プロパティ）」を検証。ランダム生成された多数の入力でテストを実行。

### 基本構造

```typescript
// fast-check例
fc.assert(
  fc.property(
    fc.integer(),           // 入力生成器
    (n) => {                // テスト関数
      // プロパティを検証
      return Math.abs(n) >= 0;
    }
  )
);
```

### プロパティのパターン

| パターン | 例 | 説明 |
|---------|-----|------|
| **可逆性** | `decode(encode(x)) === x` | 操作を元に戻せる |
| **不変条件** | `sort(arr).length === arr.length` | 操作後も維持される性質 |
| **冪等性** | `sort(sort(arr)) === sort(arr)` | 複数回実行で同じ結果 |
| **交換法則** | `f(g(x)) === g(f(x))` | 順序に依存しない |
| **結合法則** | `f(f(a, b), c) === f(a, f(b, c))` | グルーピングに依存しない |

### テスト生成戦略

```typescript
// カスタムArbitraryの定義
const userArbitrary = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  age: fc.integer({ min: 0, max: 150 }),
  email: fc.string().filter(s => s.includes('@'))
});

// テスト実行
fc.assert(
  fc.property(userArbitrary, (user) => {
    const serialized = JSON.stringify(user);
    const deserialized = JSON.parse(serialized);
    return _.isEqual(user, deserialized);  // 可逆性
  })
);
```

### 失敗時のシュリンク

プロパティベーステストは失敗時に「最小の失敗ケース」を特定：

```
失敗: n = 1234567890
↓ シュリンク
失敗: n = 12345
↓ シシュリンク
失敗: n = 10  ← 最小ケース発見
```

---

## モデルベーステスト

### 概要

システムの状態遷移モデルに基づいてテストを生成。モデルが期待する状態と実際のシステム状態を比較検証。

### 基本構造

```typescript
interface Model {
  state: S;
  actions: Action<S>[];
}

interface Action<S> {
  name: string;
  precondition: (state: S) => boolean;
  execute: (state: S) => S;
  postcondition: (state: S, result: any) => boolean;
}
```

### 実装例（カウンター）

```typescript
// モデル定義
const counterModel = {
  initialState: { count: 0 },

  actions: [
    {
      name: 'increment',
      precondition: (s) => s.count < 100,
      execute: (s) => ({ count: s.count + 1 }),
      postcondition: (s, actual) => actual.count === s.count
    },
    {
      name: 'decrement',
      precondition: (s) => s.count > 0,
      execute: (s) => ({ count: s.count - 1 }),
      postcondition: (s, actual) => actual.count === s.count
    },
    {
      name: 'reset',
      precondition: () => true,
      execute: () => ({ count: 0 }),
      postcondition: (s, actual) => actual.count === 0
    }
  ],

  invariants: [
    (s) => s.count >= 0,
    (s) => s.count <= 100
  ]
};

// テスト実行
runModelBasedTest(counterModel, {
  maxSteps: 100,
  numRuns: 1000
});
```

### 状態遷移図

```
         increment
    ┌────────────────┐
    │                │
    ▼                │
  [count=0] ──────→ [count=1] ───→ ...
    │                │
    │ reset          │ reset
    │                │
    └────────────────┘
         [count=0]
```

---

## テストダブル

### 種類

| 種類 | 用途 | 特徴 |
|------|------|------|
| **Stub** | 固定応答を返す | 状態を持たない |
| **Mock** | 呼び出しを検証 | 期待される相互作用を確認 |
| **Fake** | 実装の簡略版 | 実際に動作する（インメモリDB等） |
| **Spy** | 呼び出しを記録 | 後で検証可能 |
| **Dummy** | 引数埋め | 使用されない |

### テストの忠実度（フィデリティ）

テストの忠実度とは、テストの動作が本番コードの動作をどの程度正確に反映しているかを示す指標。

#### 依存関係の選択優先順位（Google推奨）

```
┌─────────────────────────────────────────────────────────────┐
│              依存関係の選択優先順位                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  優先度1: 実際の実装                                        │
│  ├── 忠実度: 最高                                           │
│  ├── 実装コードが実際にテスト環境で実行                       │
│  └── トレードオフ: 遅い、非決定的、インスタンス化困難          │
│                                                             │
│  優先度2: フェイク                                          │
│  ├── 忠実度: 高                                             │
│  ├── 実際の実装と同様の動作（例: インメモリDB）               │
│  └── トレードオフ: 作成・メンテナンスコスト                    │
│                                                             │
│  優先度3: モック（可能な限り回避）                           │
│  ├── 忠実度: 低                                             │
│  ├── 実装を一切実行せず、テストコードで動作定義               │
│  └── 用途: 稀なコードパス（タイムアウト等のエラー条件）         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 低忠実度 vs 高忠実度テスト

```typescript
// ❌ 低忠実度テスト: モックで置き換え
const validator = mock(OrderValidator);
const processor = mock(PaymentProcessor);
const cart = new ShoppingCart(validator, processor);

// ✅ 高忠実度テスト: 実際の実装またはフェイク
const validator = createValidator();  // 実際の実装
const processor = new FakeProcessor();  // フェイク
const cart = new ShoppingCart(validator, processor);
```

#### モックが適切なケース

```typescript
// ✅ モックが適切: 稀なエラー条件
test('should handle timeout error', async () => {
  const mockApi = {
    fetch: jest.fn().mockRejectedValue(new TimeoutError())
  };

  const service = new ApiService(mockApi);
  const result = await service.getData();

  expect(result.status).toBe('error');
  expect(result.error.code).toBe('TIMEOUT');
});

// ❌ モックが不適切: 通常のビジネスロジック
// モックを使うと実際の実装のバグを検出できない
```

#### テストサイズと忠実度のバランス

| テストサイズ | 特徴 | 忠実度との関係 |
|-------------|------|---------------|
| **小規模** | 単一プロセス、外部依存なし | 実装/フェイクで高忠実度可能 |
| **中規模** | マルチプロセス、ローカルネットワーク | 重い依存関係を利用可能 |
| **大規模** | 外部ネットワーク、フル統合 | 最高忠実度 |

### 適切な使用場面

```typescript
// Stub: 固定応答
const stubRepo = {
  findById: (id) => ({ id, name: 'Test User' })
};

// Mock: 呼び出し検証
const mockRepo = {
  save: vi.fn().mockReturnValue(true)
};
// 検証: expect(mockRepo.save).toHaveBeenCalledWith(user);

// Fake: 実際に動作
class FakeUserRepository {
  private users = new Map();

  save(user) {
    this.users.set(user.id, user);
    return user;
  }

  findById(id) {
    return this.users.get(id);
  }
}
```

### 状態検証 vs 振る舞い検証

#### 2つの検証アプローチ

| 検証方法 | 説明 | 特徴 |
|---------|------|------|
| **状態検証** | SUTと協力者の状態を確認 | 最終結果に注目 |
| **振る舞い検証** | SUTが協力者に対する正しい呼び出しを確認 | 相互作用に注目 |

#### 状態検証の例（古典的TDD）

```typescript
// 実際の倉庫オブジェクトを使用
test('should fill order if enough inventory', () => {
  const warehouse = new Warehouse();
  warehouse.add('Talisker', 50);

  const order = new Order('Talisker', 50);
  order.fill(warehouse);

  // 状態検証: 倉庫の在庫状態を確認
  expect(order.isFilled()).toBe(true);
  expect(warehouse.getInventory('Talisker')).toBe(0);
});
```

#### 振る舞い検証の例（モック主義TDD）

```typescript
// モック倉庫オブジェクトを使用
test('should fill order if enough inventory', () => {
  const mockWarehouse = mock(Warehouse);
  when(mockWarehouse.hasInventory('Talisker', 50)).thenReturn(true);

  const order = new Order('Talisker', 50);
  order.fill(mockWarehouse);

  // 振る舞い検証: 呼び出しを確認
  verify(mockWarehouse).hasInventory('Talisker', 50);
  verify(mockWarehouse).remove('Talisker', 50);
  expect(order.isFilled()).toBe(true);
});
```

### 古典的TDD vs モック主義的TDD

#### 選択基準

| 観点 | 古典的TDD | モック主義的TDD |
|------|----------|----------------|
| **依存関係** | 実際のオブジェクト優先 | 興味深い動作には常にモック |
| **検証方法** | 状態検証 | 振る舞い検証 |
| **開発方向** | ミドルアウト可能 | 外側から内側 |
| **テスト分離** | バグが連鎖的失敗の可能性 | 失敗が局所的 |
| **実装結合** | 低い | 高い（リファクタリングで壊れやすい） |
| **セットアップ** | オブジェクトマザー必要 | モック設定のみ |

#### いつどちらを選ぶか

```yaml
古典的TDDが適している場合:
  - ドメインモデル中心の開発
  - リファクタリング頻度が高い
  - 実装詳細への依存を避けたい

モック主義的TDDが適している場合:
  - 外側から内側への開発（UI層から）
  - オブジェクトの振る舞い設計を重視
  - 複雑な連携のテスト分離が必要

共通の原則:
  - どちらも受け入れテスト（結合テスト）が必要
  - テストの粒度を適切に保つ
  - TDDの実践には実際の経験が必要
```

### 所有していない型をモック化する問題

サードパーティライブラリなど「所有していない型」を直接モック化すると、メンテナンスが困難になる。

#### 問題点

| 問題 | 説明 | 具体例 |
|------|------|--------|
| **ライブラリアップグレード困難** | モックの期待値が古くなる | APIの戻り値型が変更された場合 |
| **バグ検出不可** | モックの前提が古く、実際のバグを隠蔽 | 新しい戻り値をモックが返さない |

#### 問題のあるコード例

```typescript
// ❌ サードパーティライブラリを直接モック化
const mockSalaryProcessor = mock(SalaryProcessor);
const mockTransactionStrategy = mock(TransactionStrategy);

when(mockSalaryProcessor.addStrategy()).thenReturn(mockTransactionStrategy);
when(mockSalaryProcessor.paySalary()).thenReturn('SUCCESS');

// 問題: ライブラリが更新されてもモックは古いまま
// 問題: 新しい戻り値を処理できなくてもテストはパス
```

#### 対策の優先順位

```
┌─────────────────────────────────────────────────────────────┐
│        所有していない型への対策優先順位                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  優先度1: 実際の実装を使用                                   │
│  └── 最も確実、ライブラリの実際の動作をテスト                 │
│                                                             │
│  優先度2: フェイク実装を使用                                 │
│  └── ライブラリ提供者のフェイクが理想的                       │
│                                                             │
│  優先度3: ラッパークラスを作成してモック化                    │
│  └── 自分の型をモック化、ライブラリAPIへの依存を局所化         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 対策例

```typescript
// ✅ 対策1: 実際の実装を使用
const processor = new SalaryProcessor();  // 実際の実装
const service = new MyPaymentService(processor);
expect(service.sendPayment()).toBe('SUCCESS');

// ✅ 対策2: フェイク実装を使用
const fakeProcessor = new FakeSalaryProcessor();  // テスト用フェイク
const service = new MyPaymentService(fakeProcessor);
expect(service.sendPayment()).toBe('SUCCESS');

// ✅ 対策3: ラッパークラスを作成
// ラッパー（自分の型）
class MySalaryProcessor {
  constructor(private library: SalaryProcessor) {}

  sendSalary(): PaymentStatus {
    return this.library.paySalary();  // ライブラリを委譲
  }
}

// テストではラッパーをモック化
const mockMyProcessor = mock(MySalaryProcessor);
when(mockMyProcessor.sendSalary()).thenReturn(PaymentStatus.SUCCESS);

const service = new MyPaymentService(mockMyProcessor);
expect(service.sendPayment()).toBe(PaymentStatus.SUCCESS);

// ラッパー自体のテストでは実際のライブラリを使用
test('MySalaryProcessor should delegate to library', () => {
  const realLibrary = new SalaryProcessor();  // 実際の実装
  const wrapper = new MySalaryProcessor(realLibrary);

  // ラッパーが正しく委譲しているかテスト
  expect(wrapper.sendSalary()).toBeDefined();
});
```

#### ラッパーパターンの利点

```yaml
利点:
  - ライブラリAPIへの依存を1箇所（ラッパー）に集約
  - ライブラリアップグレード時はラッパーのみ更新
  - メインのテストコードは影響を受けない
  - ラッパーのテストでライブラリ統合を検証

注意点:
  - ラッパー自体のテストでは実際の実装を使用
  - テスト実行時間の増加はラッパーのテストに限定
```

---

## デプロイパイプラインへの組み込み

### ステージ構成

```
┌─────────────┐
│  Build      │  単体テスト（高速）
├─────────────┤
│  Test       │  統合テスト・契約テスト
├─────────────┤
│  Staging    │  E2Eテスト・受け入れテスト
├─────────────┤
│  Production │  探索的テスト（手動）
└─────────────┘
```

### 原則

1. **迅速なフィードバック**: 高速テストを早期段階に
2. **信頼性向上**: 各ステージで確信を深める
3. **失敗の局所化**: どの層で失敗したか明確に

---

## テストの価値

### ユニットテストの最大の価値

```
「安心感」

- 既存機能を壊す不安なくリファクタリング可能
- 新機能追加時のリグレッション不安を解消
- 開発速度向上、バグ減少
```

### 価値のあるテストの3条件

| 条件 | 説明 | 判断基準 |
|------|------|---------|
| **リグレッション検出** | バグを検出できる確率 | 処理されるコード量とビジネスロジックの重要性 |
| **偽陽性の低さ** | 誤った警告の少なさ | 実装詳細への依存度が低い |
| **迅速なフィードバック** | 高速実行 | テストスイートの実行時間 |

### 3条件のトレードオフ関係

```
┌─────────────────────────────────────────────────────────────┐
│              3条件は相互にトレードオフ                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  E2Eテスト:                                                 │
│  ├── リグレッション検出: 高（全レイヤーテスト）               │
│  ├── 偽陽性: 低（実装詳細に依存しない）                       │
│  └── フィードバック: 遅い                                   │
│                                                             │
│  実装詳細テスト:                                             │
│  ├── リグレッション検出: 高                                 │
│  ├── 偽陽性: 高（実装詳細に強く依存）                        │
│  └── フィードバック: 速い                                   │
│                                                             │
│  理想的なテスト:                                             │
│  ├── リグレッション検出: 高                                 │
│  ├── 偽陽性: 低                                             │
│  └── フィードバック: 速い                                   │
│      → 適切なアーキテクチャで実現可能                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 偽陽性の原因と対策

#### 原因：実装詳細への強い依存

```typescript
// ❌ 実装詳細のテスト（偽陽性が高い）
test('should execute correct SQL', () => {
  const user = repository.getById(5);
  expect(repository.lastExecutedSql).toBe(
    'SELECT * FROM dbo.[User] WHERE UserID = 5'
  );
});

// 問題: 以下は全て機能的に等価だが、テストは失敗する
// - SELECT * FROM dbo.User WHERE UserID = 5
// - SELECT UserID, Name, Email FROM dbo.[User] WHERE UserID = 5

// ✅ 最終結果のテスト（偽陽性が低い）
test('should return user by id', () => {
  const user = repository.getById(5);
  expect(user).toEqual({ id: 5, name: 'Expected Name' });
});
```

#### 対策：「How」ではなく「What」をテスト

```
┌─────────────────────────────────────────────────────────────┐
│  実装詳細のテスト（避ける）    最終結果のテスト（推奨）        │
│                                                             │
│      「どのように」             「何を」                     │
│          ↓                       ↓                         │
│    内部実装を検証            外部から観測可能な動作を検証     │
│          ↓                       ↓                         │
│    リファクタリングで        リファクタリングでも            │
│    テストが失敗              テストは成功                    │
└─────────────────────────────────────────────────────────────┘
```

### テストしないコード

```
価値の低いテスト（テストしなくてよい）:

- 単純なプロパティ（getter/setter）
- 短く、ビジネスロジックを含まないコード
- 自動生成コード
- フレームワークのコード

理由:
- リグレッションを検出できる確率がほぼゼロ
- テストのコスト > 価値
```

---

## テスト命名規則

### 3要素構成

テスト名は以下の3つの要素で構成：

```
[メソッド名]_[シナリオ条件]_[期待動作]
```

| 要素 | 説明 | 例 |
|------|------|-----|
| **メソッド名** | テスト対象メソッド | `Add` |
| **シナリオ条件** | 実行条件 | `EmptyString` |
| **期待動作** | 期待される結果 | `ReturnsZero` |

**完全なテスト名例:**
- `Add_EmptyString_ReturnsZero`
- `GetDiscountedPrice_OnTuesday_ReturnsHalfPrice`
- `ParseLogLine_StartsAndEndsWithSpace_ReturnsTrimmedResult`

**命名規則の重要性:**
- テストの目的と適用範囲を明確に表現
- ドキュメントとしての役割
- テスト失敗時にどのシナリオが問題か特定可能

---

## テスト作成のベストプラクティス

### 1. インフラストラクチャへの依存を避ける

```
❌ 避けるべき依存:
- データベース
- ファイルシステム
- ネットワーク
- 外部API

✅ 推奨:
- 依存性注入を使用
- ユニットテストと統合テストを別プロジェクトに
- 明示的依存関係原則に従う
```

### 2. 最小限の条件でパス

テスト入力は、現在テストしている動作を検証するために必要な最小限の情報であるべき。

```typescript
// ❌ 過剰なデータ
test('should calculate price', () => {
  const order = {
    id: 'ORDER-12345',
    items: [
      { sku: 'SKU001', name: 'Product A', price: 100, quantity: 2 },
      { sku: 'SKU002', name: 'Product B', price: 200, quantity: 1 },
    ],
    customer: { id: 'CUST-001', name: 'John', email: 'john@example.com' },
  };
  expect(calculateTotal(order)).toBe(400);
});

// ✅ 最小限のデータ
test('should calculate total from items', () => {
  const order = { items: [{ price: 100, quantity: 2 }] };
  expect(calculateTotal(order)).toBe(200);
});
```

### 3. マジックストリングを避ける

コメントや説明なしにハードコードされた値は可読性を低下させる。

```typescript
// ❌ マジックストリング
test('should throw on overflow', () => {
  expect(() => add('1001')).toThrow(OverflowError);
});

// ✅ 意図を明確化
test('should throw when exceeding maximum sum', () => {
  const MAXIMUM_RESULT = '1001';
  expect(() => add(MAXIMUM_RESULT)).toThrow(OverflowError);
});
```

### 4. テストにロジックを記述しない

```
❌ テスト内のロジック:
- 文字列の手動結合
- if / while / for / switch
- 条件分岐

理由:
- バグが混入するリスク
- テスト自体の信頼性低下
- テストが失敗した原因が不明瞭
```

```typescript
// ❌ ロジックを含むテスト
test('should handle multiple numbers', () => {
  const testCases = ['0,0,0', '0,1,2', '1,2,3'];
  let expected = 0;
  testCases.forEach(test => {
    expect(add(test)).toBe(expected);
    expected += 3;
  });
});

// ✅ パラメータ化テスト
test.each([
  ['0,0,0', 0],
  ['0,1,2', 3],
  ['1,2,3', 6],
])('should return %s for input %s', (input, expected) => {
  expect(add(input)).toBe(expected);
});
```

### 5. Setup/Teardown よりヘルパーメソッド

```typescript
// ❌ Setup属性の使用（暗黙的）
let calculator: Calculator;

beforeEach(() => {
  calculator = new Calculator();
});

test('should add numbers', () => {
  expect(calculator.add('0,1')).toBe(1);
});

// ✅ ヘルパーメソッド（明示的）
test('should add numbers', () => {
  const calculator = createDefaultCalculator();
  expect(calculator.add('0,1')).toBe(1);
});

function createDefaultCalculator(): Calculator {
  return new Calculator();
}
```

**ヘルパーメソッドの利点:**
- 各テスト内ですべてのコードが明示される
- テストごとの過剰/不足な準備を防止
- テスト間の状態共有を回避

### 6. 単一Actタスク

```typescript
// ❌ 複数のAct
test('should treat empty entries as zero', () => {
  const result1 = add('');
  const result2 = add(',');
  expect(result1).toBe(0);
  expect(result2).toBe(0);
});

// ✅ パラメータ化で分離
test.each([
  ['', 0],
  [',', 0],
])('should treat "%s" as zero', (input, expected) => {
  expect(add(input)).toBe(expected);
});
```

**単一Actの利点:**
- 失敗時にどのActが問題か特定可能
- テストが単一ケースに集中
- 失敗原因が明確

### 7. プライベートメソッドは公開メソッドで検証

```
原則: プライベートメソッドを個別にテストしない

理由:
- プライベートメソッドは実装の詳細
- 公開メソッドの最終出力が重要
- プライベートメソッドが正しくても、呼び出し元が正しく利用するとは限らない
```

```typescript
// 実装
class Parser {
  parseLogLine(input: string): string {
    return this.trimInput(input);
  }

  private trimInput(input: string): string {
    return input.trim();
  }
}

// ✅ 公開メソッドをテスト
test('should trim whitespace from log line', () => {
  const parser = new Parser();
  expect(parser.parseLogLine(' a ')).toBe('a');
});
```

### 8. シームパターンで静的参照をスタブ化

静的参照（`DateTime.now`等）はテスト困難。インターフェースでラップして制御可能にする。

```typescript
// ❌ 静的参照（テスト困難）
getDiscountedPrice(price: number): number {
  if (DateTime.now.dayOfWeek === DayOfWeek.Tuesday) {
    return price / 2;
  }
  return price;
}

// ✅ シームパターン（インターフェースでラップ）
interface IDateTimeProvider {
  dayOfWeek(): DayOfWeek;
}

getDiscountedPrice(price: number, dateTimeProvider: IDateTimeProvider): number {
  if (dateTimeProvider.dayOfWeek() === DayOfWeek.Tuesday) {
    return price / 2;
  }
  return price;
}

// テスト
test('should return half price on Tuesday', () => {
  const calculator = new PriceCalculator();
  const mockProvider = { dayOfWeek: () => DayOfWeek.Tuesday };
  expect(calculator.getDiscountedPrice(2, mockProvider)).toBe(1);
});
```

### 9. 謙虚なオブジェクト（Humble Object）

テストが困難/不可能な要素に最小限のロジックしか持たせず、可能な限り多くのロジックをテスト可能な領域に移動させる設計パターン。

#### 概念

```
┌─────────────────────────────────────────────────────────────┐
│                    謙虚なオブジェクト                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  テスト困難な層              テスト可能な層                   │
│  ┌─────────────┐           ┌─────────────┐                 │
│  │ UI コントロール│ ←─最小限→ │ プレゼンター  │                 │
│  │ DB アクセス   │           │ サービス     │                 │
│  │ 外部 API     │           │ ドメインロジック│                │
│  └─────────────┘           └─────────────┘                 │
│                                                             │
│  「謙虚」= ロジックを最小限に                                 │
│  ロジックをテスト可能な領域へ移動                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### テスト困難な要素

| 要素 | なぜ困難か | 対策 |
|------|-----------|------|
| **UIコントロール** | テストフレームワーク不十分、実行遅い | MVVM、パッシブビュー |
| **データベース** | セットアップが複雑 | リポジトリパターン |
| **外部API** | ネットワーク依存、不安定 | モック/スタブ |
| **ファイルシステム** | 環境依存 | インターフェース化 |

#### 実装例

```typescript
// ❌ テスト困難: UIにロジックが混在
class UserForm {
  onSubmit() {
    const name = this.nameInput.value;
    const email = this.emailInput.value;

    // バリデーションロジック（テスト困難）
    if (name.length < 2) {
      this.showError('Name too short');
      return;
    }

    // API呼び出し（テスト困難）
    fetch('/api/users', { method: 'POST', body: JSON.stringify({ name, email }) });
  }
}

// ✅ 謙虚なオブジェクト: UIは最小限、ロジックは分離
class UserForm {  // 謙虚なオブジェクト（ロジック最小）
  constructor(
    private validator: UserValidator,
    private service: UserService
  ) {}

  onSubmit() {
    const name = this.nameInput.value;
    const email = this.emailInput.value;

    const result = this.validator.validate({ name, email });
    if (!result.valid) {
      this.showError(result.error);
      return;
    }

    this.service.createUser({ name, email });
  }
}

// テスト可能なロジック
class UserValidator {
  validate(user: { name: string; email: string }): ValidationResult {
    if (user.name.length < 2) {
      return { valid: false, error: 'Name too short' };
    }
    return { valid: true };
  }
}

// テスト
test('should reject short name', () => {
  const validator = new UserValidator();
  const result = validator.validate({ name: 'A', email: 'test@example.com' });
  expect(result.valid).toBe(false);
});
```

#### 関連パターン

| パターン | 説明 | 適用場面 |
|---------|------|---------|
| **MVVM** | Model-View-ViewModel | UI アプリケーション |
| **パッシブビュー** | ビューは受動的 | UI テスト容易化 |
| **リポジトリ** | データアクセスを抽象化 | DB テスト容易化 |
| **ゲートウェイ** | 外部サービスを抽象化 | API テスト容易化 |

### プレゼンテーションモデル（MVVM）

プレゼンテーションモデルは謙虚なオブジェクトパターンの代表的な実装。ビューの状態と動作をGUIコントロールから独立したモデルクラスに抽出する。

#### 構造

```
┌─────────────────────────────────────────────────────────────┐
│                  プレゼンテーションモデル構造                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │    View      │      │ Presentation │                   │
│  │   (謙虚)     │⟷⟷⟷⟷⟷│    Model     │                   │
│  │              │ 同期  │   (ロジック)  │                   │
│  │ - 状態表示   │      │ - 状態管理    │                   │
│  │ - イベント   │      │ - バリデーション│                  │
│  └──────────────┘      │ - 有効/無効判定 │                  │
│                        └───────┬──────┘                   │
│                                │                          │
│                                ↓                          │
│                        ┌──────────────┐                   │
│                        │   Domain     │                   │
│                        │   Model      │                   │
│                        └──────────────┘                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### 核心原則

| 原則 | 説明 |
|------|------|
| **自己完結型クラス** | UIの全データと動作を表現 |
| **コントロール要素を含まない** | 画面描画用コードを一切含まない |
| **ビューの単純化** | ビューは状態の表示のみ担当 |
| **決定権の分離** | 表示に関する決定は全てPMが行う |

#### 実装例

```typescript
// ❌ ビューにロジックが混在
class AlbumForm {
  onClassicalChanged() {
    // ビュー内で有効/無効を判断（テスト困難）
    this.composerField.enabled = this.classicalCheckbox.checked;
  }
}

// ✅ プレゼンテーションモデル（テスト可能）
class AlbumPresentationModel {
  private _isClassical: boolean = false;
  private _composer: string = '';

  get isClassical(): boolean {
    return this._isClassical;
  }

  set isClassical(value: boolean) {
    this._isClassical = value;
    if (!value) {
      this._composer = '';  // クラシックでないなら作曲家をクリア
    }
  }

  // ビューの有効/無効状態を決定
  get isComposerFieldEnabled(): boolean {
    return this._isClassical;  // PMが決定権を持つ
  }

  get composer(): string {
    return this._composer;
  }

  set composer(value: string) {
    if (this._isClassical) {
      this._composer = value;
    }
  }

  // ウィンドウタイトル
  get formTitle(): string {
    return `Album: ${this.title}`;
  }

  // ボタンの有効状態
  get isApplyEnabled(): boolean {
    return this.hasChanges;
  }

  get isCancelEnabled(): boolean {
    return this.hasChanges;
  }
}

// 謙虚なビュー（ロジック最小）
class AlbumForm {
  constructor(private pm: AlbumPresentationModel) {}

  onClassicalChanged() {
    this.pm.isClassical = this.classicalCheckbox.checked;
    this.syncFromPM();  // PMから状態を同期
  }

  onComposerChanged() {
    this.pm.composer = this.composerField.value;
    this.syncFromPM();
  }

  private syncFromPM() {
    // PMから状態を反映（ロジックなし）
    this.composerField.enabled = this.pm.isComposerFieldEnabled;
    this.applyButton.enabled = this.pm.isApplyEnabled;
    this.cancelButton.enabled = this.pm.isCancelEnabled;
    this.title = this.pm.formTitle;
  }
}

// テスト
test('should enable composer field when classical is checked', () => {
  const pm = new AlbumPresentationModel();

  pm.isClassical = true;
  expect(pm.isComposerFieldEnabled).toBe(true);

  pm.isClassical = false;
  expect(pm.isComposerFieldEnabled).toBe(false);
});

test('should clear composer when not classical', () => {
  const pm = new AlbumPresentationModel();

  pm.isClassical = true;
  pm.composer = 'Beethoven';

  pm.isClassical = false;
  expect(pm.composer).toBe('');
});
```

#### 同期処理の実装選択

| 実装方法 | 利点 | 欠点 |
|---------|------|------|
| **ビュー側に同期コード** | 実装が簡単 | 同期コードがテストできない |
| **PM側に同期コード** | テスト可能 | PMがビューに依存、結合度増 |
| **マッパー導入** | 関心の分離 | クラス数が増加 |

#### データバインディングとの組み合わせ

```typescript
// データバインディングが利用可能な場合
// 宣言的な同期が可能

class AlbumForm {
  constructor(private pm: AlbumPresentationModel) {
    // 双方向バインディング
    this.bind(this.classicalCheckbox, 'checked', pm, 'isClassical');
    this.bind(this.composerField, 'value', pm, 'composer');
    this.bind(this.composerField, 'enabled', pm, 'isComposerFieldEnabled');
    this.bind(this.applyButton, 'enabled', pm, 'isApplyEnabled');
  }
}
```

---

## テストコード品質

### クリーンなテストコードの原則

1. **テストコードは本番コードと同様に重要**
2. **1つのテストで1つの条件のみを検証**
3. **AAA/Given-When-Then構造を守る**
4. **可読性を優先（DRYに固執しない）**
5. **3の法則でリファクタリング**

### DRY vs DAMP

| 原則 | 説明 | 適用場面 |
|------|------|---------|
| **DRY** | Don't Repeat Yourself | 本番コード |
| **DAMP** | Descriptive And Meaningful Phrases | テストコード |

テストでは「読みやすさ」を優先し、重複があっても構わない。

```typescript
// 良い例: DAMP（各テストで明示的）
test('should greet Peter Pan', () => {
  const user = new User('Peter', 'Pan');  // 重複してもOK
  expect(greet(user)).toBe('Hello Peter Pan!');
});

test('should greet Alice Smith', () => {
  const user = new User('Alice', 'Smith');  // 重複してもOK
  expect(greet(user)).toBe('Hello Alice Smith!');
});
```

### 優れたテストの特徴

| 特徴 | 説明 |
|------|------|
| **高速性** | ミリ秒単位で完了 |
| **独立性** | 外部要因に依存しない |
| **再現性** | 結果が常に一貫 |
| **自動判定** | 人間の介入なしで判定 |
| **適切な時間管理** | コード記述時間に対して過度に長くない |

---

## コードカバレッジ

### 概要

コードカバレッジは、テストによって実行されたコードの割合を測定する指標。テスト品質を完全に測定するものではないが、実用的で客観的な業界標準指標として有用。

### Googleのガイドライン

| カバレッジ率 | 評価 | 説明 |
|-------------|------|------|
| **60%** | 許容範囲 | 最低限の水準 |
| **75%** | 称賛に値する | 良好な状態 |
| **90%** | 模範的 | 高い品質基準 |

### 重要な原則

#### 1. カバレッジ≠品質

高いカバレッジが高品質なテストを保証しない：

```
❌ 誤った安心感
- 100%カバレッジでもエッジケース未テストの可能性
- テストが実行されても、適切に検証されていない場合がある
- 機械的なコピー＆ペーストで目標達成

✅ 正しい理解
- カバレッジは「実行された」ことのみを保証
- 「正しくテストされた」ことは保証しない
- ミューテーションテストで品質を補完
```

#### 2. 低いカバレッジ＝高リスク

低いカバレッジは確実にリスクを示す：

```
テスト不足の2つのパターン:
(a) コードパス未カバー → カバレッジ分析で検出可能
(b) エッジケース未テスト → カバレッジ分析では検出困難
```

#### 3. 未カバー部分が重要

**コードカバレッジの真価は、カバーされていない部分を特定することにある。**

```
重要度の優先順位:
1. 未カバーのコード行を特定
2. なぜテストされていないか分析
3. そのリスクが許容範囲か判断
4. カバレッジ数値自体は参考程度
```

### カバレッジ目標の設定

#### 一律目標は存在しない

カバレッジ目標は以下の要素で判断：

| 要素 | 説明 | 高目標が必要な場合 |
|------|------|-------------------|
| **ビジネス影響度** | 障害時の影響範囲 | 決済・認証等の重要機能 |
| **変更頻度** | コード更新の頻度 | 頻繁に変更されるコード |
| **寿命見込み** | 長期運用の可能性 | 長期間維持するコード |
| **複雑さ** | ロジックの複雑度 | 複雑なビジネスロジック |

#### 新規コード vs 既存コード

```
プロジェクト全体: 目標値を現実的に設定（90%超は現実的でない場合も多い）
新規コミット: 99%を目指す（下限90%）

頻繁に変更されるコードは必ずテスト対象に含める
```

### カバレッジ改善の優先順位

#### 対数的減少の法則

```
効果の大きい改善:
  30% → 70%: 大きな効果

効果の小さい改善:
  90% → 95%: 限界的な効果

重要なのは段階的な改善:
- 新規コードが常に目標閾値を満たす
- 30%から70%への確実な改善
```

#### ボーイスカウトの原則

レガシーシステムへの対応：

```
「自分が見つけた時よりもキャンプ地をきれいにして去る」

- 一度に全体を改善しようとしない
- 触れた部分から少しずつ改善
- 時間をかけて段階的に健全化
```

### 単体テスト vs 統合テストのカバレッジ

#### 統合ビューの重要性

```
パイプライン全体のカバレッジ統合ビュー:

┌─────────────────────────────────────┐
│         統合カバレッジビュー          │
├─────────────────┬───────────────────┤
│  単体テスト      │  統合/E2Eテスト    │
│  (意図的)       │  (一部偶発的)      │
├─────────────────┴───────────────────┤
│         未カバー領域の特定            │
└─────────────────────────────────────┘

単体テスト: 実行コードと評価コードに高い相関
統合テスト: 一部は偶発的なカバレッジ
統合ビュー: 誤った安心感を回避
```

### カバレッジゲート

#### デプロイ承認プロセス

```
カバレッジゲートの種類:

1. 全コード対象ゲート
   - 固定カバレッジ数値
   - 例: 全体で60%以上

2. 新規コード対象ゲート
   - 前回バージョンからの差分
   - 例: 新規コードは90%以上

3. 重点領域指定
   - 重要なコードは高い閾値
   - デバッグログ等は除外可能
```

#### ゲートの運用原則

```
✅ 推奨:
- チームで約束を遵守
- 適切な承認メカニズム
- カバレッジ不足はチェックイン不可

❌ 避けるべき:
- チェックボックス化
- 形式的な達成
- 指標達成のプレッシャーによる品質低下
```

### コードレビューへの統合

```
コードレビューでのカバレッジ活用:

1. カバーされた各行をハイライト表示
2. 未カバー行について実践的な議論
3. 単に数値を確認するだけでなく、重要なコードがテストされているか確認
4. デバッグログ等、テスト優先度が低い部分を識別

効果:
- レビューの効率と容易さが向上
- 最も重要なコードが確実にテストされる
```

### カバレッジの限界と補完

#### ミューテーションテスト

カバレッジの限界を補完する手法：

```typescript
// ミューテーションテストの例
// 元のコード
function add(a: number, b: number): number {
  return a + b;
}

// ミュータント（変異版）
function add(a: number, b: number): number {
  return a - b;  // + を - に変更
}

// テストがこのミュータントを検出（失敗）すれば、
// テストが実際に値を検証していることを証明
```

## フラキーテスト（不安定なテスト）

### 概要

フラキーテストとは、同一のコードベースに対して合格と不合格の両方が報告されるテスト。Googleでは約1.5%のテスト実行が不安定で、テスト全体の約16%に何らかの不安定性が見られる。

### Googleのデータ

| 指標 | 値 |
|------|-----|
| テスト実行の不安定率 | 約1.5% |
| 何らかの不安定性を持つテスト | 約16%（7分の1） |
| 合格→不合格遷移の原因 | 84%がフラキーテスト |

### 影響

```
平均プロジェクト: 約1,000テスト
不安定率1.5% → 約15テストが失敗

問題:
- 偽陽性が多発 → 正当な失敗を無視する傾向
- ビルド監視コスト増大
- 「警告疲れ」で本当の問題を見逃す
- リリース遅延
```

### 根本原因

| 原因 | 説明 |
|------|------|
| **並行処理の問題** | レースコンディション、デッドロック |
| **非決定的動作** | ランダム値、時刻依存、ハッシュ順序 |
| **外部依存の不安定性** | API、ネットワーク、DB |
| **インフラ問題** | リソース不足、タイムアウト |
| **テスト間の干渉** | 共有状態、グローバル変数 |

### 対策方法

#### 1. 再実行戦略

```
✅ 有効な対策:
- 失敗テストのみ選択再実行
- 失敗時の自動再実行（最大3回等）
- 「不安定テスト」としてマーク

⚠️ 注意点:
- 3回連続失敗で報告 → 真の問題も遅延検出
- 例: 15分テスト × 3回 = 45分後に検出
```

#### 2. 自動隔離

```
仕組み:
- 不安定度を監視
- 閾値超過でクリティカルパスから除外
- バグレポート自動作成

⚠️ リスク:
- 実際のバグを隠蔽する可能性
- レースコンディション等の問題が見逃される
```

#### 3. 予防策（根本対策）

```typescript
// ❌ 非決定的なコード
test('should process in order', () => {
  const items = Object.values(data);  // 順序保証なし
  expect(items[0]).toBe('first');
});

// ✅ 決定的なコード
test('should process in order', () => {
  const items = Object.values(data).sort();  // 明示的ソート
  expect(items[0]).toBe('first');
});

// ❌ 時刻依存
test('should check time', () => {
  const now = new Date();  // 実行時刻に依存
  expect(isWorkingHour(now)).toBe(true);
});

// ✅ 時刻を注入
test('should check time', () => {
  const fixedTime = new Date('2024-01-15T10:00:00');
  expect(isWorkingHour(fixedTime)).toBe(true);
});
```

### フラキーテスト検出パターン

| パターン | 検出方法 |
|---------|---------|
| **頻度分析** | 同一コードで複数回実行し合格/不合格を統計 |
| **実行時間変動** | 実行時間の標準偏差が大きい |
| **タイミング依存** | 待機時間を変更して結果が変わる |
| **並列実行** | シリアル実行と並列実行で結果が異なる |

### テストサイズと不安定性の関係（Googleデータ）

#### サイズ別の不安定率

| テストサイズ | 不安定率 | 特徴 |
|-------------|---------|------|
| **小規模** | 0.5% | 単体テスト、高速、隔離済み |
| **中規模** | 1.6% | 統合テスト、一部外部依存 |
| **大規模** | 14% | E2Eテスト、多くの依存 |

**重要:** テストサイズが大きくなるほど、不安定性は指数関数的に増加。

#### 予測因子の強さ

| 指標 | 決定係数 r² | 予測精度 |
|------|------------|---------|
| **バイナリサイズ** | 0.82 | 非常に高い |
| **RAM使用量** | 0.76 | 高い |
| ライブラリ数 | 0.27 | 中程度 |

#### ツール vs テストサイズ

```
結論: ツール自体よりもテストサイズが重要

理由:
- 同じツールでも、小規模テストは安定
- 異なるツールでも、同規模なら不安定性は近い
- ツール間の差異: 4-5%
- テストサイズによる差異: 8-22%

推奨:
- 大規模テストを作成前に慎重に検討
- 最小限のテストケースで目的を達成できるか確認
- 大規模テストは追加の保守対策が必要
```

### AI支援コーディングとテスト

### 概要

AIエージェントによるコーディング支援が普及しているが、生成されるテストコードには特有の問題がある。開発者はAI生成コードを監督し、品質を担保する必要がある。

### AI生成テストの問題点

#### 重複テスト

```
❌ AIがやりがちなこと:
- 既存テスト関数に追加せず、新規関数を作成
- 他のテストでカバー済みの内容を再テスト
- 必要以上に多くのアサーションを追加

影響:
- テスト数が多い ≠ 品質が高い
- 重複テストは保守困難
- コード変更時に複数テストが失敗
- 開発者の作業負荷とストレス増大
```

#### 対策

```typescript
// ❌ AIが生成した重複テスト
test('should return user name', () => {
  expect(user.name).toBe('John');
});

test('should return user name correctly', () => {  // 重複
  expect(user.name).toBe('John');
});

// ✅ 既存テストに統合
test('should return user with correct properties', () => {
  expect(user.name).toBe('John');
  expect(user.email).toBe('john@example.com');
});
```

### AIの誤動作の影響範囲

| 影響範囲 | 特徴 | フィードバックループ | 具体例 |
|---------|------|---------------------|--------|
| **コミットまでの時間** | AIが妨げとなる | 短い | 動作しないコード、誤診断 |
| **イテレーションの作業フロー** | チーム内摩擦 | 中程度 | 過剰な事前作業、力任せの修正 |
| **長期的な保守性** | 将来的問題 | 長い | 重複テスト、再利用性欠如 |

### AI生成コードの品質問題

| 問題 | 説明 | 対策 |
|------|------|------|
| **再利用性の欠如** | 既存コンポーネントを認識せず重複作成 | 事前の既存コード調査 |
| **過剰な複雑さ** | 必要以上に複雑な実装 | YAGNI原則の適用 |
| **冗長なコード** | 不要なCSS、パラメータ | コードレビューでの削除 |

### AIコーディングにおけるベストプラクティス

#### 個人レベル

```yaml
必須実践:
  - AI生成コードは必ず慎重にレビュー
  - 修正や改善すべき点が見つからないことは稀
  - セッションが混乱したら中止して新規開始
  - 手動実装への切り替えを躊躇しない

注意すべき兆候:
  - 「とりあえず動く」ソリューション
  - セッションが長くなりすぎている
  - 同じ問題を繰り返し修正している

推奨:
  - ペアプログラミングの実践
  - 二人の目で多くの問題を発見
```

#### チーム/組織レベル

```yaml
品質監視ツール:
  - SonarQube / Codescene 等の導入
  - コードの臭いを検知
  - AI使用による問題（特に重複）を厳密監視

左シフト戦略:
  - コミット前フックの活用
  - IDE統合型コードレビュー
  - 開発段階で早期検出

継続的改善:
  - 週次での「AI品質問題」振り返り
  - 不具合記録として分析
  - カスタムルールの活用と洗練

文化:
  - 信頼と心理的安全性の確保
  - AI導入の課題を共有しやすい環境
  - 過度なプレッシャーを避ける
```

### テストレビュー時のチェックリスト（AI生成コード向け）

- [ ] 既存テストと重複していないか
- [ ] アサーションが過剰でないか
- [ ] 必要なテストが欠けていないか
- [ ] テストが実装詳細に依存していないか
- [ ] テスト名が意図を正しく表しているか

---

## チェックリスト

### テスト戦略設計

### テスト戦略設計

- [ ] テストピラミッドのバランスが適切か
- [ ] 各層のテストの責任が明確か
- [ ] 重複するテストがないか
- [ ] 高速なフィードバックループが確立されているか

### 単体テスト

- [ ] AAA構造に従っているか
- [ ] 公開インターフェースをテストしているか
- [ ] 実装詳細に依存しすぎていないか
- [ ] エッジケースをカバーしているか
- [ ] 些末なコードをテストしすぎていないか

### 統合テスト

- [ ] 各統合ポイントを個別にテストしているか
- [ ] ローカル環境で実行可能か
- [ ] シリアライズ/デシリアライズをテストしているか

### E2Eテスト

- [ ] 最も価値のあるユーザージャーニーに絞っているか
- [ ] 下位層でカバー済みの条件を再テストしていないか
- [ ] テストが安定しているか（フレーキーでないか）

### プロパティベーステスト

- [ ] 適切なプロパティを定義しているか
- [ ] カスタムArbitraryが必要か
- [ ] シュリンクが有効に機能しているか

### モデルベーステスト

- [ ] 状態遷移モデルが正確か
- [ ] インバリアントが定義されているか
- [ ] 事前条件/事後条件が明確か

---

## リファレンス

- [references/test-templates.md](references/test-templates.md) - テストテンプレート集
- [references/mocking-patterns.md](references/mocking-patterns.md) - モッキングパターン
- [references/property-patterns.md](references/property-patterns.md) - プロパティパターン集

---

## 用語集

| 用語 | 定義 |
|------|------|
| **AAA** | Arrange-Act-Assert。テストの基本構造 |
| **BDD** | Behavior-Driven Development。振る舞い駆動開発 |
| **CDC** | Consumer-Driven Contracts。消費者主導型契約 |
| **DAMP** | Descriptive And Meaningful Phrases |
| **DRY** | Don't Repeat Yourself |
| **E2E** | End-to-End。エンドツーエンド |
| **MBT** | Model-Based Testing。モデルベーステスト |
| **PBT** | Property-Based Testing。プロパティベーステスト |
| **SUT** | System Under Test。テスト対象システム |

---

## デバッグ情報

### よくある問題

| 問題 | 原因 | 解決策 |
|------|------|--------|
| テストが遅い | 外部依存のスタブ不足 | モック/スタブを活用 |
| テストが不安定 | タイミング依存 | 待機条件を明示的に |
| テストが壊れやすい | 実装詳細への依存 | 公開動作に焦点 |
| カバレッジが低い | エッジケース未対応 | プロパティベーステスト導入 |
| テスト重複 | ピラミッド違反 | 下位層で検証を移動 |

### 関連ファイル

- スキル実装: `.pi/skills/test-engineering/`
- チーム定義: `.pi/extensions/agent-teams.ts`
