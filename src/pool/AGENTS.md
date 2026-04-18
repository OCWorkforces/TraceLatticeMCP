# POOL MODULE


**Updated:** 2026-04-18
**Commit:** 906f363
## OVERVIEW

Connection pool for multi-user SSE sessions with per-user isolation, timeouts, and cleanup.

## WHERE TO LOOK

- `src/pool/ConnectionPool.ts` - Session map, lifecycle, cleanup, timeout logic (470L)
- `src/transport/SseTransport.ts` - Integration point using pool for multi-user sessions
- `src/core/HistoryManager.ts` - Per-session history owned by pool sessions

## CONVENTIONS

- One `HistoryManager` per user ID; no shared history between sessions
- Session inactivity drives timeout; cleanup removes expired sessions
- Pool is only required for SSE multi-user mode
