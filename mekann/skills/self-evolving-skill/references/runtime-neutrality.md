# Runtime neutrality notes

Pi-oriented skills should not be accidentally tied to another runtime. For this repository's Pi-maintained copies, the first priority is that the workflow is executable by Pi.

## Red flags

Check `SKILL.md`, README, and examples for:

- Single-runtime assumptions: `Claude Code`, `Cursor only`, `Codex 中`, `OpenCode only`
- Claude-style tool names: `Task`, `TodoWrite`, `Grep`, `Glob`, `LS`
- Runtime-specific paths: `~/.claude/skills`, `.claude/agents`, `.cursor/rules`
- Runtime-specific commands: `/plugin install`, `/agents`, `/hooks`
- Any mandatory step that uses a tool Pi does not provide

## Pi replacements

| Runtime-specific | Pi-compatible |
|---|---|
| `Grep` / `Glob` / `LS` tools | `bash` with `rg` / `find` / `ls` |
| File-read tool names from another runtime | `read` |
| Edit tool names from another runtime | `edit` / `write` |
| `Task` subagent | `spawn_agent`, usually read-only unless patching is explicitly delegated |
| Runtime-specific slash command | Plain workflow steps |

## Allowed mentions

These are usually allowed:

- Historical credit or upstream references.
- A runtime-specific example clearly marked as optional.
- A skill name or repository URL that contains a runtime name.

## Gate rule

A red flag is not automatically a failure. It becomes a failure when the skill would make Pi call a nonexistent tool, follow a nonexistent command, or assume files that are not present in the Pi-maintained copy.
