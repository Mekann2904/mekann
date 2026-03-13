# path: scripts/pi-llm-env.sh
# role: pi の auth/settings から terminal-bench 用 LLM 環境変数を解決する
# why: Harbor の codex agent を mekann pi と同じ zai / glm-5 系設定で動かすため
# related: scripts/run-terminal-bench.sh, scripts/check-terminal-bench.sh, scripts/run-pi-local.sh, docs/03-development/06-terminal-bench.md

set -eu

ROOT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
DEFAULT_PI_AGENT_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
DEFAULT_PI_PROVIDER="${PI_TBENCH_PROVIDER:-zai}"
DEFAULT_PI_MODEL="${PI_TBENCH_MODEL:-glm-5}"
DEFAULT_PI_BASE_URL="${PI_TBENCH_BASE_URL:-https://api.z.ai/api/coding/paas/v4}"

print_exports() {
  python3 - "$DEFAULT_PI_AGENT_DIR" "$DEFAULT_PI_PROVIDER" "$DEFAULT_PI_MODEL" "$DEFAULT_PI_BASE_URL" <<'PY'
import json
import pathlib
import shlex
import sys

agent_dir = pathlib.Path(sys.argv[1]).expanduser()
provider = sys.argv[2]
model = sys.argv[3]
base_url = sys.argv[4]

auth_path = agent_dir / "auth.json"
settings_path = agent_dir / "settings.json"

api_key = ""
default_provider = ""

if auth_path.exists():
    try:
        auth = json.loads(auth_path.read_text())
    except json.JSONDecodeError:
        auth = {}
    entry = auth.get(provider, {})
    if isinstance(entry, dict):
        value = entry.get("key") or entry.get("apiKey") or ""
        if isinstance(value, str):
            api_key = value

if settings_path.exists():
    try:
        settings = json.loads(settings_path.read_text())
    except json.JSONDecodeError:
        settings = {}
    value = settings.get("defaultProvider")
    if isinstance(value, str):
        default_provider = value

values = {
    "PI_TBENCH_AGENT_DIR": str(agent_dir),
    "PI_TBENCH_PROVIDER": provider,
    "PI_TBENCH_MODEL": model,
    "PI_TBENCH_BASE_URL": base_url,
    "PI_TBENCH_DEFAULT_PROVIDER": default_provider,
    "PI_TBENCH_HAS_API_KEY": "1" if api_key else "0",
    "PI_TBENCH_API_KEY": api_key,
}

for key, value in values.items():
    print(f"{key}={shlex.quote(value)}")
PY
}

if [ "${1:-}" = "--exports" ]; then
  print_exports
  exit 0
fi

if [ "${1:-}" = "--summary" ]; then
  eval "$(print_exports)"
  printf '%s\t%s\n' "pi_agent_dir" "$PI_TBENCH_AGENT_DIR"
  printf '%s\t%s\n' "pi_default_provider" "${PI_TBENCH_DEFAULT_PROVIDER:-}"
  printf '%s\t%s\n' "tbench_provider" "$PI_TBENCH_PROVIDER"
  printf '%s\t%s\n' "tbench_model" "$PI_TBENCH_MODEL"
  printf '%s\t%s\n' "tbench_base_url" "$PI_TBENCH_BASE_URL"
  if [ "$PI_TBENCH_HAS_API_KEY" = "1" ]; then
    printf '%s\t%s\n' "pi_api_key" "present"
  else
    printf '%s\t%s\n' "pi_api_key" "missing"
  fi
  exit 0
fi

printf '%s\n' "Usage: bash scripts/pi-llm-env.sh --exports|--summary" >&2
exit 1
