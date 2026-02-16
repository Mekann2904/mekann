---
title: トラブルシューティング・リカバリ手順
category: reference
audience: new-user, daily-user
last_updated: 2026-02-16
tags: [reference, troubleshooting, recovery]
related: [./01-configuration.md, ./02-data-storage.md]
---

# トラブルシューティング

> パンくず: [Home](../../README.md) > [Reference](./) > トラブルシューティング

pi拡張機能コレクションに関するトラブルシューティングガイドです。

## インストール関連

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

## 拡張機能関連

### 拡張機能が読み込まれない

- `.pi/` ディレクトリがプロジェクトルートにあるか確認してください
- 拡張機能ファイル（.ts）が `.pi/extensions/` 内にあるか確認してください
- TypeScriptファイルの構文エラーがないか確認してください

### 拡張機能のエラー

```bash
# piを再起動
/reload

# エラーログを確認
# ログはターミナルに出力されます
```

## 実行関連

### subagentが失敗する

- タスクが明確か確認してください
- サブエージェントが存在するか確認してください：`subagent_list`
- サブエージェントが有効か確認してください

### agent_teamが失敗する

- チームが存在するか確認してください：`agent_team_list`
- チームが有効か確認してください
- タスクが適切か確認してください

### loop_runが失敗する

- 参照ファイルが存在するか確認してください
- URLが正しいか確認してください
- タイムアウト設定を確認してください

## パフォーマンス関連

### 実行が遅い

- モデルの設定を確認してください（gpt-4o-miniはgpt-4oより高速です）
- 並列実行の数を調整してください
- タイムアウト設定を確認してください

### APIレート制限エラー

- 並列実行の数を減らしてください
- APIプロバイダーのレート制限を確認してください
- レート制限を回避するために、実行を間引けてください

## データ関連

### データが失われた

- `.pi/` ディレクトリが削除されていないか確認してください
- バックアップがある場合は復元してください
- データ保存場所を確認してください：[データ保存場所](./02-data-storage.md)

### データが破損している

- バックアップから復元してください
- 該当する拡張機能のデータを削除して再実行してください

## その他の問題

解決できない問題がある場合は、以下の手順で情報を収集してください：

1. エラーメッセージを記録
2. 実行したコマンドを記録
3. 使用環境（OS、Node.jsバージョン）を記録
4. Issueを報告

---

# リカバリ手順

障害発生時の復旧手順、緊急時対応、ロールバック手順を以下に示します。

## 障害分類と対応優先度

| 障害レベル | 影響範囲 | 対応時間 | 例 |
|-----------|---------|---------|-----|
| **P1: 緊急** | システム全体停止 | 即時 | プロセス異常終了、設定破損 |
| **P2: 高** | 機能制限 | 1時間以内 | 拡張機能エラー、検索インデックス破損 |
| **P3: 中** | 一部機能不可 | 半日以内 | 動的ツール実行エラー、ログ欠損 |
| **P4: 低** | 軽微な不具合 | 次回メンテナンス時 | UI表示問題、パフォーマンス低下 |

## 緊急時対応（P1障害）

### プロセス異常終了からの復旧

```bash
# 1. 状態確認
ps aux | grep pi

# 2. 残存プロセスの確認と終了
pkill -f "pi-coding-agent" 2>/dev/null || true

# 3. ロックファイルの削除
rm -f .pi/locks/*.lock 2>/dev/null || true

# 4. 一時ファイルのクリーンアップ
rm -rf .pi/tmp/* 2>/dev/null || true

# 5. piを再起動
pi
```

### 設定ファイル破損からの復旧

```bash
# 1. 現在の設定をバックアップ
cp .pi/config.json .pi/config.json.broken 2>/dev/null || true

# 2. デフォルト設定で復元
cat > .pi/config.json << 'EOF'
{
  "model": "claude-sonnet-4-20250514",
  "provider": "anthropic"
}
EOF

# 3. 再起動して動作確認
pi
```

### .piディレクトリ全体の復旧

```bash
# 警告: この操作は履歴とキャッシュを削除します

# 1. 現在の状態をバックアップ
tar -czf pi-backup-$(date +%Y%m%d_%H%M%S).tar.gz .pi/ 2>/dev/null || true

# 2. .piディレクトリを再作成
rm -rf .pi/
mkdir -p .pi/{extensions,skills,logs,tmp,locks,search,runs}

# 3. 必要な基本ファイルを作成
touch .pi/config.json
echo '{"model": "claude-sonnet-4-20250514", "provider": "anthropic"}' > .pi/config.json

# 4. piを再起動
pi
```

## 機能別リカバリ手順（P2-P3障害）

### 検索機能の復旧

#### シンボルインデックス破損

```bash
# 1. インデックスファイルの削除
rm -f .pi/search/symbols.jsonL

# 2. インデックスの再生成
# pi内で実行:
# sym_index { "force": true }
```

#### ctagsエラー

```bash
# 1. universal-ctagsのインストール確認
which ctags
ctags --version

# 2. インストールされていない場合
# macOS:
brew install universal-ctags

# Ubuntu/Debian:
sudo apt-get install universal-ctags

# 3. インデックス再生成
sym_index { "force": true }
```

#### 検索結果が不正確

```bash
# 1. インデックスの完全削除と再作成
rm -rf .pi/search/
mkdir -p .pi/search

# 2. 再インデックス化
sym_index { "force": true }
```

### 動的ツールの復旧

#### 動的ツール実行エラー

```bash
# 1. 登録済みツールの確認
# pi内で実行:
# list_dynamic_tools {}

# 2. 問題のあるツールの特定と削除
# delete_dynamic_tool { "tool_id": "<問題のあるツールID>", "confirm": true }

# 3. ツールの再作成
# create_tool { "name": "...", "code": "..." }
```

