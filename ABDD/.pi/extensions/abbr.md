---
title: abbr
category: api-reference
audience: developer
last_updated: 2026-02-18
tags: [auto-generated, extensions]
---

# abbr

## 概要

Fish shellライクな省略形（abbreviation）サポートをpiに提供する拡張機能。短いエイリアス（例: "gaa"）を完全なコマンド（例: "git add ."）に展開する。

## エクスポート

### インターフェース

#### Abbreviation

```typescript
interface Abbreviation {
  name: string;
  expansion: string;
  regex?: boolean;
  pattern?: string;
  position?: "command" | "anywhere";
}
```

省略形の定義を表すインターフェース。

| プロパティ | 型 | 説明 |
|-----------|-----|------|
| name | string | 省略形の名前 |
| expansion | string | 展開後の文字列 |
| regex | boolean | 正規表現パターンを使用するか |
| pattern | string | 正規表現パターン（regex=true時） |
| position | "command" \| "anywhere" | 展開位置 |

### 関数

#### default (エントリーポイント)

```typescript
export default function (pi: ExtensionAPI): void
```

拡張機能のエントリーポイント。abbrツール、/abbrコマンド、入力変換フックを登録する。

## 使用例

```typescript
// コマンドラインでの使用
/abbr add gaa "git add --all"
/abbr list
/abbr erase gaa
/abbr rename oldname newname

// 入力時の自動展開
// "gaa " と入力してスペースを押すと "git add --all " に展開
```

## 登録ツール

### abbr

省略形を管理するツール。アクション: list, add (name, expansion), erase (name), rename (name, newName), query (name)。

## 登録コマンド

### /abbr

省略形を管理するコマンド。add, list, erase, rename, query サブコマンドをサポート。

## デフォルト省略形

Git関連の200以上のデフォルト省略形が含まれる:
- `g` → `git`
- `ga` → `git add`
- `gaa` → `git add --all`
- `gc` → `git commit -v`
- `gp` → `git push`
- など

## 設定ファイル

- 設定ディレクトリ: `~/.pi/`
- 設定ファイル: `~/.pi/abbr.json`

## 関連

- `.pi/extensions/subagents.ts`
- `.pi/extensions/agent-teams.ts`
