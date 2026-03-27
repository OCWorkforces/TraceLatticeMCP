# TESTING MODULE

**Updated:** 2026-03-27
**Parent:** ../AGENTS.md

## OVERVIEW

Test suite using Vitest with V8 coverage. 870+ tests across 31 test files. Coverage: 81.95% statements.

## STRUCTURE

```
src/__tests__/
├── helpers/              # Shared test utilities (helpers/index.ts)
├── sequentialthinking-tools.test.ts  # Main integration test (1076L)
├── streamable-http-transport.test.ts # Streamable HTTP tests (869L)
├── sse-transport.test.ts             # SSE transport tests (758L)
├── container.test.ts                 # DI container tests (712L)
├── persistence.test.ts               # Persistence backend tests (615L)
├── base-registry.test.ts             # BaseRegistry tests (609L)
└── [module].test.ts                  # Other module tests
```

## PATTERNS

- **Aggregation**: All tests collected in `src/__tests__/`, co-located with source.
- **Helpers**: `src/__tests__/helpers/index.ts` — shared utilities (createTestThought, etc.).
- **Mocking**: Manual dependency injection via container or constructor.
- **Coverage**: V8 provider, thresholds at branches 55%, functions 60%, lines 65%.

## COMMANDS

`npm test` (all), `npm run test:coverage` (report).