#### 動的ツールの完全リセット

```bash
# 1. 動的ツールデータのバックアップ
cp -r .pi/dynamic-tools .pi/dynamic-tools.bak 2>/dev/null || true

# 2. 全ツールの削除
rm -rf .pi/dynamic-tools/

# 3. ディレクトリ再作成
mkdir -p .pi/dynamic-tools
```

#### VMサンドボックスエラー

```bash
# 動的ツールはサンドボックス内で実行されます。
# 以下の操作はサンドボックスで禁止されています：
# - require/import（外部モジュール読み込み）
# - process（プロセス操作）
# - global（グローバルオブジェクト操作）

# 解決策: ツールコードを修正して、禁止操作を削除してください
```

### サブエージェント・エージェントチームの復旧

#### サブエージェント実行エラー

```bash
# 1. サブエージェント一覧の確認
# pi内で実行:
# subagent_list {}

# 2. 実行履歴の確認
ls -la .pi/runs/

# 3. 途中停止した実行のクリーンアップ
rm -f .pi/locks/subagent-*.lock
```

#### エージェントチームデッドロック

```bash
# 1. 実行中チームの確認
# pi内で実行:
# agent_team_status {}

# 2. 強制終了が必要な場合
rm -f .pi/locks/agent-team-*.lock

# 3. チーム定義の再読み込み
# /reload
```

### データ・ログの復旧

#### ログファイル破損

```bash
# 1. 現在のログをバックアップ
mv .pi/logs .pi/logs.broken 2>/dev/null || true

# 2. 新しいログディレクトリを作成
mkdir -p .pi/logs

# 3. piを再起動（新規ログ生成）
```

#### 実行履歴の復旧

```bash
# 1. 実行履歴の場所
ls -la .pi/runs/

# 2. 破損した履歴ファイルの特定
find .pi/runs -name "*.json" -exec sh -c 'jq empty "$1" 2>/dev/null || echo "$1"' _ {} \;

# 3. 破損ファイルの削除
# rm .pi/runs/<破損ファイル名>
```

## ロールバック手順

### 拡張機能のロールバック

```bash
# 1. 現在の拡張機能をバックアップ
tar -czf extensions-backup-$(date +%Y%m%d).tar.gz .pi/extensions/

# 2. 特定の拡張機能を無効化
mv .pi/extensions/problem-extension.ts .pi/extensions/problem-extension.ts.disabled

# 3. piを再起動
# /reload
```

### スキルのロールバック

```bash
# 1. 現在のスキルをバックアップ
tar -czf skills-backup-$(date +%Y%m%d).tar.gz .pi/skills/

# 2. 特定のスキルを無効化
mv .pi/skills/problem-skill .pi/skills/problem-skill.disabled

# 3. piを再起動
# /reload
```

### 設定のロールバック

```bash
# 1. バックアップから復元
cp .pi/config.json.backup .pi/config.json

# 2. または、特定の設定項目をデフォルトに戻す
# 設定ファイルを編集して、問題のある項目を削除
```

## 定期バックアップ推奨手順

### 自動バックアップスクリプト

```bash
#!/bin/bash
# backup-pi.sh - pi設定の定期バックアップ

BACKUP_DIR="$HOME/pi-backups"
DATE=$(date +%Y%m%d_%H%M%S)
PROJECT_ROOT=$(pwd)

mkdir -p "$BACKUP_DIR"

# バックアップ対象
tar -czf "$BACKUP_DIR/pi-backup-$DATE.tar.gz" \
  --exclude='*.log' \
  --exclude='node_modules' \
  --exclude='.pi/tmp' \
  --exclude='.pi/locks' \
  "$PROJECT_ROOT/.pi/" \
  2>/dev/null

# 30日以上古いバックアップを削除
find "$BACKUP_DIR" -name "pi-backup-*.tar.gz" -mtime +30 -delete

echo "Backup created: $BACKUP_DIR/pi-backup-$DATE.tar.gz"
```

### crontab設定（毎日3時に実行）

```bash
# crontab -e
0 3 * * * /path/to/backup-pi.sh >> /var/log/pi-backup.log 2>&1
```

## 障害調査チェックリスト

障害発生時に確認すべき項目：

- [ ] エラーメッセージの正確な記録
- [ ] 発生時刻と実行中の操作
- [ ] `.pi/logs/` 内のログファイル確認
- [ ] ディスク容量の確認（`df -h`）
- [ ] メモリ使用状況の確認（`free -m` または `vm_stat`）
- [ ] Node.jsバージョンの確認（`node --version`）
- [ ] 最近の変更内容（設定変更、拡張機能追加等）
- [ ] 再現手順の特定

## エスカレーション

上記の手順で解決できない場合：

1. **ログ収集**: `.pi/logs/` ディレクトリ全体をアーカイブ
2. **環境情報収集**:
   ```bash
   # 診断情報の収集
   echo "=== System Info ===" > pi-diagnostic.txt
   uname -a >> pi-diagnostic.txt
   echo "\n=== Node.js ===" >> pi-diagnostic.txt
   node --version >> pi-diagnostic.txt
   npm --version >> pi-diagnostic.txt
   echo "\n=== Disk Space ===" >> pi-diagnostic.txt
   df -h >> pi-diagnostic.txt
   echo "\n=== .pi Structure ===" >> pi-diagnostic.txt
   ls -laR .pi/ >> pi-diagnostic.txt 2>&1
   ```
3. **Issue報告**: 収集した情報を添えてIssueを作成

---

## 関連トピック

- [設定リファレンス](./01-configuration.md) - 設定リファレンス
- [データ保存場所](./02-data-storage.md) - データ保存場所
- [拡張機能一覧](../02-user-guide/01-extensions.md) - 拡張機能の詳細
