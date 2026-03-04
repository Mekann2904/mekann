# spec.md対話作成ガイド（piエージェント用）

piエージェント内で`question`ツールを使用して、対話的にspec.mdを作成する手順。

## 使用方法

以下の質問フローを順番に実行し、回答を収集してspec.mdを生成します。

---

## Phase 1: 基本情報

### Q1. 作成対象
```typescript
question({
  question: "作成対象は何ですか？",
  options: [
    { label: "新規プロジェクト全体" },
    { label: "特定の機能・モジュール" },
    { label: "既存spec.mdの更新" }
  ]
})
```

### Q2. システムの責任
```typescript
question({
  question: "対象システムの主要な責任は何ですか？（1〜2文で簡潔に）",
  options: [
    { label: "サブエージェントの実行を管理し、結果を統合する" },
    { label: "エージェントチームの編成と並列実行を制御する" },
    { label: "ツールの登録・実行・検証を行う" },
    { label: "タスクのキューイングと優先度付けを行う" },
    { label: "ワークフローの状態遷移を管理する" },
    { label: "設定の読み込みと検証を行う" },
    { label: "エラーの分類と回復処理を行う" },
    { label: "その他（テキストで入力）" }
  ]
})
```

### Q3. ドメイン領域
```typescript
question({
  question: "このシステムが属するドメイン領域を選んでください:",
  options: [
    { label: "サブエージェント管理" },
    { label: "エージェントチーム編成" },
    { label: "ツール実行・管理" },
    { label: "タスク管理" },
    { label: "ワークフロー制御" },
    { label: "設定・構成管理" },
    { label: "エラー処理・回復" },
    { label: "その他" }
  ]
})
```

---

## Phase 2: 不変条件

### Q4. 絶対条件
```typescript
question({
  question: "このシステムにおいて「絶対に崩れてはいけない」ルールは何ですか？",
  options: [
    { label: "同じ入力には同じ出力を返す（冪等性）" },
    { label: "無効な状態になりえない" },
    { label: "エラー後もデータは破損していない" },
    { label: "リソースは必ず解放される" },
    { label: "タイムアウトは必ず発生する" },
    { label: "ログは必ず記録される" },
    { label: "アクセス権限は常に検証される" }
  ],
  multiple: true
})
```

### Q5. データ整合性
```typescript
question({
  question: "データ整合性について、どのような制約がありますか？",
  options: [
    { label: "一意性制約（重複を許さない）" },
    { label: "参照整合性（関連データの整合性）" },
    { label: "値域制約（取りうる値の範囲）" },
    { label: "状態遷移制約（許可される状態遷移）" },
    { label: "該当なし" }
  ],
  multiple: true
})
```

### Q6. 並行性
```typescript
question({
  question: "並行・並列実行時に守るべき性質はありますか？",
  options: [
    { label: "冪等性（同じ操作を何度実行しても同じ結果）" },
    { label: "原子性（全て成功するか、全て失敗するか）" },
    { label: "順序制約（特定の順序で実行されなければならない）" },
    { label: "排他制御（同時アクセスの制限）" },
    { label: "該当なし" }
  ],
  multiple: true
})
```

---

## Phase 3: 契約

