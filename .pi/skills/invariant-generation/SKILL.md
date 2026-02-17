---
name: invariant-generation
description: 形式仕様からインバリアント、プロパティベーステスト、モデルベーステストを自動生成するスキル。Quint/TLA+形式仕様、Rustインバリアントマクロ、proptestコード、MBTドライバーの生成を支援。
license: MIT
tags: [formal-methods, testing, invariants, quint, rust]
metadata:
  skill-version: "1.0.0"
  created-by: invariant-pipeline
---

# Invariant Generation

形式仕様記述から検証コードを自動生成するスキル。spec.mdを入力とし、Quint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストドライバーを出力する。

**主な機能:**
- spec.mdの解析と意味理解
- Quint形式仕様の生成
- Rustインバリアントマクロの生成
- proptestベースのプロパティテスト生成
- モデルベーステストドライバーの生成
- 生成物の整合性検証

## 概要

形式手法を用いたソフトウェア検証は、バグの早期発見と品質向上に有効。しかし、手動での形式仕様記述とテストコード生成は時間がかかり、専門知識が必要。

このスキルは、自然言語で書かれた仕様書（spec.md）から以下を自動生成:

1. **Quint形式仕様**: TLA+ベースの形式仕様言語
2. **Rustインバリアントマクロ**: コンパイル時・実行時の不変条件チェック
3. **プロパティベーステスト**: proptestを用いたランダムテスト生成
4. **モデルベーステスト**: 状態遷移に基づくテストドライバー

## 使用タイミング

以下の場合にこのスキルを読み込む:
- 仕様書からテストコードを生成する場合
- 形式仕様を作成する場合
- インバリアントを定義する場合
- プロパティベーステストを設計する場合
- モデルベーステストを実装する場合

---

## 生成パイプライン

### 入力: spec.md

```markdown
# 仕様書: カウンターサービス

## 状態
- count: 整数（初期値 0）
- max_value: 整数（定数）

## 操作
- increment(): countを1増加
- decrement(): countを1減少
- reset(): countを0にリセット

## インバリアント
- count >= 0
- count <= max_value
```

### 出力1: Quint形式仕様

```quint
module Counter {
  const max_value: int

  var count: int

  init() {
    count = 0
  }

  increment() {
    all {
      count' = count + 1,
      count' <= max_value
    }
  }

  decrement() {
    all {
      count' = count - 1,
      count' >= 0
    }
  }

  reset() {
    count' = 0
  }

  invariant CounterInvariant {
    all {
      count >= 0,
      count <= max_value
    }
  }
}
```

### 出力2: Rustインバリアントマクロ

```rust
#[macro_export]
macro_rules! define_counter_invariants {
    ($struct_name:ident) => {
        impl $struct_name {
            #[inline]
            pub fn check_invariants(&self) -> Result<(), InvariantViolation> {
                if self.count < 0 {
                    return Err(InvariantViolation::new(
                        "count >= 0",
                        format!("count = {}", self.count)
                    ));
                }
                if self.count > self.max_value {
                    return Err(InvariantViolation::new(
                        "count <= max_value",
                        format!("count = {}, max_value = {}", self.count, self.max_value)
                    ));
                }
                Ok(())
            }
        }
    };
}
```

### 出力3: プロパティベーステスト

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn test_count_non_negative(count in 0i32..) {
        let counter = Counter::new(count);
        prop_assert!(counter.count >= 0);
    }

    #[test]
    fn test_count_within_bounds(
        count in 0i32..1000,
        max_value in 1i32..1000
    ) {
        let counter = Counter::with_max(count, max_value);
        prop_assert!(counter.count <= counter.max_value);
    }

    #[test]
    fn test_increment_maintains_invariant(
        initial in 0i32..100,
        max_value in 100i32..200
    ) {
        let mut counter = Counter::with_max(initial, max_value);
        counter.increment();
        prop_assert!(counter.check_invariants().is_ok());
    }
}
```

### 出力4: モデルベーステストドライバー

```rust
#[derive(Debug, Clone)]
enum CounterAction {
    Increment,
    Decrement,
    Reset,
}

struct CounterModel {
    count: i32,
    max_value: i32,
}

impl Model for CounterModel {
    type Action = CounterAction;
    type State = Self;

    fn initial_state() -> Self {
        Self { count: 0, max_value: 100 }
    }

    fn apply_action(&self, action: &Self::Action) -> Self {
        let mut new_state = self.clone();
        match action {
            CounterAction::Increment => {
                if new_state.count < new_state.max_value {
                    new_state.count += 1;
                }
            }
            CounterAction::Decrement => {
                if new_state.count > 0 {
                    new_state.count -= 1;
                }
            }
            CounterAction::Reset => {
                new_state.count = 0;
            }
        }
        new_state
    }

