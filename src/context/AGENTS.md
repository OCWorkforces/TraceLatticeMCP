# CONTEXT MODULE

**Updated:** 2026-04-18
**Commit:** 906f363

## OVERVIEW

Request context management using Node.js `AsyncLocalStorage` for zero-cost correlation ID propagation across async boundaries.

## STRUCTURE

```
src/context/
└── RequestContext.ts   # AsyncLocalStorage wrapper for requestId — `getRequestId` only (34L)
```

## KEY SYMBOLS

| Symbol           | Type     | Location            | Role                                                      |
| ---------------- | -------- | ------------------- | --------------------------------------------------------- |
| `getRequestId`   | function | `RequestContext.ts` | Get current requestId from async context                  |

## WHERE TO LOOK

| Task                    | Location            | Notes                                  |
| ----------------------- | ------------------- | -------------------------------------- |
| **Request correlation** | `RequestContext.ts` | requestId propagation across async ops |

## CONVENTIONS

- Uses `AsyncLocalStorage` from `node:async_hooks` — no explicit parameter passing.
- Only `getRequestId()` is exported; context is established by transport-layer wrappers.
- Imported from `src/context/RequestContext.ts`.