### Q7. インターフェース
```typescript
question({
  question: "このシステムが提供する主要なインターフェース・APIは何ですか？",
  options: [
    { label: "executeTool(params): Result" },
    { label: "validateInput(data): boolean" },
    { label: "registerExtension(ext): void" },
    { label: "createAgent(config): Agent" },
    { label: "runTask(task): Promise<Result>" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q8. 前提条件
```typescript
question({
  question: "各インターフェースの前提条件（呼び出す前に満たされていなければならない条件）は？",
  options: [
    { label: "パラメータはnullでない" },
    { label: "初期化済みである" },
    { label: "必要な権限を持っている" },
    { label: "入力値は検証済みである" },
    { label: "依存リソースは確保済みである" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q9. 事後条件
```typescript
question({
  question: "各インターフェースの事後条件（呼び出し後に満たされていなければならない条件）は？",
  options: [
    { label: "成功時は結果が返る" },
    { label: "失敗時はエラーが設定される" },
    { label: "副作用が適用されている" },
    { label: "リソースが解放されている" },
    { label: "ログが記録されている" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q10. 戻り値の約束
```typescript
question({
  question: "戻り値の型・構造について、どのような約束がありますか？",
  options: [
    { label: "Result型（ok/errorの区別）" },
    { label: "特定のスキーマに従う" },
    { label: "null非許容" },
    { label: "配列の長さ制限あり" },
    { label: "該当なし" }
  ],
  multiple: true
})
```

### Q11. エラーの約束
```typescript
question({
  question: "エラー返却時の約束はありますか？",
  options: [
    { label: "エラーメッセージは日本語" },
    { label: "エラーコード体系がある" },
    { label: "エラーにコンテキスト情報を含める" },
    { label: "特定のエラー型を使用" },
    { label: "スタックトレースを含める" },
    { label: "該当なし" }
  ],
  multiple: true
})
```

---

## Phase 4: 境界条件

### Q12. タイムアウト
```typescript
question({
  question: "タイムアウト・時間制約はありますか？",
  options: [
    { label: "ツール実行: 60秒" },
    { label: "LLM生成: 120秒" },
    { label: "サブエージェント: 300秒" },
    { label: "データベース接続: 30秒" },
    { label: "HTTPリクエスト: 10秒" },
    { label: "該当なし" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q13. リソース制約
```typescript
question({
  question: "リソース使用量の制約はありますか？",
  options: [
    { label: "メモリ: 512MB（超過時は警告）" },
    { label: "CPU: 80%（超過時は警告）" },
    { label: "ディスク: 1GB（超過時はエラー）" },
    { label: "ネットワーク帯域: 100Mbps" },
    { label: "ファイルディスクリプタ: 1024" },
    { label: "該当なし" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q14. 並列処理制約
```typescript
question({
  question: "同時実行数の制約はありますか？",
  options: [
    { label: "最大並列数: 10（超過時は待機）" },
    { label: "キュー最大長: 100（超過時は拒否）" },
    { label: "バッチサイズ: 5（超過時は分割）" },
    { label: "同時接続数: 50" },
    { label: "該当なし" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q15. 出力サイズ制約
```typescript
question({
  question: "出力サイズの制約はありますか？",
  options: [
    { label: "標準出力: 50KB（超過時は切り捨て）" },
    { label: "ファイル出力: 1MB（超過時は切り捨て）" },
    { label: "ログ出力: 10MB（超過時はローテーション）" },
    { label: "レスポンス本文: 5MB" },
    { label: "該当なし" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

---

## Phase 5: エラーハンドリング

### Q16. エラーの種類
```typescript
question({
  question: "想定されるエラーの種類は何ですか？",
  options: [
    { label: "Recoverable: 再試行で復旧可能 → 自動再試行" },
    { label: "UserError: ユーザーの入力ミス → ユーザーに通知" },
    { label: "SystemError: システム内部エラー → ログ記録＋通知" },
    { label: "Fatal: 致命的エラー → プロセス終了" },
    { label: "TimeoutError: タイムアウト → キャンセル処理" },
    { label: "ResourceError: リソース不足 → 待機または拒否" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q17. エラーメッセージ形式
```typescript
question({
  question: "エラーメッセージの形式に関する約束はありますか？",
  options: [
    { label: "[E001] 簡潔な説明\\n詳細な説明\\n解決方法の提案" },
    { label: "{ code: 'E001', message: '...', context: {...} }" },
    { label: "日本語での説明を必須とする" },
    { label: "エラーコードは連番で管理" },
    { label: "スタックトレースは開発環境のみ含める" },
    { label: "該当なし" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

---

## Phase 6: 最終確認

### Q18. 追加事項
```typescript
question({
  question: "追加すべき重要な制約・約束はありますか？",
  options: [
    { label: "philosophy.mdとの整合性を維持する" },
    { label: "セキュリティ要件（認証・認可）" },
    { label: "監査ログの記録義務" },
    { label: "個人情報保護（マスキング・暗号化）" },
    { label: "外部APIとの互換性" },
    { label: "特になし" },
    { label: "その他（テキストで入力）" }
  ],
  multiple: true
})
```

### Q19. 保存先
```typescript
question({
  question: "生成したspec.mdをどこに保存しますか？",
  options: [
    { label: "ABDD/spec-[domain].md（推奨）" },
    { label: "docs/03-development/spec-[domain].md" },
    { label: "標準出力のみ表示（保存しない）" },
    { label: "カスタムパスを指定" }
  ]
})
```

---

## 生成後の処理

すべての回答を収集したら、以下のテンプレートでspec.mdを生成:

```markdown
---
title: [ドメイン]ドメイン仕様
category: abdd
audience: developer
last_updated: YYYY-MM-DD
tags: [spec, invariants, contracts, [ドメイン]]
related: [philosophy.md, index.md]
---

# [ドメイン]ドメイン仕様

## 概要

[責任の説明]

---

## 不変条件（Invariants）

### [ドメイン]システム

- [ ] **[ルール名]**: [選択内容]
...

---

## 契約（Contracts）

### 主要インターフェース

[インターフェースリスト]

**契約:**
- 前提条件: [内容]
- 事後条件: [内容]
- 戻り値: [内容]
- エラー: [内容]

---

## 境界条件（Boundary Conditions）

[表形式で記載]

---

## エラーハンドリング

### エラーの分類

[表形式で記載]

---

## 検証チェックリスト

[標準テンプレート]

---

## 変更履歴

| 日付 | 変更内容 | 作成者 |
|------|----------|--------|
| YYYY-MM-DD | 初版作成 | AI Agent |

---

## 関連ファイル

- [philosophy.md](../philosophy.md)
- [index.md](index.md)
- [.pi/skills/abdd/SKILL.md](../.pi/skills/abdd/SKILL.md)

---

## 次のステップ

1. 不変条件のチェックリストを確認する
2. 実装が契約を満たしているか検証する
3. 境界条件のテストを追加する
```
