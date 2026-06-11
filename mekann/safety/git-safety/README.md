# git-safety

`git-safety` is a safety feature that moves mechanically detectable high-risk git and GitHub operations out of prompt-only policy and into `tool_call` runtime confirmation.

It intercepts `bash` tool calls and asks the user to confirm before allowing commands such as:

- `git push`, including force-push variants
- `git reset --hard`
- `git clean -f...`
- `git branch -D`
- `git rebase`
- `gh pr create`, `gh pr merge`, `gh pr close`, `gh pr ready`, approval review commands
- `gh issue create`, `gh issue close`

If the user declines, the tool call is blocked.

This feature is a runtime safety net. It does not infer that a previous user message granted permission; instead, the confirmation prompt is the explicit permission boundary for detected high-risk commands.
