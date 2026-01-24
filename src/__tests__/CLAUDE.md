# CLAUDE.md

This directory contains all test files for the MCP Sequential Thinking Server.

## Test Files

| Test File | Description | Tests |
|-----------|-------------|-------|
| `container.test.ts` | DI container tests | 48 |
| `persistence.test.ts` | Persistence backend tests | 42 |
| `sse-transport.test.ts` | SSE transport tests | 33 |
| `http-transport.test.ts` | HTTP transport tests | 27 |
| `worker-manager.test.ts` | Worker pool tests | 33 |
| `connection-pool.test.ts` | Connection pool tests | 39 |
| `sequentialthinking-tools.test.ts` | MCP tool comprehensive tests | 35 |
| `integration.test.ts` | Integration tests | 6 |
| `crud.test.ts` | Tool/Skill CRUD tests | 12 |
| `schema.test.ts` | Schema validation tests | 8 |
| `tool-registry.test.ts` | Tool registry tests | 10 |
| `errors.test.ts` | Error handling tests | 6 |
| `skill-discovery.test.ts` | Skill discovery tests | 15 |
| `thought-processor.test.ts` | Thought processor tests | 20 |
| `input-normalizer.test.ts` | Input normalizer tests | 12 |

## Vitest Configuration

The test suite uses Vitest with the following configuration:

```typescript
{
  globals: true,              // Global describe/it/expect available
  coverage: {
    provider: 'v8',
    reporter: ['text', 'json', 'html']
  }
}
```

## Test Patterns

### Helper Functions

Common helper functions defined in test files:

```typescript
// Helper for creating test thoughts
function createTestThought(overrides?: Partial<ThoughtData>): ThoughtData {
  return {
    thought: 'Test thought',
    thought_number: 1,
    total_thoughts: 1,
    next_thought_needed: false,
    ...overrides,
  };
}

// Helper for creating tool recommendations
function createToolRecommendation(overrides?: Partial<ToolRecommendation>): ToolRecommendation {
  return {
    tool_name: 'test-tool',
    confidence: 0.9,
    rationale: 'Test rationale',
    priority: 1,
    ...overrides,
  };
}

// Helper for parsing processThought result
function parseProcessThoughtResult(result: unknown) {
  const content = (result as { content: Array<{ type: string; text: string }> }).content;
  return JSON.parse(content[0].text);
}
```

### Test Structure

Tests follow the vitest convention with `describe` and `it` blocks:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('Component Name', () => {
  let server: ToolAwareSequentialThinkingServer;

  beforeEach(() => {
    server = new ToolAwareSequentialThinkingServer({ maxHistorySize: 10 });
    server.clear();
  });

  it('should do something', async () => {
    const result = await server.processThought(thought);
    expect(result).toBeDefined();
  });
});
```

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- src/__tests__/integration.test.ts

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```
