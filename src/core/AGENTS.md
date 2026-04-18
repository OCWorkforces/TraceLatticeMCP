# CORE MODULE

**Updated:** 2026-04-18
**Commit:** 906f363

## OVERVIEW

Domain heart of the project. Thought processing pipeline, history management, branching model, quality evaluation, reasoning types, and core data types. Highest centrality (26+ incoming references from non-test code).

## STRUCTURE

```
src/core/
├── HistoryManager.ts      # Thought history, branching, session partitioning, buffered persistence (1280L)
├── IHistoryManager.ts     # History manager contract (8 methods + session lifecycle) (108L)
├── ThoughtProcessor.ts    # Validate → normalize → persist → format → evaluate pipeline (679L)
├── ThoughtEvaluator.ts    # Stateless quality signals + reasoning analytics (130L)
├── ThoughtFormatter.ts    # Display formatting with chalk 💭🔄🌿🔬✅🔍🧬🧠📝 (256L)
├── InputNormalizer.ts     # Fixes LLM field mistakes, fills defaults (478L)
├── sanitize.ts            # Input sanitization utilities
├── thought.ts             # ThoughtData interface with reasoning fields (253L)
├── reasoning.ts           # ThoughtType union (11 types), ConfidenceSignals, ReasoningStats (212L)
├── ids.ts                 # ULID-based ID generation + `SESSION_ID_PATTERN` regex + `MAX_SESSION_ID_LENGTH` (=100) constant (26L)
├── step.ts                # StepRecommendation interface (50L)
├── graph/                 # DAG edges: Edge types, EdgeStore, GraphView traversal
│   ├── Edge.ts            # Edge kinds (8 types), Edge interface (60L)
│   ├── EdgeStore.ts       # Per-session edge CRUD with adjacency Maps (216L)
│   └── GraphView.ts       # Read-only graph traversal (topological, ancestors, etc.) (326L)
├── evaluator/             # Decomposed quality evaluation
│   ├── SignalComputer.ts  # ConfidenceSignals computation (174L)
│   ├── Aggregator.ts      # ReasoningStats aggregation (82L)
│   ├── PatternDetector.ts # 6 pattern detectors (262L)
│   ├── Calibrator.ts      # Beta(2,2) calibration, Brier score, ECE (299L)
│   └── internals.ts       # Shared evaluator internals (83L)
├── compression/           # Branch rollup + dehydration
│   ├── CompressionService.ts   # Deterministic branch rollup (202L)
│   ├── DehydrationPolicy.ts    # Sliding-window dehydration (131L)
│   ├── InMemorySummaryStore.ts # In-memory ISummaryStore (205L)
│   └── Summary.ts              # Branch rollup record (55L)
├── reasoning/             # Reasoning strategies
│   ├── OutcomeRecorder.ts # Tool outcome recording (113L)
│   └── strategies/        # Strategy implementations
│       ├── SequentialStrategy.ts    # Default linear (72L)
│       ├── TreeOfThoughtStrategy.ts # BFS/beam ToT (178L)
│       ├── StrategyFactory.ts       # Factory dispatch (53L)
│       ├── totScoring.ts            # Heuristic scoring + beam selection (216L)
│       └── plateau.ts               # Plateau detection (33L)
└── tools/                 # Tool interleave support
    └── InMemorySuspensionStore.ts # Per-session tool suspension with TTL (150L)
```

## WHERE TO LOOK

| Task                    | Location                           | Notes                                                                                                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Thought history**     | `HistoryManager.ts`                | Linear history + branching per session via `Map<string, SessionState>`. TTL eviction (30min), LRU (100 sessions max).            |
| **Persistence buffer**  | `HistoryManager.ts:_flushBuffer()` | Session-scoped write buffers, batch flush with retry + exponential backoff (70L method)                                          |
| **Session isolation**   | `HistoryManager.ts:_getSession()`  | Per-session state via `__global__` default. `session_id` on ThoughtData routes to session. `reset_state` clears session.         |
| **Processing pipeline** | `ThoughtProcessor.ts:process()`    | normalize → validate → session routing → persist → format → evaluate → tool interleave (suspend/resume) → return                 |
| **Quality signals**     | `ThoughtEvaluator.ts`              | Delegates to `evaluator/` submodules: `computeConfidenceSignals` and `computeReasoningStats`                                     |
| **Input normalization** | `InputNormalizer.ts`               | Fixes singular→plural field names, sanitizes `branch_id`, validates `session_id`                                                 |
| **Reasoning types**     | `reasoning.ts` + `ids.ts` (26L)    | ThoughtType (11 variants), ConfidenceSignals, ReasoningStats; ULID-based ID generation                                          |
| **Core data**           | `thought.ts`                       | ThoughtData with optional reasoning fields including `session_id` and `reset_state`                                              |
| **History contract**    | `IHistoryManager.ts`               | 11 methods: 8 base + `clearSession()`, `getSessionIds()`, `getSessionCount()`                                                    |
| **DAG / Graph**         | `src/core/graph/`                  | Multi-parent thought edges, graph traversal (topological, ancestors, descendants, leaves)                                       |
| **Edge Persistence**    | `src/persistence/`                 | `saveEdges`/`loadEdges` per backend                                                                                              |
| **Compression**         | `src/core/compression/`            | Deterministic branch rollup + sliding-window dehydration policy                                                                 |
| **Strategy Selection**  | `src/core/reasoning/strategies/`   | Sequential vs Tree-of-Thought (BFS/beam) dispatch via `StrategyFactory`                                                         |
| **Calibrated Evaluation** | `src/core/evaluator/`            | Decomposed `SignalComputer`, `Aggregator`, `PatternDetector`, `Calibrator` (Beta(2,2), Brier, ECE)                              |
| **Tool Interleave**     | `src/core/tools/`                  | Suspend/resume flow: `ThoughtProcessor` suspends on `tool_call`, LLM resumes via token                                           |
| **Outcome Recording**   | `src/core/reasoning/OutcomeRecorder.ts` | Records tool outcomes (`tool_call`/`tool_observation`) with metadata when `outcomeRecording` flag on                        |

