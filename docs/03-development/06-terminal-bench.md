<!-- /Users/mekann/github/pi-plugin/mekann/docs/03-development/06-terminal-bench.md -->
<!-- このファイルは、mekann で Terminal-Bench 2.0 相当 dataset を導入して使う手順を説明します。 -->
<!-- なぜ存在するか: agent 性能を e2e 以外でも測り、autoresearch の評価器として使えるようにするためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/scripts/run-terminal-bench.sh, /Users/mekann/github/pi-plugin/mekann/scripts/check-terminal-bench.sh, /Users/mekann/github/pi-plugin/mekann/bench/terminal-bench/README.md, /Users/mekann/github/pi-plugin/mekann/package.json -->
---
title: Terminal Bench Integration
category: development
audience: developer
last_updated: 2026-03-13
tags: [terminal-bench, harbor, benchmark, autoresearch]
related: [../../bench/terminal-bench/README.md, ../../scripts/run-terminal-bench.sh, ../../tests/e2e/README.md, ../05-meta/08-autonomous-harness-playbook.md]
---

# Terminal Bench Integration

`mekann` に Terminal-Bench 2.0 相当の benchmark 実行環境を導入しました。

CLI は repo ローカルの `.venv-tbench` に入っています。

## 何が入ったか

- `harbor`
- `terminal-bench` (`tb`)
- Harbor custom agent
  - `bench/tbench_pi_agent/harbor_pi_agent.py`
- 実行ラッパー
  - `scripts/harbor.sh`
  - `scripts/tb.sh`
  - `scripts/run-terminal-bench.sh`
  - `scripts/check-terminal-bench.sh`
  - `scripts/init-terminal-bench-task.sh`

## 前提条件

- Docker
- `pi` の auth
  - 既定では `~/.pi/agent/auth.json` の `zai` API key を使います
  - provider は `zai`
  - model は `glm-5`
  - base URL は `https://api.z.ai/api/coding/paas/v4`

確認:

```bash
bash scripts/check-terminal-bench.sh
```

## Official dataset を走らせる

```bash
bash scripts/run-terminal-bench.sh
```

既定では次を使います。

- dataset: `terminal-bench@2.0`
- agent: Harbor custom `pi`
- jobs dir: `.pi/benchmarks/terminal-bench/jobs`
- provider: `zai` from pi auth
- model: `glm-5`
- agent setup timeout multiplier: `4`
- `Darwin arm64` では `--force-build` が既定です
- API-only 既定 denylist: `gpt2-codegolf`

この custom agent は benchmark 環境の中で次を行います。

1. `mekann` repo を環境へ展開する
2. `npm ci` で `pi` 実行環境を構築する
3. `pi --mode json --print` を実行する
4. `~/.pi/agent/auth.json` の `zai` key と `settings.json` を使う

Apple Silicon では prebuilt の `linux/amd64` image を避けるため、task Dockerfile をローカル build します。

必要なら明示的に切り替えられます。

```bash
TBENCH_FORCE_BUILD=1 bash scripts/run-terminal-bench.sh
TBENCH_FORCE_BUILD=0 bash scripts/run-terminal-bench.sh
```

ローカル model asset を取る task を避けたい場合、既定で `gpt2-codegolf` を除外します。

必要なら denylist を調整できます。

```bash
TBENCH_EXCLUDE_TASK_NAMES=gpt2-codegolf bash scripts/run-terminal-bench.sh
TBENCH_EXCLUDE_TASK_NAMES= bash scripts/run-terminal-bench.sh
```

つまり benchmark は `codex` shim ではなく、実際の `pi` フローで動きます。

model を明示したい場合:

```bash
TBENCH_MODEL=glm-5 \
bash scripts/run-terminal-bench.sh
```

旧来の codex agent で動かしたい場合:

```bash
TBENCH_AGENT=codex \
bash scripts/run-terminal-bench.sh
```

## mekann private set を使う

task 雛形作成:

```bash
bash scripts/init-terminal-bench-task.sh fix-plan-flow
```

local dataset 実行:

```bash
TBENCH_DATASET_PATH=bench/terminal-bench/tasks \
bash scripts/run-terminal-bench.sh
```

## npm scripts

```bash
npm run tbench:check
npm run tbench:terminal-bench2
npm run tbench:status
```

## 実行できない場合

### Docker がない

この環境では benchmark 本体は動きません。

まず Docker を入れてください。

### API key がない

agent 実行で止まります。

`scripts/check-terminal-bench.sh` で `pi_api_key` を確認してください。

`~/.pi/agent/auth.json` に `zai` の key が無い場合は、まず `pi` 側の認証を直してください。

### custom agent の import に失敗する

`scripts/run-terminal-bench.sh` は `PYTHONPATH` に repo root を足してから Harbor を起動します。

直接 `harbor run` する場合は、先に次を付けてください。

```bash
PYTHONPATH="$PWD" \
bash scripts/harbor.sh run \
  --agent-import-path bench.tbench_pi_agent.harbor_pi_agent:HarborPiAgent \
  ...
```

### CLI が壊れた

再インストール:

```bash
UV_CACHE_DIR=/tmp/uv-cache \
uv pip install --python .venv-tbench/bin/python harbor terminal-bench
```

## autoresearch との関係

`e2e` だけではなく、terminal task の完遂率を評価器にできます。

つまり次の流れにできます。

1. agent がコード変更
2. `terminal-bench@2.0` を実行
3. score を比較
4. 改善時だけ keep

このための benchmark 土台として今回の導入を使います。
