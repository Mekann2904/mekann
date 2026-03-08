<!-- /Users/mekann/github/pi-plugin/mekann/docs/05-meta/09-agent-first-harness.md -->
<!-- このファイルは、mekann に導入した agent-first harness の入口、診断方法、使い方を説明します。 -->
<!-- なぜ存在するか: 自走機能が増えても入口が散らばらず、pi 上の mekann 拡張と人間が同じ運用契約を参照できるようにするためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/WORKFLOW.md, /Users/mekann/github/pi-plugin/mekann/.pi/extensions/harness-engineering.ts, /Users/mekann/github/pi-plugin/mekann/scripts/harness-engineering.ts, /Users/mekann/github/pi-plugin/mekann/docs/05-meta/08-autonomous-harness-playbook.md -->
---
title: Agent-First Harness
category: meta
audience: developer, contributor
last_updated: 2026-03-08
tags: [agent-first, harness, workflow, pi-mono, mekann]
related: [./08-autonomous-harness-playbook.md, ../../WORKFLOW.md, ../../README.md]
---

# Agent-First Harness

`mekann` にはすでに `autonomy-policy`、`long-running-supervisor`、`workspace-verification`、`ul-workflow` がありました。

今回追加したのは、それらを人間にも pi 上の `mekann` 拡張にも分かる 1 つの入口へ束ねる層です。

## 追加したもの

- `WORKFLOW.md`
- `.pi/lib/harness-engineering.ts`
- `.pi/extensions/harness-engineering.ts`
- `scripts/harness-engineering.ts`
- `.pi/lib/workflow-workpad.ts`
- `.pi/extensions/workflow-workpad.ts`

## 何が改善されるか

1. 自走前にどの文書を読むべきかが固定されます。
2. repo のハーネス状態をスコア化できます。
3. 欠けた制御点を recommendation として機械的に出せます。
4. report を `.pi/reports/` へ保存できます。
5. 各タスクの progress / verification / next step を `.pi/workpads/` に durable に残せます。

## 使い方

CLI:

```bash
npm run harness:doctor
npm run harness:doctor -- --write
npm run harness:workflow -- --write
```

pi tool:

```text
harness_engineering_assess(action="report")
harness_engineering_assess(action="write_report")
harness_engineering_assess(action="workflow_template")
```

workpad:

```text
workflow_workpad_start(task="Fix verification drift", issue_id="MK-12")
workflow_workpad_update(id="...", section="progress", content="- inspected related files")
workflow_workpad_show(action="latest")
```

## 読み方

`overall_score` は 4 本柱の平均です。

- Progressive Disclosure
- Execution Harness
- Mechanical Verification
- Review And Garbage Collection

低い pillar が、そのまま次の整備対象です。

## 運用の位置づけ

`WORKFLOW.md` は「開始時の地図」です。

`08-autonomous-harness-playbook.md` は「毎反復の runbook」です。

`.pi/workpads/*.md` は「各タスクの durable log」です。

両方を分けたことで、入口は短く、運用は具体的に保てます。
