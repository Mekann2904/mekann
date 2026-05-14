# Sandbox Extension

macOS Seatbelt (`sandbox-exec`) による bash tool 用コマンドサンドボックス化 Pi extension。

## Scope

**This sandbox is a defense-in-depth layer for the bash tool only — not an agent-wide security boundary.**

- Only commands executed through the overridden bash tool are sandboxed
- File edit, patch, MCP, and extension tools are NOT sandboxed
- See [SECURITY.md](./SECURITY.md) for full scope documentation

## Design Principles

- **Defense-in-depth**: macOS Seatbelt sandbox profiles restrict filesystem, network, and process operations
- **Fail-closed**: If `sandbox-exec` is unavailable, commands are REFUSED (no silent fallback to unsandboxed)
- **macOS Seatbelt / `sandbox-exec`**: Relies on `/usr/bin/sandbox-exec` (absolute path, no PATH lookup)

## Sandbox Modes

| Mode | Description |
|------|-------------|
| `read_only` | Workspace is read-only. Writing to workspace is denied. Only per-run isolated `$TMPDIR` is writable. Reading user data outside workspace is denied. |
| `workspace_write` | Workspace writes allowed, but `.git`, `.codex`, `.agents` directories are protected (write denied). Symlink escapes blocked. |
| `danger_full_access` | No sandbox. Requires explicit user approval via CLI flag, `/sandbox-mode` command, or tool execution prompt. |

## Key Security Properties

- **Environment secrets** (API keys, tokens) are NOT passed to child processes by default — explicit allowlist only
- **`$HOME` is isolated** per-run, never set to workspace/cwd — prevents startup file injection
- **Bash startup files are NOT loaded**: `/bin/bash --noprofile --norc -c`
- **`mach-lookup` / `sysctl-read`** are currently broad — allowlist hardening is planned (see Future Hardening Issues in SECURITY.md)
- **Process group kill**: SIGTERM → grace → SIGKILL for timeout, abort, and output cap exceeded

## Usage

```bash
# Default: workspace_write mode
pi -e ./sandbox

# Read-only mode
pi -e ./sandbox --sandbox-mode read_only

# Explicitly disable sandbox (not recommended)
pi -e ./sandbox --no-sandbox

# Show sandbox status
/sandbox

# Change mode at runtime
/sandbox-mode read_only
```

## Testing

```bash
cd sandbox

# Install dependencies
npm ci

# Type checking
npm run typecheck

# Run tests (macOS integration tests run automatically when sandbox-exec is available)
npm test

# macOS CI: require sandbox integration tests to pass
RUN_MAC_SANDBOX_TESTS=1 npm test
```

## CI

See `.github/workflows/sandbox-ci.yml`:
- **ubuntu-latest**: typecheck + unit tests (sandbox integration tests silently skipped)
- **macos-latest**: typecheck + full tests with `RUN_MAC_SANDBOX_TESTS=1`

## Documentation

- [SECURITY.md](./SECURITY.md) — full security model, scope, limitations, and known issues
