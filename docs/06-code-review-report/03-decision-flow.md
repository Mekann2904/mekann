---
title: 判断基準と意思決定フロー
category: reference
audience: developer
last_updated: 2026-02-17
tags: [decision-flow, delegation, best-practices]
related:
  - ./README.md
  - ../../.pi/APPEND_SYSTEM.md
---

# 判断基準と意思決定フロー

> パンくず: [Home](../README.md) > [Code Review Report](./README.md) > 判断基準と意思決定フロー

## 概要

このドキュメントは、pi-plugin/mekannプロジェクトにおける開発時の判断基準と意思決定フローを定義します。委任の使用、ファイル分割、ドキュメント更新、型安全性、エラーハンドリングに関する指針を提供します。

## 1. 委任の使用判断基準

### 委任を使用すべき場合

```mermaid
flowchart TD
    A[タスク開始] --> B{タスクの複雑さ}
    B -->|単純| C{変更範囲}
    B -->|複雑| D[委任を使用]
    C -->|1ファイル| E{変更種別}
    C -->|複数ファイル| D
    E -->|タイポ修正| F[直接編集]
    E -->|ドキュメント更新| F
    E -->|ロジック変更| G{影響範囲}
    G -->|限定的| H[直接編集可能]
    G -->|広範囲| D
```

### 判断基準一覧

| 条件 | 委任 | 直接編集 |
|------|------|---------|
| 変更ファイル数 | 3ファイル以上 | 1-2ファイル |
| タスク種別 | 設計判断が必要 | 機械的修正 |
| 影響範囲 | 複数モジュール | 単一モジュール |
| テスト必要性 | 新規テスト作成 | テスト不要 |
| ドキュメント影響 | 更新必要 | 更新不要 |

### 委任フロー

```mermaid
sequenceDiagram
    participant L as Lead Agent
    participant D as Delegation Checker
    participant S as Subagent/Team

    L->>D: 編集試行
    D->>D: 委任判定

    alt 委任必要
        D->>L: ブロック
        L->>S: subagent_run / agent_team_run
        S->>L: 結果返却
        L->>D: 再試行
        D->>L: 許可
    else 委任不要
        D->>L: 許可
    end

    L->>L: 編集実行
```

### 委任ツール選択

| ツール | 使用場面 |
|--------|---------|
| `subagent_run` | 単一の独立タスク |
| `subagent_run_parallel` | 複数の独立タスク（並列実行） |
| `agent_team_run` | 協調が必要な複雑なタスク |
| `agent_team_run_parallel` | 複数のチームタスク（並列実行） |

## 2. ファイル分割判断基準

### 分割フロー

```mermaid
flowchart TD
    A[ファイル評価] --> B{行数}
    B -->|500行以下| C{責任数}
    B -->|500行超過| D[分割検討]
    C -->|単一| E[分割不要]
    C -->|複数| D
    D --> F{分割可能?}
    F -->|Yes| G[機能単位で分割]
    F -->|No| H[リファクタリング検討]
    G --> I[インターフェース定義]
    I --> J[段階的移行]
```

### 分割基準

| 指標 | 分割不要 | 分割検討 | 分割必須 |
|------|---------|---------|---------|
| 行数 | < 300行 | 300-500行 | > 500行 |
| 責任数 | 1つ | 2-3つ | 4つ以上 |
| 依存関係 | 単方向 | 双方向1つ | 循環あり |
| テスト容易性 | 高い | 中程度 | 低い |

### ファイル分割パターン

```mermaid
graph LR
    subgraph Before[分割前]
        A[large-file.ts<br/>1200行<br/>5責任]
    end

    subgraph After[分割後]
        B[core.ts<br/>200行<br/>1責任]
        C[utils.ts<br/>150行<br/>1責任]
        D[types.ts<br/>100行<br/>型定義]
        E[handlers.ts<br/>300行<br/>ハンドラ]
    end

    A --> B
    A --> C
    A --> D
    A --> E

    B --> C
    B --> D
    E --> B
    E --> D
```

