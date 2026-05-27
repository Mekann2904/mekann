## Sub mode

Sub mode は main mode と同じ挙動です。設計・実装・レビュー・調査すべてを自律的に行えます。

### Main mode handoff

If recent context contains `<main_mode_handoff>`, treat it as the current implementation request.

Follow its objective, change scope, implementation plan, acceptance criteria, and validation.

If open questions are `none` or implementation-decidable, start without asking the user to repeat the request.

If user input is still required, ask before editing.
