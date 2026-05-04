# CONTRACTS MODULE

**Updated:** 2026-05-04
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
| `ids.ts` | `SessionId`, `ThoughtId`, `EdgeId`, `SuspensionToken`, `BranchId`, `SummaryId` (branded types) + validated constructors (`asSessionId()`, `asBranchId()` etc.) + unchecked constructors (`asThoughtId()`, `asEdgeId()`, `asSuspensionToken()`, `asSummaryId()`) + generators + `GLOBAL_SESSION_ID` constant |
| `features.ts` | `FeatureFlags`, `DEFAULT_FLAGS`, `hasFeature()` type guard |
| `transport.ts` | `ITransport`, `TransportKind` |

Key contracts:
- `IEdgeStore` (7 methods): `addEdge`, `getEdge`, `outgoing`, `incoming`, `edgesForSession`, `clearSession`, `size`
- `IReasoningStrategy`: pure policy, `decideNext(ctx) → StrategyDecision`, no mutable state, no I/O
- `ISuspensionStore` (8 methods): `suspend`, `resume`, `peek`, `expire`, `clearSession`, `size`, `start`, `stop`
- `FeatureFlags`: 7 readonly flags + `DEFAULT_FLAGS` + `hasFeature()` type guard, re-exported from `ServerConfig.ts`
- `ITransport`: shared transport lifecycle (`kind`, `connect`, `stop`, `clientCount`, `isShuttingDown`, `serverUrl`)
- `GLOBAL_SESSION_ID`: replaces literal `'__global__'` string everywhere

## RULES

- ALL cross-module type imports MUST route through this directory.
- Exception: `IHistoryManager` and `ThoughtData` deliberately live in `src/core/` (domain primitives, not here).
- Define interface here, implement in owning module, never import implementations across modules.
