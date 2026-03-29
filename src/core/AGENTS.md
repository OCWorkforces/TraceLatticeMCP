# CORE MODULE

**Created:** 2026-03-29
**Parent:** ../AGENTS.md

## OVERVIEW

Domain heart of the project. Thought processing pipeline, history management, branching model, and core data types. Highest centrality (26 incoming references from non-test code).

## STRUCTURE

```
src/core/
├── HistoryManager.ts      # Thought history, branching, buffered persistence (755L)
├── IHistoryManager.ts     # History manager contract (8 methods)
├── ThoughtProcessor.ts    # Validate → normalize → persist → format pipeline (243L)
├── InputNormalizer.ts     # Fixes LLM field mistakes, fills defaults (303L)
├── ThoughtFormatter.ts    # Display formatting with chalk 💭/🔄/🌿 (188L)
├── thought.ts             # ThoughtData interface (86L)
└── step.ts                # StepRecommendation interface (50L)
```

## WHERE TO LOOK

| Task                    | Location                           | Notes                                                                                                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **Thought history**     | `HistoryManager.ts`                | Linear history + branching, FIFO trim at `maxHistorySize`                                                                       |
| **Persistence buffer**  | `HistoryManager.ts:_flushBuffer()` | Batch flush with retry + exponential backoff (70L method)                                                                       |
| **Branching**           | `HistoryManager.ts:addToBranch()`  | Branch from thought via `branch_from_thought` + `branch_id`                                                                     |
| **Processing pipeline** | `ThoughtProcessor.ts:process()`    | normalize → validate → persist → format → return                                                                                |
| **Input normalization** | `InputNormalizer.ts`               | Fixes singular→plural field names, sanitizes `branch_id`                                                                        |
| **History contract**    | `IHistoryManager.ts`               | 8 methods: addThought, getHistory, getHistoryLength, getBranches, getBranchIds, clear, getAvailableMcpTools, getAvailableSkills |

## PROCESSING PIPELINE

```
LLM MCP tool call
       │
       ▼
ThoughtProcessor.process(input)
       │
       ├── 1. normalizeInput()        — InputNormalizer.ts
       │      Fixes LLM field mistakes (singular→plural), fills defaults
       │
       ├── 2. validateInput()         — ThoughtProcessor.ts
       │      Auto-adjusts total_thoughts if thought_number exceeds it
       │
       ├── 3. historyManager.addThought()  — HistoryManager.ts
       │      Appends to history, creates branch if branch_id set,
       │      buffers for persistence
       │
       ├── 4. thoughtFormatter.formatThought()  — ThoughtFormatter.ts
       │      Chalk display: 💭 Thought / 🔄 Revision / 🌿 Branch
       │
       └── 5. Returns CallToolResult JSON
```

## KEY SYMBOLS

| Symbol                 | Type      | Lines | Role                                                                                                                              |
| ---------------------- | --------- | ----- | --------------------------------------------------------------------------------------------------------------------------------- |
| `HistoryManager`       | class     | 755   | History + branching + buffered persistence. 14 private fields, 4 concerns: linear history, branching, persistence buffer, metrics |
| `HistoryManagerConfig` | interface | ~50   | 10 config options (maxHistorySize, maxBranches, maxBranchSize, persistence, etc.)                                                 |
| `IHistoryManager`      | interface | 97    | 8-method contract for decoupling + testability                                                                                    |
| `ThoughtData`          | interface | 86    | Core data structure: thought_number, total_thoughts, next_thought_needed, branches, tools/skills                                  |
| `ThoughtProcessor`     | class     | 243   | Pipeline orchestrator. Holds historyManager + formatter references                                                                |
| `normalizeInput`       | function  | 303   | Field correction, default filling, branch_id sanitization                                                                         |
| `sanitizeBranchId`     | function  | —     | Path traversal prevention for branch IDs                                                                                          |
| `ThoughtFormatter`     | class     | 188   | Chalk-based console output                                                                                                        |
| `StepRecommendation`   | interface | 50    | Step with tools + skills recommendations                                                                                          |

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
