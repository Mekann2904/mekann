# mattpocock-skills import policy

This repository imports the engineering skills from [mattpocock/skills](https://github.com/mattpocock/skills) and maintains Pi-oriented adaptations of them.

## Acknowledgement

The original ideas, structure, and workflows for these engineering skills were created by Matt Pocock. Mekann adapts them for Pi coding agent, including Pi tool names, Pi subagent workflow, Japanese-language use, and local package layout.

## Directories

- `vendor/mattpocock-skills` is the upstream mirror, updated by git subtree.
- `mekann/skills` is the Pi-maintained skill directory that Pi coding agents read.

## Rules

- Do not edit files under `vendor/mattpocock-skills` directly.
- Treat `vendor/mattpocock-skills` as an upstream mirror only.
- The update command copies all upstream `skills/engineering/*` skill directories into `mekann/skills`.
- Pi developers edit the copied files under `mekann/skills` to make them suitable for Pi.
- Pi coding agents read only the `mekann/skills` copies exposed by `package.json`.
- Keep attribution / acknowledgement text in the copied skills when adapting them.

## Update flow

```bash
npm run update:mattpocock-skills
```

The command:

1. Updates `vendor/mattpocock-skills` from upstream with git subtree.
2. Copies every upstream engineering skill from `vendor/mattpocock-skills/skills/engineering/*` into `mekann/skills`.
3. Overwrites the existing copied engineering skill directories.

After running it, review the diff under `mekann/skills` and edit those files for Pi before committing. In particular, re-check:

- Claude-specific or non-Pi tool names.
- Slash-command assumptions.
- Subagent instructions that should use Pi `spawn_agent` / `wait_agent` vocabulary.
- Japanese language policy.
- Attribution / acknowledgement text.
- References to `AGENTS.md`, `docs/agents/`, issue tracker labels, `CONTEXT.md`, and ADRs.

## Exposed engineering skills

The Pi package exposes `./mekann/skills` via `package.json`, and the update script currently imports all upstream engineering skills:

- `diagnose`
- `grill-with-docs`
- `improve-codebase-architecture`
- `prototype`
- `setup-matt-pocock-skills`
- `tdd`
- `to-issues`
- `to-prd`
- `triage`
- `zoom-out`

Mekann-specific skills may also live in `mekann/skills`, but they are not copied from `vendor/mattpocock-skills`.
