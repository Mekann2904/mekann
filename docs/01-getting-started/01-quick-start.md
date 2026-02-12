---
title: クイックスタート
category: getting-started
audience: new-user
last_updated: 2026-02-12
tags: [quick-start, installation]
related: [./02-installation.md, ./03-first-steps.md]
---

# クイックスタート

> パンくず: [Home](../README.md) > [Getting Started](./) > クイックスタート

5分でpi拡張機能コレクションを始めましょう。

## 前提条件チェック

以下のコマンドで前提条件を確認してください：

```bash
# Node.jsの確認
node --version  # v20.18.1以上が必要

# piの確認
pi --version

# fzfの確認
which fzf
```

すべてがインストールされている場合は、[初回ステップ](./03-first-steps.md)へ進んでください。

## インストール

### Step 1: piのインストール

```bash
npm install -g @mariozechner/pi-coding-agent
```

### Step 2: fzfのインストール

**macOS:**
```bash
brew install fzf
```

**Linux:**
```bash
sudo apt-get install fzf  # Ubuntu/Debian
sudo dnf install fzf      # Fedora
```

**Windows:**
```powershell
scoop install fzf
```

### Step 3: mekann のインストール

```bash
pi install https://github.com/Mekann2904/mekann
```

プロジェクトローカルで使いたい場合：

```bash
pi install -l https://github.com/Mekann2904/mekann
```

詳細なインストール手順は [インストールガイド](./02-installation.md) を参照してください。

## 最初の拡張機能を試す

### question 拡張機能を試す

piの対話モードで以下を入力します：

```typescript
question
```

対話UIが表示され、ユーザーに選択肢を提示できるようになります。

### subagent を試す

```typescript
subagent_run
{
  "task": "現在のディレクトリ構造を分析して、問題点を指摘してください"
}
```

サブエージェントがタスクを実行します。

## 次のステップ

- [初回ステップ](./03-first-steps.md) - 基本的な操作を学ぶ
- [拡張機能一覧](../02-user-guide/) - すべての拡張機能を確認
- [インストールガイド](./02-installation.md) - 詳細なインストール手順

---

## 関連トピック

- [インストールガイド](./02-installation.md) - 詳細なインストール手順
- [初回ステップ](./03-first-steps.md) - 最初の操作ガイド

## 次のトピック

[ → インストールガイド](./02-installation.md)
