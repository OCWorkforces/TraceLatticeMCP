# CORE MODULE

**Updated:** 2026-03-31
**Commit:** 509ece3

## OVERVIEW

Domain heart of the project. Thought processing pipeline, history management, branching model, quality evaluation, reasoning types, and core data types. Highest centrality (26+ incoming references from non-test code).

## STRUCTURE

```
src/core/
├── HistoryManager.ts      # Thought history, branching, session partitioning, buffered persistence (970L)
├── IHistoryManager.ts     # History manager contract (8 methods)
├── ThoughtProcessor.ts    # Validate → normalize → persist → format → evaluate pipeline (421L)
├── ThoughtEvaluator.ts    # Stateless quality signals + reasoning analytics (190L)
├── ThoughtFormatter.ts    # Display formatting with chalk 💭🔄🌿🔬✅🔍🧬🧠📝 (231L)
├── InputNormalizer.ts     # Fixes LLM field mistakes, fills defaults (433L)
├── thought.ts             # ThoughtData interface with 11 optional reasoning fields (193L)
├── reasoning.ts           # ThoughtType union, ConfidenceSignals, ReasoningStats (143L)
└── step.ts                # StepRecommendation interface (50L)
```

## WHERE TO LOOK

| Task                    | Location                           | Notes                                                                                                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Thought history**     | `HistoryManager.ts`                | Linear history + branching per session via `Map<string, SessionState>`. TTL eviction (30min), LRU (100 sessions max).                        |
| **Persistence buffer**  | `HistoryManager.ts:_flushBuffer()` | Session-scoped write buffers, batch flush with retry + exponential backoff (70L method)                                              |
| **Session isolation** | `HistoryManager.ts:_getSession()` | Per-session state via `__global__` default. `session_id` on ThoughtData routes to session. `reset_state` clears session.                            |
| **Processing pipeline** | `ThoughtProcessor.ts:process()`    | normalize → validate → session routing → persist → format → evaluate → return                                                       |
| **Quality signals**     | `ThoughtEvaluator.ts`              | `computeConfidenceSignals(history, branches)` and `computeReasoningStats(history, branches)`                                    |
| **Input normalization** | `InputNormalizer.ts`               | Fixes singular→plural field names, sanitizes `branch_id`, validates `session_id`                                                     |
| **Reasoning types**     | `reasoning.ts`                     | ThoughtType (6 variants), ConfidenceSignals, ReasoningStats                                                                     |
| **Core data**           | `thought.ts`                       | ThoughtData with 13 optional fields including `session_id` and `reset_state`                                                       |
| **History contract**    | `IHistoryManager.ts`               | 11 methods: 8 base + `clearSession()`, `getSessionIds()`, `getSessionCount()`                                                    |

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
|       ├── 3. historyManager.addThought()  — HistoryManager.ts
|       │      Routes to session via thought.session_id (defaults to __global__)
|       │      Appends to session-scoped history, creates branch if branch_id set,
|       │      buffers for session-scoped persistence. Respects reset_state flag.    |
       │
       ├── 4. thoughtFormatter.formatThought()  — ThoughtFormatter.ts
       │      Chalk display: 💭 Thought / 🔄 Revision / 🌿 Branch
       │      / 🔬 Hypothesis / ✅ Verification / 🔍 Critique
       │      / 🧬 Synthesis / 🧠 Meta
       │
       ├── 5. evaluator.computeConfidenceSignals()  — ThoughtEvaluator.ts
       │      Stateless quality signals: reasoning_depth, revision_count,
       │      thought_type_distribution, has_hypothesis, has_verification
       │
       ├── 6. evaluator.computeReasoningStats()  — ThoughtEvaluator.ts
       │      Session analytics: totals, hypothesis chains, averages
       │
       └── 7. Returns CallToolResult JSON
```

## KEY SYMBOLS

| Symbol                 | Type      | Lines | Role                                                                                                                              |
| ---------------------- | --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `HistoryManager`       | class     | 970   | History + branching + session partitioning via `Map<string, SessionState>`. TTL eviction (30min), LRU (100 sessions max). 14 private fields, 5 concerns: linear history, branching, session partitioning, persistence buffer, metrics |
| `HistoryManagerConfig` | interface | ~50   | 10 config options (maxHistorySize, maxBranches, maxBranchSize, persistence, etc.)                                                 |
| `IHistoryManager`      | interface | 108   | 11-method contract: 8 base + `clearSession()`, `getSessionIds()`, `getSessionCount()`. All getters accept optional `sessionId`. |
| `ThoughtData`          | interface | 193   | Core data with 13 optional fields including `session_id` (1-100 chars, alphanumeric/hyphen/underscore) and `reset_state`.     |
| `ThoughtProcessor`     | class     | 429   | Pipeline orchestrator. Extracts `session_id` after normalization, routes all calls session-scoped. `reset_state` clears session before processing. |
| `ThoughtEvaluator`     | class     | 190   | Stateless quality signal computation + reasoning analytics. All methods pure — no side effects                                    |
| `normalizeInput`       | function  | 433   | Field correction, default filling, branch_id sanitization, session_id validation (regex: `/^[a-zA-Z0-9_-]+$/`)                           |
| `sanitizeBranchId`     | function  | —     | Path traversal prevention for branch IDs                                                                                          |
| `ThoughtFormatter`     | class     | 231   | Chalk-based console output with per-type icons (8 types)                                                                          |
| `ThoughtType`          | union     | 143   | `'regular' | 'hypothesis' | 'verification' | 'critique' | 'synthesis' | 'meta'`                                              |
| `ConfidenceSignals`    | interface | 143   | Computed quality indicators: reasoning_depth, revision_count, thought_type_distribution, has_hypothesis, has_verification         |
| `ReasoningStats`       | interface | 143   | Aggregated session analytics: totals, hypothesis chains, averages                                                                 |
| `StepRecommendation`   | interface | 50    | Step with tools + skills recommendations                                                                                          |
| `SessionState`         | interface | —     | Internal per-session container: thought_history, branches, availableMcpTools, availableSkills, writeBuffer, lastAccessedAt       |
| `DEFAULT_SESSION`      | constant  | —     | `'__global__'` — default session key, never TTL-evicted                                                                         |
| `SESSION_TTL_MS`       | constant  | —     | `30 * 60 * 1000` (30 minutes) — session idle timeout                                                                            |
| `MAX_SESSIONS`         | constant  | —     | `100` — maximum concurrent sessions before LRU eviction                                                                          |

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
