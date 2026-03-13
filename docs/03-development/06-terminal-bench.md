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

`docker` が入っていても daemon が落ちていると実行できません。

`docker_daemon	ok` が出ることを確認してください。

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
- concurrent trials: `2`
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

difficulty ごとに件数で絞りたい場合:

```bash
TBENCH_DIFFICULTY_COUNTS=easy=2,medium=3,hard \
bash scripts/run-terminal-bench.sh
```

- `easy=2`: easy を 2 件だけ実行
- `medium=3`: medium を 3 件だけ実行
- `hard`: hard を全件実行
- 件数を省略した difficulty は全件実行
- 既定では task cache の `task.toml` にある `metadata.difficulty` を使います

固定した task 名だけで回したい場合:

```bash
TBENCH_TASK_NAMES=break-filter-js-from-html,llm-inference-batching-scheduler \
bash scripts/run-terminal-bench.sh
```

- `TBENCH_TASK_NAMES` は `--task-name` をそのまま固定します
- `TBENCH_DIFFICULTY_COUNTS` と同時指定はできません
- autoresearch-tbench は `init` 時に difficulty selector を concrete task list に解決し、その固定 list を以後ずっと使います

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

### Docker daemon に繋がらない

今回の失敗はこれです。

`docker` コマンドがあっても、Colima か Docker Desktop が起動していないと Harbor が全 task を即失敗させます。

先に次を確認してください。

```bash
bash scripts/check-terminal-bench.sh
docker info
```

`docker_daemon	unreachable` が出る場合は、Docker Desktop を起動するか Colima を起動してから再実行してください。

Colima が壊れた状態で残っていると、`colima start` 自体が失敗することがあります。

今回の実例では次の流れで復旧しました。

```bash
colima delete --force
colima start
colima ssh -- sudo systemctl restart docker
colima ssh -- sudo chmod 666 /run/docker.sock
docker info
```

補足:

- `colima delete --force` は Colima VM 内の image と container を消します
- 今回は guest 内 Docker は起動していたのに、host 側 socket 転送が `EOF` のまま残りました
- そのため一時対応として `/run/docker.sock` の権限を広げて host 側接続を復旧しました
- この権限変更は再起動で戻る可能性があります

### Colima の DNS が壊れている

今回の benchmark 失敗の主因はこれでした。

症状は 2 つに見えます。

```text
Temporary failure resolving 'deb.debian.org'
lookup registry-1.docker.io on [::1]:53: read udp ... connection refused
```

つまり task container から Debian mirror と Docker Hub を引けず、environment build と agent setup の両方が落ちます。

確認:

```bash
docker info
colima ssh -- bash -lc 'cat /etc/resolv.conf'
colima ssh -- bash -lc 'getent hosts deb.debian.org'
colima ssh -- bash -lc 'getent hosts registry-1.docker.io'
```

今回の根因は、Colima VM 内の `/etc/resolv.conf` が壊れた link になっていたことでした。

恒久対策:

- Colima 設定の `network.dns` を固定値にする
- `provision` で `/etc/resolv.conf` を毎回補正する

現在は `~/.colima/default/colima.yaml` に次を入れてあります。

```yaml
network:
  dns:
    - 1.1.1.1
    - 8.8.8.8

provision:
  - mode: system
    script: |
      rm -f /etc/resolv.conf
      cat >/etc/resolv.conf <<'EOF'
      nameserver 1.1.1.1
      nameserver 8.8.8.8
      options edns0
      EOF
```

反映:

```bash
colima stop
colima start
```

この修正後は `deb.debian.org` と `registry-1.docker.io` の名前解決が通ることを確認済みです。

### pi agent setup が `nvm install` で詰まる

DNS 復旧後も、`pi agent setup` が長時間止まる場合があります。

今回の実例では `nvm install 22` が `iojs.org/dist/index.tab` 周辺で張り付きました。

対策として、Harbor custom agent は `nvm` を使わず、Node 22.12.0 の公式 tarball を直接入れる方式へ変更しました。

実装箇所:

- `bench/tbench_pi_agent/harbor_pi_agent.py`

今の setup 方針:

1. `apt-get install` で最小依存だけ入れる
2. `https://nodejs.org/dist/v22.12.0/...tar.xz` を直接取得する
3. `/opt/mekann/node` に展開する
4. `PATH` に `/opt/mekann/node/bin` を追加して `npm ci` と `pi` 実行に使う

つまり再発時は `nvm` を疑う必要はほぼありません。

確認したい場合:

```bash
python3 -m py_compile bench/tbench_pi_agent/harbor_pi_agent.py
docker top <task-container-name>
```

`docker top` に `nvm install` ではなく、`curl https://nodejs.org/dist/v22.12.0/...` が見えれば新しい setup が使われています。

### 再発時の最短チェックリスト

次に同じ事故が起きたら、まずこの順で見てください。

```bash
bash scripts/check-terminal-bench.sh
docker info
colima ssh -- bash -lc 'cat /etc/resolv.conf'
colima ssh -- bash -lc 'getent hosts deb.debian.org'
colima ssh -- bash -lc 'getent hosts registry-1.docker.io'
```

次に 1 task だけ再検証します。

```bash
bash scripts/run-terminal-bench.sh --n-concurrent 1 --task-name log-summary-date-ranges
```

この single-task が通れば、full run に戻してよいです。

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

今の既定ループは `autoresearch-tbench` です。

`pi` の中から次を使えます。

```text
/autoresearch-tbench init selection=easy=2,medium=2,hard=2 tag=mekann-tbench
/autoresearch-tbench baseline label=baseline
/autoresearch-tbench run label=try-adaptorch
/autoresearch-tbench status
```

重要なのは `init` で固定した task list を、その session 中ずっと使うことです。

これで評価のぶれを防ぎ、成功率と時間の差分を同じ母集団で比較できます。
