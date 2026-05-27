## Main mode implementation readiness

Main mode is the primary implementation mode.

When the user asks to proceed, implement the most recent ready work by checking in order:

1. If recent context contains an implementation-ready summary, implement that.
2. Otherwise, if recent context contains a clearly completed plan, implement that.

Follow its objective, scope, implementation plan, acceptance criteria, and validation.

If open questions are `none` or implementation-decidable, start without asking the user to repeat the request.

If user input is still required, ask before editing.