### 分割手順

1. **現状分析**: 責任の境界を特定
2. **インターフェース定義**: 公開APIを明確化
3. **新規ファイル作成**: 機能単位で分割
4. **段階的移行**: インポートパス更新
5. **テスト更新**: 各モジュールのテスト追加
6. **削除**: 元ファイルの不要部分削除

## 3. ドキュメント更新判断基準

### 更新フロー

```mermaid
flowchart TD
    A[変更発生] --> B{変更種別}
    B -->|API変更| C[APIドキュメント更新]
    B -->|設定変更| D[設定ガイド更新]
    B -->|バグ修正| E{ユーザー影響}
    B -->|新機能| F[機能ガイド追加]
    E -->|あり| G[リリースノート更新]
    E -->|なし| H[ドキュメント更新不要]
    C --> I[インデックス更新]
    D --> I
    F --> I
    G --> I
```

### 更新基準

| 変更種別 | ドキュメント更新 | 対象ファイル |
|---------|----------------|-------------|
| 新規関数追加 | 必要 | APIドキュメント |
| 関数シグネチャ変更 | 必要 | APIドキュメント |
| 設定項目追加 | 必要 | 設定ガイド |
| バグ修正 | ユーザー影響時のみ | リリースノート |
| 内部リファクタリング | 不要 | - |
| パフォーマンス改善 | 大幅改善時 | リリースノート |

### フロントマター必須項目

```yaml
---
title: ページタイトル        # 必須
category: getting-started | user-guide | development | reference | meta  # 必須
audience: new-user | daily-user | developer | contributor  # 必須
last_updated: YYYY-MM-DD    # 必須
tags: []                    # 任意
related: []                 # 任意
---
```

## 4. 型安全性の判断基準

### any型使用の可否

```mermaid
flowchart TD
    A[any型検討] --> B{使用理由}
    B -->|外部ライブラリIF| C{型定義存在?}
    B -->|段階的移行中| D[TODOコメント必須]
    B -->|複雑な型| E[unknown推奨]
    B -->|面倒だから| F[使用不可]

    C -->|あり| G[型定義使用]
    C -->|なし| H{型定義作成可能?}
    H -->|Yes| I[型定義作成]
    H -->|No| J[unknown + 型ガード]
```

### 判断基準

| 状況 | 判定 | 対応 |
|------|------|------|
| 外部ライブラリで型定義なし | 条件付き許可 | `unknown` + 型ガード |
| 段階的TypeScript移行中 | 条件付き許可 | TODOコメント + 期限設定 |
| 複雑なJSONレスポンス | 条件付き許可 | Zod等でのランタイム検証 |
| 面倒だから | 不可 | 適切な型定義を作成 |
| 第三方ライブラリの callback | 条件付き許可 | 可能な限り型付け |

### 型定義のベストプラクティス

```typescript
// 悪い例
function process(data: any): any {
  return data.value;
}

// 良い例
interface InputData {
  value: string;
}

function process(data: InputData): string {
  return data.value;
}

// 外部ライブラリ用の妥協例
function handleExternal(data: unknown): Result {
  if (!isExternalData(data)) {
    throw new TypeError('Invalid data format');
  }
  return processExternal(data);
}
```

## 5. エラーハンドリング判断基準

### エラー分類

```mermaid
graph TB
    subgraph Errors[エラー種別]
        E1[Retryable]
        E2[Fatal]
        E3[Recoverable]
    end

    subgraph Actions[対応アクション]
        A1[リトライ]
        A2[ログ + 終了]
        A3[フォールバック]
    end

    E1 --> A1
    E2 --> A2
    E3 --> A3
```

### エラー種別と対応