    fn check_invariants(&self) -> Result<(), String> {
        if self.count < 0 {
            return Err(format!("count < 0: {}", self.count));
        }
        if self.count > self.max_value {
            return Err(format!("count > max_value: {} > {}", self.count, self.max_value));
        }
        Ok(())
    }
}
```

---

## インバリアント設計パターン

### 1. 境界インバリアント

数値の範囲を制限:

```
invariant BoundsInvariant {
  all {
    value >= min_value,
    value <= max_value
  }
}
```

### 2. 状態一貫性インバリアント

状態遷移の一貫性:

```
invariant StateConsistencyInvariant {
  state = "active" implies active_since != null,
  state = "inactive" implies active_since == null
}
```

### 3. 関係インバリアント

複数フィールド間の関係:

```
invariant RelationInvariant {
  total = sum(items.map(i => i.value))
}
```

### 4. 一意性インバリアント

重複の禁止:

```
invariant UniquenessInvariant {
  all k1, k2 in keys: k1 != k2 => values[k1] != values[k2]
}
```

---

## Quint構文ベストプラクティス

### モジュール構造

```quint
module ModuleName {
  // 1. 定数
  const constant_name: type

  // 2. 変数
  var variable_name: type

  // 3. 初期化
  init() { ... }

  // 4. 操作
  action1() { ... }
  action2() { ... }

  // 5. インバリアント
  invariant InvariantName { ... }

  // 6. テンプレート
  run testScenario = { ... }
}
```

### 命名規則

| 要素 | 規則 | 例 |
|------|------|-----|
| モジュール | PascalCase | `BankAccount` |
| 定数 | snake_case | `max_balance` |
| 変数 | snake_case | `current_balance` |
| 操作 | snake_case | `deposit()` |
| インバリアント | PascalCase + Invariant | `BalanceInvariant` |

### 型注釈

```quint
// プリミティブ型
val num: int
val flag: bool
val text: str

// コレクション型
val items: List[int]
val mapping: Map[str, int]
val unique: Set[int]

// レコード型
val person: { name: str, age: int }

// タプル型
val pair: (int, str)
```

---

## テスト生成戦略

### プロパティベーステスト

1. **状態生成戦略**: 各フィールドに適切な戦略を定義
2. **アクション生成**: 有効なアクションのランダム生成
3. **事後条件**: 実行後の状態を検証
4. **シュリンク**: 失敗時の最小ケース特定

### モデルベーステスト

1. **モデル定義**: 仕様の抽象モデル
2. **アクション定義**: 可能な操作の列挙
3. **事前条件**: アクションの実行可否判定
4. **状態遷移**: アクション適用後の状態
5. **インバリアント**: 各状態での検証

---

## エラー対応

### よくある問題と対処

| 問題 | 原因 | 対処 |
|------|------|------|
| Quintパースエラー | 構文ミス | 型注釈と括弧の確認 |
| インバリアント違反 | 実装と仕様の不一致 | 操作の条件を確認 |
| テスト生成失敗 | 型戦略の欠如 | カスタム戦略を追加 |
| MBT無限ループ | 終了条件なし | ステップ数制限を追加 |

---

## チェックリスト

### 生成前

- [ ] spec.mdが完全で一貫しているか
- [ ] すべての状態変数が定義されているか
- [ ] すべての操作が記述されているか
- [ ] インバリアントが明示的か

### 生成後

- [ ] Quint仕様が構文的に正しいか
- [ ] Rustマクロがコンパイル通るか
- [ ] proptestが実行可能か
- [ ] MBTが終了するか
- [ ] 生成物間で一貫性があるか

---

## リファレンス

- [Quint Documentation](https://informalsystems.github.io/quint/)
- [TLA+ Specification Language](https://lamport.azurewebsites.net/tla/tla.html)
- [proptest Book](https://altsysrq.github.io/proptest-book/intro.html)
- [Model-Based Testing in Rust](https://blog.eqrion.net/pbt-in-rust/)

---

## デバッグ情報

### 記録されるイベント

このスキルの実行時に記録されるイベント：

| イベント種別 | 説明 | 記録タイミング |
|-------------|------|---------------|
| generation_start | 生成開始 | spec.md解析時 |
| quint_generated | Quint生成完了 | Quintファイル出力時 |
| rust_generated | Rust生成完了 | マクロ・テスト出力時 |
| generation_end | 生成終了 | 全出力完了時 |

### ログ確認方法

```bash
# 今日のログを確認
cat .pi/logs/events-$(date +%Y-%m-%d).jsonl | jq 'select(.eventType | startswith("generation"))'

# エラーを検索
cat .pi/logs/events-*.jsonl | jq 'select(.data.status == "failure")'
```

### トラブルシューティング

| 症状 | 考えられる原因 | 確認方法 | 解決策 |
|------|---------------|---------|--------|
| 生成が失敗する | spec.mdフォーマット | フォーマット確認 | テンプレートに従う |
| Quint検証エラー | インバリアント矛盾 | Quint REPLで確認 | インバリアント修正 |
| Rustコンパイルエラー | 型不一致 | コンパイラメッセージ | 型注釈追加 |
| テスト失敗 | 実装と仕様の乖離 | 失敗ケース分析 | 仕様または実装修正 |

### 関連ファイル

- 実装: `.pi/extensions/invariant-pipeline.ts`
- ログ: `.pi/logs/events-YYYY-MM-DD.jsonl`