## PROCESSING PIPELINE

```
LLM MCP tool call
       │
       ▼
ThoughtProcessor.process(input)
       │
       ├── 1. normalizeInput()        — InputNormalizer.ts
       │      Fixes LLM field mistakes (singular→plural), fills defaults,
       │      normalizes reasoning fields (thought_type, confidence, etc.)
       │
       ├── 2. validateInput()         — ThoughtProcessor.ts
       │      Auto-adjusts total_thoughts if thought_number exceeds it
       │
       ├── 3. historyManager.addThought()  — HistoryManager.ts
       │      Routes to session via thought.session_id (defaults to __global__)
       │      Appends to session-scoped history, creates branch if branch_id set,
       │      buffers for session-scoped persistence. Respects reset_state flag.
       │
       ├── 4. thoughtFormatter.formatThought()  — ThoughtFormatter.ts
       │      Chalk display for 11 types: 💭 Thought / 🔄 Revision / 🌿 Branch
       │      / 🔬 Hypothesis / ✅ Verification / 🔍 Critique
       │      / 🧬 Synthesis / 🧠 Meta / 🛠️ tool_call / 👁️ tool_observation
       │      / 💡 assumption / 📊 decomposition / ↩️ backtrack
       │
       ├── 5. evaluator.computeConfidenceSignals()  — ThoughtEvaluator.ts → evaluator/SignalComputer.ts
       │      Stateless quality signals: reasoning_depth, revision_count,
       │      thought_type_distribution, has_hypothesis, has_verification
       │
       ├── 5a. Tool interleave (toolInterleave flag) — tools/InMemorySuspensionStore.ts
       │      If thought_type === 'tool_call': suspend session, return resume token
       │
       ├── 5b. Tool resume                            — tools/InMemorySuspensionStore.ts
       │      If thought_type === 'tool_observation': resume from suspension token
       │
       ├── 6. evaluator.computeReasoningStats()  — ThoughtEvaluator.ts → evaluator/Aggregator.ts
       │      Session analytics: totals, hypothesis chains, averages
       │
       └── 7. Returns CallToolResult JSON
```

## KEY SYMBOLS

