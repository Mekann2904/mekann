---
title: ドメイン仕様
category: abdd
audience: developer
last_updated: 2026-02-18
tags: [spec, invariants, contracts]
related: [philosophy.md]
---

# ドメイン仕様

> Domain Specification and Invariants

## 概要

このドキュメントは、mekann/piプロジェクトのドメイン不変条件、契約、境界条件を定義する。実装は常にこれらの条件を満たす必要がある。

---

## 不変条件（Invariants）

常に成り立つべきルール。違反はバグとして扱う。

### サブエージェントシステム

- [ ] **単一責任**: 各サブエージェントは単一の責任を持つ
- [ ] **構造化通信**: サブエージェント間通信は構造化されたプロトコルを使用する
- [ ] **エラー伝播**: エラーは上位に伝播し、適切にハンドリングされる
- [ ] **冪等性**: 同じ入力に対して同じ出力を返す（副作用がある場合を除く）

### 拡張機能システム

- [ ] **冪等性**: 各拡張機能は冪等性を持つ（同じ操作を繰り返しても同じ結果）
- [ ] **明示的依存**: 拡張機能間の依存は明示的に宣言される
- [ ] **有用なエラー**: 失敗時は有用なエラーメッセージを返す
- [ ] **タイムアウト**: 長時間実行される操作はタイムアウトを持つ

### エージェントチームシステム

- [ ] **役割定義**: 各チームメンバーは明確な役割を持つ
- [ ] **コミュニケーション**: メンバー間のコミュニケーションは記録される
- [ ] **合意形成**: 意見の対立は明示的に解決される
- [ ] **結果統合**: 各メンバーの結果は統合されて出力される

### ドキュメントシステム

- [ ] **テンプレート遵守**: 新規ドキュメントはテンプレートに従う
- [ ] **日本語**: すべてのドキュメントは日本語で記述される
- [ ] **インデックス整合**: INDEX.mdとNAVIGATION.mdは最新の構造を反映する

---

## 契約（Contracts）

インターフェースの約束。実装はこれらの契約を満たす必要がある。

### Tool Interface

すべてのツールが実装すべきインターフェース:

```typescript
interface Tool {
  /** ツール名（一意識別子） */
  name: string;

  /** ツールの説明 */
  description: string;

  /** パラメータのJSON Schema */
  parameters: JSONSchema;

  /** ツールを実行する */
  execute(params: unknown): Promise<Result>;
}
```

**契約:**
- `name`は一意であること
- `description`は日本語で記述すること
- `parameters`は有効なJSON Schemaであること
- `execute`はエラーを投げず、Result型を返すこと

### Result Type

すべてのツールが返す結果型:

```typescript
type Result<T = unknown> =
  | { ok: true; value: T }
  | { ok: false; error: string };
```

**契約:**
- 成功時は`{ ok: true, value: ... }`を返すこと
- 失敗時は`{ ok: false, error: ... }`を返すこと
- `error`は日本語で記述すること

### Subagent Interface

サブエージェントが実装すべきインターフェース:

```typescript
interface Subagent {
  /** サブエージェント名 */
  name: string;

  /** 役割の説明 */
  role: string;

  /** 実行 */
  run(input: SubagentInput): Promise<SubagentOutput>;
}

interface SubagentInput {
  task: string;
  context?: Record<string, unknown>;
}

interface SubagentOutput {
  summary: string;
  claim: string;
  evidence: string;
  confidence: number;
  discussion?: string;
  result: unknown;
  nextStep?: string;
}
```

**契約:**
- `summary`は日本語で簡潔に記述すること
- `evidence`にはファイルパスと行番号を含めること
- `confidence`は0.0〜1.0の範囲であること

### Extension Interface

拡張機能が実装すべきインターフェース:

```typescript
interface Extension {
  /** 拡張機能名 */
  name: string;

  /** 提供するツール */
  tools: Tool[];

  /** 初期化（オプション） */
  init?(): Promise<void>;

  /** 終了処理（オプション） */
  cleanup?(): Promise<void>;
}
```

**契約:**
- `tools`は空でないこと
- `init`と`cleanup`はエラーを投げないこと

---

## 境界条件（Boundary Conditions）

動作の制約。これらを超える場合は明示的なエラーを返す。

### 並列処理

| 条件 | 制約 | 動作 |
|------|------|------|
| 最大並列数 | 10 | 超過時は待機 |
| バッチサイズ | 5 | 超過時は分割 |
| キュー長 | 100 | 超過時は拒否 |

### タイムアウト

| 条件 | 制約 | 動作 |
|------|------|------|
| ツール実行 | 60秒 | タイムアウトエラー |
| LLM生成 | 120秒 | タイムアウトエラー |
| サブエージェント | 300秒 | タイムアウトエラー |

### 出力サイズ

| 条件 | 制約 | 動作 |
|------|------|------|
| 標準出力 | 50KB | 切り捨て |
| ファイル出力 | 1MB | 切り捨て |
| ログ出力 | 10MB | ローテーション |

### リソース使用

| 条件 | 制約 | 動作 |
|------|------|------|
| メモリ | 512MB | 警告 |
| CPU | 80% | 警告 |
| ディスク | 1GB | エラー |

---

## エラーハンドリング

### エラーの分類

| 分類 | 説明 | 対応 |
|------|------|------|
| Recoverable | 再試行で復旧可能 | 自動再試行 |
| UserError | ユーザーの入力ミス | ユーザーに通知 |
| SystemError | システム内部エラー | ログ記録 + ユーザーに通知 |
| Fatal | 致命的エラー | プロセス終了 |

### エラーメッセージの形式

```
[エラーコード] 簡潔な説明

詳細な説明

解決方法の提案
```

**例:**
```
[E001] ファイルが見つかりません

指定されたパス `path/to/file.ts` にファイルが存在しません。

解決方法:
- パスが正しいか確認してください
- ファイルが削除されていないか確認してください
```

---

## 検証チェックリスト

### 実装レビュー時

- [ ] 不変条件をすべて満たしているか
- [ ] 契約に違反していないか
- [ ] 境界条件内で動作しているか
- [ ] エラーハンドリングが適切か

### ドキュメントレビュー時

- [ ] 実装とドキュメントが一致しているか
- [ ] 不変条件が実装に反映されているか
- [ ] 契約がテストで検証されているか

---

## 変更履歴

| 日付 | 変更内容 | 作成者 |
|------|----------|--------|
| 2026-02-18 | 初版作成 | AI Agent |

---

## 関連ファイル

- [philosophy.md](../philosophy.md) - プロジェクト哲学
- [index.md](index.md) - ABDDインデックス
- [.pi/skills/abdd/SKILL.md](../.pi/skills/abdd/SKILL.md) - ABDDスキル定義

---

## 次のステップ

1. 不変条件のチェックリストを確認する
2. 実装が契約を満たしているか検証する
3. 境界条件のテストを追加する
