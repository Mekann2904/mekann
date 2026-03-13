# path: bench/tbench_pi_agent/harbor_pi_agent.py
# role: Harbor custom agent として mekann の pi CLI を task 環境内で起動する
# why: terminal-bench を codex 互換 shim ではなく、実際の pi / glm-5 フローで評価できるようにするため
# related: bench/tbench_pi_agent/__init__.py, scripts/run-terminal-bench.sh, scripts/pi-llm-env.sh, scripts/run-pi-local.sh

from __future__ import annotations

import io
import json
import os
import shlex
import shutil
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from harbor.agents.base import BaseAgent
from harbor.environments.base import BaseEnvironment, ExecResult
from harbor.models.agent.context import AgentContext
from harbor.models.trial.paths import EnvironmentPaths

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_PROVIDER = "zai"
DEFAULT_MODEL = "glm-5"
DEFAULT_NODE_MAJOR = "22"
DEFAULT_NODE_VERSION = "22.12.0"
DEFAULT_ZAI_BASE_URL = "https://api.z.ai/api/coding/paas/v4"
ARCHIVE_ROOT = "/opt/mekann"
ARCHIVE_PATH = "/tmp/mekann-repo.tar.gz"
CONTAINER_NODE_DIR = f"{ARCHIVE_ROOT}/node"
CONTAINER_AGENT_DIR = f"{EnvironmentPaths.agent_dir}/pi-agent"
CONTAINER_RUNTIME_DIR = f"{EnvironmentPaths.agent_dir}/pi-runtime"
CONTAINER_SESSION_DIR = f"{EnvironmentPaths.agent_dir}/pi-sessions"
CONTAINER_EVENT_LOG = f"{EnvironmentPaths.agent_dir}/pi-events.jsonl"
CONTAINER_STDERR_LOG = f"{EnvironmentPaths.agent_dir}/pi-stderr.txt"
CONTAINER_OUTPUT_LOG = f"{EnvironmentPaths.agent_dir}/pi-output.txt"
CONTAINER_INSTRUCTION_PATH = f"{EnvironmentPaths.agent_dir}/instruction.txt"
CONTAINER_RUN_INFO_PATH = f"{EnvironmentPaths.agent_dir}/pi-run-info.json"
CONTAINER_SETUP_INFO_PATH = f"{EnvironmentPaths.agent_dir}/pi-setup-info.json"
CONTAINER_NPM_DEBUG_LOG = f"{EnvironmentPaths.agent_dir}/npm-debug.log"
CONTAINER_REPO_DIR = f"{ARCHIVE_ROOT}/repo"
CONTAINER_PI_BIN = f"{CONTAINER_REPO_DIR}/node_modules/.bin/pi"
MAX_EVENT_LOG_BYTES = 512 * 1024

ARCHIVE_INCLUDE_PATHS = (
    ".pi",
    "scripts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "tsconfig-check.json",
    "README.md",
    "LICENSE",
)

ARCHIVE_EXCLUDE_NAMES = {
    ".git",
    ".DS_Store",
    ".venv-tbench",
    "node_modules",
    "coverage",
    "dist",
    "build",
}

ARCHIVE_EXCLUDE_PREFIXES = (
    ".pi/benchmarks/",
    ".pi/local-agent/",
    ".pi/runtime/",
    ".pi/logs/",
)

SETTINGS_RESOURCE_KEYS = ("packages", "extensions", "skills", "prompts", "themes")
SETTING_KEYS_TO_COPY = (
    "defaultProvider",
    "defaultModel",
    "defaultThinkingLevel",
    "transport",
    "steeringMode",
    "followUpMode",
    "blockImages",
)


@dataclass
class PiSourceConfig:
    source_agent_dir: Path
    auth_payload: dict[str, Any]
    settings_payload: dict[str, Any]
    models_payload: dict[str, Any] | None
    provider: str
    model: str
    base_url: str


