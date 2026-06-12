# Terminal UI placement uses Pi TUI in Pi and OpenTUI in Kitty split

Mekann extension UI distinguishes between Pi TUI overlay, Terminal pass-through, and External split UI. UI rendered inside Pi's active TUI uses Pi TUI only, because Pi manages that TTY and OpenTUI competes for terminal modes, cursor state, and screen ownership when run in-place. OpenTUI may be used for UI launched into a separate terminal-emulator-managed pane or window, because that UI no longer takes over Pi's TTY and can use OpenTUI's higher-level building blocks without conflicting with Pi.

## Considered Options

- Use OpenTUI directly inside Pi's active TUI: rejected because it conflicts with Pi's TTY management and has produced terminal-state bugs.
- Use Pi TUI for every Mekann UI: rejected because External split UI does not need to share Pi's TTY and can benefit from OpenTUI's easier UI construction.
- Choose per feature without a placement rule: rejected because it keeps the architecture ambiguous and makes future extension implementation harder.

## Consequences

- Pi TUI overlay uses Pi TUI.
- Terminal pass-through is reserved for idle human-operated terminal actions, not in-place OpenTUI applications.
- Terminal actions may fall back from split launch to idle Terminal pass-through when the action supports it.
- External UI features may use OpenTUI when launched as External split UI.
- External UI features must fail instead of falling back to Terminal pass-through when no supported External split UI capability is available.
- OpenTUI must not be launched in-place inside Pi's active TUI or pass-through fallback.
- Feature safety constraints and supported placements take precedence over user launch preferences.
- User-facing launch preference names are terminal-emulator-independent; terminal adapters translate preferences such as `split-longer-side` into emulator-specific commands.
- Existing Kitty-specific launch strategy names should be fully migrated rather than kept as compatibility aliases when they are not in active use.
- New terminal UI work should decide Terminal UI placement before choosing the TUI framework.
- Terminal-emulator-specific implementation lives under `utils/terminal/<emulator>/`; Kitty-specific control belongs in `utils/terminal/kitty/`, not a top-level `utils/kitty-control/` utility.
- Shared TUI placement and framework-selection rules live under `utils/tui/`, separate from terminal-emulator adapters.
