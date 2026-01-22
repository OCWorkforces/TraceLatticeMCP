# CLAUDE.md

This directory contains MCP transport implementations.

## Files

- `SseTransport.ts` - Server-Sent Events (SSE) transport for multi-user support
- `HttpTransport.ts` - HTTP request-response transport for REST-like API
- `index.ts` - Export all transports from one module

## SseTransport

The `SseTransport` class implements an SSE-based transport for multi-user MCP server communication.

### Features

- **Multi-User Support**: Multiple concurrent connections with isolated sessions
- **Session Management**: Each connection gets its own history via ConnectionPool
- **CORS Support**: Configurable CORS origins
- **Health Check Endpoint**: `/health` endpoint for monitoring
- **Graceful Shutdown**: Properly closes all connections on shutdown

### Configuration

```typescript
interface SseTransportOptions {
  port: number;           // Server port (default: 3000)
  host: string;           // Server host (default: 'localhost')
  corsOrigin: string;     // CORS origin (default: '*')
  enableCors: boolean;    // Enable CORS (default: true)
  path?: string;          // SSE endpoint path (default: '/sse')
  enableRateLimit?: boolean;  // Enable rate limiting (default: true)
  maxRequestsPerMinute?: number; // Rate limit (default: 100)
}
```

### Usage

```typescript
import { SseTransport, createSseTransport } from './transport/index.js';
import { McpServer } from 'tmcp';

const server = new McpServer({...});

// Direct instantiation
const sseTransport = new SseTransport({
  port: 3000,
  host: 'localhost',
  corsOrigin: '*',
  enableCors: true
});

// Using factory function
const sseTransport2 = createSseTransport({
  port: 3001,
  host: '0.0.0.0'
});

// Connect the transport
await sseTransport.connect(server);

// Server now listening on http://localhost:3000
```

### Complete SseTransportOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port |
| `host` | string | 'localhost' | Server host |
| `corsOrigin` | string | '*' | CORS origin |
| `enableCors` | boolean | true | Enable CORS |
| `path` | string | '/sse' | SSE endpoint path |
| `enableRateLimit` | boolean | true | Enable rate limiting |
| `maxRequestsPerMinute` | number | 100 | Rate limit threshold |

### Endpoints

- `GET /sse` - SSE endpoint for MCP connections
- `GET /sse/message` - Message endpoint for client-to-server messages
- `GET /health` - Health check endpoint

### Environment Configuration

```bash
# Enable SSE transport
export TRANSPORT_TYPE=sse

# Configure SSE
export SSE_PORT=3000
export SSE_HOST=localhost
export CORS_ORIGIN=*
```

### Client Connection

Clients connect via SSE:

```javascript
const eventSource = new EventSource('http://localhost:3000/sse');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle MCP messages
};
```

---

## HttpTransport

The `HttpTransport` class implements a standard HTTP request-response transport for MCP server communication.

### Features

- **Stateless Request-Response**: Traditional HTTP POST/GET pattern
- **CORS Support**: Configurable CORS origins
- **Health Check**: `/health` endpoint for monitoring
- **Rate Limiting**: Per-IP request throttling
- **Body Size Limits**: Configurable max request size
- **Graceful Shutdown**: Proper server cleanup

### Configuration

```typescript
interface HttpTransportOptions {
  port?: number;           // Server port (default: 3000)
  host?: string;           // Server host (default: 'localhost')
  corsOrigin?: string;     // CORS origin (default: '*')
  enableCors?: boolean;    // Enable CORS (default: true)
  path?: string;           // Messages endpoint (default: '/messages')
  enableRateLimit?: boolean;  // Enable rate limiting (default: true)
  maxRequestsPerMinute?: number; // Rate limit (default: 100)
  enableBodySizeLimit?: boolean; // Enable size limit (default: true)
  maxBodySize?: number;    // Max body size (default: 10MB)
  requestTimeout?: number; // Timeout in ms (default: 30000)
}
```

### Usage

