# CONTRACTS MODULE

**Updated:** 2026-04-18
**Parent:** ../AGENTS.md

## OVERVIEW

Shared interface contracts. Single coupling point for cross-module type imports (sentrux-enforced). `index.ts` is one of only 2 allowed barrels in the project.

## INTERFACES

| File | Exports |
|------|---------|
| `interfaces.ts` | `IMetrics`, `IDiscoveryCache`, `DiscoveryCacheOptions`, `IEdgeStore`, `IPersistenceBackend` |
| `strategy.ts` | `IReasoningStrategy`, `StrategyContext`, `StrategyDecision` |
| `summary.ts` | `ISummaryStore`, `Summary` |
| `calibrator.ts` | `ICalibrator`, `CalibrationMetrics`, `CalibrationResult` |
| `suspension.ts` | `ISuspensionStore`, `SuspensionRecord` |
| `index.ts` | Barrel re-export (allowed) |

Key contracts:
- `IEdgeStore` (7 methods): `addEdge`, `getEdge`, `outgoing`, `incoming`, `edgesForSession`, `clearSession`, `size`
- `IReasoningStrategy`: pure policy, `decideNext(ctx) → StrategyDecision`, no mutable state, no I/O
- `ISuspensionStore` (8 methods): `suspend`, `resume`, `peek`, `expire`, `clearSession`, `size`, `start`, `stop`

## RULES

- ALL cross-module type imports MUST route through this directory.
- Exception: `IHistoryManager` and `ThoughtData` live in `src/core/` (not here).
- Define interface here, implement in owning module, never import implementations across modules.
- `index.ts` barrel is intentional — re-export new contracts from it.
- Adding a new shared interface? Drop it in the matching file (or new one) and update `index.ts`.
