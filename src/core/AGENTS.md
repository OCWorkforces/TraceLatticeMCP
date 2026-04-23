# CORE DOMAIN

## OVERVIEW

Reasoning engine: thought ingest → graph mutation → quality signals → strategy decision.

## PIPELINE FLOW

`ThoughtProcessor.process()` (7 stages):

1. **normalize** (`InputNormalizer`): fix LLM field mistakes, fill defaults, sanitize `branch_id`
2. **validate** (valibot via `schema.ts`): throw `ValidationError` with `field`
3. **persist** (`HistoryManager.addThought`): append to history, mutate branches, emit edges
4. **format** (`ThoughtFormatter`): chalk display for stderr (💭🔄🌿🔬✅🔍🧬🧠📝)
5. **evaluate** (`ThoughtEvaluator`): `ConfidenceSignals` + `ReasoningStats`
6. **strategy** (`IReasoningStrategy.decideNext`): sequential vs ToT dispatch via `StrategyFactory`
7. **hints** (`PatternDetector`): priority-based selection, max 3, 3-thought cooldown

## SUBSYSTEMS

| Dir              | Role                                                           |
| ---------------- | -------------------------------------------------------------- |
| `graph/`         | DAG edges. 8 kinds. `EdgeStore` per-session, `GraphView` read-only traversal (Kahn's topological) |
| `compression/`   | Branch rollup (`CompressionService`) plus sliding-window `DehydrationPolicy` |
| `evaluator/`     | Decomposed: `SignalComputer`, `Aggregator`, `PatternDetector`, `Calibrator` (own AGENTS.md) |
| `tools/`         | `InMemorySuspensionStore`: suspend/resume on `tool_call`, TTL expiry, periodic sweep |
| `reasoning/strategies/` | Pure policies. No I/O, no mutable state. Decisions from `StrategyContext` only |

## WHERE TO LOOK

| Task                          | File                                  |
| ----------------------------- | ------------------------------------- |
| Add a thought type            | `reasoning.ts` (union) + `thought.ts` + processor branches |
| Change pipeline order         | `ThoughtProcessor.process()`          |
| Tweak quality scoring         | `evaluator/SignalComputer.ts`         |
| New hint pattern              | `evaluator/PatternDetector.ts`        |
| Edge resolution bug           | `EdgeEmitter._resolveThoughtId` (searches history + branches) |
| Session eviction              | `SessionManager` (TTL 30min, LRU 100) |
| Batched writes                | `PersistenceBuffer` (flush timer)     |
| New reasoning strategy        | `reasoning/strategies/` + `StrategyFactory` dispatch |
| Branch collapse               | `compression/CompressionService.ts`   |

## KEY INTERFACES

- `IHistoryManager` (8 methods + session lifecycle): contract for the coordinator
- `ThoughtData`: 11 optional reasoning fields + `retracted: boolean` (logical retraction via `backtrack`). Uses branded ID types (`ThoughtId`, `SessionId`, `SuspensionToken`) from `contracts/ids.ts`.
- `ThoughtType`: 11-variant union. Flag gates:
  - `newThoughtTypes`: `assumption`, `decomposition`, `backtrack`
  - `toolInterleave`: `tool_call`, `tool_observation`
- `IReasoningStrategy.decideNext(ctx) → StrategyDecision`: pure policy
- `ConfidenceSignals.confidence_stability`: `null` when n<2, excluded from geomean with redistributed weights

## NOTES

- `HistoryManager` was decomposed (538L). Mutation logic lives in `EdgeEmitter` / `PersistenceBuffer` / `SessionManager`. Keep it that way: HM coordinates, doesn't compute.
- `_resolveThoughtId` walks BOTH `session.thought_history` AND every `session.branches[*]`. Branch thoughts are NOT in main history.
- `ThoughtProcessor` is 754L because it's the seam between schema, persistence, and policy. Don't fold helpers back in. Extract further if it grows.
- `EdgeStore` is always registered in DI. Feature flag `dagEdges` gates the WRITE path only, not the registration.
- `reasoning/strategies/` lives at depth 4 deliberately. Strategies are leaf policies, not infrastructure.
- `generateUlid` is timestamp-base36 + random hex. Not a real ULID. Don't rename.