def _read_json_file(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None

    try:
        parsed = json.loads(path.read_text())
    except json.JSONDecodeError:
        return None

    return parsed if isinstance(parsed, dict) else None


def _shell_join(parts: list[str]) -> str:
    return " ".join(shlex.quote(part) for part in parts)


class HarborPiAgent(BaseAgent):
    """Run the local mekann pi package inside a Harbor environment."""

    SUPPORTS_ATIF = False

    def __init__(
        self,
        logs_dir: Path,
        repo_root: str | None = None,
        source_agent_dir: str | None = None,
        provider: str | None = None,
        default_model: str | None = None,
        base_url: str | None = None,
        node_major: str = DEFAULT_NODE_MAJOR,
        node_version: str = DEFAULT_NODE_VERSION,
        *args,
        **kwargs,
    ):
        super().__init__(logs_dir=logs_dir, *args, **kwargs)
        self._repo_root = Path(repo_root).expanduser().resolve() if repo_root else REPO_ROOT
        self._source_agent_dir = (
            Path(source_agent_dir).expanduser().resolve()
            if source_agent_dir
            else Path(
                os.environ.get(
                    "PI_CODING_AGENT_DIR",
                    str(Path.home() / ".pi" / "agent"),
                )
            ).expanduser().resolve()
        )
        self._provider_override = provider or DEFAULT_PROVIDER
        self._model_override = default_model or DEFAULT_MODEL
        self._base_url_override = base_url or DEFAULT_ZAI_BASE_URL
        self._node_major = node_major
        self._node_version = node_version
        self._source_config = self._load_source_config()

    @staticmethod
    def name() -> str:
        return "pi"

    def version(self) -> str:
        package_json_path = self._repo_root / "package.json"
        package_data = _read_json_file(package_json_path)
        version = package_data.get("version") if package_data else None
        return version if isinstance(version, str) else "unknown"

    def _resolve_requested_model(self) -> tuple[str, str]:
        if self.model_name:
            if "/" in self.model_name:
                provider, model = self.model_name.split("/", 1)
                return provider, model
            return self._source_config.provider, self.model_name
        return self._source_config.provider, self._source_config.model

    def _load_source_config(self) -> PiSourceConfig:
        auth_path = self._source_agent_dir / "auth.json"
        settings_path = self._source_agent_dir / "settings.json"
        models_path = self._source_agent_dir / "models.json"

        auth_payload = _read_json_file(auth_path) or {}
        settings_payload = _read_json_file(settings_path) or {}
        models_payload = _read_json_file(models_path)

        default_provider = settings_payload.get("defaultProvider")
        provider = (
            default_provider
            if isinstance(default_provider, str) and default_provider
            else self._provider_override
        )

        default_model = settings_payload.get("defaultModel")
        model = (
            default_model
            if isinstance(default_model, str) and default_model
            else self._model_override
        )

        provider_auth = auth_payload.get(provider)
        if not isinstance(provider_auth, dict):
            raise ValueError(
                f"pi auth is missing provider '{provider}' in {auth_path}"
            )

        api_key = provider_auth.get("key") or provider_auth.get("apiKey")
        if not isinstance(api_key, str) or not api_key:
            raise ValueError(
                f"pi auth for provider '{provider}' has no API key in {auth_path}"
            )

        sanitized_settings: dict[str, Any] = {}
        for key_name in SETTING_KEYS_TO_COPY:
            value = settings_payload.get(key_name)
            if value is not None:
                sanitized_settings[key_name] = value
        sanitized_settings["defaultProvider"] = provider
        sanitized_settings["defaultModel"] = model
        for key_name in SETTINGS_RESOURCE_KEYS:
            sanitized_settings[key_name] = []

        return PiSourceConfig(
            source_agent_dir=self._source_agent_dir,
            auth_payload={provider: provider_auth},
            settings_payload=sanitized_settings,
            models_payload=models_payload,
            provider=provider,
            model=model,
            base_url=self._base_url_override,
        )

    def _create_repo_archive(self) -> Path:
        temp_file = tempfile.NamedTemporaryFile(
            prefix="mekann-repo-",
            suffix=".tar.gz",
            delete=False,
        )
        temp_file.close()
        archive_path = Path(temp_file.name)
        with tarfile.open(archive_path, "w:gz") as tar:
            for relative_path in ARCHIVE_INCLUDE_PATHS:
                source_path = self._repo_root / relative_path
                if not source_path.exists():
                    continue
                tar.add(
                    source_path,
                    arcname=relative_path,
                    filter=self._archive_filter,
                )
        return archive_path

    @staticmethod
    def _archive_filter(tarinfo: tarfile.TarInfo) -> tarfile.TarInfo | None:
        normalized = tarinfo.name.rstrip("/")
        name = Path(normalized).name
        if name in ARCHIVE_EXCLUDE_NAMES:
            return None
        for prefix in ARCHIVE_EXCLUDE_PREFIXES:
            if normalized.startswith(prefix.rstrip("/")):
                return None
        return tarinfo

    @staticmethod
    def _write_json(path: Path, payload: dict[str, Any]) -> None:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")

    async def _upload_pi_agent_files(self, environment: BaseEnvironment) -> None:
        temp_dir = self.logs_dir / "pi-agent-source"
        temp_dir.mkdir(parents=True, exist_ok=True)

        self._write_json(temp_dir / "auth.json", self._source_config.auth_payload)
        self._write_json(temp_dir / "settings.json", self._source_config.settings_payload)
        if self._source_config.models_payload is not None:
            self._write_json(temp_dir / "models.json", self._source_config.models_payload)

        await environment.exec(
            command=(
                "mkdir -p "
                f"{shlex.quote(CONTAINER_AGENT_DIR)} "
                f"{shlex.quote(CONTAINER_RUNTIME_DIR)} "
                f"{shlex.quote(CONTAINER_SESSION_DIR)} "
                f"{shlex.quote(ARCHIVE_ROOT)}"
            ),
            timeout_sec=30,
        )

        for file_path in temp_dir.iterdir():
            await environment.upload_file(
                source_path=file_path,
                target_path=f"{CONTAINER_AGENT_DIR}/{file_path.name}",
            )

    def _write_exec_artifacts(self, prefix: str, result: ExecResult) -> None:
        (self.logs_dir / f"{prefix}-return-code.txt").write_text(
            str(result.return_code)
        )
        if result.stdout:
            (self.logs_dir / f"{prefix}-stdout.txt").write_text(result.stdout)
        if result.stderr:
            (self.logs_dir / f"{prefix}-stderr.txt").write_text(result.stderr)

    async def setup(self, environment: BaseEnvironment) -> None:
        archive_path = self._create_repo_archive()
        try:
            await self._upload_pi_agent_files(environment)
            await environment.upload_file(archive_path, ARCHIVE_PATH)
        finally:
            archive_path.unlink(missing_ok=True)

        setup_info = {
            "repoRoot": str(self._repo_root),
            "sourceAgentDir": str(self._source_config.source_agent_dir),
            "provider": self._source_config.provider,
            "model": self._source_config.model,
            "baseUrl": self._source_config.base_url,
            "nodeMajor": self._node_major,
            "nodeVersion": self._node_version,
        }
        self._write_json(self.logs_dir / "pi-setup-info.json", setup_info)

        setup_command = f"""
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v curl >/dev/null 2>&1 || \
   ! command -v git >/dev/null 2>&1 || \
   ! command -v make >/dev/null 2>&1 || \
   ! command -v g++ >/dev/null 2>&1 || \
   ! command -v xz >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl git make g++ xz-utils
fi
NODE_ARCH="$(uname -m)"
case "$NODE_ARCH" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *)
    echo "unsupported node architecture: $NODE_ARCH" >&2
    exit 1
    ;;
esac
NODE_VERSION="{self._node_version}"
NODE_URL="https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODE_ARCH.tar.xz"
if [ ! -x "{CONTAINER_NODE_DIR}/bin/node" ]; then
  rm -rf {shlex.quote(CONTAINER_NODE_DIR)}
  mkdir -p {shlex.quote(CONTAINER_NODE_DIR)}
  curl -fsSL "$NODE_URL" -o /tmp/node.tar.xz
  tar -xJf /tmp/node.tar.xz --strip-components=1 -C {shlex.quote(CONTAINER_NODE_DIR)}
fi
export PATH="{CONTAINER_NODE_DIR}/bin:$PATH"
CURRENT_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$CURRENT_MAJOR" != "{self._node_major}" ]; then
  echo "expected node major {self._node_major}, got $CURRENT_MAJOR" >&2
  exit 1
fi
rm -rf {shlex.quote(CONTAINER_REPO_DIR)}
mkdir -p {shlex.quote(CONTAINER_REPO_DIR)}
tar -xzf {shlex.quote(ARCHIVE_PATH)} -C {shlex.quote(CONTAINER_REPO_DIR)}
cd {shlex.quote(CONTAINER_REPO_DIR)}
npm ci --no-audit --no-fund || {{
  status="$?"
  if ls /root/.npm/_logs/*-debug-0.log >/dev/null 2>&1; then
    cat /root/.npm/_logs/*-debug-0.log > {shlex.quote(CONTAINER_NPM_DEBUG_LOG)} || true
    cat /root/.npm/_logs/*-debug-0.log || true
  fi
  exit "$status"
}}
cat > {shlex.quote(CONTAINER_SETUP_INFO_PATH)} <<'EOF'
{{
  "pi_bin": "{CONTAINER_PI_BIN}",
  "provider": "{self._source_config.provider}",
  "model": "{self._source_config.model}",
  "base_url": "{self._source_config.base_url}",
  "node_dir": "{CONTAINER_NODE_DIR}",
  "npm_debug_log": "{CONTAINER_NPM_DEBUG_LOG}"
}}
EOF
"""

        result = await environment.exec(
            command=setup_command,
            timeout_sec=1800,
        )
        self._write_exec_artifacts("setup", result)
        if result.return_code != 0:
            raise RuntimeError(
                "pi agent setup failed. See setup-stdout.txt and setup-stderr.txt in the trial agent logs."
            )

    def _trim_event_log(self, event_log_path: Path) -> None:
        file_size = event_log_path.stat().st_size
        if file_size <= MAX_EVENT_LOG_BYTES:
            return

        head_limit = MAX_EVENT_LOG_BYTES // 2
        tail_limit = MAX_EVENT_LOG_BYTES - head_limit

        with event_log_path.open("rb") as stream:
            head_bytes = stream.read(head_limit)
            if len(head_bytes) == head_limit:
                head_bytes = head_bytes.rsplit(b"\n", 1)[0] + b"\n"

            stream.seek(max(file_size - tail_limit, 0))
            tail_bytes = stream.read()
            newline_index = tail_bytes.find(b"\n")
            if newline_index >= 0:
                tail_bytes = tail_bytes[newline_index + 1 :]

        trimmed = io.BytesIO()
        trimmed.write(head_bytes)
        trimmed.write(
            (
                f'{{"type":"log_truncated","omittedBytes":{file_size - len(head_bytes) - len(tail_bytes)}}}\n'
            ).encode()
        )
        trimmed.write(tail_bytes)
        event_log_path.write_bytes(trimmed.getvalue())

    def _cleanup_large_artifacts(self) -> None:
        sessions_dir = self.logs_dir / "pi-sessions"
        if sessions_dir.exists():
            shutil.rmtree(sessions_dir, ignore_errors=True)

        event_log_path = self.logs_dir / "pi-events.jsonl"
        if event_log_path.exists():
            self._trim_event_log(event_log_path)

    def _parse_event_log(self) -> dict[str, Any]:
        event_log_path = self.logs_dir / "pi-events.jsonl"
        final_text_parts: list[str] = []
        tool_names: list[str] = []
        non_json_lines: list[str] = []
        event_count = 0
        stop_reason: str | None = None

        if not event_log_path.exists():
            return {
                "eventCount": 0,
                "toolCalls": [],
                "finalText": "",
                "stopReason": None,
                "nonJsonLineCount": 0,
            }

        for raw_line in event_log_path.read_text().splitlines():
            line = raw_line.strip()
            if not line:
                continue
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                non_json_lines.append(line)
                continue

            event_count += 1
            if event.get("type") != "message_update":
                continue

            message_event = event.get("assistantMessageEvent")
            if not isinstance(message_event, dict):
                continue

            event_type = message_event.get("type")
            if event_type == "text_delta":
                delta = message_event.get("delta")
                if isinstance(delta, str):
                    final_text_parts.append(delta)
            elif event_type in {"toolcall_start", "toolcall_end"}:
                tool_call = message_event.get("toolCall")
                if isinstance(tool_call, dict):
                    tool_name = tool_call.get("name")
                    if isinstance(tool_name, str):
                        tool_names.append(tool_name)
            elif event_type == "done":
                reason = message_event.get("reason")
                if isinstance(reason, str):
                    stop_reason = reason

        final_text = "".join(final_text_parts).strip()
        (self.logs_dir / "pi-output.txt").write_text(final_text)
        if non_json_lines:
            (self.logs_dir / "pi-non-json-lines.txt").write_text(
                "\n".join(non_json_lines) + "\n"
            )

        return {
            "eventCount": event_count,
            "toolCalls": tool_names,
            "finalText": final_text,
            "stopReason": stop_reason,
            "nonJsonLineCount": len(non_json_lines),
        }

    async def run(
        self,
        instruction: str,
        environment: BaseEnvironment,
        context: AgentContext,
    ) -> None:
        provider, model = self._resolve_requested_model()
        provider_auth = self._source_config.auth_payload.get(provider)
        if not isinstance(provider_auth, dict):
            raise RuntimeError(f"Missing auth payload for provider '{provider}'")

        api_key = provider_auth.get("key") or provider_auth.get("apiKey")
        if not isinstance(api_key, str) or not api_key:
            raise RuntimeError(f"Provider '{provider}' has no API key")

        instruction_path = self.logs_dir / "instruction.txt"
        instruction_path.write_text(instruction)
        await environment.upload_file(instruction_path, CONTAINER_INSTRUCTION_PATH)

        run_info = {
            "provider": provider,
            "model": model,
            "baseUrl": self._source_config.base_url,
            "sourceAgentDir": str(self._source_config.source_agent_dir),
            "sessionDir": CONTAINER_SESSION_DIR,
        }
        self._write_json(self.logs_dir / "pi-run-info.json", run_info)
        await environment.upload_file(
            self.logs_dir / "pi-run-info.json",
            CONTAINER_RUN_INFO_PATH,
        )

        pi_command = _shell_join(
            [
                CONTAINER_PI_BIN,
                "--mode",
                "json",
                "--print",
                "--session-dir",
                CONTAINER_SESSION_DIR,
                "--provider",
                provider,
                "--model",
                model,
            ]
        )

        command_parts = [
            "set -euo pipefail",
            f"export PI_CODING_AGENT_DIR={shlex.quote(CONTAINER_AGENT_DIR)}",
            f"export PI_RUNTIME_DIR={shlex.quote(CONTAINER_RUNTIME_DIR)}",
            f"export ZAI_API_KEY={shlex.quote(api_key)}",
            f'export PATH="{CONTAINER_NODE_DIR}/bin:$PATH"',
            f"test -x {shlex.quote(CONTAINER_PI_BIN)}",
            f"cat {shlex.quote(CONTAINER_INSTRUCTION_PATH)} | {pi_command} > "
            f"{shlex.quote(CONTAINER_EVENT_LOG)} 2> {shlex.quote(CONTAINER_STDERR_LOG)}",
        ]

        result = await environment.exec(
            command="\n".join(command_parts),
            timeout_sec=1800,
        )
        self._write_exec_artifacts("run", result)

        parsed = self._parse_event_log()
        context.metadata = {
            "provider": provider,
            "model": model,
            "baseUrl": self._source_config.base_url,
            "exitCode": result.return_code,
            "eventCount": parsed["eventCount"],
            "toolCalls": parsed["toolCalls"],
            "stopReason": parsed["stopReason"],
            "eventLog": str(self.logs_dir / "pi-events.jsonl"),
            "stderrLog": str(self.logs_dir / "pi-stderr.txt"),
            "outputLog": str(self.logs_dir / "pi-output.txt"),
        }

        if result.return_code != 0:
            final_excerpt = parsed["finalText"][:500] if parsed["finalText"] else ""
            self._cleanup_large_artifacts()
            raise RuntimeError(
                "pi agent run failed with exit code "
                f"{result.return_code}. stopReason={parsed['stopReason']} excerpt={final_excerpt}"
            )

        self._cleanup_large_artifacts()
