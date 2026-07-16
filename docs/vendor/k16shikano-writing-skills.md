# k16shikano writing-skill import policy

Mekann imports two Japanese writing skills published by k16shikano as GitHub Gists and adapts them as reference units of `writing-assistant`.

## Sources

- `japanese-tech-writing`: https://gist.github.com/k16shikano/fd287c3133457c4fd8f5601d34aa817d
- `cognitive-rhythm-writing`: https://gist.github.com/k16shikano/eb2929f13ed19c97188393d297be8432

The original writing rules and examples were created by k16shikano. Mekann keeps the upstream text in `vendor/` and changes only the path by which the cognitive-rhythm reference loads the technical-writing reference.

## Directories

- `vendor/k16shikano-japanese-tech-writing` is the disposable local upstream snapshot of `japanese-tech-writing`.
- `vendor/k16shikano-cognitive-rhythm-writing` is the disposable local upstream snapshot of `cognitive-rhythm-writing`.
- `mekann/skills/writing-assistant/references` contains the runtime copies read by Pi.
- Each vendor directory has a `REVISION` file containing the fetched Gist revision.

The vendor snapshots are ignored by Git and can be recreated at any time. Do not edit them directly. Make Mekann-specific routing changes in `writing-assistant/SKILL.md` or in the deterministic adaptation performed by the update script.

## Update flow

```bash
npm run update:k16shikano-writing-skills
```

The command fetches both Gists through the GitHub API, records their current revisions, copies their `SKILL.md` files into `writing-assistant/references`, and rewrites the cognitive-rhythm skill's sibling-skill path for the Mekann reference layout.

After updating, review all changes under both `vendor/k16shikano-*` directories and `mekann/skills/writing-assistant/references`. In particular, check whether upstream changed file layout, cross-references, frontmatter, attribution, or assumptions about the agent harness.

## Runtime policy

`writing-assistant` is the only user-facing entry point. Pi does not expose the imported Gists as competing standalone skills.

- Load `japanese-tech-writing.md` for Japanese technical articles, explanatory documents, and book chapters.
- Load `cognitive-rhythm-writing.md` when accurate prose is flat or the user explicitly requests stronger rhythm or momentum.
- Apply cognitive-rhythm rules after logical and factual checks. Do not invent facts, scenes, uncertainty, or tension to satisfy a stylistic pattern.
