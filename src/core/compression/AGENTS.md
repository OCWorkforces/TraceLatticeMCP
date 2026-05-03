# COMPRESSION

## OVERVIEW

Branch rollup subsystem. Collapses cold (inactive) branches into compact `Summary` records so the active history stays small without losing provenance. The collapse is fully deterministic (no LLM call), driven by a sliding-window policy. Gated by the `compression` feature flag; when off, nothing in this directory runs.

## STRUCTURE

```
compression/
├── Summary.ts              # Summary interface + SummarySchema (Valibot)
├── InMemorySummaryStore.ts # Per-session ISummaryStore impl
├── CompressionService.ts   # Deterministic branch → Summary collapse
└── DehydrationPolicy.ts    # Sliding-window decision policy
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Summary shape / persisted record | `Summary.ts` (`Summary` interface) |
| Validating a Summary read from disk | `Summary.ts` (`SummarySchema`, Valibot) |
| Storing / fetching summaries | `InMemorySummaryStore.ts` |
| ISummaryStore contract | `src/contracts/summary.ts` (`add`, `get`, `listForBranch`, `clearSession`) |
| Deciding which thoughts get rolled up | `DehydrationPolicy.ts` |
| Performing the rollup | `CompressionService.ts` |
| Wiring into the pipeline | `src/lib.ts` (DI), parent `AGENTS.md` |

## CONVENTIONS

- **Deterministic only.** `CompressionService` derives `summary`, `topics`, and `aggregateConfidence` from the source thoughts via fixed reducers. No model calls, no randomness, no I/O. Same input → byte-identical output.
- **Sliding window, not time.** `DehydrationPolicy` decides eligibility from frontier distance and branch activity, not wall-clock age. Keep policy logic free of `Date.now()` for testability.
- **Branded IDs.** `Summary.id` is `SummaryId`, `branchId` is `BranchId`, `rootThoughtId` and `coveredIds` are `ThoughtId`. Construct via the helpers in `src/contracts/ids.ts`. Never widen to `string`.
- **Per-session isolation.** All store operations take a `SessionId`. `InMemorySummaryStore` keeps one inner `Map` per session. `clearSession(sessionId)` must drop everything for that session and nothing else.
- **Validate on read, trust on write.** Persistence backends parse loaded JSON through `SummarySchema` before handing records back. In-memory paths skip validation.
- **Field set is closed.** A `Summary` carries: `id`, `branchId`, `rootThoughtId`, `coveredIds`, `coveredRange`, `topics`, `aggregateConfidence`, `summary`, `createdAt`, `meta`. Adding a field means updating both the interface and `SummarySchema` in lockstep.

## NOTES

- The `compression` feature flag gates the write path only. `ISummaryStore` is always registered in DI so reads from existing summaries stay safe when the flag is flipped off mid-session.
- `CompressionService` does not mutate `HistoryManager` directly. It produces `Summary` records; the caller is responsible for marking covered thoughts as dehydrated and pruning if desired. Keep this seam intact, it is what makes rollback trivial.
- `aggregateConfidence` is a pure reducer over source-thought confidence. If you change the reducer, bump a version marker in `meta` so older summaries remain interpretable.
- Keep `coveredIds` sorted by thought number. Several downstream consumers assume ordering and will silently misbehave otherwise.
- No barrel file. Import directly from the four source files.
