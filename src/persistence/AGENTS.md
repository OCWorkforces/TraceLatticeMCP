# PERSISTENCE MODULE

**Updated:** 2026-04-18
**Commit:** 906f363

## OVERVIEW

State persistence backends for storing thought history and branch data.

## STRUCTURE

```
src/persistence/
├── PersistenceBackend.ts  # Abstract interface (78L)
├── PersistenceFactory.ts   # Factory function (47L)
├── FilePersistence.ts     # JSON file storage (dev) (236L)
├── SqlitePersistence.ts   # SQLite storage (prod) (265L)
├── MemoryPersistence.ts   # In-memory storage (default) (112L)
└── better-sqlite3.d.ts    # Type declarations for better-sqlite3
```

## INTERFACE

All backends implement `PersistenceBackend`:

- `saveThought(thought): Promise<void>`
- `saveBranch(branchId, thoughts): Promise<void>`
- `saveEdges(edges): Promise<void>`
- `loadHistory(): Promise<ThoughtData[]>`
- `loadEdges(): Promise<Edge[]>`
- `clear(): Promise<void>`
- `healthy(): Promise<boolean>`

## CONVENTIONS

- **Fire-and-Forget**: Save operations are not awaited to avoid blocking.
- **Auto-trimming**: History size limits applied on load.
