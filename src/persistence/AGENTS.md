# PERSISTENCE MODULE

**Updated:** 2026-03-31
**Parent:** ../AGENTS.md

## OVERVIEW

State persistence backends for storing thought history and branch data.

## STRUCTURE

```
src/persistence/
├── PersistenceBackend.ts  # Abstract interface
├── FilePersistence.ts     # JSON file storage (dev)
├── SqlitePersistence.ts   # SQLite storage (prod)
└── MemoryPersistence.ts   # In-memory storage (default)
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
