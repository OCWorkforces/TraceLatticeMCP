# CONTRACTS MODULE

**Updated:** 2026-04-18
**Commit:** 906f363
## OVERVIEW

Shared interface contracts centralizing cross-module type dependencies. Single coupling point — modules depend on these interfaces (not concrete implementations) to reduce lateral coupling. The only allowed barrel re-export outside `src/index.ts`.

## STRUCTURE

```
src/contracts/
├── interfaces.ts   # Core interfaces (IMetrics, IDiscoveryCache, IEdgeStore, etc.)
├── strategy.ts     # IReasoningStrategy contract + StrategyDecision type
├── calibrator.ts   # ICalibrator, CalibrationMetrics, CalibrationResult
├── summary.ts      # ISummaryStore contract for branch rollup summaries
├── suspension.ts   # ISuspensionStore, SuspensionRecord contract for tool interleave
└── index.ts        # Module barrel (intentional — single coupling point)
```

## INTERFACES

| Interface               | Purpose                                         | Key Methods                                                         |
| ----------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| `IMetrics`              | Metrics abstraction (counter, gauge, histogram) | `counter()`, `gauge()`, `histogram()`, `inc()`, `dec()`, `export()` |
| `IDiscoveryCache`       | Discovery result caching                        | `get()`, `set()`, `has()`, `invalidate()`, `clear()`                |
| `DiscoveryCacheOptions` | Cache configuration                             | `ttl`, `maxSize`, `cleanupInterval`                                 |
| `IEdgeStore`            | DAG edge storage contract                       | `addEdge()`, `getEdge()`, `outgoing()`, `incoming()`, `edgesForSession()`, `clearSession()`, `size()` |
| `IReasoningStrategy`    | Strategy contract for thought dispatch          | `decideNext(ctx)` → `StrategyDecision`                              |
| `ICalibrator`           | Confidence calibration contract                 | `calibrate()`, `getMetrics()`                                       |
| `CalibrationMetrics`    | Calibration data types                          | Brier score, ECE                                                    |
| `ISummaryStore`         | Branch rollup summary storage                   | `add()`, `get()`, `listForBranch()`, `clearSession()`               |
| `ISuspensionStore`      | Tool suspension storage                         | `suspend()`, `resume()`, `peek()`, `expire()`, `clearSession()`, `size()`, `start()`, `stop()` |
| `SuspensionRecord`      | Suspension data type                            | token, sessionId, toolCallThoughtNumber, toolName, toolArguments, timestamps |


## CONVENTIONS

- This is the **single coupling point** — cross-module type imports come through here.
- `IHistoryManager` remains in `src/core/IHistoryManager.ts` (not in this module) — the real interface with 8+ methods.
- Interfaces are defined here; implementations live in their respective modules.
- `IMetrics` and `IDiscoveryCache` are the most widely used (10+ consumer files each).
