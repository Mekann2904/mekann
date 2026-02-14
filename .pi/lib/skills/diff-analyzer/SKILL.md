---
name: diff-analyzer
description: 差分分析スキル。大規模変更の影響範囲、競合リスク、統合難易度を評価。PRレビュー、マージ計画、リリース判断を支援。
---

# Diff Analyzer

コードの差分を分析し、変更の影響範囲とリスクを評価するスキル。PRレビューやマージ計画に使用。

## 基本的な差分確認

### 変更統計

```bash
# 変更統計
git diff --stat main...feature-branch

# 出力例
# src/api/user.ts    |  45 +++++++++++---
# src/utils/helper.ts |  12 ++--
# 2 files changed, 42 insertions(+), 15 deletions(-)
```

### 行数の詳細

```bash
# 追加・削除行数
git diff --numstat main...feature-branch

# 形式: 追加行数 削除行数 ファイルパス
```

### 変更ファイル一覧

```bash
# 変更されたファイルのみ
git diff --name-only main...feature-branch

# ステータス付き
git diff --name-status main...feature-branch
# M  modified
# A  added
# D  deleted
# R  renamed
```

## 変更規模の評価

### 変更サイズによる分類

| 規模 | 行数 | レビュー時間 |
|------|------|--------------|
| 小 | < 100行 | 15-30分 |
| 中 | 100-500行 | 1-2時間 |
| 大 | 500-1000行 | 半日 |
| 巨大 | 1000行+ | 分割推奨 |

### 統計取得スクリプト

```bash
#!/bin/bash
BRANCH=${1:-main}
TARGET=${2:-HEAD}

added=$(git diff $BRANCH...$TARGET --diff-filter=M | grep "^+" | wc -l)
deleted=$(git diff $BRANCH...$TARGET --diff-filter=M | grep "^-" | wc -l)
files=$(git diff $BRANCH...$TARGET --name-only | wc -l)

echo "=== Diff Statistics ==="
echo "Files changed: $files"
echo "Lines added: $added"
echo "Lines deleted: $deleted"
echo "Net change: $((added - deleted))"
```

## 影響範囲分析

### ディレクトリ別の変更

```bash
# ディレクトリ別集計
git diff --stat main...HEAD | grep "/" | awk -F'/' '{print $1}' | sort | uniq -c | sort -rn
```

### 機能別の変更

```bash
# 特定プレフィックスを持つファイルの変更
git diff --name-only main...HEAD | grep -E "(api|service|component)" | sort | uniq -c
```

### テストファイル vs 本体ファイル

```bash
#!/bin/bash
echo "=== Test vs Source Changes ==="
tests=$(git diff --name-only main...HEAD | grep -c "__tests__\|\.test\.\|\.spec\.")
sources=$(git diff --name-only main...HEAD | grep -cv "__tests__\|\.test\.\|\.spec\.")
echo "Source files: $sources"
echo "Test files: $tests"
echo "Test ratio: $(echo "scale=2; $tests * 100 / ($tests + $sources)" | bc)%"
```

## 競合リスク評価

### マージベースとの差分

```bash
# 共通祖先からの分岐点を確認
git merge-base main feature-branch

# 分岐からの経過コミット数
git rev-list --count $(git merge-base main feature-branch)..feature-branch
```

### 競合可能性の高いファイル

```bash
# 同じファイルがmainでも変更されているか
for file in $(git diff --name-only main...feature-branch); do
  if git diff --name-only $(git merge-base main feature-branch)..main | grep -q "$file"; then
    echo "CONFLICT RISK: $file"
  fi
done
```

### 競合リスクスコア

```bash
#!/bin/bash
echo "=== Conflict Risk Assessment ==="

base=$(git merge-base main HEAD)
branch_commits=$(git rev-list --count $base..HEAD)
main_commits=$(git rev-list --count $base..main)
overlap=$(comm -12 <(git diff --name-only $base..HEAD | sort) <(git diff --name-only $base..main | sort) | wc -l)

echo "Branch commits ahead: $branch_commits"
echo "Main commits ahead: $main_commits"
echo "Overlapping files: $overlap"

if [ $overlap -gt 5 ]; then
  echo "RISK: HIGH - Many overlapping file changes"
elif [ $overlap -gt 0 ]; then
  echo "RISK: MEDIUM - Some overlapping file changes"
else
  echo "RISK: LOW - No overlapping file changes"
fi
```

## 変更タイプ分析

### 変更パターンの分類

```bash
#!/bin/bash
echo "=== Change Type Analysis ==="

echo "New files:"
git diff --name-status main...HEAD | grep "^A" | wc -l

echo "Deleted files:"
git diff --name-status main...HEAD | grep "^D" | wc -l

echo "Renamed files:"
git diff --name-status main...HEAD | grep "^R" | wc -l

echo "Modified files:"
git diff --name-status main...HEAD | grep "^M" | wc -l
```

### 重要な変更パターン検出

```bash
# API変更の検出
git diff main...HEAD -- '*.ts' '*.js' | grep -E "^\+.*export|^\-.*export"

# 設定ファイルの変更
git diff main...HEAD -- '*.json' '*.yaml' '*.yml' '*.env*'

# マイグレーションファイル
git diff --name-only main...HEAD | grep -i migration
```

## PRレビュー支援

### レビュー観点チェックリスト

```bash
#!/bin/bash
echo "=== Review Checklist ==="

echo "1. Breaking changes:"
git diff main...HEAD | grep -E "^\-.*export|^\-.*public" | head -5

echo ""
echo "2. New dependencies:"
git diff main...HEAD -- package.json requirements.txt Pipfile go.mod | grep "^\+"

echo ""
echo "3. Security sensitive files:"
git diff --name-only main...HEAD | grep -E "auth|password|secret|key|token"

echo ""
echo "4. Large changes (>500 lines in single file):"
git diff --numstat main...HEAD | awk '$1 > 500 || $2 > 500 {print $3}'
```

## 統合難易度評価

### スコアリング

| 要件 | スコア |
|------|--------|
| 変更行数 < 200 | +0 |
| 変更行数 200-500 | +1 |
| 変更行数 500-1000 | +2 |
| 変更行数 > 1000 | +3 |
| 競合ファイル > 0 | +2 |
| テストが含まれる | -1 |
| ドキュメント更新あり | -1 |

### 判定

| スコア | 難易度 | 推奨アクション |
|--------|--------|----------------|
| 0-1 | 低 | 通常マージ |
| 2-3 | 中 | コードレビュー強化 |
| 4-5 | 高 | 段階的マージ検討 |
| 6+ | 非常に高い | 変更の分割を検討 |

## CI統合

```yaml
- name: Diff Analysis
  run: |
    echo "=== Change Statistics ==="
    git diff --stat origin/main...HEAD

    echo "=== Files Changed ==="
    git diff --name-status origin/main...HEAD

    # 大きすぎるPRを警告
    lines=$(git diff origin/main...HEAD | wc -l)
    if [ $lines -gt 1000 ]; then
      echo "::warning::Large PR detected ($lines lines). Consider splitting."
    fi
```