| Symbol                 | Type      | Lines | Role                                                                                                                              |
| ---------------------- | --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `HistoryManager`       | class     | 1280  | History + branching + session partitioning via `Map<string, SessionState>`. TTL eviction (30min), LRU (100 sessions max). 14 private fields, 5 concerns: linear history, branching, session partitioning, persistence buffer, metrics |
| `HistoryManagerConfig` | interface | ~50   | 10 config options (maxHistorySize, maxBranches, maxBranchSize, persistence, etc.)                                                 |
| `IHistoryManager`      | interface | 108   | 11-method contract: 8 base + `clearSession()`, `getSessionIds()`, `getSessionCount()`. All getters accept optional `sessionId`.   |
| `ThoughtData`          | interface | 253   | Core data with optional reasoning fields including `session_id` (1-100 chars, alphanumeric/hyphen/underscore) and `reset_state`.  |
| `ThoughtProcessor`     | class     | 679   | Pipeline orchestrator. Extracts `session_id` after normalization, routes all calls session-scoped. `reset_state` clears session before processing. Handles tool interleave suspend/resume. |
| `ThoughtEvaluator`     | class     | 130   | Stateless quality signal computation + reasoning analytics. Delegates to `evaluator/` submodules. All methods pure — no side effects |
| `normalizeInput`       | function  | 478   | Field correction, default filling, branch_id sanitization, session_id validation (regex: `/^[a-zA-Z0-9_-]+$/`)                    |
| `sanitizeBranchId`     | function  | —     | Path traversal prevention for branch IDs                                                                                          |
| `ThoughtFormatter`     | class     | 256   | Chalk-based console output with per-type icons (11 types)                                                                         |
| `ThoughtType`          | union     | 212   | `'regular' \| 'hypothesis' \| 'verification' \| 'critique' \| 'synthesis' \| 'meta' \| 'tool_call' \| 'tool_observation' \| 'assumption' \| 'decomposition' \| 'backtrack'` |
| `ConfidenceSignals`    | interface | 212   | Computed quality indicators: reasoning_depth, revision_count, thought_type_distribution, has_hypothesis, has_verification         |
| `ReasoningStats`       | interface | 212   | Aggregated session analytics: totals, hypothesis chains, averages                                                                 |
| `StepRecommendation`   | interface | 50    | Step with tools + skills recommendations                                                                                          |
| `SessionState`         | interface | —     | Internal per-session container: thought_history, branches, availableMcpTools, availableSkills, writeBuffer, lastAccessedAt        |
| `DEFAULT_SESSION`      | constant  | —     | `'__global__'` — default session key, never TTL-evicted                                                                          |
| `SESSION_TTL_MS`       | constant  | —     | `30 * 60 * 1000` (30 minutes) — session idle timeout                                                                             |
| `MAX_SESSIONS`         | constant  | —     | `100` — maximum concurrent sessions before LRU eviction                                                                          |
| `EdgeKind`             | union     | 60    | 8 kinds in `graph/Edge.ts`: `sequence` / `branch` / `merge` / `verifies` / `critiques` / `derives_from` / `tool_invocation` / `revises` |
| `EdgeStore`            | class     | 216   | Per-session edge CRUD with adjacency Maps (byId, outgoing, incoming). Implements `IEdgeStore`.                                    |
| `GraphView`            | class     | 326   | Read-only graph traversal: chronological, topological (Kahn's), ancestors, descendants, leaves, branchThoughts                    |
| `CompressionService`   | class     | 202   | Deterministic branch rollup: collapses cold branches into Summary records                                                         |
| `InMemorySuspensionStore` | class  | 150   | Per-session tool suspension with TTL expiry, periodic sweep                                                                       |
| `OutcomeRecorder`      | class     | 113   | Records tool outcomes (`tool_call`/`tool_observation`) with metadata when `outcomeRecording` flag on                              |

## PERSISTENCE BUFFER LIFECYCLE

HistoryManager manages a write buffer for persistence:

1. `addThought()` → appends thought to `_writeBuffer[]`
2. `_startFlushTimer()` → periodic flush every `_persistenceFlushInterval` ms
3. `_flushBuffer()` → batch write with retry (exponential backoff: 100ms, 200ms, 400ms)
4. On failure → emits `persistenceError` event via `PersistenceEventEmitter`
5. `shutdown()` → stops timer + final flush

Config: `persistenceBufferSize`, `persistenceFlushInterval`, `persistenceMaxRetries`

## BRANCHING MODEL

- Thoughts set `branch_from_thought` + `branch_id` to create a branch
- `addToBranch()` appends to `_branches[branchId]`
- `cleanupBranches()` evicts oldest when `maxBranches` exceeded
- `trimBranchSize()` trims branch if exceeds `maxBranchSize`

## CONVENTIONS

- `IHistoryManager` lives here (not in `contracts/`) — it's core domain, not a shared infrastructure interface
- `ThoughtData` lives here — the central data type of the system
- All imports use `.js` extensions (ESM)
- Private fields prefixed `_`: `_thought_history`, `_branches`, `_writeBuffer`, etc.
- `ThoughtEvaluator` is stateless — registered as transient in DI container
- **Session Isolation**: `session_id` on ThoughtData routes to `Map<string, SessionState>`. Default key is `__global__`. Both `session_id` and `reset_state` are optional — backward compatible with global-only behavior.
- **Feature Flags**: 7 flags gate write-path behavior — `dagEdges`, `reasoningStrategy` (`'sequential'`/`'tot'`), `calibration`, `compression`, `toolInterleave`, `newThoughtTypes`, `outcomeRecording`. All default off (reasoningStrategy defaults to `sequential`).
- **Strategy Purity**: `IReasoningStrategy` implementations in `reasoning/strategies/` are pure policies — no mutable state, no I/O. Decisions derived from `StrategyContext` (graph snapshot + history).
- **Error helper**: `src/errors.ts` exports `getErrorMessage(error: unknown): string` — use instead of inline `error instanceof Error ? error.message : String(error)`.
