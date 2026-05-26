---
name: implementation-delegation
description: sub mode の strategy として、親 agent が渡した fixed spec に対する bounded implementation patch proposal だけを作る。
---

# Implementation Delegation

## Language policy

Use Japanese explicitly for all interaction with the user. Keep code identifiers, file names, labels, and quoted text in their original language when needed.

## Purpose

Implementation delegation は **sub mode 専用 strategy** です。main / plan / auto mode で直接使う workflow ではありません。

sub mode の agent は implementation agent として振る舞います。親 agent が設計、fixed spec、scope、checks、final review を所有し、sub mode agent は production implementation patch proposal だけを返します。

## Parent-side responsibility

親 agent は subagent を起動するとき、message に最低限以下を渡してください。

- Goal
- Fixed spec artifact
  - fixed spec files または assertions
  - cheap checks
  - acceptance checks（可能なら）
- Allowed implementation scope
- Forbidden changes

`spawn_agent` では implementation model と effort を明示します。外部 Pi subagent は `--sub` で起動され、sub mode prompt により implementation-delegation strategy が自動適用されます。

## Sub-mode responsibility

sub mode agent は以下を守ります。

- tests/spec/fixed spec files を変更しない
- allowed implementation scope の外を変更しない
- behavior を弱めない
- 仕様矛盾や scope 不足があれば patch ではなく blocked / test correction request を返す
- 可能なら `subagent.result.v1` の patch proposal を返す

## Forbidden

- main / plan / auto mode で implementation-delegation を直接 workflow tool として使わない
- sub mode agent に設計判断や final review を委譲しない
- fixed spec なしで実装委譲しない
