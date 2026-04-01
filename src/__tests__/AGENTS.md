# TESTING MODULE

**Updated:** 2026-03-31
**Commit:** 509ece3

## OVERVIEW

Test suite using Vitest with V8 coverage. 1006 tests across 35 test files. Coverage: 83.47% statements.

## STRUCTURE

```
src/__tests__/
├── helpers/              # Shared test utilities (helpers/index.ts)
├── tracelattice.test.ts  # Main integration test (1076L)
├── streamable-http-transport.test.ts # Streamable HTTP tests (869L)
├── sse-transport.test.ts             # SSE transport tests (758L)
├── container.test.ts                 # DI container tests (712L)
├── persistence.test.ts               # Persistence backend tests (615L)
├── base-registry.test.ts             # BaseRegistry tests (609L)
├── thought-evaluator.test.ts         # ThoughtEvaluator quality signal tests
└── [module].test.ts                  # Other module tests
```

## PATTERNS

- **Aggregation**: All tests collected in `src/__tests__/`, co-located with source.
- **Helpers**: `src/__tests__/helpers/index.ts` — shared utilities (createTestThought, MockHistoryManager, etc.).
- **Mocking**: Manual dependency injection via container or constructor.
- **Coverage**: V8 provider, thresholds at branches 55%, functions 60%, lines 65%, statements 65%.

## COMMANDS

`npm test` (all), `npm run test:coverage` (report).
