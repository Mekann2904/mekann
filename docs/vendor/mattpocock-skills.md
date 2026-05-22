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
- `scripts/mattpocock-skills.manifest.json` is the import manifest and declares which upstream engineering skills are copied.
- The update command copies only manifest-declared upstream skill directories into `mekann/skills`.
- Pi developers edit the copied files under `mekann/skills` to make them suitable for Pi.
- Pi coding agents read only the `mekann/skills` copies exposed by `package.json`.
- Keep attribution / acknowledgement text in the copied skills when adapting them.
- Protected local skills in the manifest must never be overwritten by upstream imports.

## Update flow

```bash
npm run update:mattpocock-skills
```

The command:

1. Updates `vendor/mattpocock-skills` from upstream with git subtree.
2. Reads `scripts/mattpocock-skills.manifest.json`.
3. Copies each manifest-declared upstream engineering skill from `vendor/mattpocock-skills/skills/engineering/*` into `mekann/skills`.
4. Fails if an import would overwrite a protected local skill.
5. Runs `npm run check:mattpocock-skills` as a post-import validation gate.

You can also run the validation independently:

```bash
npm run check:mattpocock-skills
```

The current gate fails on:

- Missing manifest-declared upstream source directories.
- Import destinations that collide with protected local skills.
- Missing `description` frontmatter.
- Missing attribution / acknowledgement text.
- Missing Japanese language policy.

The current gate warns on:

- Upstream engineering skills not listed in the manifest.
- Possible Claude-only tool names or slash-command assumptions.

After running the update, review the diff under `mekann/skills` and edit those files for Pi before committing. In particular, re-check:

- Claude-specific or non-Pi tool names.
- Slash-command assumptions.
- Subagent instructions that should use Pi `spawn_agent` / `wait_agent` vocabulary.
- Japanese language policy.
- Attribution / acknowledgement text.
- References to `AGENTS.md`, `docs/agents/`, issue tracker labels, `CONTEXT.md`, and ADRs.

## Exposed engineering skills

The Pi package exposes `./mekann/skills` via `package.json`, and the manifest currently imports all upstream engineering skills:

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
