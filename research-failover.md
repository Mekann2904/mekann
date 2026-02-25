# Distributed Lock Failover Test Research

## CLAIM
Current implementation lacks explicit failover tests; lock TTL exists but crash/network partition scenarios are untested.

## EVIDENCE

### 1. Lock Mechanism Analysis (cross-instance-coordinator.ts)

**Acquisition (tryAcquireLock)**
- Uses `openSync(path, "wx")` for atomic O_EXCL creation (line 770-785)
- TTL: 30 seconds default (`LOCK_TIMEOUT_MS`)
- Max retries: 3 with exponential backoff (10ms, 20ms, 40ms)
- Retry uses `Atomics.wait()` for precise delay

**Release (releaseLock)**
- Validates lockId ownership before unlink (line 823-832)
- Silent failure on errors (catch block ignores all errors)

**Cleanup (cleanupExpiredLocks)**
- Called by `enhancedHeartbeat()` only
- Removes locks where `nowMs >= lock.expiresAt`
- Removes corrupted lock files silently

### 2. Failover Scenarios - Current Handling

| Scenario | Implementation | Tested |
|----------|---------------|--------|
| Process crash | Lock expires after TTL (30s) | NO |
| Network partition | No handling (file-based, local FS) | N/A |
| Split-brain | No distributed consensus | N/A |
| TOCTOU race | O_EXCL + retry with backoff | NO |
| Stale lock cleanup | `cleanupExpiredLocks()` on heartbeat | NO |
| Owner validation | `lockId` comparison in release | NO |

### 3. Test Coverage Gaps

**Existing tests (cross-instance-coordinator.test.ts)**
- Happy path: register/unregister/heartbeat
- Basic mock-based unit tests
- Property-based: `getMyParallelLimit >= 1`

**Missing tests:**
1. Lock acquisition collision (two instances, same resource)
2. Lock expiry and cleanup by non-owner
3. Process crash simulation (lock left behind)
4. Retry mechanism with backoff
5. Release by non-owner (should fail silently)
6. Corrupted lock file handling
7. Concurrent lock acquisition attempts

### 4. Key Functions Requiring Failover Tests

```typescript
// Primary lock functions
tryAcquireLock(resource, ttlMs, maxRetries)  // Line 763-806
releaseLock(lock)                            // Line 819-832
cleanupExpiredLocks()                        // Line 971-994

// Supporting functions
tryCleanupExpiredLock(lockFile, nowMs)       // Line 812-840
acquireDistributedLock(resource, ttlMs)      // Line 846-851
safeStealWork()                              // Line 912-958
```

### 5. Risk Areas

1. **Silent failures**: `releaseLock()` catches all errors - may hide issues
2. **No distributed coordination**: File-based locks don't handle network partitions
3. **Heartbeat dependency**: `cleanupExpiredLocks` only runs during heartbeat
4. **TOCTOU window**: Between expired check and rename, another process could acquire

## CONFIDENCE
0.85

## ACTION
next - Create test implementation plan for failover scenarios
