# METRICS MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e

## OVERVIEW

Prometheus-compatible metrics collection. Integrated into the server via DI container — injected into `HistoryManager`, transports, and other components. Exports in Prometheus text format for scraping.

## FILES

- `Metrics.impl.ts` - Metrics class implementation

## METRIC TYPES

| Type        | Behavior                   | Use Case                    |
| ----------- | -------------------------- | --------------------------- |
| `Counter`   | Cumulative, only increases | Request counts, errors      |
| `Gauge`     | Can go up or down          | Active connections, memory  |
| `Histogram` | Samples observations       | Latency, size distributions |

## USAGE

```typescript
const metrics = new Metrics({ prefix: 'mcp_server' });
metrics.counter('requests_total', 1, { method: 'GET' });
metrics.gauge('active_connections', 5);
metrics.histogram('request_duration_seconds', 0.023);
const prometheusText = metrics.export();
```

## API

| Method      | Args                               | Returns             | Description              |
| ----------- | ---------------------------------- | ------------------- | ------------------------ |
| `counter`   | name, value=1, labels, help        | void                | Create/increment counter |
| `gauge`     | name, value, labels, help          | void                | Set gauge value          |
| `histogram` | name, value, labels, help, buckets | void                | Record observation       |
| `get`       | name, labels                       | number \| undefined | Get current value        |
| `inc`       | name, labels                       | void                | Increment counter by 1   |
| `dec`       | name, labels                       | void                | Decrement gauge by 1     |
| `reset`     | -                                  | void                | Clear all metrics        |
| `export`    | -                                  | string              | Prometheus format        |

## INTEGRATION

Metrics is wired into the DI container via `ToolAwareSequentialThinkingServer._createContainerCore()`. Components receive `IMetrics` from `src/contracts/`.
