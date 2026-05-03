# PROJECT KNOWLEDGE BASE

**Updated:** 2026-05-04
**Commit:** 1c9141f v1.3.6+typing
**Branch:** feat/rslib-rsbuild-migration

## OVERVIEW

MCP Sequential Thinking Server — TypeScript/Node.js server providing structured thinking with tool/skill recommendations and a6-type reasoning pipeline (hypothesis → verification → critique → synthesis → meta). Supports stdio, SSE, Streamable HTTP, and HTTP transports with DI and persistence.

## STRUCTURE

```
./
├── src/                  # Source code (see src/AGENTS.md)
│   ├── core/            # Core domain: HistoryManager, ThoughtProcessor, ThoughtEvaluator, types
│   │   ├── graph/        # DAG edges: Edge type, EdgeStore, GraphView traversal
│   │   ├── compression/  # Branch rollup summaries + sliding-window dehydration
│   │   ├── evaluator/    # Decomposed evaluator: SignalComputer, Aggregator, PatternDetector, Calibrator
│   │   ├── tools/         # Tool interleave: InMemorySuspensionStore (suspend/resume)
│   │   └── reasoning/    # Strategies: Sequential, TreeOfThought (BFS/beam), StrategyFactory
│   ├── transport/        # MCP transports (SSE/HTTP/StreamableHTTP)
│   ├── di/               # DI container + service registry (18 services)
│   ├── registry/         # Tool/Skill registries (BaseRegistry<T> + subclasses)
│   ├── contracts/        # Shared interfaces (IMetrics, IDiscoveryCache, etc.)
│   ├── __tests__/        # Test suite (Vitest, 2100 tests, 80 files)
│   ├── cache/            # LRU+TTL discovery cache
│   ├── logger/           # Structured logging (JSON/pretty)
│   ├── pool/             # Multi-user session pool
│   ├── config/           # YAML + env var config loading
│   ├── watchers/         # File system watchers for tool/skill discovery
│   ├── metrics/          # Prometheus metrics collection
│   ├── health/           # Aggregate health checking
│   ├── context/          # Request context via AsyncLocalStorage (getRequestId only)
│   └── types/            # Shared type definitions (Tool, Skill, ServerConfig)
├── .agents/             # Agent skills (vercel-react-*)
├── .sentrux/            # sentrux architectural rules (9 layers, 6 forbidden boundaries)
└── docs/                # Documentation assets
```


## WHERE TO LOOK

| Task                     | Location                       | Notes                                                              |
| ------------------------ | ------------------------------ | ------------------------------------------------------------------ |
| **Core Logic**           | `src/lib.ts`                   | Entry point, wiring, ToolAwareSequentialThinkingServer             |
| **State Management**     | `src/core/HistoryManager.ts`   | Thought history, branching, persistence buffering                  |
| **Shared Interfaces**    | `src/contracts/interfaces.ts`  | IMetrics, IDiscoveryCache, etc. (`IHistoryManager` in `src/core/`) |
| **Persistence**          | `src/persistence/`             | File/SQLite/Memory backends                                        |
| **DI Container**         | `src/di/Container.ts`          | IoC container + ServiceRegistry type                               |
| **Transports**           | `src/transport/`               | SSE, HTTP, StreamableHTTP implementations                          |
| **Tool/Skill Discovery** | `src/registry/BaseRegistry.ts` | Base class with frontmatter parsing, LRU cache                     |
| **Quality Signals**      | `src/core/ThoughtEvaluator.ts` | Stateless confidence signals + reasoning analytics                 |
| **Reasoning Types**      | `src/core/reasoning.ts`        | ThoughtType union, ConfidenceSignals, ReasoningStats               |
| **Metrics**              | `src/metrics/Metrics.impl.ts`  | Prometheus counters, gauges, histograms                            |
| **Config**               | `src/config/ConfigLoader.ts`   | YAML + env var loading                                             |
| **DAG / Graph**          | `src/core/graph/`              | Multi-parent thought edges, graph traversal                        |
| **Edge Persistence**     | `src/persistence/`             | Extended with saveEdges/loadEdges per backend                      |
| **Compression**          | `src/core/compression/`        | Deterministic branch rollup + sliding-window dehydration policy    |
| **Strategy Selection**   | `src/core/reasoning/strategies/` | Sequential vs Tree-of-Thought (BFS/beam) dispatch via StrategyFactory |
| **Calibrated Evaluation**| `src/core/evaluator/`          | Decomposed signals/stats/patterns + Beta(2,2) calibration (Brier, ECE) |
| **Tool Interleave**     | `src/core/tools/`              | Suspend/resume flow: ThoughtProcessor suspends on tool_call, LLM resumes via token |
| **Outcome Recording**   | `src/core/HistoryManager.ts`   | Records tool_call/tool_observation outcomes with metadata when outcomeRecording flag on |