```typescript
import { HttpTransport, createHttpTransport } from './transport/index.js';
import { McpServer } from 'tmcp';

const server = new McpServer({...});

// Direct instantiation
const httpTransport = new HttpTransport({
  port: 3000,
  host: 'localhost',
  corsOrigin: '*',
  enableCors: true
});

// Using factory function
const httpTransport2 = createHttpTransport({
  port: 3001,
  host: '0.0.0.0'
});

// Connect the transport
await httpTransport.connect(server);

// Server now listening on http://localhost:3000
```

### Complete HttpTransportOptions

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `port` | number | 3000 | Server port |
| `host` | string | 'localhost' | Server host |
| `corsOrigin` | string | '*' | CORS origin |
| `enableCors` | boolean | true | Enable CORS |
| `path` | string | '/messages' | Messages endpoint path |
| `enableRateLimit` | boolean | true | Enable rate limiting |
| `maxRequestsPerMinute` | number | 100 | Rate limit threshold |
| `enableBodySizeLimit` | boolean | true | Enable body size limit |
| `maxBodySize` | number | 10485760 | Max body size (10MB) |
| `requestTimeout` | number | 30000 | Request timeout (ms) |

### Endpoints

- `POST /messages` - JSON-RPC method calls
- `GET /health` - Health check endpoint
- `GET /` - Server info endpoint

### HTTP Status Code Mapping

| Status | Condition | Response |
|--------|-----------|----------|
| 200 | Success | JSON-RPC response |
| 204 | CORS Preflight | Empty body |
| 400 | Bad Request | `{error: "message"}` |
| 403 | Forbidden (invalid CORS) | `{error: "Forbidden"}` |
| 404 | Not Found | "Not Found" |
| 413 | Payload Too Large | `{error: "Request body too large"}` |
| 429 | Too Many Requests | `{error: "Too many requests"}` |
| 500 | Internal Error | `{error: "Internal server error"}` |
| 503 | Server Not Ready | `{error: "Server not ready"}` |

### Environment Configuration

```bash
# Enable HTTP transport
export TRANSPORT_TYPE=http

# Configure HTTP
export HTTP_PORT=3000
export HTTP_HOST=localhost
export HTTP_PATH=/messages
export CORS_ORIGIN=*
export ENABLE_CORS=true
export ENABLE_RATE_LIMIT=true
export MAX_REQUESTS_PER_MINUTE=100
```

### Client Usage

Clients make HTTP POST requests to the messages endpoint:

```bash
# Health check
curl http://localhost:3000/health

# Server info
curl http://localhost:3000/

# JSON-RPC call
curl -X POST http://localhost:3000/messages \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {...},
    "id": 1
  }'
```

---

## SSE vs HTTP Transport

| Aspect | SSE Transport | HTTP Transport |
|--------|--------------|----------------|
| Communication | One-way streaming (server->client) | Request-response (bidirectional) |
| Connection | Persistent (keep-alive) | Stateless (per-request) |
| Use case | Real-time updates, notifications | Traditional API calls |
| Response | Events pushed to client | Direct JSON response to request |
| Endpoints | `/sse`, `/sse/message`, `/health` | `/messages`, `/health`, `/` |

---

## Architecture

```
┌─────────────────────────────────────┐
│         MCP Server                  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │     Transport Layer         │   │
│  │                              │   │
│  │  ┌──────────┐  ┌──────────┐  │   │
│  │  │   SSE    │  │   HTTP   │  │   │
│  │  │Transport │  │Transport │  │   │
│  │  └────┬─────┘  └────┬─────┘  │   │
│  └───────┼────────────┼────────┘   │
│          │            │             │
├──────────┼────────────┼─────────────┤
│          ▼            ▼             │
│  ┌───────────┐  ┌───────────┐      │
│  │Client 1   │  │Client 2   │      │
│  │SSE/HTTP   │  │HTTP only  │      │
│  └───────────┘  └───────────┘      │
└─────────────────────────────────────┘
```
