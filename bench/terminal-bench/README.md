<!-- /Users/mekann/github/pi-plugin/mekann/bench/terminal-bench/README.md -->
<!-- このファイルは、Terminal-Bench 2.0 相当 dataset と mekann private set の入口をまとめます。 -->
<!-- なぜ存在するか: official benchmark と repo 固有 benchmark を同じ場所で運用するためです。 -->
<!-- 関連ファイル: /Users/mekann/github/pi-plugin/mekann/scripts/run-terminal-bench.sh, /Users/mekann/github/pi-plugin/mekann/scripts/init-terminal-bench-task.sh, /Users/mekann/github/pi-plugin/mekann/docs/03-development/06-terminal-bench.md, /Users/mekann/github/pi-plugin/mekann/package.json -->

# Terminal Bench

このディレクトリは 2 つの用途を持ちます。

1. Terminal-Bench 2.0 相当の official dataset を実行する
2. `mekann` 固有の private task set を育てる

## Official Benchmark

```bash
bash scripts/check-terminal-bench.sh
bash scripts/run-terminal-bench.sh
```

既定値:

- dataset: `terminal-bench@2.0`
- agent: Harbor custom `pi`
- provider: `zai`
- model: `glm-5`
- jobs dir: `.pi/benchmarks/terminal-bench/jobs`
- concurrent trials: `2`
- `Darwin arm64` では task image を `--force-build` します
- API-only 既定 denylist: `gpt2-codegolf`

## Private Set

task 雛形を作る:

```bash
bash scripts/init-terminal-bench-task.sh fix-plan-loop
```

local dataset を走らせる:

```bash
TBENCH_DATASET_PATH=bench/terminal-bench/tasks \
bash scripts/run-terminal-bench.sh
```

denylist を変える:

```bash
TBENCH_EXCLUDE_TASK_NAMES=gpt2-codegolf \
bash scripts/run-terminal-bench.sh
```

difficulty ごとに件数で絞る:

```bash
TBENCH_DIFFICULTY_COUNTS=easy=2,medium=3,hard \
bash scripts/run-terminal-bench.sh
```

- `easy=2`: easy を先頭 2 件だけ実行
- `medium=3`: medium を先頭 3 件だけ実行
- `hard`: hard を全件実行
- 件数を省略した difficulty は全件実行
- task 順は task 名の昇順です

固定した task 名だけで実行する:

```bash
TBENCH_TASK_NAMES=break-filter-js-from-html,llm-inference-batching-scheduler \
bash scripts/run-terminal-bench.sh
```

- `TBENCH_TASK_NAMES` は `--task-name` を固定列挙します
- `TBENCH_DIFFICULTY_COUNTS` とは同時に使えません
- autoresearch では `init` 時に一度だけこの固定 list を決めます

## Notes

- Docker が必要です
- Docker daemon も起動済みである必要があります
- `pi` の `~/.pi/agent/auth.json` にある `zai` API key を使います
- benchmark 環境の中で `mekann` repo を展開し、`pi --mode json --print` を実行します
- Harbor と terminal-bench は repo ローカルの `.venv-tbench` に入っています
- 実行結果は git 管理外の `.pi/benchmarks/terminal-bench/` に出ます

## Cleanup

benchmark を何度も回すと 2 つが膨らみます。

- repo 内の `.pi/benchmarks/terminal-bench/jobs` と `.pi/autoresearch/tbench/jobs`
- Colima / Docker の build cache と未使用 image / volume

サイズ確認:

```bash
bash scripts/check-terminal-bench.sh
```

安全側の掃除:

```bash
bash scripts/clean-terminal-bench.sh --dry-run
bash scripts/clean-terminal-bench.sh --keep-benchmark-jobs 3 --keep-autoresearch-jobs 3
```

Docker build cache まで掃除したい場合:

```bash
bash scripts/clean-terminal-bench.sh --docker-builder-prune
```

Docker の未使用 image / layer / volume まで全掃除したい場合:

```bash
bash scripts/clean-terminal-bench.sh --docker-system-prune
```

`docker_storage	corrupt` が出る場合は、Docker / Colima 側の blob store が壊れている可能性があります。
