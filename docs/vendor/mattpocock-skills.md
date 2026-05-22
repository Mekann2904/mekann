# mattpocock-skills import policy

This repository imports selected skills from `mattpocock/skills`.

## Directories

- `vendor/mattpocock-skills` is the upstream mirror, updated by git subtree.
- `mekann/skills` is the Pi-maintained skill directory that Pi coding agents read.

## Rules

- Do not edit files under `vendor/mattpocock-skills` directly.
- Treat `vendor/mattpocock-skills` as an upstream mirror only.
- The update command copies selected upstream skills into `mekann/skills`.
- Pi developers edit the copied files under `mekann/skills` to make them suitable for Pi.
- Pi coding agents read only the `mekann/skills` copies exposed by `package.json`.

## Update flow

```bash
npm run update:mattpocock-skills
```

The command:

1. Updates `vendor/mattpocock-skills` from upstream with git subtree.
2. Copies the exposed upstream skills into `mekann/skills`.
3. Overwrites the existing copied skill directories.

After running it, review the diff under `mekann/skills` and edit those files for Pi before committing.

## Exposed skills

The Pi package currently exposes:

* `grill-with-docs` from `mekann/skills/grill-with-docs`
* `improve-codebase-architecture` from `mekann/skills/improve-codebase-architecture`

Other upstream skills are not exposed unless they are copied into `mekann/skills` and included by the package skill configuration.
