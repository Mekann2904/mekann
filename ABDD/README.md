---
title: ABDD - Automated Documentation
category: reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, documentation]
related: []
---

# ABDD（Automated Documentation）

このフォルダは自動生成されたドキュメントを管理します。手動で作成したドキュメントは`docs/`に、自動生成ドキュメントは`ABDD/`に分離することで、競合や上書きを防止します。

## 構造

ソースコードと同じディレクトリ構造でドキュメントを管理します。

```
ABDD/
├── .pi/
│   └── extensions/
│       ├── question.md
│       ├── rsa.md
│       ├── agent-teams.md
│       └── ...
├── lib/
│   ├── concurrency.md
│   ├── retry-with-backoff.md
│   └── ...
└── README.md
```

## 生成ルール

1. **ミラーリング**: ソースコードのディレクトリ構造を反映
2. **拡張子変換**: `.ts` → `.md`
3. **ハッシュ管理**: ファイルハッシュでドリフト検出
4. **上書き保護**: 手動編集セクションをプレースホルダで保護

## 使用ツール

| ツール | 用途 |
|-------|------|
| `code-structure-analyzer` | AST解析、Mermaid図生成、ドキュメント雛形生成 |
| `doc-generator` スキル | JSDoc/Sphinx形式のAPIドキュメント生成 |

## 注意事項

- このフォルダ内のファイルは**自動生成**されます
- 手動編集はプレースホルダセクション内でのみ行ってください
- コード変更時は再生成が必要です（ハッシュで検出可能）

## 生成済みドキュメント

### Extensions（19ファイル）

[ABDD/.pi/extensions/README.md](.pi/extensions/README.md)を参照

### Lib（57ファイル）

[ABDD/.pi/lib/README.md](.pi/lib/README.md)を参照

## 統計

| カテゴリ | ファイル数 | 総サイズ |
|---------|-----------|---------|
| Extensions | 19 | 約180KB |
| Lib | 57 | 約350KB |
| **合計** | **76** | **約530KB** |

## 関連

- 手動ドキュメント: `docs/`
- ソースコード: `.pi/extensions/`, `.pi/lib/`
