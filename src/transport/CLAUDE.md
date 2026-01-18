# CLAUDE.md

This directory contains MCP transport implementations.

## Files

- `SseTransport.ts` - Server-Sent Events (SSE) transport for multi-user support

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
  pool?: ConnectionPool;  // Optional connection pool
}
```

### Usage

```typescript
import { SseTransport } from './transport/SseTransport.js';
import { McpServer } from 'tmcp';

const server = new McpServer({...});

const sseTransport = new SseTransport({
  port: 3000,
  host: 'localhost',
  corsOrigin: '*',
  enableCors: true
});

// Connect the transport
await sseTransport.connect(server);

// Server now listening on http://localhost:3000
```

### Endpoints

- `GET /` - SSE endpoint for MCP connections
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
const eventSource = new EventSource('http://localhost:3000');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle MCP messages
};
```

## Architecture

```
┌─────────────────────────────────────┐
│         HTTP Server (SSE)           │
│                                     │
│  ┌───────────┐  ┌───────────┐      │
│  │Client 1   │  │Client 2   │      │
│  │SSE Conn   │  │SSE Conn   │      │
│  └─────┬─────┘  └─────┬─────┘      │
│        │              │             │
│        ▼              ▼             │
│  ┌─────────────────────────┐       │
│  │    ConnectionPool       │       │
│  │  Session per Client     │       │
│  └─────────────────────────┘       │
│                                     │
│  ┌─────────────────────────┐       │
│  │       McpServer          │       │
│  └─────────────────────────┘       │
└─────────────────────────────────────┘
```
