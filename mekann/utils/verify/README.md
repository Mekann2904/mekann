# verify

`verify` is a utility feature that turns verification reporting into a runtime command instead of relying only on prompt reminders.

## Command

- `/verify`: quick verification. Runs the cheapest standard script found in `package.json`: `typecheck:prod`, then `typecheck`, then `test`.
- `/verify full`: runs existing standard scripts from `typecheck:prod`, `typecheck`, and `test`.
- `/verify <script names>`: runs matching package scripts by name and reports missing requested scripts instead of silently dropping them.

The command reports exactly which `npm run ...` commands were executed and whether each passed or failed.
