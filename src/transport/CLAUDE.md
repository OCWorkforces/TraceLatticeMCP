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
	port?: number; // Server port (default: 9108)
	host?: string; // Server host (default: '127.0.0.1')
	corsOrigin?: string; // CORS origin (default: '*')
	enableCors?: boolean; // Enable CORS (default: true)
	path?: string; // SSE endpoint path (default: '/sse')
	enableRateLimit?: boolean; // Enable rate limiting (default: true)
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
  port: 9108,
  host: '127.0.0.1',
  corsOrigin: '*',
  enableCors: true
});

// Using factory function
const sseTransport2 = createSseTransport({
  port: 9109,
  host: '0.0.0.0'
});

// Connect the transport
await sseTransport.connect(server);

// Server now listening on http://127.0.0.1:9108
```

### Complete SseTransportOptions

| Option                 | Type    | Default     | Description          |
| ---------------------- | ------- | ----------- | -------------------- |
| `port`                 | number  | 9108        | Server port          |
| `host`                 | string  | '127.0.0.1' | Server host          |
| `corsOrigin`           | string  | '\*'        | CORS origin          |
| `enableCors`           | boolean | true        | Enable CORS          |
| `path`                 | string  | '/sse'      | SSE endpoint path    |
| `enableRateLimit`      | boolean | true        | Enable rate limiting |
| `maxRequestsPerMinute` | number  | 100         | Rate limit threshold |

### Endpoints

- `GET /sse` - SSE endpoint for MCP connections
- `GET /sse/message` - Message endpoint for client-to-server messages
- `GET /health` - Health check endpoint

### Environment Configuration

```bash
# Enable SSE transport
export TRANSPORT_TYPE=sse

# Configure SSE
export SSE_PORT=9108
export SSE_HOST=127.0.0.1
export CORS_ORIGIN=*
```

### Client Connection

Clients connect via SSE:

```javascript
const eventSource = new EventSource('http://127.0.0.1:9108/sse');

eventSource.onmessage = (event) => {
	const data = JSON.parse(event.data);
	// Handle MCP messages
};
```

---

## Architecture

```
┌─────────────────────────────────────┐
│         MCP Server                  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │     Transport Layer         │   │
│  │                              │   │
│  │  ┌──────────┐              │   │
│  │  │   SSE    │              │   │
│  │  │Transport │              │   │
│  │  └────┬─────┘              │   │
│  └───────┼────────────┘           │
│          │                         │
├──────────┼─────────────────────────┤
│          ▼                         │
│  ┌───────────┐                  │
│  │Client 1   │                  │
│  │SSE         │                  │
│  └───────────┘                  │
└─────────────────────────────────────┘
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

| Option                 | Type    | Default     | Description            |
| ---------------------- | ------- | ----------- | ---------------------- |
| `port`                 | number  | 9108        | Server port            |
| `host`                 | string  | '127.0.0.1' | Server host            |
| `corsOrigin`           | string  | '\*'        | CORS origin            |
| `enableCors`           | boolean | true        | Enable CORS            |
| `path`                 | string  | '/mcp'      | Messages endpoint path |
| `enableRateLimit`      | boolean | true        | Enable rate limiting   |
| `maxRequestsPerMinute` | number  | 100         | Rate limit threshold   |
| `enableBodySizeLimit`  | boolean | true        | Enable body size limit |
| `maxBodySize`          | number  | 10485760    | Max body size (10MB)   |
| `requestTimeout`       | number  | 30000       | Request timeout (ms)   |

### Endpoints

- `POST /mcp` - JSON-RPC method calls
- `GET /health` - Health check endpoint
- `GET /` - Server info endpoint

### HTTP Status Code Mapping

| Status | Condition                | Response                            |
| ------ | ------------------------ | ----------------------------------- |
| 200    | Success                  | JSON-RPC response                   |
| 204    | CORS Preflight           | Empty body                          |
| 400    | Bad Request              | `{error: "message"}`                |
| 403    | Forbidden (invalid CORS) | `{error: "Forbidden"}`              |
| 404    | Not Found                | "Not Found"                         |
| 413    | Payload Too Large        | `{error: "Request body too large"}` |
| 429    | Too Many Requests        | `{error: "Too many requests"}`      |
| 500    | Internal Error           | `{error: "Internal server error"}`  |
| 503    | Server Not Ready         | `{error: "Server not ready"}`       |

### Environment Configuration

```bash
# Enable HTTP transport
export TRANSPORT_TYPE=http

# Configure HTTP
export HTTP_PORT=9108
export HTTP_HOST=127.0.0.1
export HTTP_PATH=/mcp
export CORS_ORIGIN=*
export ENABLE_CORS=true
export ENABLE_RATE_LIMIT=true
export MAX_REQUESTS_PER_MINUTE=100
```

### Client Usage

Clients make HTTP POST requests to the messages endpoint:

```bash
# Health check
curl http://127.0.0.1:9108/health

# Server info
curl http://127.0.0.1:9108/

# JSON-RPC call
curl -X POST http://127.0.0.1:9108/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/call",
    "params": {...},
    "id": 1
  }'
```

---

## Architecture

```
┌─────────────────────────────────────┐
│         MCP Server                  │
│                                     │
│  ┌─────────────────────────────┐   │
│  │     Transport Layer         │   │
│  │                              │   │
│  │  ┌──────────┐              │   │
│  │  │   SSE    │              │   │
│  │  │Transport │              │   │
│  │  └────┬─────┘              │   │
│  └───────┼────────────┘           │
│          │                         │
├──────────┼─────────────────────────┤
│          ▼                         │
│  ┌───────────┐                  │
│  │Client 1   │                  │
│  │SSE         │                  │
│  └───────────┘                  │
└─────────────────────────────────────┘
```
