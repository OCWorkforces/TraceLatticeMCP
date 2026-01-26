# TRANSPORT MODULE

**Generated:** 2026-01-26
**Parent:** ../AGENTS.md

## OVERVIEW

MCP transport implementations providing communication channels between the MCP server and clients. Supports SSE (Server-Sent Events) for real-time streaming and HTTP for request-response patterns.

## STRUCTURE

```
src/transport/
├── BaseTransport.ts      # Abstract base class with shared security features
├── SseTransport.ts       # Server-Sent Events transport (multi-user, streaming)
├── HttpTransport.ts      # HTTP request-response transport (stateless, JSON-RPC)
└── index.ts             # Re-exports for public API
```

## PATTERNS

### BaseTransport Pattern

**Purpose:** Shared security and infrastructure logic for all transport implementations.

**Security Features:**

- **Session ID validation**: Alphanumeric pattern (max 64 chars)
- **Query parameter sanitization**: Whitelist-based validation
- **Rate limiting**: Per-IP, configurable (default 100 req/min)
- **CORS validation**: Exact match or wildcard patterns
- **IP extraction**: Supports `X-Forwarded-For` header

**Key Methods:**

```typescript
validateSessionId(sessionId: string): boolean
sanitizeQueryParams(url: URL): Record<string, string>
checkRateLimit(ip: string): boolean
getClientIp(req: IncomingMessage): string
validateCorsOrigin(req: IncomingMessage): boolean
setCorsHeaders(res: ServerResponse): void
```

### SseTransport Pattern

**Architecture:** Server-Sent Events with persistent connections and message queuing.

**Features:**

- **Multi-connection support**: Multiple concurrent clients via `Set<ServerResponse>`
- **Message queue**: Deferred delivery to new connections
- **Event broadcasting**: Global `broadcast(event, data)` method
- **Client identification**: Auto-generated `client_<timestamp>_<random>`

**Connection Lifecycle:**

```typescript
1. Client connects -> _handleSseConnection()
2. Send 'connected' event with timestamp
3. Add client to _clients Set
4. Send any queued messages
5. Handle disconnect via req.on('close')
```

**Endpoints:**

- `GET {path}` - SSE connection endpoint
- `POST {path}/message` - Client-to-server messages
- `GET /health` - Health check with client count

**Event Format:**

```
event: <event_type>
data: <json_payload>

```

### HttpTransport Pattern

**Architecture:** Stateless request-response with JSON-RPC over HTTP.

**Features:**

- **Stateless**: No persistent connections
- **JSON-RPC 2.0**: Structured request/response format
- **Body size limits**: Configurable (default 10MB)
- **Request timeout**: Configurable (default 30s)
- **Error handling**: Structured JSON-RPC error responses

**Request Processing Pipeline:**

```typescript
1. Rate limit check
2. CORS validation
3. Body size validation
4. JSON-RPC schema validation (Valibot)
5. Delegate to MCP server.receive()
6. Return JSON-RPC response
```

**Endpoints:**

- `POST {path}` - JSON-RPC method calls
- `GET /health` - Health check with request count
- `GET /` - Server info (name, version, endpoints)

**Error Response Format:**

```typescript
{
  jsonrpc: "2.0",
  id: <request_id> | null,
  error: {
    code: <error_code>,
    message: <error_message>,
    data?: <additional_info>
  }
}
```

**HTTP Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Success (JSON-RPC response) |
| 204 | CORS Preflight (empty) |
| 400 | Invalid session ID / JSON |
| 403 | Invalid CORS origin |
| 404 | Not Found |
| 413 | Payload too large |
| 429 | Rate limit exceeded |
| 500 | Internal error / timeout |
| 503 | Server not ready |

## KEY PATTERNS

### Server-Sent Events (SSE)

**Streaming Pattern:** One-way server-to-client with persistent HTTP connection.

**Client Implementation:**

```typescript
const eventSource = new EventSource(url);

eventSource.onmessage = (event) => {
	const data = JSON.parse(event.data);
	// Handle MCP messages
};

eventSource.onopen = () => {
	console.log('Connected to SSE endpoint');
};

eventSource.onerror = (error) => {
	// Connection error handling
};
```

**Event Types:**

- `connected` - Initial connection established
- `message` - Server message to client
- Custom events - Application-specific events

### Connection Management

**SSE:** `Set<ServerResponse>` tracks active connections. Cleanup on `req.on('close')`.

**HTTP:** Request counter (`_requestCount`) tracks active connections. No cleanup needed (stateless).

### Factory Functions

Both transports provide `create*Transport()` factory functions for convenient instantiation:

```typescript
const sseTransport = createSseTransport(options);
const httpTransport = createHttpTransport(options);
```

## CONFIGURATION

### Shared Options

```typescript
interface TransportOptions {
	port?: number; // Default: 9108
	host?: string; // Default: '127.0.0.1'
	corsOrigin?: string; // Default: '*'
	enableCors?: boolean; // Default: true
	enableRateLimit?: boolean; // Default: true
	maxRequestsPerMinute?: number; // Default: 100
}
```

### SSE-Specific Options

```typescript
interface SseTransportOptions extends TransportOptions {
	path?: string; // Default: '/sse'
	// Inherits all TransportOptions
}
```

### HTTP-Specific Options

```typescript
interface HttpTransportOptions extends TransportOptions {
	path?: string; // Default: '/messages'
	enableBodySizeLimit?: boolean; // Default: true
	maxBodySize?: number; // Default: 10MB
	requestTimeout?: number; // Default: 30s
	// Inherits all TransportOptions
}
```

## SHARED CONVENTIONS

1. **Async-First:** All I/O operations use async/await patterns
2. **Factory Pattern:** `create*Transport()` functions for instantiation
3. **Error Handling:** Structured error responses with JSON-RPC format
4. **Graceful Shutdown:** `stop()` method with Promise-based cleanup
5. **Type Safety:** Full TypeScript support with exported types
