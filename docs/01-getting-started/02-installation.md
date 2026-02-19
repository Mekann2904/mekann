---
title: インストールガイド
category: getting-started
audience: new-user
last_updated: 2026-02-12
tags: [installation, setup]
related: [./01-quick-start.md, ./03-first-steps.md]
---

# インストールガイド

> パンくず: [Home](../../README.md) > [Getting Started](./) > インストールガイド

pi拡張機能コレクションをインストールするための詳細な手順です。

## 前提条件

| 依存関係 | 最小バージョン | 用途 | 必須 |
|---------|-------------|------|------|
| **Node.js** | v20.18.1以上 | ランタイム環境 | はい |
| **pi** | 最新版 | メインのAIコーディングエージェント | はい |
| **fzf** | 0.40以上 | ファジーファインダー | はい |
| **kitty** | 0.30以上 | kittyターミナル統合（オプション） | いいえ |

### 前提条件の確認

```bash
# Node.jsの確認
node --version  # v20.18.1以上が必要

# npmの確認
npm --version

# fzfの確認
which fzf
fzf --version
```

## Piのインストール

### npmでインストール

```bash
npm install -g @mariozechner/pi-coding-agent
```

### インストール確認

```bash
pi --version
```

バージョンが表示されればインストール成功です。

## fzfのインストール

fzfはいくつかの方法でインストールできます。

### macOS

```bash
# Homebrewを使用
brew install fzf

# インストール後にシェル拡張を有効化（オプション）
$(brew --prefix)/opt/fzf/install
```

### Linux

```bash
# Ubuntu/Debian
sudo apt-get install fzf

# Fedora/CentOS
sudo dnf install fzf

# Arch Linux
sudo pacman -S fzf

# または git からインストール
git clone --depth 1 https://github.com/junegunn/fzf.git ~/.fzf
~/.fzf/install
```

### Windows

```powershell
# Scoopを使用
scoop install fzf

# Chocolatey を使用
choco install fzf

# Winget を使用
winget install junegunn.fzf
```

### fzfのインストール確認

```bash
fzf --version
```

## 拡張機能コレクションのセットアップ

### グローバルインストール（推奨）

```bash
pi install https://github.com/Mekann2904/mekann
```

### プロジェクトローカルインストール

```bash
pi install -l https://github.com/Mekann2904/mekann
```

### インストール確認

```bash
# インストール済みパッケージ一覧
pi list

# 実際に起動して確認
pi
```

`pi` 起動時に以下のような通知が表示されれば、拡張機能が正しく読み込まれています：

```
質問機能が読み込まれました • 使用例: "質問して選択させて"
Loop extension loaded (/loop, loop_run)
fzf統合拡張が読み込まれました
Plan Extension loaded
Subagent extension loaded
Agent team extension loaded
UL Dual-Orchestration Mode loaded (ul prefix)
...
```

### 更新と削除

```bash
# 更新
pi update

# 削除
pi remove https://github.com/Mekann2904/mekann
```

### 開発中のローカルチェックアウトを使う場合

```bash
# ローカルチェックアウト
git clone https://github.com/Mekann2904/mekann /path/to/mekann
cd /path/to/your-project

# ローカルチェックアウト版をこのプロジェクトへ設定
pi install -l /path/to/mekann
```

### 設定の再確認

```bash
pi list
```

## kittyターミナル統合（オプション）

kittyターミナルを使用している場合、エージェント実行中のステータスを表示できます。

詳細は [Utilities](../02-user-guide/11-utilities.md#kitty-status-integration) を参照してください。

## トラブルシューティング

### piが見つからない

```bash
# npmグローバルパスを確認
npm config get prefix

# PATHに追加（必要な場合）
export PATH="$HOME/.npm-global/bin:$PATH"
```

### fzfが見つからない

```bash
# fzfのインストールパスを確認
which fzf

# 手動でPATHに追加（必要な場合）
export PATH="$HOME/.fzf/bin:$PATH"
```

### 拡張機能が読み込まれない

- `pi list` で `mekann` が表示されるか確認してください
- グローバル導入なら `~/.pi/agent/settings.json`、ローカル導入なら `.pi/settings.json` の `packages` にソースが入っているか確認してください
- TypeScriptファイルの構文エラーがないか確認してください

---

## 次のステップ

- [初回ステップ](./03-first-steps.md) - 最初の操作を学ぶ
- [拡張機能一覧](../02-user-guide/) - 利用可能な拡張機能を確認

---

## 関連トピック

- [クイックスタート](./01-quick-start.md) - 5分で始める
- [初回ステップ](./03-first-steps.md) - 基本的な操作
- [データ保存場所](../04-reference/02-data-storage.md) - 各拡張機能のデータ保存場所

## 次のトピック

[ → 初回ステップ](./03-first-steps.md)
