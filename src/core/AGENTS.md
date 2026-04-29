# CORE DOMAIN

## OVERVIEW

Reasoning engine: thought ingest → graph mutation → quality signals → strategy decision.

## PIPELINE FLOW

`ThoughtProcessor.process()` (7 stages):

1. **normalize** (`InputNormalizer`): fix LLM field mistakes, fill defaults, sanitize `branch_id`, strip urgency phrases from step-level fields (`step_description`, `expected_outcome`, `meta_observation`, `next_step_conditions`)
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
| Sanitization of step fields   | `InputNormalizer.ts` (uses `sanitizeStepField` from `sanitize.ts`) |

## KEY INTERFACES

- `IHistoryManager` (8 methods + session lifecycle): contract for the coordinator
- `ThoughtData`: 11 optional reasoning fields + `retracted: boolean` (logical retraction via `backtrack`). Now derived from `v.InferOutput<SequentialThinkingSchema>` (single source of truth). Uses branded ID types (`ThoughtId`, `SessionId`, `SuspensionToken`, `BranchId`) from `contracts/ids.ts`.
- `ValidatedThought` (`thought.ts`): discriminated union over `kind` with 7 variants — `ToolCallThought`, `ToolObservationThought`, `BacktrackThought`, `VerificationThought`, `CritiqueThought`, `SynthesisThought`, `BaseThought`. Returned by `_validateNewTypes` so handlers no longer use `!` non-null assertions.
- `BranchId` (branded): keys `Map<BranchId, ThoughtData[]>` for branch storage. Imported from `contracts/ids.ts`.
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
- `HistoryManager.clear()` enforces ownership via `_getSession()` — cross-owner `reset_state` throws `SessionAccessDeniedError`. Stdio path (no owner) is unrestricted.
- Input sanitization has two layers: `sanitizeStepField` (urgency phrases + HTML + control chars + length cap) for step-level and reasoning fields, and `sanitizeRationale` (same + 2000-char cap) for tool/skill recommendation rationales. Both use `stripUrgencyPhrases` internally.
- `_validateNewTypes` returns a `ValidatedThought` discriminated union — `_handleToolCall` / `_handleToolObservation` / backtrack handlers consume the narrowed variant directly. No more `!` assertions in processor branches.
- `_hintCooldowns` is typed `Map<SessionId, Map<PatternName, number>>` (inner key is `PatternName` from `reasoning.ts`, not raw string).
- `GLOBAL_SESSION_ID` constant (in `SessionManager` / id helpers) replaces the `'__global__'` literal previously sprinkled across session code. Always use the constant.
