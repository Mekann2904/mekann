<!-- /Users/mekann/github/pi-plugin/mekann/docs/02-user-guide/26-autoresearch-e2e.md -->
<!-- このファイルは、mekann で autoresearch 型の e2e 改善ループを回す運用を説明します。 -->
<!-- なぜ存在するか: overnight 実験を agent-first で安全に再開可能な形へ固定するためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/.pi/skills/autoresearch-e2e/SKILL.md, /Users/mekann/github/pi-plugin/mekann/scripts/autoresearch-e2e.ts, /Users/mekann/github/pi-plugin/mekann/tests/e2e/README.md, /Users/mekann/github/pi-plugin/mekann/docs/05-meta/08-autonomous-harness-playbook.md -->
---
title: Autoresearch E2E Loop
category: user-guide
audience: developer
last_updated: 2026-03-13
tags: [autoresearch, e2e, autonomy, overnight]
related: [./README.md, ../../tests/e2e/README.md, ../../tests/e2e/STRATEGY.md, ../05-meta/08-autonomous-harness-playbook.md]
---

# Autoresearch E2E Loop

`karpathy/autoresearch` の考え方を、`mekann` の `e2e` 改善ループへ寄せた運用です。

## 何をするか

- 1 実験 1 アイデアでコードを変える
- `tests/e2e` を実行する
- 結果を保存する
- 改善時だけ commit する
- 退行時は best commit に戻す

## コマンド

初期化:

```bash
node --import tsx scripts/autoresearch-e2e.ts init --tag mekann-e2e
```

baseline:

```bash
node --import tsx scripts/autoresearch-e2e.ts baseline --label baseline
```

1 実験:

```bash
node --import tsx scripts/autoresearch-e2e.ts run --label "fix-plan-lifecycle"
```

状態確認:

```bash
node --import tsx scripts/autoresearch-e2e.ts status
```

## 保存先

```text
.pi/autoresearch/e2e/
├── state.json
├── results.tsv
└── experiments/
    └── <timestamp>-<label>/
        ├── run.log
        └── vitest-report.json
```

## 判定ルール

改善判定は次の順です。

1. failed test 数が減ったか
2. passed test 数が増えたか
3. total test 数が増えたか
4. duration が短くなったか

## タイムアウト

- 理想時間: 約 5 分
- hard timeout: 10 分

10 分を超えた実験は kill して `timeout` 扱いにします。

## skill

agent に自律反復をさせるときは `autoresearch-e2e` skill を使います。

場所:

```text
.pi/skills/autoresearch-e2e/SKILL.md
```
