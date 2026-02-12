---
title: rsa_solve - 推論スケーリング
category: user-guide
audience: daily-user
last_updated: 2026-02-11
tags: [extension, rsa, reasoning]
related: [./01-extensions.md, ./04-loop-run.md]
---

# rsa_solve - 推論スケーリング

> パンくず: [Home](../../README.md) > [User Guide](./) > rsa_solve

Recursive Self-Aggregation (RSA) による推論タスクのスケーリング。

## アルゴリズム

1. N個の候補解を生成
2. 各ステップでK個のサブセットを選択し、集約プロンプトで改善
3. Tステップ繰り返す
4. 過半数投票で1つの結果を選択

総モデル呼び出し数：`N × T`

## スラッシュコマンド

```bash
/rsa ルート2が無理数であることを証明せよ
/rsa --n 8 --k 4 --t 5 --parallel 4 問題を解いてください
/rsa --trace verbose --n 6 --k 3 --t 3 問題を解いてください
/rsa --stream --n 6 --k 3 --t 3 問題を解いてください
/rsa --help
```

## パラメータ

| パラメータ | 短縮形 | デフォルト | 範囲 | 説明 |
|-----------|--------|-----------|------|------|
| `-n` | - | `4` | 1-32 | 初期母集団サイズ |
| `-k` | - | `2` | 1-16 | 集約用サブセットサイズ |
| `-t` | - | `2` | 1-20 | 反復ステップ数 |
| `--parallel` / `--p` / `--c` | - | `1` | 1-16 | ステップごとの並列呼び出し数 |
| `--trace` | - | `summary` | - | トレースレベル：`off`、`summary`、`verbose` |
| `--verbose` | - | - | - | `--trace verbose` のショートカット |
| `--stream` | - | - | - | `--trace verbose` のショートカット |
| `--timeout` | - | `120000` | - | 呼び出しごとのタイムアウト（ミリ秒、0=無効） |
| `--no-timeout` | - | - | - | タイムアウトを無効化（`timeout`を0に設定） |

**注意：** スラッシュコマンドでは短縮形（`-n`、`-k`、`-t`）のみ使用可能です。ツール呼び出し時には `populationSize`、`aggregationSize`、`steps`、`parallelism`、`traceMode`、`timeoutMs` を使用します。

## ツール呼び出し例

```json
{
  "tool": "rsa_solve",
  "input": {
    "question": "この漸化式の閉形式を求めてください",
    "populationSize": 8,
    "aggregationSize": 4,
    "steps": 5,
    "parallelism": 4,
    "traceMode": "summary"
  }
}
```

## パフォーマンス考慮事項

- 総API呼び出し数 = `populationSize × steps`
- デフォルト設定（N=4、K=2、T=2）：8回の呼び出し
- 論文設定（N=16、K=4、T=10）：160回の呼び出し
- 並列性を上げると実行速度が向上しますが、同時実行レート制限に注意

## 使用パターン

### 数学的証明

```bash
/rsa ルート2が無理数であることを証明せよ
```

### 複雑な問題解決

```bash
/rsa --n 8 --k 4 --t 5 --parallel 4 このアルゴリズムの最適化を提案してください
```

### 詳細なトレース

```bash
/rsa --verbose --n 6 --k 2 --t 3 --parallel 2 問題を解いてください
```

---

## 関連トピック

- [loop_run](./04-loop-run.md) - 自律ループ実行
- [拡張機能一覧](./01-extensions.md) - すべての拡張機能

## 次のトピック

[ → loop_run](./04-loop-run.md)