## CODE MAP

| Symbol                              | Type      | Location                                 | Role                                                                                 |
| ----------------------------------- | --------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| `ToolAwareSequentialThinkingServer` | class     | src/lib.ts                               | Main server: DI wiring, MCP tool registration, lifecycle                             |
| `createServer`                      | function  | src/lib.ts                               | Async factory with persistence + discovery                                           |
| `initializeServer`                  | function  | src/lib.ts                               | Convenience factory with config + logger + watchers                                  |
| `HistoryManager`                    | class     | src/core/HistoryManager.ts               | Coordinates history + branching + session partitioning. Delegates to EdgeEmitter, PersistenceBuffer, SessionManager. Ownership enforced on all mutating methods including `clear()`. TTL eviction (30min), LRU (100 max). |
| `IHistoryManager`                   | interface | src/core/IHistoryManager.ts              | History manager contract (8 methods + session lifecycle)                                                 |
| `ThoughtProcessor` | class | src/core/ThoughtProcessor.ts | Validate → normalize → persist → format → evaluate → strategy → hints pipeline (798L) |
| `ThoughtEvaluator` | class | src/core/ThoughtEvaluator.ts | Stateless quality signals + reasoning analytics (150L) |
| `normalizeInput`                    | function  | src/core/InputNormalizer.ts              | Field correction, default filling, sanitization of `branch_id`, step-level urgency phrase stripping (460L) |
| `ThoughtFormatter` | class | src/core/ThoughtFormatter.ts | Chalk display: 💭🔄🌿🔬✅🔍🧬🧠📝 (264L) |
| `ThoughtData` | interface | src/core/thought.ts | Core data structure with 11 optional reasoning fields + `retracted` boolean. Now derived from `v.InferOutput<SequentialThinkingSchema>` (single source of truth). (262L) |
| `ThoughtType`                       | union     | src/core/reasoning.ts                    | `'regular'\|'hypothesis'\|'verification'\|'critique'\|'synthesis'\|'meta'\|'tool_call'\|'tool_observation'\|'assumption'\|'decomposition'\|'backtrack'` |
| `ConfidenceSignals`                 | interface | src/core/reasoning.ts                    | Computed quality indicators (depth, revision count, type distribution)               |
| `ReasoningStats`                    | interface | src/core/reasoning.ts                    | Aggregated session analytics (totals, hypothesis chains, averages)                   |
| `PatternName`                      | union     | src/core/reasoning.ts                    | 6 pattern name variants for `PatternSignal.pattern` (consecutive_without_verification, unverified_hypothesis, etc.) |
| `SequentialThinkingError` | class | src/errors.ts | Base error (20 subclasses + `ValidationError` with `field`, each with unique `code`). Module exports `ERROR_CODES` const (22 codes), `ErrorCode` union, `isErrorCode()` type guard, `getErrorMessage()` helper. (829L) |
| `BaseRegistry<T>`                   | class     | src/registry/BaseRegistry.ts             | Generic CRUD + discovery + cache + frontmatter                                       |
| `ToolRegistry`                      | class     | src/registry/ToolRegistry.ts             | MCP tool discovery (extends BaseRegistry)                                            |
| `SkillRegistry`                     | class     | src/registry/SkillRegistry.ts            | Claude skill discovery(extends BaseRegistry)                                         |
| `StreamableHttpTransport`           | class     | src/transport/StreamableHttpTransport.ts | MCP Streamable HTTP transport (stateful/stateless)                                   |
| `SseTransport`                      | class     | src/transport/SseTransport.ts            | SSE transport for multi-user streaming                                               |
| `HttpTransport`                     | class     | src/transport/HttpTransport.ts           | HTTP JSON-RPC transport (stateless)                                                  |
| `DIContainer`                       | class     | src/di/Container.ts                      | IoC container (singleton/transient/lazy, circular detection). `resolveDynamic(name)` escape hatch replaces deprecated `resolve<T>(string)` overload. |
| `ServiceRegistry`                   | interface | src/di/ServiceRegistry.ts                | Typed service key map (18 services: `ToolRegistry: ToolRegistry` concrete; includes EdgeStore, reasoningStrategy, outcomeRecorder, calibrator, summaryStore, compressionService, suspensionStore) |
| `DiscoveryCache`                    | class     | src/cache/DiscoveryCache.ts              | LRU+TTL cache (TTL 300s, max 100 entries)                                            |
| `Metrics`                           | class     | src/metrics/Metrics.impl.ts              | Prometheus counters, gauges, histograms                                              |
| `ConfigLoader`                      | class     | src/config/ConfigLoader.ts               | YAML + env var config (env > project > user > defaults)                              |
| `ConnectionPool`                    | class     | src/pool/ConnectionPool.ts               | Multi-user session isolation with timeouts                                           |
| `EdgeKind`                          | union     | src/core/graph/Edge.ts                   | 8 edge kinds: sequence/branch/merge/verifies/critiques/derives_from/tool_invocation/revises |
| `Edge`                              | interface | src/core/graph/Edge.ts                   | DAG edge with id, from, to, kind, sessionId, createdAt, metadata                     |
| `EdgeStore`                         | class     | src/core/graph/EdgeStore.ts              | Per-session edge CRUD with adjacency Maps (byId, outgoing, incoming). Implements IEdgeStore. |
| `GraphView`                         | class     | src/core/graph/GraphView.ts              | Read-only graph traversal: chronological, topological (Kahn's), ancestors, descendants, leaves, branchThoughts |
| `IEdgeStore`                        | interface | src/contracts/interfaces.ts              | Edge store contract (7 methods: addEdge, getEdge, outgoing, incoming, edgesForSession, clearSession, size) |
| `InvalidEdgeError`                  | class     | src/errors.ts                            | Thrown on self-edges. Code: `INVALID_EDGE`                                           |
| `CycleDetectedError`                | class     | src/errors.ts                            | Thrown by GraphView.topological() on cyclic graphs. Code: `CYCLE_DETECTED`           |
| `generateUlid`                      | function  | src/core/ids.ts                          | Timestamp base36 + random hex ID generator. Module also exports `SESSION_ID_PATTERN` regex + `MAX_SESSION_ID_LENGTH` (=100) constant. |
| `IReasoningStrategy`                | interface | src/contracts/strategy.ts                | Strategy contract: `decideNext(ctx) → StrategyDecision`. Pure policy, no mutable state |
| `SequentialStrategy`                | class     | src/core/reasoning/strategies/SequentialStrategy.ts | Default linear strategy: emit next thought in chain                          |
| `TreeOfThoughtStrategy`             | class     | src/core/reasoning/strategies/TreeOfThoughtStrategy.ts | BFS/beam ToT: scores frontier, selects beam, detects plateau (178L)      |
| `StrategyFactory`                   | function  | src/core/reasoning/strategies/StrategyFactory.ts | Factory dispatch: returns strategy based on `reasoningStrategy` flag (`sequential`/`tot`) |
| `scoreThought`                      | function  | src/core/reasoning/strategies/totScoring.ts | Heuristic scoring of a thought (confidence × novelty × type weight)               |
| `selectBeam`                        | function  | src/core/reasoning/strategies/totScoring.ts | Top-k beam selection from scored frontier                                         |
| `breadthFirstFrontier`              | function  | src/core/reasoning/strategies/totScoring.ts | Compute next BFS frontier from graph leaves                                       |
| `detectPlateau`                     | function  | src/core/reasoning/strategies/plateau.ts | Plateau detection: returns true when score gain falls below threshold              |
| `Summary`                           | interface | src/core/compression/Summary.ts          | Branch rollup record: id, branchId, sourceThoughts, summary text, createdAt          |
| `ISummaryStore`                     | interface | src/contracts/summary.ts                 | Summary CRUD contract (add, get, listForBranch, clearSession)                        |
| `InMemorySummaryStore`              | class     | src/core/compression/InMemorySummaryStore.ts | In-memory `ISummaryStore` impl with per-session Maps                              |
| `CompressionService`                | class     | src/core/compression/CompressionService.ts | Deterministic branch rollup: collapses cold branches into Summary records (197L)   |
| `DehydrationPolicy`                 | class     | src/core/compression/DehydrationPolicy.ts | Sliding-window policy: decides which branches/thoughts to dehydrate                 |
| `SignalComputer` | class | src/core/evaluator/SignalComputer.ts | Stateless `ConfidenceSignals` computation (extracted from ThoughtEvaluator). Uses `roundToPrecision()` for FP-safe averages. |
| `Aggregator` | class | src/core/evaluator/Aggregator.ts | `ReasoningStats` aggregation: hypothesis chains, type distributions, averages. Uses `roundToPrecision()` for FP-safe averages. |
| `PatternDetector` | class | src/core/evaluator/PatternDetector.ts | 6 pattern detectors (all emit `warning` severity): consecutive_without_verification, unverified_hypothesis, monotonic_type, no_alternatives_explored, confidence_drift, healthy_verification (`info`-only). (262L) |
| `Calibrator`                        | class     | src/core/evaluator/Calibrator.ts         | Beta(2,2) priors + Brier score + ECE for confidence calibration (302L)               |
| `ICalibrator`                       | interface | src/contracts/calibrator.ts              | Calibrator contract + `CalibrationMetrics`, `CalibrationResult` types                 |
| `InMemorySuspensionStore`           | class     | src/core/tools/InMemorySuspensionStore.ts | Per-session tool suspension with TTL expiry, periodic sweep (150L) |
| `ISuspensionStore`                  | interface | src/contracts/suspension.ts              | Suspension contract: suspend, resume, peek, expire, clearSession, size, start/stop |
| `SuspensionRecord`                  | interface | src/contracts/suspension.ts              | Suspension data: token, sessionId, toolCallThoughtNumber, toolName, toolArguments, timestamps |
| `SuspensionNotFoundError`           | class     | src/errors.ts                            | Thrown when resuming with unknown token. Code: `SUSPENSION_NOT_FOUND` |
| `SuspensionExpiredError`            | class     | src/errors.ts                            | Thrown when resuming an expired suspension. Code: `SUSPENSION_EXPIRED` |
| `InvalidToolCallError`              | class     | src/errors.ts                            | Thrown for invalid tool_call thoughts. Code: `INVALID_TOOL_CALL` |
| `InvalidBacktrackError`             | class     | src/errors.ts                            | Thrown for invalid backtrack thoughts. Code: `INVALID_BACKTRACK` |
| `EdgeEmitter`                       | class     | src/core/EdgeEmitter.ts                  | Extracted from HistoryManager: edge creation, _resolveThoughtId (searches history + branches), _addEdgeIfValid |
| `PersistenceBuffer`                 | class     | src/core/PersistenceBuffer.ts            | Extracted from HistoryManager: write buffer, flush timer, batched persistence |
| `SessionManager`                    | class     | src/core/SessionManager.ts               | Extracted from HistoryManager: session lifecycle, TTL eviction, LRU tracking |
| `SessionId` / `ThoughtId` / `EdgeId` / `BranchId` / `SuspensionToken` / `SummaryId` | branded types | src/contracts/ids.ts | Branded ID types preventing wrong-ID-passing. `asBranchId()` constructor validates branch IDs. `SessionId` + `ThoughtData` branded end-to-end through HistoryManager. `generateThoughtId/EdgeId/SuspensionToken/SummaryId` wrap `generateUlid`. |
| `GLOBAL_SESSION_ID`                | constant  | src/contracts/ids.ts                     | Branded `SessionId` constant replacing literal `'__global__'` for stdio/global session path. |
| `ValidatedThought`                 | union     | src/core/thought.ts                      | Discriminated union over 7 thought-type variants for exhaustive type-narrowed handling. |
| `assertNever`                      | function  | src/utils.ts                             | Exhaustiveness helper: throws on unreachable union branches. |
| `FeatureFlags`                     | interface | src/contracts/features.ts                | 7 readonly feature flags (dagEdges, reasoningStrategy, calibration, compression, toolInterleave, newThoughtTypes, outcomeRecording). Feature flags gate write paths only; EdgeStore always registered in DI. |
| `ITransport`                       | interface | src/contracts/transport.ts               | Shared transport lifecycle: `kind`, `connect`, `stop`, `clientCount`, `isShuttingDown`, `serverUrl`. |
| `stripUrgencyPhrases`              | function  | src/sanitize.ts                          | Strips urgency/imperative phrases (URGENT, IMMEDIATELY, etc.) from strings to prevent prompt injection. Used by `sanitizeRationale` and `sanitizeStepField`. |
| `sanitizeStepField`                | function  | src/sanitize.ts                          | Sanitizes step-level fields (`step_description`, `expected_outcome`, `meta_observation`, `next_step_conditions`). Combines `sanitizeString` + `stripUrgencyPhrases` + 4000-char cap. |

## CONVENTIONS

- **Async-First**: All I/O and discovery is async.
- **Factory Pattern**: `createServer()`, `createPersistenceBackend()`, `createStreamableHttpTransport()` etc.
- **DI**: Inject via `src/di` container; typed via `ServiceRegistry` (18 keys); no global state.
- **Error Handling**: `SequentialThinkingError` hierarchy (20 subclasses + `ValidationError` with `field`); never swallow.
- **Contracts Module**: Cross-module type imports go through `src/contracts/` — single coupling point. `IHistoryManager` + `ThoughtData` live in `src/core/`.
- **No Barrels**: Submodules import directly from source files. No barrel re-exports anywhere.
- **ESM-only**: `"type": "module"`, imports use `.js` extensions.
- **Valibot**: Validation uses `valibot` (not zod/joi). Schemas in `src/schema.ts`.
- **Tabs**: Prettier configured for tabs (tabWidth 2), single quotes, printWidth 100.
- **`override` keyword**: Required by `noImplicitOverride`.
- **Private `_` prefix**: `_container`, `_logger`, `_historyManager` etc.
- **Unused params `_`**: ESLint `argsIgnorePattern: '^_'`.
- **JSDoc**: All public APIs have full TSDoc with `@example`, `@param`, `@returns`.
- **Session Isolation & Ownership**: `session_id` on ThoughtData scopes history, branches, and stats to isolated sessions. Omit for backward-compatible global behavior. `reset_state: true` clears session before processing. All mutating methods (including `clear()`/`clearSession()`) enforce ownership via `_getSession()`, throwing `SessionAccessDeniedError` on cross-owner access. Stdio path (no owner) is unrestricted.
- **Feature Flags**: 7 flags (dagEdges, reasoningStrategy `'sequential'\|'tot'`, calibration, compression, toolInterleave, newThoughtTypes, outcomeRecording). All default off (reasoningStrategy defaults to `sequential`). Env vars: `TRACELATTICE_FEATURES_*`. Flag gates write path only; EdgeStore always registered in DI.
- **Strategy Purity**: `IReasoningStrategy` implementations are pure policies. No mutable state, no I/O. Decisions derived from `StrategyContext` (graph snapshot + history).

## ANTI-PATTERNS (THIS PROJECT)

- **No `as any`**: Strict type safety. ESLint `no-explicit-any` = warn.
- **No `@ts-ignore` / `@ts-expect-error`**: Fix type issues properly.
- **No Global State**: Use the DI container. `AsyncLocalStorage` for request context.
- **No Sync I/O**: Use async equivalents (except strictly sync startup).
- **No Empty Catch**: Never swallow errors. All catch blocks log, rethrow, or collect.
- **No Barrel Re-exports**: All re-exports are forbidden. Import directly from source files.
- **Entry Points**: `src/lib.ts` is the library entry point and public API; `src/cli.ts` is CLI entry. Don't mix.
- **Max CC 25**: Cyclomatic complexity per function (enforced by sentrux).
- **Max function 100 lines**: Function length limit (enforced by sentrux).

## SETUP NOTES

- **CI**: `.github/workflows/ci.yml` — Node 22.x + 24.x matrix. Hard gates: type-check, test+coverage, build. Soft gates (continue-on-error): lint, audit.
- **Coverage**: 2100 tests (80 files, 16 skipped). Thresholds: branches 90%, functions 60%, lines 65%, statements 65%.
- **Test Helpers**: `src/__tests__/helpers/factories.ts` — `createTestThought()`, `MockHistoryManager`. `src/__tests__/helpers/timers.ts` — timer helpers.
- **Large Files**: `errors.ts` (829L), `ThoughtProcessor.ts` (798L), `schema.ts` (724L), `StreamableHttpTransport.ts` (712L), `lib.ts` (659L), `HistoryManager.ts` (572L), `ServerConfig.ts` (517L), `SseTransport.ts` (485L), `ConnectionPool.ts` (466L), `metrics.impl.ts` (470L).
- **Architectural Layers**: `.sentrux/rules.toml` — 9 layers (types→crosscutting→config→core→domain→infrastructure→di→app→cli), 6 forbidden boundaries.
- **Duplicate env files**: Both `.env.example` (minimal) and `.example.env` (full) exist — non-standard.

## COMMANDS

```bash
npm run build       # rslib build && rsbuild build -c rsbuild.config.ts && node scripts/postbuild-cli.mjs
npm run start       # bun dist/cli.js
npm run dev         # bunx @modelcontextprotocol/inspector dist/cli.js
npm test            # vitest run (2100 tests)
npm run test:coverage # vitest run --coverage
npm run type-check  # tsc --noEmit
npm run lint        # eslint src/
```
