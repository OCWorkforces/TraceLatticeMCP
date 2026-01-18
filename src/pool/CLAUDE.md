# CLAUDE.md

This directory contains connection pooling components for multi-user sessions.

## Files

- `ConnectionPool.ts` - Connection pool for managing isolated user sessions

## ConnectionPool

The `ConnectionPool` class manages isolated sessions for multiple users in SSE transport mode.

### Features

- **Session Isolation**: Each user gets their own history and state
- **Session Timeout**: Automatic cleanup of inactive sessions
- **Session Tracking**: Track active sessions across the server
- **Memory Management**: Prevents memory leaks from abandoned sessions

### Configuration

```typescript
interface ConnectionPoolOptions {
  maxSessions?: number;      // Maximum concurrent sessions (default: 100)
  sessionTimeout?: number;   // Session timeout in ms (default: 30 minutes)
  cleanupInterval?: number;  // Cleanup interval in ms (default: 5 minutes)
}
```

### Usage

```typescript
import { ConnectionPool } from './pool/ConnectionPool.js';

const pool = new ConnectionPool({
  maxSessions: 100,
  sessionTimeout: 1800000, // 30 minutes
  cleanupInterval: 300000  // 5 minutes
});

// Get or create a session for a user
const session = pool.getSession('user-id');

// Use the session's history
session.history.addThought(thought);

// Clean up a specific session
pool.removeSession('user-id');

// Cleanup expired sessions
pool.cleanupExpiredSessions();
```

## Architecture

```
┌─────────────────────────────┐
│      ConnectionPool         │
│                             │
│  ┌─────────┐  ┌─────────┐  │
│  │Session1 │  │Session2 │  │
│  │user-id-1│  │user-id-2│  │
│  └─────────┘  └─────────┘  │
│                             │
│  ┌─────────┐  ┌─────────┐  │
│  │Session3 │  │SessionN │  │
│  │user-id-3│  │user-id-N│  │
│  └─────────┘  └─────────┘  │
└─────────────────────────────┘
```

## Session Lifecycle

1. **Creation**: Session created on first request for a user ID
2. **Activity**: Session stays active while being used
3. **Expiration**: Session expires after timeout period of inactivity
4. **Cleanup**: Expired sessions removed during cleanup cycle

## Use with SSE Transport

The connection pool is automatically used by the SSE transport to maintain isolated sessions per connected user:

```typescript
const pool = new ConnectionPool();
const sseTransport = new SseTransport({ pool });

// Each connected user gets their own session
```
