# METRICS MODULE

**Generated:** 2026-01-26 09:15
**Status:** PREVIOUSLY UNDOCUMENTED

## OVERVIEW

Prometheus-compatible metrics collection. Supports counters, gauges, and histograms for observability. Exports in Prometheus text format for scraping.

## FILES

- `index.ts` - Module exports
- `Metrics.impl.ts` - Metrics class implementation (427 lines)

## METRIC TYPES

| Type        | Behavior                   | Use Case                    |
| ----------- | -------------------------- | --------------------------- |
| `Counter`   | Cumulative, only increases | Request counts, errors      |
| `Gauge`     | Can go up or down          | Active connections, memory  |
| `Histogram` | Samples observations       | Latency, size distributions |

## USAGE

```typescript
import { Metrics } from './metrics/index.js';

const metrics = new Metrics({ prefix: 'mcp_server' });

// Counter - cumulative
metrics.counter('requests_total', 1, { method: 'GET' });
metrics.inc('requests_total', { method: 'POST' });

// Gauge - adjustable
metrics.gauge('active_connections', 5);
metrics.dec('active_connections');

// Histogram - observations
metrics.histogram('request_duration_seconds', 0.023);
metrics.histogram('thought_processing_ms', 45);

// Export Prometheus format
const prometheusText = metrics.export();
```

## EXPORT FORMAT

```text
# HELP mcp_server_requests_total Total HTTP requests
# TYPE mcp_server_requests_total counter
mcp_server_requests_total{method="GET",status="200"} 1234

# TYPE mcp_server_request_duration_seconds histogram
mcp_server_request_duration_seconds_sum{method="GET"} 45.678
mcp_server_request_duration_seconds_count{method="GET"} 100
mcp_server_request_duration_seconds_bucket{method="GET",le="0.005"} 10
mcp_server_request_duration_seconds_bucket{le="+Inf"} 100
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

## OPTIONS

```typescript
interface MetricsOptions {
	prefix?: string; // Metric name prefix
	defaultLabels?: Record<string, string>; // Labels for all metrics
}
```

## DEFAULT BUCKETS

Latency histogram defaults (seconds):
`[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`

## INTEGRATION

The Metrics class is not yet integrated into the main server. To add metrics:

1. Create Metrics instance in DI container
2. Inject into components (HistoryManager, transports, etc.)
3. Emit metrics on operations
4. Expose `/metrics` HTTP endpoint for Prometheus scraping
