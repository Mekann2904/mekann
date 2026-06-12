# Add autoresearch test-time scaling as a supervisor mode

Mekann will add Autoresearch test-time scaling as a separate `/autoresearch-scale` supervisor mode rather than replacing the existing autoresearch loop. The mode generates an extended scaling plan, uses approved contracts and plan-scoped scaling state, drives one recoverable action per agent turn through `agent_end` followUp injection, records evidence in append-only state, treats `COMPLETE` as exploration exhaustion rather than research completion, and keeps winning candidates pending adoption instead of automatically changing the main worktree.

This keeps the existing `/autoresearch <purpose>` UX intact, avoids background daemons, preserves Pi’s session/tool/interrupt lifecycle, and lets test-time compute scale through hypothesis populations, subagents, isolated candidate evaluation, and evidence-driven survivor selection while keeping concurrent resources bounded.
