<!-- /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/27-autoresearch-tbench.md -->
<!-- このファイルは、pi 内で terminal-bench 向け autoresearch を回す手順を説明します。 -->
<!-- なぜ存在するか: agent 改善の主評価器を e2e ではなく terminal-bench に固定するためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/extensions/autoresearch-tbench.ts, /Users/mekann/github/pi-plugin/mekann/.pi/lib/autoresearch-tbench.ts, /Users/mekann/github/pi-plugin/mekann/scripts/autoresearch-tbench.ts, /Users/mekann/github/pi-plugin/mekann/docs/03-development/06-terminal-bench.md -->
---
title: Autoresearch Tbench Loop
category: user-guide
audience: developer
last_updated: 2026-03-13
tags: [autoresearch, terminal-bench, benchmark, pi]
related: [./26-autoresearch-e2e.md, ../03-development/06-terminal-bench.md, ../../scripts/autoresearch-tbench.ts, ../../scripts/run-terminal-bench.sh]
---

# Autoresearch Tbench Loop

`mekann` の既定の autoresearch 入口は `terminal-bench` です。

`e2e` は残していますが、主評価器としては `autoresearch-tbench` を使います。

## 何をするか

- `init` 時点で benchmark 対象 task を固定する
- baseline を 1 回取る
- 1 実験 1 アイデアでコードを変える
- 同じ task 集合で `terminal-bench` を再実行する
- 成功率を最優先に比較する
- 同点なら reward と時間で比較する
- 改善時だけ keep する

## なぜ fixed task list なのか

difficulty selector を毎回引き直すと、比較対象が変わります。

それでは改善なのか、task の引きが変わっただけなのかが分かりません。

そのため `autoresearch-tbench` は `init` の瞬間に selector を concrete task list に解決し、その session では同じ list を使い続けます。

新しい autoresearch session を始めたときだけ、別の list に変えてよい設計です。

## pi から使う

```text
/autoresearch-tbench init selection=easy=2,medium=2,hard=2 tag=mekann-tbench
/autoresearch-tbench baseline label=baseline
/autoresearch-tbench run label=try-adaptorch
/autoresearch-tbench status
```

`/autoresearch` も同じコマンドの alias です。

## npm scripts

```bash
npm run autoresearch:init -- --selection easy=2,medium=2,hard=2 --tag mekann-tbench
npm run autoresearch:baseline -- --label baseline
npm run autoresearch:run -- --label try-adaptorch
npm run autoresearch:status
```

## 判定ルール

改善判定は次の順です。

1. success 数が増えたか
2. mean reward が上がったか
3. error 数が減ったか
4. completed trial 数が増えたか
5. elapsed time が短くなったか

つまり「成功しつつ、時間を短くする」を、同じ task 集合の中で比較します。

## 保存先

```text
.pi/autoresearch/tbench/
├── state.json
├── results.tsv
├── jobs/
└── experiments/
    └── <timestamp>-<label>/
        ├── run.log
        └── summary.json
```

## Git 運用

既定では `init` 前に clean tree を要求します。

改善時は commit します。

退行時は best commit に戻します。

Git を使いたくない場合だけ `git=false` または `--no-git` を使ってください。

ただしその場合、退行した変更は自動では戻りません。
