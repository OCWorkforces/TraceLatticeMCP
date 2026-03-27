# TELEMETRY MODULE

**Generated:** 2026-03-09
**Parent:** ../AGENTS.md

## OVERVIEW

OpenTelemetry integration for distributed tracing. Optional, opt-in observability with multiple exporter support.

## STRUCTURE

```
src/telemetry/
├── Telemetry.ts     # Core telemetry class with span management
└── __tests__/       # Module tests
```

## WHERE TO LOOK

| Task               | Location                      | Notes                                  |
| ------------------ | ----------------------------- | -------------------------------------- |
| **Span creation**  | `Telemetry.ts`                 | `startSpan()` returns span with `end()` |
| **Configuration**  | `Telemetry.ts`                 | `TelemetryOptions` interface           |
| **Testing**        | `__tests__/Telemetry.test.ts` | Unit tests                             |
## API

```typescript
const telemetry = new Telemetry({
	serviceName: 'trace-lattice',
	enabled: true,
	maxSpans: 1000,
	logger: loggerInstance,
});

// Start a span
const span = telemetry.startSpan('operation', 'SERVER', { key: 'value' });
// ... do work ...
span.end(); // Captures duration, marks complete

// Query spans
const spans = telemetry.getSpans();
```

## CONVENTIONS

- **Opt-in**: Disabled by default (`enabled: false`).
- **Async APIs**: Always use async initialization to avoid blocking.
- **Short-lived spans**: Spans must end when work completes.
- **No external deps**: OpenTelemetry packages are optional peer dependencies.

## SPAN KINDS

| Kind     | Use Case                         |
| -------- | -------------------------------- |
| SERVER   | Incoming requests, server init   |
| CLIENT   | Outgoing requests, transport ops |
| CONSUMER | Processing operations            |
| PRODUCER | Background tasks, discovery      |
| INTERNAL | Low-level operations             |

## ANTI-PATTERNS

- **BAD**: Synchronous tracing setup (blocks initialization)
- **BAD**: Long-lived spans without explicit `end()` call
