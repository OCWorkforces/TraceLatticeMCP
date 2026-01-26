# CLAUDE.md

This directory contains Prometheus-compatible metrics collection for observability.

## Files

- `index.ts` - Module exports
- `Metrics.impl.ts` - Metrics class implementation (427 lines)

## Overview

The `Metrics` class provides a thread-safe metrics collection system that exports in Prometheus text format. It supports three metric types: counters, gauges, and histograms.

## Metric Types

| Type          | Behavior                   | Use Case                    |
| ------------- | -------------------------- | --------------------------- |
| **Counter**   | Cumulative, only increases | Request counts, errors      |
| **Gauge**     | Can go up or down          | Active connections, memory  |
| **Histogram** | Samples observations       | Latency, size distributions |

## Usage

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

## API Reference

### Constructor

```typescript
interface MetricsOptions {
	prefix?: string; // Metric name prefix
	defaultLabels?: Record<string, string>; // Labels for all metrics
}

const metrics = new Metrics({ prefix: 'mcp_server', defaultLabels: { service: 'mcp' } });
```

### Methods

| Method              | Args                               | Returns             | Description                   |
| ------------------- | ---------------------------------- | ------------------- | ----------------------------- |
| `counter`           | name, value=1, labels, help        | void                | Create/increment counter      |
| `gauge`             | name, value, labels, help          | void                | Set gauge value               |
| `histogram`         | name, value, labels, help, buckets | void                | Record observation            |
| `get`               | name, labels                       | number \| undefined | Get current value             |
| `inc`               | name, labels                       | void                | Increment counter by 1        |
| `dec`               | name, labels                       | void                | Decrement gauge by 1          |
| `reset`             | -                                  | void                | Clear all metrics             |
| `export`            | -                                  | string              | Export in Prometheus format   |
| `getOperationCount` | -                                  | number              | Get operation count (testing) |

### Example: Counter

```typescript
// Simple counter
metrics.counter('requests_total');

// With labels
metrics.counter('http_requests_total', 1, { method: 'GET', status: '200' });

// Increment by value
metrics.counter('bytes_processed', 1024, { type: 'input' });

// Using inc() shorthand
metrics.inc('requests_total', { method: 'POST' });
```

### Example: Gauge

```typescript
// Set gauge value
metrics.gauge('active_connections', 5);

// Get current value
const connections = metrics.get('active_connections', {});

// Decrement
metrics.dec('active_connections');
```

### Example: Histogram

```typescript
// Default buckets
metrics.histogram('request_duration_seconds', 0.023);

// With custom labels
metrics.histogram('request_duration_seconds', 0.045, { method: 'POST' });

// Custom buckets
const customBuckets = [0.01, 0.05, 0.1, 0.5, 1, 5];
metrics.histogram('processing_time_ms', 25, {}, 'Processing time', customBuckets);
```

## Export Format

The `export()` method returns metrics in Prometheus text format:

```text
# HELP mcp_server_requests_total Total HTTP requests
# TYPE mcp_server_requests_total counter
mcp_server_requests_total{method="GET",status="200"} 1234

# TYPE mcp_server_request_duration_seconds histogram
mcp_server_request_duration_seconds_sum{method="GET"} 45.678
mcp_server_request_duration_seconds_count{method="GET"} 100
mcp_server_request_duration_seconds_bucket{method="GET",le="0.005"} 10
mcp_server_request_duration_seconds_bucket{method="GET",le="0.01"} 25
mcp_server_request_duration_seconds_bucket{method="GET",le="+Inf"} 100
```

## Default Buckets

Latency histogram defaults (in seconds):

```typescript
[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
```

## Integration with Main Server

The Metrics class is not yet integrated into the main server. To add metrics:

1. Create Metrics instance in DI container
2. Inject into components (HistoryManager, transports, etc.)
3. Emit metrics on operations
4. Expose `/metrics` HTTP endpoint for Prometheus scraping

```typescript
// Example: Adding to DI container
container.registerInstance('Metrics', new Metrics({ prefix: 'mcp_server' }));

// Example: Using in a transport
const metrics = container.resolve<Metrics>('Metrics');
metrics.counter('http_requests_total', 1, { path: '/mcp' });
```

## Thread Safety

The Metrics implementation is thread-safe:

- All operations use atomic increments where possible
- Maps are accessed synchronously (assumes single-threaded execution)
- For concurrent scenarios, ensure proper synchronization

## Testing

```typescript
import { Metrics } from './metrics/index.js';

describe('Metrics', () => {
	let metrics: Metrics;

	beforeEach(() => {
		metrics = new Metrics({ prefix: 'test' });
	});

	it('should increment counter', () => {
		metrics.counter('test_counter', 1);
		expect(metrics.get('test_counter')).toBe(1);
	});

	it('should export in Prometheus format', () => {
		metrics.counter('test_counter', 5);
		const output = metrics.export();
		expect(output).toContain('test_test_counter 5');
	});

	it('should support labels', () => {
		metrics.counter('test_counter', 1, { method: 'GET' });
		metrics.counter('test_counter', 1, { method: 'POST' });
		expect(metrics.get('test_counter', { method: 'GET' })).toBe(1);
	});

	it('should reset all metrics', () => {
		metrics.counter('test_counter', 10);
		metrics.reset();
		expect(metrics.get('test_counter')).toBeUndefined();
	});
});
```
