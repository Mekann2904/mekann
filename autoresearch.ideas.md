# Autoresearch Ideas

## Pre-push Phase 2 Optimization Ideas

### High Potential
1. **subagent index.test.ts ファイル分割**: 4699行→複数ファイルに分割。tscの型チェック時間3.8秒を短縮可能
2. **sandbox macSeatbelt.test.ts 分割**: 2205行でtransform+import 3秒。unit tests(L1-968)とintegration tests(L969-2205)に分割したいが、unit testsがintegrationの前後に散在しているため、まずdescribeブロックの順序を整理する必要がある
3. **typecheck並列化**: sandbox tsc(1.7s)とsubagent tsc(3.8s)を並列→3.8sに短縮。ただし8プロセス同時でシステム過負荷になる。CPUコア数が多ければ効果的

### Medium Potential
4. **tsc --build モード**: プロジェクト参照を使ったインクリメンタル型チェック。初回は同じだが2回目以降が速くなる
5. **subagentテストのconcurrent mode**: mailbox/agentControlのwait系テスト(50ms)を並列化。subagent自体は2.4秒でsandboxより速いためprepushには影響しない
6. **sandboxテストのバッチ化**: 複数アサーションを1プロセス起動にまとめる。プロセス起動回数を33→15に削減で~3.6秒短縮。ただしテスト粒度が荒くなる

### Low Potential
7. **typecheckをprepushから外す**: prepushはテストのみにし、typecheckはCIで実行。prepush ~3秒に短縮だが品質保証レベルが下がる
8. **vitest workspace モード**: 全モジュールを単一vitestプロセスで実行。モジュールパス解決の問題で失敗。各モジュールのimportパスを相対→絶対に変更すれば可能

### Physical Limits
- sandbox-exec プロセス起動: ~200ms/回（OS制約）
- vitest transform+import: ~3秒（2200行TypeScriptのコンパイル）
- 7並列プロセスがシステム負荷の限界

## Session Status: 183 → 40 (-78.1%), 6 experiments | Coverage: 98.24% avg stmts, 1497 tests

## Remaining 40 Uncovered Lines
### goal/index.ts (~13 lines)
- L331-335: update_goal "already complete" error (covered in tool.test.ts but coverage tool inconsistency)
- L351-352: command handler disabled guard
- L386,429,489,534,624: catch blocks String(e) path (non-Error thrown)
- L403-407: resume budget exhausted
- L562: handleSetObjective guard (store/runtime null)

### autoresearch/index.ts (~13 lines)
- L105: gitAutoRevert catch (requires actual git error)
- L159-160: appendTextFragments content=string / messages array
- L783,790-791: git revert error branches in log tool

### autoresearch/runner.ts (~8 lines)
- L167-168: child 'error' event (spawn failure before close)

### Defensive / Unreachable by Design
- goal/state.ts L240: fromEntries edge case
- plan-mode/index.ts L131-132: fallback model path
- sandbox/index.ts L115: yolo branch (yolo skips Case 4)
- sandbox/index.ts L383-384: escalation rejection
- sandbox/macSeatbelt.ts L275,289,332: defensive checks
- subagent/render.ts L57: else-if false
- subagent/registry.ts L171: duplicate recheck

## Completed
- ✅ Dead code removal, deduplication, single-use inlining
- ✅ Multi-line import/export/brace/throw/return compression
- ✅ File merging: 21→15 files (capabilities, approvals, state, contentExtract, commandIntent, agentPath, pathPolicy)
- ✅ Helper extraction: evBase, enqueueToMailbox, resolveAgentOrFail, setStatusAndPublish, toolResult, withCtrl, disableSandbox, refreshStatusBar, logProfileRejection, logBlockedTool, shutdownControl, safeEmit, filterAgents, findAgent
- ✅ Merge duplicate branches (contextFork user/assistant loop)
- ✅ Delegate agentControl.openCount → registry.openCount
- ✅ Alias FollowupTaskParams = SendMessageParams
- ✅ Split buildMacSeatbeltPolicy into sub-functions (complexity 2→1)
- ✅ Extract resolveTargetSession helper (sendMessage/followupTask/close)
- ✅ Extract removeProfileEntry helper (profileOverrideStack find+splice)
- ✅ Merge duplicate sendUserMessage branches in followupTask
- ✅ Add listAgents() to avoid snake_case round-trip in /agents command
- ✅ mkPolicy factory (readOnlyPolicy/workspaceWritePolicy/yoloPolicy)
- ✅ validateSegments helper in types.ts
- ❌ textResponse helper: net LOC increase
- ❌ Import merge: net LOC increase

