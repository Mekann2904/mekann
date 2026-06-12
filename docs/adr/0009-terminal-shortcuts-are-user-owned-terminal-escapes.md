# Terminal shortcuts are user-owned terminal escapes, not agent prompts

Mekann treats exact terminal shortcuts such as `lg` as human-operated utility actions rather than prompts for the agent. A terminal shortcut intercepts interactive input before normal prompt handling, launches a terminal-oriented command through a launcher strategy, and does not create session entries, agent context, or completion notifications. Built-in shortcuts use argv mode for stability, while environment-defined shortcuts use shell mode for convenience.

## Considered Options

- Use shell aliases: rejected because Pi resolves terminal shortcuts before prompt handling, while shell aliases only apply after a shell has already been selected.
- Use slash commands: rejected because the desired interaction is a bare exact input such as `lg`, not command-mode syntax.
- Use `user_bash`: rejected because the desired interaction does not require `!` and should remain a human-owned terminal escape rather than a bash command transcript.
- Start with kitty overlay or tmux popup: deferred behind a launcher strategy because pass-through is the reliable baseline and overlay launchers add environment-specific setup.

## Consequences

Terminal shortcuts can surprise readers because a bare input may be handled without reaching the agent. To keep this bounded, shortcuts match exact interactive input only, are utility features, and should avoid broad prefix matching.
