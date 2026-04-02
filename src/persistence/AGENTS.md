# PERSISTENCE MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

State persistence backends for storing thought history and branch data.

## STRUCTURE

```
src/persistence/
├── PersistenceBackend.ts  # Abstract interface (78L)
├── PersistenceFactory.ts   # Factory function (47L)
├── FilePersistence.ts     # JSON file storage (dev) (236L)
├── SqlitePersistence.ts   # SQLite storage (prod) (265L)
└── MemoryPersistence.ts   # In-memory storage (default) (112L)
```

## INTERFACE

All backends implement `PersistenceBackend`:

- `saveThought(thought): Promise<void>`
- `saveBranch(branchId, thoughts): Promise<void>`
- `loadHistory(): Promise<ThoughtData[]>`
- `clear(): Promise<void>`
- `healthy(): Promise<boolean>`

## CONVENTIONS

- **Fire-and-Forget**: Save operations are not awaited to avoid blocking.
- **Auto-trimming**: History size limits applied on load.
