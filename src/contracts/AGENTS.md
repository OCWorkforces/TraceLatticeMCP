# CONTRACTS MODULE

**Updated:** 2026-04-23
**Parent:** ../AGENTS.md

## OVERVIEW

Shared interface contracts. Single coupling point for cross-module type imports (sentrux-enforced). All consumers import directly from the matching file (no barrel).

## INTERFACES

| File | Exports |
|------|---------|
| `interfaces.ts` | `IMetrics`, `IDiscoveryCache`, `DiscoveryCacheOptions`, `IEdgeStore`, `IPersistenceBackend` |
| `strategy.ts` | `IReasoningStrategy`, `StrategyContext`, `StrategyDecision` |
| `summary.ts` | `ISummaryStore`, `Summary` |
| `calibrator.ts` | `ICalibrator`, `CalibrationMetrics`, `CalibrationResult` |
| `suspension.ts` | `ISuspensionStore`, `SuspensionRecord` |
| `ids.ts` | `SessionId`, `ThoughtId`, `EdgeId`, `SuspensionToken` (branded types) + constructors + generators |
| `features.ts` | `FeatureFlags`, `DEFAULT_FLAGS`, `hasFeature()` type guard |
| `transport.ts` | `ITransport`, `TransportKind` |

Key contracts:
- `IEdgeStore` (7 methods): `addEdge`, `getEdge`, `outgoing`, `incoming`, `edgesForSession`, `clearSession`, `size`
- `IReasoningStrategy`: pure policy, `decideNext(ctx) → StrategyDecision`, no mutable state, no I/O
- `ISuspensionStore` (8 methods): `suspend`, `resume`, `peek`, `expire`, `clearSession`, `size`, `start`, `stop`

## RULES

- ALL cross-module type imports MUST route through this directory.
- Exception: `IHistoryManager` and `ThoughtData` live in `src/core/` (not here).
- Define interface here, implement in owning module, never import implementations across modules.