| エラー種別 | 分類 | 対応 |
|-----------|------|------|
| ネットワークタイムアウト | Retryable | 指数バックオフでリトライ |
| API レート制限 | Retryable | 待機後にリトライ |
| ファイルロック競合 | Retryable | 短い待機後にリトライ |
| メモリ不足 | Fatal | ログ出力して終了 |
| 設定ファイル破損 | Fatal | ログ出力して終了 |
| 権限エラー | Fatal | ユーザー通知して終了 |
| データフォーマット不正 | Recoverable | デフォルト値使用 |
| オプション機能のエラー | Recoverable | 機能無効化して継続 |

### エラーハンドリングパターン

```mermaid
sequenceDiagram
    participant C as Client
    participant H as Handler
    participant R as Retry Logic
    participant L as Logger

    C->>H: リクエスト
    H->>H: 処理

    alt 成功
        H->>C: 結果返却
    else Retryable Error
        H->>R: リトライ要求
        R->>R: 待機
        R->>H: 再実行
        H->>C: 結果返却
    else Fatal Error
        H->>L: エラーログ
        H->>C: エラー返却
    else Recoverable Error
        H->>H: フォールバック
        H->>C: 結果返却
    end
```

### エラーメッセージガイドライン

| 項目 | 良い例 | 悪い例 |
|------|-------|-------|
| 具体性 | `Failed to read config.json: ENOENT` | `Error reading file` |
| 復旧方法 | `Run 'pi init' to create config` | `Config not found` |
| コンテキスト | `In extension loader at line 42` | `Something went wrong` |
| ユーザー向け | `Configuration file is missing` | `ENOENT: no such file` |

## 6. コードレビュー時の判断基準

### レビュー判定フロー

```mermaid
flowchart TD
    A[レビュー開始] --> B{設計}
    B -->|問題あり| C[Request Changes]
    B -->|問題なし| D{機能性}
    D -->|問題あり| C
    D -->|問題なし| E{複雑性}
    E -->|過剰| F[Comment + Approve]
    E -->|適切| G{テスト}
    G -->|不足| F
    G -->|十分| H[Approve]
    F --> I[Nitコメント追加]
```

### LGTM判定基準

| 判定 | 基準 | アクション |
|------|------|-----------|
| **LGTM** | コードの健康状態が維持/改善 | 即時マージ |
| **LGTM with Comments** | 軽微な改善提案あり | マージ後対応 |
| **Request Changes** | コードの健康状態を悪化させる | 修正後に再レビュー |

### レビューコメント分類

| 分類 | 説明 | 必須対応 |
|------|------|---------|
| **Must** | バグ、セキュリティ問題 | はい |
| **Should** | 可読性、保守性の改善 | 推奨 |
| **Nit** | スタイル、一貫性 | 任意 |
| **Question** | 確認事項 | 回答のみ |

## 7. セキュリティ判断基準

### セキュリティチェックリスト

```mermaid
flowchart LR
    A[コード変更] --> B{認証関連?}
    B -->|Yes| C[セキュリティレビュー]
    B -->|No| D{外部入力処理?}
    D -->|Yes| C
    D -->|No| E{ファイル操作?}
    E -->|Yes| C
    E -->|No| F[通常レビュー]
    C --> G[セキュリティチェック]
    G --> H[問題なし]
    G --> I[問題あり]
    I --> J[修正要求]
```

### セキュリティ確認事項

| 項目 | チェック内容 |
|------|-------------|
| 入力検証 | 外部入力のサニタイズ |
| 認証・認可 | 適切な権限チェック |
| 機密情報 | ログ出力の除外 |
| 依存関係 | 脆弱性のあるパッケージ |
| ファイルアクセス | パストラバーサル対策 |

---

## 関連トピック

- [レビュー結果サマリー](./01-summary.md) - 全体的な評価
- [アーキテクチャ図](./02-architecture-diagram.md) - システム構造の視覚化
- [改善推奨事項](./04-recommendations.md) - 具体的な改善アクション
- [APPEND_SYSTEM.md](../../.pi/APPEND_SYSTEM.md) - プロジェクトルール

## 次のトピック

[ 改善推奨事項を見る ](./04-recommendations.md)