## Near-Floor Experiments (no score change)
- resetAllState helper: creates new dup (clearMainModel/errMsg pattern)
- errMsg helper: replaces one dup with another, net zero
- clearMainModel helper: replaces one dup with another, marginal -1
- resolveCallerAndAgent helper: +4 LOC, same duplication
- spawnSandboxedProcess helper: +4 LOC, same duplication
- collectSandboxOutput extraction: score worsened (+1 dup)
- findAgent (first attempt): +2 LOC, same duplication
- safeEmit helper: -4 LOC, same duplication

## Natural Floor
Remaining 108 duplicated lines are structural JS/TS syntax (try, catch, return, braces),
framework API boilerplate (pi.registerTool, promptGuidelines, Type.String),
type field declarations across independent interfaces (agentId, message, target),
SBPL security rules, and cross-file patterns (createdAt/updatedAt, now, imports)
that represent genuine different code paths. The `runSandboxedShellMac` function
(121 lines with deep closure state) is the sole remaining complexity >50.

## Future Ideas
- Mutation testing (Stryker) to verify test coverage quality
- E2E testing with pi core
- Extract sandbox state into a state object (reduces coupling, not LOC)
- Split runSandboxedShellMac into class-based state machine (high risk, 121 lines of closures)

## Test Coverage Session Results

### Before → After
| Module | Stmts Before | Stmts After | Branch Before | Branch After |
|--------|-------------|------------|---------------|-------------|
| plan-mode | 97.66% | 98.83% | 94.01% | 97% |
| sandbox | 94.27% | 98.3% | 86.38% | 96.1% |
| subagent | 67.85% | 99.43% | 58.98% | 93.71% |
| zip-repo | 100% | 100% | 100% | 100% |
| **Total tests** | 890 | 1117 | | |
| **Avg stmt coverage** | ~90% | **99.14%** | | |
| **Avg branch coverage** | ~85% | **96.7%** | | |

### Identified Dead Code (defensive, unreachable by design)
- sandbox/index.ts:115 — `buildCurrentPolicy()` yolo branch (yolo skips Case 4)
- sandbox/index.ts:383-384 — escalation rejection (`MODE_RANK[read_only]=0 > any` is always false)
- sandbox/macSeatbelt.ts:332 — `keepBytes > 0` false branch (mathematically always true when reached)
- sandbox/macSeatbelt.ts:123 — `!isAbsolute(rel)` false (cross-volume relative path)
- sandbox/macSeatbelt.ts:275,289 — `proc.pid` falsy / `resolved` already true in waitForProcessDeath
- subagent/registry.ts:171 — duplicate recheck (single-threaded, checked at reservation time)
- subagent/contextFork.ts:30 — null text skip in fork
- subagent/agentControl.ts:98,162,219,256 — `callerPath !== ROOT_PATH` (resolveCallerPath always returns ROOT_PATH)
- subagent/agentControl.ts:388 — `"seq" in e` false (appendEvent always sets seq)
- subagent/agentControl.ts:437,466 — agent closed/removed during close
- subagent/render.ts:57 — else-if false (filter guarantees only status_changed/final_message)
- subagent/index.ts:265 — wait_agent formatting branches (architectural limitation)
- subagent/index.ts:349 — String(err) path (close() always throws Error)
- plan-mode/index.ts:131-132 — fallback model path (enterPlanMode sets mainRef === savedMainModel)
