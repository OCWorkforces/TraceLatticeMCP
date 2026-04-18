# TEST SUITE

**Parent:** ../AGENTS.md

## OVERVIEW

Vitest 4.1.4 suite colocated under `src/__tests__/` (non-standard, kept inside `src/` for path alias parity). 2005 tests across 75 files, 16 skipped for known gaps. Coverage gates: branches 55%, functions 60%, lines 65%, statements 65%.

## STRUCTURE

Test files mirror the `src/` tree. `src/__tests__/core/graph/EdgeStore.test.ts` covers `src/core/graph/EdgeStore.ts`, etc.

```
helpers/         factories.ts, timers.ts, index.ts (only allowed test barrel)
core/graph/      EdgeStore, GraphView, Edge
core/reasoning/strategies/   TreeOfThought.newTypes
strategies/      TreeOfThoughtStrategy (538L), totScoring, StrategyContract
integration/     Cross-module flows
compression/     CompressionAutoTrigger
eval/fixtures/   scenarios.ts (10 canonical eval scenarios)
```

## CONVENTIONS

- **Mirror layout**: new test file path = source path with `__tests__/` inserted after `src/`.
- **No barrels** in test dirs except `helpers/index.ts`. Import other test files directly.
- **Feature flags via constructor**, never env vars in tests:
  ```ts
  const proc = new ThoughtProcessor({ historyManager: mock, dagEdges: true, calibration: true });
  ```
- **Spread overrides** for fixtures: `createTestThought({ thought_type: 'hypothesis', confidence: 0.8 })`. Only specify what the test asserts on.
- **One concern per `it`**. Group by behavior, not by method name.
- **Skipped tests** (`it.skip`) need a comment explaining the gap.
- **Async cleanup**: `await` shutdowns in `afterEach` to avoid leaking timers across files.

## HELPERS

`helpers/factories.ts`:
- `createTestThought(overrides?)`: 11 typed variants covering every `ThoughtType` (regular, hypothesis, verification, critique, synthesis, meta, tool_call, tool_observation, assumption, decomposition, backtrack). Returns a fully-valid `ThoughtData`.
- `MockHistoryManager`: in-memory `Map`-backed `IHistoryManager`. Use it instead of stubbing the real one when persistence isn't under test.
- `createMockFormatter()`: capture-only formatter for assertions on display output.

`helpers/timers.ts` wraps Vitest timer APIs:
- `useFakeTimers()` / `useRealTimers()`: pair them in `beforeEach` / `afterEach`.
- `advanceTime(ms)`: thin wrapper over `vi.advanceTimersByTimeAsync` that also flushes microtasks, keeping suspension TTL and persistence buffer flush tests deterministic.
