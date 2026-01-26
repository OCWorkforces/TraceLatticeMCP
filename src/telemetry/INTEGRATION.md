# OpenTelemetry Integration Guide

This guide documents how to integrate OpenTelemetry for distributed tracing in the TraceLatticeMCP server.

## Overview

OpenTelemetry provides standardized observability across distributed systems. This integration focuses on tracing thought processing requests across transports (stdio, SSE, HTTP).

## Architecture

```
┌─────────────────┐     ┌─────────────┐
│   Client Process  │     │  Redis/Memory/   │
│                  │     │     │     │
│                  │◀────►│     │◀────►│
└─────────────────┘     └─────────────┘
        │              │
        ▼              ▼
┌─────────────────────────────────────────┐
│   Thought Processing  │
│  (Sequential Thinking)   │
│         │
│         │
└─────────────────────────────────┘
        │
┌─────────────┐   ┌─────────────┐
│ Transports   │     │  Backends   │
│              │     │     │
└─────────────┘     └─────────────┘
```

## Instrumentation Points

### 1. Server Initialization

```typescript
const server = await createServer({
  enableTelemetry: true,  // Enable OpenTelemetry
  telemetryOptions: {
    serviceNames: 'trace-lattice',
    serviceName: 'mcp-sequential-thinking',
    exporterType: 'jaeger'  // or 'otlp', 'zipkin'
    samplingRatio: 0.1,  // Sample 10% of traces
  }
});
```

### 2. Request Processing

```typescript
// In ThoughtProcessor.ts
async processThought(input: ThoughtData): Promise<any> {
  const tracer = this._tracer;  // Get from DI container

  const span = tracer.startSpan({
    name: 'processThought',
    kind: 'SERVER',
    attributes: {
      'thought.number': input.thought_number,
      'total.thoughts': input.total_thoughts
    }
  });

  try {
    // ... process thought logic ...

    span.addEvent('processing', { duration: processingTimeMs });
    span.setStatus({ code: 1, message: 'Success' });
  } catch (error) {
    span.recordException(error);
    span.setStatus({ code: 2, message: error.message });
  } finally {
    span.end();
  }
}
```

### 3. Transport Requests

```typescript
// In BaseTransport.ts
protected _createSpan(operation: string): Span {
  if (this._tracer) {
    return this._tracer.startSpan({
      name: operation,
      kind: 'CLIENT',
      attributes: {
        'transport': this.constructor.name,
        'client.ip': this.getClientIp(request)
      }
    });
  }
  return null;
}
```

## Configuration Options

### Server Options

```typescript
interface ServerOptions {
	// ... existing options ...

	enableTelemetry?: boolean; // Enable OpenTelemetry (default: false)
	telemetryOptions?: TelemetryOptions; // OpenTelemetry configuration
}

interface TelemetryOptions {
	serviceName?: string; // Service name (default: 'trace-lattice')
	exporterType?: 'jaeger' | 'otlp' | 'zipkin' | 'stdout' | 'none'; // Exporter type (default: 'none')
	samplingRatio?: number; // Trace sampling ratio (default: 1.0)
	resourceAttributes?: Record<string, string>; // Additional resource attributes
}
```

## Dependencies

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.1",
    "@opentelemetry/sdk-trace": "^1.20.0",
    "@opentelemetry/sdk-trace-node": "^1.20.0"
    "@opentelemetry/resources": "^1.20.0"
  }
}
```

Install with: `npm install @opentelemetry/api @opentelemetry/sdk-trace @opentelemetry/sdk-trace-node @opentelemetry/resources`

## Metrics Integration

OpenTelemetry metrics are automatically exported as Prometheus metrics:

```typescript
// Metrics include:
// - trace_exporter_spans_total: Total number of spans exported
// - trace_exporter_spans_success_total: Successfully exported spans
// - trace_exporter_spans_failed_total: Failed export attempts
// - trace_processor_spans_total: Spans processed by processor
// - trace_processor_spans_dropped_total: Dropped spans
```

## Best Practices

### 1. Always Use Async APIs

```typescript
// BAD: Synchronous tracing setup
const tracer = setupTracer(); // Blocks initialization
await server.start();

// GOOD: Async tracing setup
const tracer = await setupTracer(); // Non-blocking
await server.start();
```

### 2. Keep Spans Short-Lived

```typescript
// Spans should end when work is complete
const span = tracer.startSpan('operation');
// ... do work ...
span.end(); // Ends span and sends to exporter
```

### 3. Use Proper Span Kind

- **SERVER**: Top-level operations (server initialization, shutdown)
- **CLIENT**: Transport operations (request handling, response sending)
- **CONSUMER**: Processing operations (tool execution, thought processing)
- **PRODUCER**: Background operations (skill discovery, file watching)
- **INTERNAL**: Low-level operations (database queries, cache operations)

### 4. Add Semantic Attributes

```typescript
span.setAttributes({
	'thought.id': thought.id,
	'thought.branch': thought.branch_from_thought,
	'tool.name': toolName,
	'session.id': sessionId,
});
```

## Testing

### Manual Testing

```bash
# 1. Start server with telemetry
export OTEL_SERVICE_NAME=trace-lattice \
       OTEL_EXPORTER=stdout \
       node dist/index.js

# 2. Generate load and verify traces
curl http://localhost:9108/ \
  -H "Content-Type: application/json" \
  -d '{"method":"sequentialthinking_tools","input":{"thought":"test"}}'

# 3. Check Prometheus metrics
curl http://localhost:9090/metrics
```

### Verification Checklist

- [ ] Spans exported to console/stdout
- [ ] Traces visible in Jaeger/Zipkin (if exporter configured)
- [ ] Span attributes are correct
- [ ] Span parent/child relationships are correct
- [ ] Performance impact is acceptable (< 5% overhead)
- [ ] No memory leaks from span buffering
- [ ] Errors are properly recorded as exceptions
- [ ] Sampling is configured correctly

## Implementation Notes

This integration is designed to be **non-breaking**:

1. **Optional by default**: Telemetry is opt-in (`enableTelemetry: false`)
2. **No external dependency in core**: Only adds OpenTelemetry when enabled
3. **Backward compatible**: Works with existing transports without changes
4. **Exporter-agnostic**: Supports multiple exporters (jaeger, otlp, zipkin, stdout, none)
5. **Configurable**: Service names, sampling ratios, resource attributes
6. **Performance-conscious**: Async initialization and manual span ending

## Future Enhancements

1. **Automatic sampling**: Dynamic sampling based on endpoint health
2. **Baggage propagation**: Correlate traces across service boundaries
3. **Distributed context**: Attach request/response IDs to all spans
4. **Span links**: Link spans to external traces (Jaeger, Zipkin)
