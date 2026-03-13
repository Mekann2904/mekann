# path: scripts/clean-terminal-bench.sh
# role: terminal-bench の job artifact と Docker/Colima build cache を掃除する
# why: benchmark を何度も回した時に repo 内ログと Docker storage が膨らみ続けるのを抑えるため
# related: scripts/check-terminal-bench.sh, scripts/run-terminal-bench.sh, docs/03-development/06-terminal-bench.md, bench/terminal-bench/README.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
BENCHMARK_JOBS_DIR="${TBENCH_JOBS_DIR:-$ROOT_DIR/.pi/benchmarks/terminal-bench/jobs}"
AUTORESEARCH_JOBS_DIR="${TBENCH_AUTORESEARCH_JOBS_DIR:-$ROOT_DIR/.pi/autoresearch/tbench/jobs}"
KEEP_BENCHMARK_JOBS="${TBENCH_CLEAN_KEEP_BENCHMARK_JOBS:-3}"
KEEP_AUTORESEARCH_JOBS="${TBENCH_CLEAN_KEEP_AUTORESEARCH_JOBS:-3}"
PRUNE_DOCKER_MODE="none"
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/clean-terminal-bench.sh [options]

Options:
  --dry-run                     Show what would be removed.
  --keep-benchmark-jobs N       Keep latest N terminal-bench job dirs. Default: 3
  --keep-autoresearch-jobs N    Keep latest N autoresearch-tbench job dirs. Default: 3
  --docker-builder-prune        Run docker builder prune -af
  --docker-system-prune         Run docker system prune -af --volumes
  --help                        Show this help

Notes:
  - Job cleanup only touches git-ignored benchmark directories in this repo.
  - --docker-system-prune removes every unused Docker image, layer, container, network, and volume.
  - If docker reports containerd blob input/output errors, Colima storage may already be corrupted.
EOF
}

require_integer() {
  case "$1" in
    ''|*[!0-9]*)
      printf '%s\n' "expected non-negative integer, got: $1" >&2
      exit 1
      ;;
  esac
}

dir_size() {
  if [ -d "$1" ]; then
    du -sh "$1" 2>/dev/null | awk '{print $1}'
  else
    printf '%s' "0B"
  fi
}

print_job_plan() {
  label="$1"
  dir="$2"
  keep="$3"

  if [ ! -d "$dir" ]; then
    printf '%s\t%s\t%s\t%s\n' "$label" "missing" "-" "$dir"
    return
  fi

  current_count="$(find "$dir" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')"
  printf '%s\t%s\t%s\t%s\n' "$label" "present" "$current_count" "$dir"
  printf '%s\n' "  size=$(dir_size "$dir") keep_latest=$keep"
}

cleanup_job_dirs() {
  label="$1"
  dir="$2"
  keep="$3"

  if [ ! -d "$dir" ]; then
    return
  fi

  require_integer "$keep"
  old_ifs="${IFS}"
  IFS='
'
  set -- $(find "$dir" -mindepth 1 -maxdepth 1 -type d -print | sort)
  IFS="${old_ifs}"

  total="$#"
  if [ "$total" -le "$keep" ]; then
    printf '%s\n' "$label: nothing to remove"
    return
  fi

  remove_count=$((total - keep))
  index=1
  for entry in "$@"; do
    if [ "$index" -le "$remove_count" ]; then
      if [ "$DRY_RUN" -eq 1 ]; then
        printf '%s\n' "$label: would remove $entry"
      else
        printf '%s\n' "$label: removing $entry"
        rm -rf "$entry"
      fi
    fi
    index=$((index + 1))
  done
}

run_docker_cleanup() {
  if [ "$PRUNE_DOCKER_MODE" = "none" ]; then
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    printf '%s\n' "docker cleanup skipped: docker command is missing" >&2
    return
  fi

  if ! docker info >/dev/null 2>&1; then
    printf '%s\n' "docker cleanup skipped: daemon is unreachable" >&2
    return
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    if [ "$PRUNE_DOCKER_MODE" = "builder" ]; then
      printf '%s\n' "docker: would run docker builder prune -af"
    else
      printf '%s\n' "docker: would run docker system prune -af --volumes"
    fi
    return
  fi

  if [ "$PRUNE_DOCKER_MODE" = "builder" ]; then
    docker builder prune -af
    return
  fi

  docker system prune -af --volumes
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=1
      ;;
    --keep-benchmark-jobs)
      shift
      [ "$#" -gt 0 ] || { printf '%s\n' "--keep-benchmark-jobs requires a value" >&2; exit 1; }
      KEEP_BENCHMARK_JOBS="$1"
      ;;
    --keep-autoresearch-jobs)
      shift
      [ "$#" -gt 0 ] || { printf '%s\n' "--keep-autoresearch-jobs requires a value" >&2; exit 1; }
      KEEP_AUTORESEARCH_JOBS="$1"
      ;;
    --docker-builder-prune)
      PRUNE_DOCKER_MODE="builder"
      ;;
    --docker-system-prune)
      PRUNE_DOCKER_MODE="system"
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf '%s\n' "unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

require_integer "$KEEP_BENCHMARK_JOBS"
require_integer "$KEEP_AUTORESEARCH_JOBS"

printf '%s\n' "terminal-bench cleanup plan"
print_job_plan "benchmark_jobs" "$BENCHMARK_JOBS_DIR" "$KEEP_BENCHMARK_JOBS"
print_job_plan "autoresearch_jobs" "$AUTORESEARCH_JOBS_DIR" "$KEEP_AUTORESEARCH_JOBS"
printf '%s\n' "docker_prune_mode=$PRUNE_DOCKER_MODE"

cleanup_job_dirs "benchmark_jobs" "$BENCHMARK_JOBS_DIR" "$KEEP_BENCHMARK_JOBS"
cleanup_job_dirs "autoresearch_jobs" "$AUTORESEARCH_JOBS_DIR" "$KEEP_AUTORESEARCH_JOBS"
run_docker_cleanup

printf '%s\n' "cleanup complete"
print_job_plan "benchmark_jobs" "$BENCHMARK_JOBS_DIR" "$KEEP_BENCHMARK_JOBS"
print_job_plan "autoresearch_jobs" "$AUTORESEARCH_JOBS_DIR" "$KEEP_AUTORESEARCH_JOBS"
