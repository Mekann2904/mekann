# 動的ツール生成システム - リカバリ手順書

本ドキュメントでは、動的ツール生成システムの障害対応・復旧手順について説明します。障害レベルに応じた対応フロー、バックアップとリストア、完全システム復旧手順を網羅しています。

## 目次

1. [概要](#概要)
2. [障害レベル分類](#障害レベル分類)
3. [緊急時対応フロー](#緊急時対応フロー)
4. [バックアップとリストア](#バックアップとリストア)
5. [障害シナリオ別対応手順](#障害シナリオ別対応手順)
6. [完全システム復旧](#完全システム復旧)
7. [復旧後検証チェックリスト](#復旧後検証チェックリスト)
8. [エスカレーション基準](#エスカレーション基準)

---

## 概要

### 本ドキュメントの目的

リカバリ手順書は以下の目的で作成されています:

1. **迅速な復旧**: 障害発生時の対応時間を最小化
2. **影響範囲の限定**: 障害の波及を防ぐ適切な初期対応
3. **再発防止**: 根本原因の特定と再発防止策の実施
4. **知識の共有**: 復旧手順の標準化と属人化の防止

### 対象範囲

| コンポーネント | 対象 | 責任者 |
|--------------|------|--------|
| ツール定義ファイル | .pi/tools/*.json | 運用者 |
| 監査ログ | .pi/logs/dynamic-tools-audit.jsonl | 運用者 |
| 拡張機能コード | .pi/extensions/dynamic-tools.ts | 開発者 |
| ライブラリ | .pi/lib/dynamic-tools/*.ts | 開発者 |

### 前提知識

本ドキュメントを理解するために必要な知識:

- [README.md](./README.md): システム概要、アーキテクチャ
- [OPERATIONS.md](./OPERATIONS.md): 日次・週次運用手順
- [SAFETY.md](./SAFETY.md): 安全性解析、危険パターン

---

## 障害レベル分類

障害を重大度に基づいて4つのレベルに分類し、対応の優先度を決定します。

### レベル定義

| レベル | 重大度 | 影響範囲 | 対応時間 | 例 |
|--------|--------|----------|----------|-----|
| **P1: 緊急** | Critical | システム全体停止 | 15分以内 | 全ツール消失、プロセス異常終了 |
| **P2: 高** | High | 主要機能の障害 | 1時間以内 | 特定ツール実行不可、ログ記録停止 |
| **P3: 中** | Medium | 一部機能の制限 | 4時間以内 | 単一ツールの不具合、パフォーマンス低下 |
| **P4: 低** | Low | 軽微な問題 | 24時間以内 | ツール作成エラー、表示不具合 |

### 対応マトリクス

```
+------------------+-----+-----+-----+-----+
| 対応アクション    | P1  | P2  | P3  | P4  |
+------------------+-----+-----+-----+-----+
| 即時調査開始      | YES | YES | NO  | NO  |
| エスカレーション  | YES | YES | NO  | NO  |
| 影響範囲特定      | YES | YES | YES | NO  |
| 暫定対処実施      | YES | YES | YES | YES |
| 根本原因分析      | YES | YES | YES | YES |
| 再発防止策実装    | YES | YES | NO  | NO  |
| 事後レポート作成  | YES | YES | NO  | NO  |
+------------------+-----+-----+-----+-----+
```

### 障害レベル判定フローチャート

```
障害発生
    │
    ├─ 全ツールが使用不可？
    │   └─ YES → P1: 緊急
    │
    ├─ 新規ツール作成不可？
    │   └─ YES → P2: 高
    │
    ├─ 特定ツールが実行不可？
    │   └─ YES → P3: 中
    │
    └─ その他の軽微な問題
        └─ P4: 低
```

---

## 緊急時対応フロー

### P1障害対応フロー（15分以内）

```
[0-2分] 初期対応
    ├─ 障害の確認と記録
    │   - 発生時刻: ___________
    │   - 影響範囲: ___________
    │   - エラーメッセージ: ___________
    │
    ├─ 関係者への通知
    │   - 担当者へ連絡
    │   - ユーザーへの影響通知（必要に応じて）
    │
    └─ ログの保護
        - 現在のログをバックアップ

[2-5分] 状況把握
    ├─ プロセス状態の確認
    │   ```bash
    │   ps aux | grep -i pi
    │   ```
    │
    ├─ ファイルシステム状態の確認
    │   ```bash
    │   ls -la .pi/tools/
    │   ls -la .pi/logs/
    │   df -h .
    │   ```
    │
    └─ 直近のログを確認
        ```bash
        tail -50 .pi/logs/dynamic-tools-audit.jsonl
        ```

[5-10分] 暫定復旧
    ├─ バックアップからの復元（可能な場合）
    │   ```bash
    │   # 最新バックアップを確認
    │   ls -lt .pi/tools/backup/ | head -5
    │
    │   # 復元実行
    │   cp -r .pi/tools/backup/YYYYMMDD/* .pi/tools/
    │   ```
    │
    └─ または、サービス再起動
        ```bash
        # piの再起動
        # （環境に応じて実行）
        ```

[10-15分] 復旧確認
    ├─ ツール一覧が表示されるか確認
    │   ```typescript
    │   list_dynamic_tools({})
    │   ```
    │
    ├─ サンプルツールの実行テスト
    │   ```typescript
    │   // 既存ツールでテスト実行
    │   run_dynamic_tool({ tool_name: "test_tool", parameters: {} })
    │   ```
    │
    └─ ログ記録の確認
        ```bash
        tail -5 .pi/logs/dynamic-tools-audit.jsonl
        ```

[15分以降] 事後対応
    ├─ 根本原因の調査開始
    ├─ 再発防止策の検討
    └─ 事後レポートの作成
```

### P2障害対応フロー（1時間以内）

```
[0-10分] 初期対応
    ├─ 障害現象の特定
    │   - どの操作で問題が発生するか
    │   - エラーメッセージの記録
    │
    └─ 影響範囲の特定
        - 一部のツールのみか、全ツールか

[10-30分] 調査
    ├─ 監査ログの分析
    │   ```bash
    │   grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | tail -50
    │   ```
    │
    ├─ 設定ファイルの確認
    │   - ツール定義ファイルの整合性
    │   - 最大ツール数の確認
    │
    └─ リソース状況の確認
        ```bash
        df -h .
        free -m
        ```

[30-60分] 復旧と確認
    ├─ 問題の修正
    │   - 不要なツールの削除
    │   - 設定の修正
    │   - ファイルの修復
    │
    └─ 動作確認
        - 問題があった操作を再実行
        - 正常動作を確認
```

---

## バックアップとリストア

### バックアップ計画

| 種別 | 頻度 | 保持期間 | 自動化 | 対象 |
|------|------|----------|--------|------|
| フルバックアップ | 日次 | 30日 | 推奨 | .pi/tools/, .pi/logs/ |
| 増分バックアップ | 時間毎 | 7日 | 推奨 | 変更されたファイルのみ |
| 手動バックアップ | 変更前 | 90日 | 手動 | 大規模変更の前後 |

### バックアップ手順

#### 日次フルバックアップ（推奨スクリプト）

```bash
#!/bin/bash
# backup-dynamic-tools.sh
# 動的ツール生成システムの日次バックアップ

BACKUP_BASE=".pi/backups"
DATE=$(date +%Y%m%d)
BACKUP_DIR="${BACKUP_BASE}/${DATE}"

# バックアップディレクトリの作成
mkdir -p "${BACKUP_DIR}"

# ツール定義のバックアップ
if [ -d ".pi/tools" ]; then
  cp -r .pi/tools "${BACKUP_DIR}/tools"
  echo "$(date): ツール定義をバックアップしました"
fi

# 監査ログのバックアップ
if [ -f ".pi/logs/dynamic-tools-audit.jsonl" ]; then
  cp .pi/logs/dynamic-tools-audit.jsonl "${BACKUP_DIR}/"
  echo "$(date): 監査ログをバックアップしました"
fi

# メタデータの記録
cat > "${BACKUP_DIR}/metadata.json" <<EOF
{
  "backupDate": "$(date -Iseconds)",
  "toolCount": $(ls .pi/tools/*.json 2>/dev/null | wc -l),
  "logSize": $(du -b .pi/logs/dynamic-tools-audit.jsonl 2>/dev/null | cut -f1),
  "version": "1.0"
}
EOF

# 古いバックアップの削除（30日以上前）
find "${BACKUP_BASE}" -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null

echo "$(date): バックアップ完了: ${BACKUP_DIR}"
```

#### バックアップの自動化（cron設定）

```bash
# crontab -e で以下を追加
# 毎日午前2時にバックアップ実行
0 2 * * * /path/to/backup-dynamic-tools.sh >> /var/log/dynamic-tools-backup.log 2>&1
```

### リストア手順

#### 部分リストア（特定ツールの復元）

```bash
# 1. 復元するツールの確認
ls -la .pi/backups/YYYYMMDD/tools/

# 2. 特定ツールの復元
cp .pi/backups/YYYYMMDD/tools/dt_abc123.json .pi/tools/

# 3. 復元の確認
cat .pi/tools/dt_abc123.json | jq '.name, .description'
```

#### 完全リストア（全ツールの復元）

```bash
# 1. 現在の状態をバックアップ（念のため）
mv .pi/tools .pi/tools.corrupted.$(date +%Y%m%d%H%M%S)

# 2. バックアップからの復元
cp -r .pi/backups/YYYYMMDD/tools .pi/tools

# 3. 復元の確認
ls -la .pi/tools/
ls .pi/tools/*.json | wc -l

# 4. ツール一覧での確認
# pi内で実行: list_dynamic_tools({})
```

#### 監査ログのリストア

```bash
# 1. 現在のログを退避
mv .pi/logs/dynamic-tools-audit.jsonl .pi/logs/dynamic-tools-audit.jsonl.old

# 2. バックアップから復元
cp .pi/backups/YYYYMMDD/dynamic-tools-audit.jsonl .pi/logs/

# 3. 復元の確認
wc -l .pi/logs/dynamic-tools-audit.jsonl
head -1 .pi/logs/dynamic-tools-audit.jsonl | jq .
```

---

## 障害シナリオ別対応手順

### シナリオ1: 全ツール定義ファイルの消失

**障害レベル**: P1

**症状**:
- `list_dynamic_tools({})` が空を返す
- `.pi/tools/` ディレクトリが空または存在しない

**原因**:
- 誤削除
- ディスク障害
- ファイルシステム破損

**対応手順**:

```bash
# Step 1: 状況確認
ls -la .pi/tools/
df -h .

# Step 2: 最新バックアップの特定
ls -lt .pi/backups/ | head -10

# Step 3: 復元実行
LATEST_BACKUP=$(ls -td .pi/backups/*/ | head -1)
cp -r "${LATEST_BACKUP}tools" .pi/tools

# Step 4: 復元確認
ls -la .pi/tools/
ls .pi/tools/*.json | wc -l
```

**復旧後の検証**:
```typescript
// ツール一覧の確認
list_dynamic_tools({})

// 各ツールの実行テスト（主要ツールをピックアップ）
```

### シナリオ2: 監査ログの完全破損

**障害レベル**: P2

**症状**:
- ログファイルが読めない
- jq パースエラーが発生

**対応手順**:

```bash
# Step 1: 破損の程度を確認
wc -l .pi/logs/dynamic-tools-audit.jsonl
head -5 .pi/logs/dynamic-tools-audit.jsonl

# Step 2: 正常な行のみを抽出して修復
cat .pi/logs/dynamic-tools-audit.jsonl | \
  while IFS= read -r line; do
    echo "$line" | jq . > /dev/null 2>&1 && echo "$line"
  done > .pi/logs/dynamic-tools-audit-fixed.jsonl

# Step 3: 修復結果の確認
wc -l .pi/logs/dynamic-tools-audit-fixed.jsonl

# Step 4: 元ファイルの置き換え
mv .pi/logs/dynamic-tools-audit.jsonl .pi/logs/dynamic-tools-audit.jsonl.corrupted
mv .pi/logs/dynamic-tools-audit-fixed.jsonl .pi/logs/dynamic-tools-audit.jsonl
```

### シナリオ3: ツール実行の連続タイムアウト

**障害レベル**: P2 または P3

**症状**:
- 複数のツールでタイムアウトが発生
- 実行時間が異常に長い

**原因**:
- リソース不足（CPU、メモリ）
- 外部依存の遅延
- ツールコードの問題

**対応手順**:

```bash
# Step 1: リソース状況の確認
top -n 1 | head -20
free -m
df -h .

# Step 2: 問題のあるツールの特定
grep '"success":false' .pi/logs/dynamic-tools-audit.jsonl | \
  grep -i timeout | \
  jq -r '.toolName' | sort | uniq -c | sort -rn

# Step 3: 問題ツールの一時無効化
# （削除せず、バックアップに移動）
mkdir -p .pi/tools/disabled
mv .pi/tools/dt_problematic.json .pi/tools/disabled/

# Step 4: システムリソースの確保
# 不要なプロセスの停止など（環境に応じて実施）
```

### シナリオ4: ディスク容量枯渇

**障害レベル**: P2

**症状**:
- ツール作成エラー
- ログ書き込みエラー

**対応手順**:

```bash
# Step 1: 容量状況の確認
df -h .
du -sh .pi/*
du -sh .pi/tools/*
du -sh .pi/logs/*

# Step 2: 古いログのアーカイブ
# （30日以上前のログを圧縮）
find .pi/backups -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null

# または手動でアーカイブ
mkdir -p .pi/logs/archive
gzip -c .pi/logs/dynamic-tools-audit.jsonl > .pi/logs/archive/audit-$(date +%Y%m%d).jsonl.gz

# Step 3: 不要なツールの削除
# 使用頻度の低いツールを確認
cat .pi/logs/dynamic-tools-audit.jsonl | \
  jq -r 'select(.action == "tool.run") | .toolName' | \
  sort | uniq -c | sort -n | head -20

# Step 4: 確保した容量の確認
df -h .
```

### シナリオ5: セキュリティ侵害の疑い

**障害レベル**: P1

**症状**:
- 不明なツールが作成されている
- 異常なログエントリ
- 権限昇格の兆候

**対応手順**:

```bash
# Step 1: 被害範囲の特定
# 直近のツール作成ログを確認
grep '"action":"tool.create"' .pi/logs/dynamic-tools-audit.jsonl | \
  tail -50 | jq '.'

# Step 2: 全ツールの安全性再評価
for f in .pi/tools/*.json; do
  tool_name=$(jq -r '.name' "$f")
  code=$(jq -r '.code' "$f")
  # コードに危険なパターンがないか目視確認
  echo "=== $tool_name ==="
  echo "$code" | grep -E 'eval|exec|spawn|rm\s' || echo "OK"
done

# Step 3: 疑わしいツールの隔離
mkdir -p .pi/tools/quarantine
mv .pi/tools/dt_suspicious.json .pi/tools/quarantine/

# Step 4: 監査ログの保護
cp .pi/logs/dynamic-tools-audit.jsonl .pi/logs/audit-evidence-$(date +%Y%m%d%H%M%S).jsonl

# Step 5: エスカレーション
# セキュリティ担当者へ連絡
```

---

## 完全システム復旧

### 災害復旧（DR）計画

大規模障害や災害時に、動的ツール生成システムを完全に復旧する手順です。

#### 前提条件

- バックアップが外部ストレージまたはクラウドに保存されている
- 復旧先の環境が稼働可能な状態である
- 必要な認証情報にアクセス可能である

#### 復旧手順

```
フェーズ1: 環境準備（15分）
    ├─ 復旧先環境の確認
    │   - Node.js v18以上がインストールされているか
    │   - ディスク容量が十分か（最低1GB）
    │   - ネットワーク接続が正常か
    │
    ├─ pi-coding-agentのインストール
    │   - npm install -g @mariozechner/pi-coding-agent
    │
    └─ ディレクトリ構造の作成
        mkdir -p .pi/{tools,logs,backups,extensions,lib/dynamic-tools}

フェーズ2: バックアップの取得（10分）
    ├─ 最新バックアップの特定
    │   - 外部ストレージまたはクラウドから一覧取得
    │   - 最新の整合性の取れたバックアップを選択
    │
    └─ バックアップの転送
        - 復旧先環境へバックアップを転送

フェーズ3: データの復元（15分）
    ├─ ツール定義の復元
    │   tar -xzf backup.tar.gz -C .pi/tools/
    │
    ├─ 監査ログの復元
    │   tar -xzf backup.tar.gz -C .pi/logs/
    │
    └─ 拡張機能とライブラリの復元
        - ソースコードリポジトリから取得

フェーズ4: 動作確認（15分）
    ├─ piの起動確認
    │
    ├─ ツール一覧の確認
    │   list_dynamic_tools({})
    │
    ├─ テストツールの実行
    │
    └─ ログ記録の確認

フェーズ5: 切り替え（必要に応じて）
    ├─ DNS/ロードバランサの設定変更
    ├─ 旧環境からのトラフィック停止
    └─ 新環境へのトラフィック開始
```

#### 復旧時間目標（RTO/RPO）

| 項目 | 目標 | 備考 |
|------|------|------|
| RTO（復旧時間目標） | 1時間 | 小規模障害の場合 |
| RTO（災害時） | 4時間 | 環境再構築が必要な場合 |
| RPO（復旧時点目標） | 24時間 | 日次バックアップに依存 |
| RPO（時間毎バックアップ有効時） | 1時間 | 増分バックアップ使用時 |

---

## 復旧後検証チェックリスト

障害からの復旧後、以下のチェックリストを使用してシステムの健全性を確認してください。

### 基本機能チェック

```markdown
## 復旧後検証チェックリスト

### 調査日時: ____年__月__日 __:__
### 担当者: ________________

#### 1. ファイルシステム
- [ ] .pi/tools/ ディレクトリが存在する
- [ ] ツール定義ファイル数が期待値と一致する（___件）
- [ ] .pi/logs/ ディレクトリが存在する
- [ ] 監査ログファイルが存在する

#### 2. ツール一覧
- [ ] list_dynamic_tools({}) が正常に応答する
- [ ] ツール数が期待値と一致する（___件）
- [ ] 主要ツールが一覧に表示される

#### 3. ツール実行
- [ ] 既存ツールの実行が成功する（ツール名: _______）
- [ ] 実行結果が正しい
- [ ] タイムアウトが発生しない

#### 4. ツール作成
- [ ] 新規ツールの作成が成功する
- [ ] 作成したツールが一覧に表示される
- [ ] 作成したツールの実行が成功する

#### 5. ログ記録
- [ ] 新しい操作が監査ログに記録される
- [ ] ログエントリの形式が正しい
- [ ] エラー情報が適切に記録される

#### 6. セキュリティ
- [ ] 不明なツールが存在しない
- [ ] 権限設定が適切である
- [ ] 機密情報の漏洩がない

#### 7. パフォーマンス
- [ ] ツール実行時間が正常範囲内（___ms以下）
- [ ] ディスク使用量が正常範囲内（___%以下）
- [ ] メモリ使用量が正常範囲内

### 確認結果
- 合格項目数: ___/___
- 不合格項目: ________________
- 追加対応が必要な項目: ________________

### 署名
- 検証者: ________________
- 承認者: ________________
```

### 検証コマンド一覧

```bash
# ファイルシステム確認
ls -la .pi/tools/
ls -la .pi/logs/
df -h .

# ツール定義の整合性確認
for f in .pi/tools/*.json; do
  jq . "$f" > /dev/null 2>&1 || echo "INVALID: $f"
done

# 監査ログの整合性確認
cat .pi/logs/dynamic-tools-audit.jsonl | \
  while IFS= read -r line; do
    echo "$line" | jq . > /dev/null 2>&1 || echo "INVALID LINE"
  done

# ツール数の確認
ls .pi/tools/*.json 2>/dev/null | wc -l
```

---

## エスカレーション基準

### エスカレーションが必要な状況

| 状況 | エスカレーション先 | タイミング |
|------|-------------------|-----------|
| P1障害の発生 | 管理者、開発チーム | 即時 |
| P2障害が1時間で解決しない | 管理者 | 1時間後 |
| セキュリティ侵害の疑い | セキュリティ担当者 | 即時 |
| データ損失の発生 | 管理者、法務（必要に応じて） | 即時 |
| 復旧手順の不備 | ドキュメント管理者 | 復旧後 |

### エスカレーション時の情報

エスカレーション時は以下の情報を含めてください:

```markdown
## 障害エスカレーション報告

### 報告日時
- YYYY-MM-DD HH:MM

### 障害レベル
- P1/P2/P3/P4

### 影響範囲
- 影響を受けるユーザー数:
- 影響を受ける機能:
- ビジネスへの影響:

### 現状
- 発生時刻:
- 発見者:
- 現在の状況:

### 実施済み対応
- 1. ...
- 2. ...

### 必要な支援
- [ ] 技術的な支援
- [ ] リソースの追加
- [ ] 権限のある操作
- [ ] ユーザーへの通知

### 添付資料
- エラーログ:
- スクリーンショット:
- 設定ファイル:
```

---

## 関連ドキュメント

- [README.md](./README.md) - システム概要とトラブルシューティング
- [API.md](./API.md) - APIリファレンス
- [SAFETY.md](./SAFETY.md) - 安全性ガイド
- [OPERATIONS.md](./OPERATIONS.md) - 運用手順書

---

## 変更履歴

| 日付 | バージョン | 変更内容 | 作成者 |
|------|-----------|----------|--------|
| 2026-02-16 | 1.0.0 | 初版作成 | recovery-author |
