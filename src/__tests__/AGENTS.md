# TESTING MODULE

**Generated:** 2026-01-26
**Parent:** ../AGENTS.md

## OVERVIEW

Test suite using Vitest with V8 coverage. 380+ tests.

## STRUCTURE

```
src/__tests__/
├── unit/             # (Implied) schema.test.ts, container.test.ts
├── integration/      # sequentialthinking-tools.test.ts
├── e2e/              # integration.test.ts
└── [module].test.ts  # Co-located tests logic
```

## PATTERNS

- **Co-location**: Tests often sit near source, but `src/__tests__` aggregates them here.
- **Helpers**: Inline helpers (createTestThought) - no shared helper file yet.
- **Mocking**: Manual dependency injection via container or constructor.

## COMMANDS

`npm test` (all), `npm run test:coverage` (report).
