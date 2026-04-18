# PERSISTENCE MODULE

**Updated:** 2026-04-18
**Parent:** ../AGENTS.md

## OVERVIEW

State backends for thoughts + DAG edges. 3 implementations behind one interface, selected via `PersistenceFactory`. Per-session edge storage; `__global__` is the default session for backward compat.

## STRUCTURE

```
persistence/
├── PersistenceBackend.ts   # 15-method interface (116L)
├── PersistenceFactory.ts   # Backend selector
├── MemoryPersistence.ts    # In-memory (default, tests)
├── FilePersistence.ts      # JSON files (452L)
├── SqlitePersistence.ts    # SQLite + WAL (468L)
├── types.ts                # Shared persistence types
└── better-sqlite3.d.ts     # Type shim
```

## BACKENDS

| Backend  | Thoughts                      | Edges                                       | Notes                                  |
| -------- | ----------------------------- | ------------------------------------------- | -------------------------------------- |
| Memory   | `Map`                         | `Map<string, Edge[]>` keyed by session      | No I/O, fastest, ephemeral             |
| File     | `{dataDir}/thoughts.json`     | `{dataDir}/edges/{sessionId}.json`          | Atomic writes, path traversal guarded  |
| SQLite   | `thoughts` table              | `edges` table with `session_id` column      | WAL mode, prepared stmts, transactions |

## INTERFACE

`PersistenceBackend` — 15 methods. Edge-related:

- `saveEdges(sessionId, edges): Promise<void>` — per-session write
- `loadEdges(sessionId): Promise<Edge[]>` — per-session read
- `listEdgeSessions(): Promise<string[]>` — enumerate all sessions with edge data
  - File: scan `edges/` dir
  - SQLite: `SELECT DISTINCT session_id FROM edges`
  - Memory: `Array.from(map.keys())`

## NOTES

- `HistoryManager._loadFromPersistence()` iterates **all** sessions returned by `listEdgeSessions()`, not just `__global__`.
- `HistoryManager._flushEdges()` writes per-session, looping `_sessions.keys()` plus `DEFAULT_SESSION` (`'__global__'`).
- Write buffering + batched flush handled by `PersistenceBuffer` in `core/`, not here. Backends are dumb sinks.
- `clear()` is destructive across both thoughts and edges; tests rely on this.
