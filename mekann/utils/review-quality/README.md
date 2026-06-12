# review-quality

`review-quality` is a utility feature that moves large-change review prompting into runtime detection.

## Command

- `/review-quality`: inspects the branch diff from the merge-base with `origin/HEAD` or `main`, plus the working-tree diff from `HEAD`, and reports diff size. For large diffs, it suggests `thermo-nuclear-code-quality-review`.

## Hook

On `agent_end`, the feature checks branch + working-tree diff size and notifies once per diff signature when the change is large enough to merit a strict maintainability review.
