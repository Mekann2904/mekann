# review-quality

`review-quality` is a utility feature that moves large-change review prompting into runtime detection.

## Command

- `/review-quality`: inspects `git diff --numstat HEAD` and reports diff size. For large diffs, it suggests `thermo-nuclear-code-quality-review`.

## Hook

On `agent_end`, the feature checks diff size and notifies once per diff signature when the change is large enough to merit a strict maintainability review.
