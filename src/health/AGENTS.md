# HEALTH MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

Aggregate health checking system that provides liveness and readiness probes by querying registered backend components (persistence, pool, etc.).

## STRUCTURE

```
src/health/
└── HealthChecker.ts   # Aggregate health checker with component probing (160L)
```

## KEY SYMBOLS

| Symbol                 | Type      | Location           | Role                                                             |
| ---------------------- | --------- | ------------------ | ---------------------------------------------------------------- |
| `HealthChecker`        | class     | `HealthChecker.ts` | Registers components, runs health probes, returns status         |
| `HealthComponent`      | interface | `HealthChecker.ts` | Per-component: name, healthy, details, latencyMs                 |
| `HealthCheckResult`    | interface | `HealthChecker.ts` | Aggregate: status (ok/degraded/unhealthy), timestamp, components |
| `HealthCheckerOptions` | interface | `HealthChecker.ts` | Constructor opts: persistence backend, logger                    |

## WHERE TO LOOK

| Task                       | Location           | Notes                                     |
| -------------------------- | ------------------ | ----------------------------------------- |
| **Liveness/readiness**     | `HealthChecker.ts` | `/health` endpoint backing                |
| **Component registration** | `HealthChecker.ts` | `registerComponent()` for custom backends |

## CONVENTIONS

- Status levels: `ok` (all healthy), `degraded` (some unhealthy), `unhealthy` (all down).
- Each component probe measures latency in milliseconds.
- No-op logger fallback when none provided.
