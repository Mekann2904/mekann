# pi extensions by mekann

Custom extensions for [pi](https://pi.dev) coding agent.

## Extensions

### [plan-mode](./plan-mode/)

Codex-inspired plan mode with separate model selection for planning and execution phases.

- Plan mode: read-only exploration with reasoning model
- Execute mode: full tool access with code model
- Pi-style model selector for each mode
- Progress tracking with `[DONE:n]` markers

```bash
# Install
cp -r plan-mode ~/.pi/agent/extensions/plan-mode

# Or add to settings.json
{
  "extensions": ["/path/to/this/repo/plan-mode"]
}
```

See [plan-mode/README.md](./plan-mode/README.md) for full documentation.
