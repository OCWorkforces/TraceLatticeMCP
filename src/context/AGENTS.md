# CONTEXT MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

Request context management using Node.js `AsyncLocalStorage` for zero-cost correlation ID propagation across async boundaries.

## STRUCTURE

```
src/context/
└── RequestContext.ts   # AsyncLocalStorage wrapper for requestId (85L)
```

## KEY SYMBOLS

| Symbol           | Type     | Location            | Role                                                      |
| ---------------- | -------- | ------------------- | --------------------------------------------------------- |
| `runWithContext` | function | `RequestContext.ts` | Run a function within a request context (requestId)       |
| `getRequestId`   | function | `RequestContext.ts` | Get current requestId from async context                  |
| `withRequestId`  | function | `RequestContext.ts` | Generate UUID and run function within new request context |

## WHERE TO LOOK

| Task                    | Location            | Notes                                  |
| ----------------------- | ------------------- | -------------------------------------- |
| **Request correlation** | `RequestContext.ts` | requestId propagation across async ops |
| **Context creation**    | `RequestContext.ts` | `withRequestId()` auto-generates UUID  |

## CONVENTIONS

- Uses `AsyncLocalStorage` from `node:async_hooks` — no explicit parameter passing.
- `withRequestId()` generates a UUID via `node:crypto`.
- All functions are re-exported from `src/context/RequestContext.ts`.
