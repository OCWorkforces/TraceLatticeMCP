# TRANSPORT MODULE

**Updated:** 2026-04-02
**Commit:** 4d84f2e
## OVERVIEW

MCP transport implementations providing communication channels between the MCP server and clients. Supports SSE (Server-Sent Events) for real-time streaming and HTTP for request-response patterns.

## STRUCTURE

```
src/transport/
├── BaseTransport.ts          # Abstract base (security, rate limiting, CORS) (439L)
├── SseTransport.ts           # Server-Sent Events (multi-user, streaming) (476L)
├── HttpTransport.ts          # HTTP JSON-RPC (stateless, request-response) (344L)
├── HttpHelpers.ts            # HTTP utility functions (120L)
└── StreamableHttpTransport.ts # MCP Streamable HTTP transport (724L)
```


## PATTERNS

### BaseTransport
Shared security: session ID validation, query sanitization, rate limiting (100 req/min), CORS, IP extraction via `X-Forwarded-For`.

### SseTransport
Multi-connection SSE with `Set<ServerResponse>`, message queue for late joiners, auto-generated client IDs. Endpoints: `GET {path}` (SSE), `POST {path}/message`, `GET /health`.

### HttpTransport
Stateless JSON-RPC 2.0 over HTTP. Pipeline: rate limit → CORS → body size → schema validation → delegate to MCP server. Body limit 10MB, timeout 30s.

### StreamableHttpTransport
MCP Streamable HTTP transport (724L). Full MCP protocol support with session management, request streaming, and graceful shutdown.

## CONVENTIONS

- All transports provide `create*Transport()` factory functions.
- `stop()` method with Promise-based cleanup for graceful shutdown.
- `HealthChecker` integration for `/health` endpoints.
