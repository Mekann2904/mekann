# mekann

Integrated pi extension that loads the mekann extension suites in a stable order.

## Suites

| Suite | Modules |
|-------|---------|
| core | `cache-friendly-prompt`, `agent-guidelines` |
| safety | `sandbox`, `plan-mode` |
| autonomy | `goal`, `subagent`, `autoresearch` |
| utils | `zip-repo` |

The safety suite initializes `sandbox` before `plan-mode` so plan-mode's read-only sandbox profile events are observed consistently.
