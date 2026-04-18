# TESTING MODULE

**Updated:** 2026-04-18
**Commit:** 906f363

## OVERVIEW

Test suite using Vitest with V8 coverage. 1913 tests across 74 test files (16 skipped).

## STRUCTURE

```
src/__tests__/
├── helpers/                    # Shared test utilities (factories, timers, mocks)
├── core/                       # Core module tests
│   ├── graph/                  # Graph/DAG tests
│   ├── reasoning/              # Reasoning strategy tests
│   │   └── strategies/         # Strategy-specific tests
│   └── tools/                  # Tool interleave tests
├── integration/                # Integration tests
├── compression/                # Compression tests
├── strategies/                 # Strategy tests
├── calibrator/                 # Calibration tests
├── config/                     # Config tests
├── eval/                       # Evaluation harness (gated by RUN_EVAL=1)
├── evaluator/                  # Evaluator submodule tests
├── thought-processor.test.ts   # Thought processing pipeline tests (1643L)
├── sequentialthinking-tools.test.ts # Main integration test (1364L)
├── sse-transport-cov.test.ts   # SSE coverage tests (1180L)
├── streamable-http-cov.test.ts # Streamable HTTP coverage tests (1035L)
├── history-manager.test.ts     # History management tests (1036L)
├── history-manager-cov.test.ts # History manager coverage tests
├── thought-evaluator.test.ts   # Thought evaluator tests
├── skill-registry.test.ts      # Skill registry tests (934L)
├── streamable-http-transport.test.ts # Streamable HTTP tests (869L)
├── tool-registry-cov.test.ts   # Tool registry coverage tests (851L)
├── input-normalizer.test.ts    # Input normalization tests (934L)
├── sse-transport.test.ts       # SSE transport tests (758L)
├── thought-formatter.test.ts   # Thought formatting tests (716L)
├── container.test.ts           # DI container tests (712L)
├── persistence.test.ts         # Persistence backend tests (713L)
├── base-registry.test.ts       # BaseRegistry tests (680L)
├── schema.test.ts              # Valibot schema tests (652L)
├── lib-server.test.ts          # Server lifecycle tests (359L)
├── metrics-integration.test.ts # Metrics integration tests (598L)
└── [module].test.ts            # Other module tests
```

## PATTERNS

- **Aggregation**: All tests collected in `src/__tests__/`, co-located with source.
- **Helpers**: `src/__tests__/helpers/index.ts` — shared utilities (createTestThought with 11 ThoughtType variants, MockHistoryManager, timer helpers).
- **Mocking**: Manual dependency injection via container or constructor.
- **Coverage**: V8 provider, thresholds at branches 55%, functions 60%, lines 65%, statements 65%.

## COMMANDS

`npm test` (all), `npm run test:coverage` (report).
