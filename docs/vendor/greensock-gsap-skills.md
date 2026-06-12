# greensock/gsap-skills import policy

This repository imports GSAP skills from [greensock/gsap-skills](https://github.com/greensock/gsap-skills) and maintains Pi-oriented copies of them.

## Layout

- `vendor/greensock-gsap-skills` is the upstream mirror.
- `mekann/skills/gsap-*` are the Pi-maintained skill directories that Pi coding agents read.
- Do not edit files under `vendor/greensock-gsap-skills` directly.

## Update command

```bash
npm run update:gsap-skills
```

The command refreshes the upstream mirror and copies every `skills/gsap-*` directory into `mekann/skills`.

After updating, review the diff under `mekann/skills/gsap-*` and adapt copied files for Pi if upstream introduces harness-specific tool names or workflows.
