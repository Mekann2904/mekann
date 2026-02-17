---
title: Invariant Validation Pipeline
category: user-guide
audience: developer
last_updated: 2026-02-17
tags: [invariant, formal-methods, testing, quint, rust]
related: [08-subagents.md, 09-agent-teams.md]
---

# Invariant Validation Pipeline

> パンくず: [Home](../README.md) > [User Guide](./) > Invariant Validation Pipeline

## 概要

spec.mdから形式仕様、インバリアント、テストコードを自動生成するパイプライン。Quint形式仕様、Rustインバリアントマクロ、プロパティベーステスト、モデルベーステストドライバーを一括生成する。

## 特徴

- **形式仕様生成**: spec.mdからQuint/TLA+形式仕様を自動生成
- **インバリアントマクロ**: Rustのコンパイル時・実行時チェック用マクロ生成
- **プロパティテスト**: proptestベースのランダムテスト生成
- **モデルベーステスト**: 状態遷移に基づくテストドライバー生成
- **一貫性保証**: 全成果物間の論理的一貫性を保証

## インストール

mekann拡張機能の一部として自動的に利用可能:

```bash
pi install https://github.com/Mekann2904/mekann
```

## ツール一覧

| ツール | 説明 |
|--------|------|
| `generate_from_spec` | spec.mdから全成果物を一括生成 |
| `verify_quint_spec` | Quint形式仕様の検証 |
| `generate_invariant_macros` | Rustインバリアントマクロ生成 |
| `generate_property_tests` | proptestコード生成 |
| `generate_mbt_driver` | モデルベーステストドライバー生成 |

## 使用方法

### 1. spec.mdの作成

```markdown
# 仕様書: カウンターサービス

## 状態
- count: 整数（初期値 0）
- max_value: 整数（定数 100）

## 操作
- increment(): countを1増加
- decrement(): countを1減少
- reset(): countを0にリセット

## インバリアント
- count >= 0
- count <= max_value
```

### 2. 全成果物の一括生成

```typescript
// ツール呼び出し
generate_from_spec({
  spec_path: "./specs/counter.md",
  output_dir: "./generated/counter"
})
```

**出力:**
- `counter.qnt` - Quint形式仕様
- `invariants.rs` - Rustインバリアントマクロ
- `property_tests.rs` - プロパティテスト
- `mbt_driver.rs` - モデルベーステストドライバー

### 3. 個別ツールの使用

#### Quint仕様の検証

```typescript
verify_quint_spec({
  quint_path: "./generated/counter/counter.qnt",
  check_invariants: true
})
```

#### インバリアントマクロの生成

```typescript
generate_invariant_macros({
  spec_path: "./specs/counter.md",
  struct_name: "Counter"
})
```

#### プロパティテストの生成

```typescript
generate_property_tests({
  spec_path: "./specs/counter.md",
  struct_name: "Counter"
})
```

#### MBTドライバーの生成

```typescript
generate_mbt_driver({
  spec_path: "./specs/counter.md",
  struct_name: "Counter"
})
```

## 生成されるコード例

### Quint形式仕様

```quint
module Counter {
  var count: int
  const max_value: int

  init() {
    count' = 0
  }

  increment() {
    all {
      count' = count + 1,
      count' <= max_value
    }
  }

  invariant CounterInvariant {
    all {
      count >= 0,
      count <= max_value
    }
  }
}
```

### Rustインバリアントマクロ

```rust
#[macro_export]
macro_rules! define_counter_invariants {
    ($struct_name:ident) => {
        impl $struct_name {
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

### プロパティテスト

```rust
proptest! {
    #[test]
    fn test_count_non_negative(count in 0i32..) {
        let counter = Counter::new(count);
        prop_assert!(counter.count >= 0);
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

### MBTドライバー

```rust
#[derive(Debug, Clone)]
pub enum CounterAction {
    Increment,
    Decrement,
    Reset,
}

impl CounterModel {
    pub fn apply_action(&self, action: &CounterAction) -> Self {
        let mut new_state = self.clone();
        match action {
            CounterAction::Increment => {
                if new_state.count < new_state.max_value {
                    new_state.count += 1;
                }
            }
            // ...
        }
        new_state
    }

    pub fn check_invariants(&self) -> Result<(), String> {
        if self.count < 0 {
            return Err(format!("count < 0: {}", self.count));
        }
        Ok(())
    }
}
```

## spec.mdフォーマット

### 必須セクション

| セクション | 説明 |
|-----------|------|
| `# タイトル` | 仕様のタイトル（モジュール名に使用） |
| `## 状態` | 状態変数の定義 |
| `## 操作` | 操作（アクション）の定義 |
| `## インバリアント` | 不変条件の定義 |

### 状態変数フォーマット

```markdown
## 状態
- variable_name: Type（初期値 value）
- another_var: Type
```

### 操作フォーマット

```markdown
## 操作
- operation_name(param: Type): 説明
- simple_operation(): 説明
```

### インバリアントフォーマット

```markdown
## インバリアント
- 条件式（例: count >= 0）
- 複合条件（例: count >= 0 and count <= max_value）
```

## ベストプラクティス

### spec.mdの書き方

1. **明確な命名**: 変数名は意味がわかる名前に
2. **完全なインバリアント**: すべての制約を明示
3. **型の明示**: 可能な限り型を明示
4. **初期値の指定**: 状態変数には初期値を設定

### 生成後の調整

1. **TODOコメントの確認**: 生成されたコードのTODOを埋める
2. **テストの実行**: 生成されたテストを実行して確認
3. **Quintの検証**: `quint verify`で形式検証

## トラブルシューティング

| 問題 | 原因 | 解決策 |
|------|------|--------|
| 生成が空 | spec.mdのフォーマット | セクションヘッダーを確認 |
| Quint構文エラー | 型の不一致 | 型注釈を確認 |
| Rustコンパイルエラー | 型変換 | 手動で型を修正 |
| テスト失敗 | 仕様と実装の乖離 | spec.mdを修正 |

## 関連リソース

- [invariant-generationスキル](../.pi/skills/invariant-generation/SKILL.md)
- [invariant-generation-team](../.pi/agent-teams/definitions/invariant-generation-team/team.md)
- [Quint Documentation](https://informalsystems.github.io/quint/)
- [proptest Book](https://altsysrq.github.io/proptest-book/)

---

## 関連トピック

- [サブエージェント](./08-subagents.md) - タスクの委任
- [エージェントチーム](./09-agent-teams.md) - マルチエージェント協調

## 次のトピック

[ → ユーティリティ](./11-utilities.md)
