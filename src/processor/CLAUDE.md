# CLAUDE.md

This directory contains thought processing logic.

## Files

- `ThoughtProcessor.ts` - Core thought processing and validation

## ThoughtProcessor

The `ThoughtProcessor` class handles the core logic for processing sequential thinking requests.

### Responsibilities

1. **Input Validation**: Validates and normalizes thought input
2. **History Management**: Adds thoughts to history via HistoryManager
3. **Response Formatting**: Formats responses via ThoughtFormatter
4. **Error Handling**: Gracefully handles processing errors

### Validation Rules

- `thought_number` must be >= 1
- `total_thoughts` must be >= 1
- If `thought_number > total_thoughts`, `total_thoughts` is auto-adjusted
- `confidence` values must be between 0 and 1 (enforced by Valibot schema)
- `branch_id` must match regex `/^[a-zA-Z0-9_-]+$/` and be 1-50 characters

### Processing Flow

```
Input Thought
     │
     ▼
┌─────────────┐
│ Validate &  │
│ Normalize   │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Add to      │
│ History     │
└─────┬───────┘
      │
      ▼
┌─────────────┐
│ Format      │
│ Response    │
└─────┬───────┘
      │
      ▼
   Return
```

### Usage

```typescript
import { ThoughtProcessor } from './processor/ThoughtProcessor.js';

const processor = new ThoughtProcessor(historyManager, formatter, logger);

const result = await processor.process({
  thought: 'I need to analyze the problem',
  thought_number: 1,
  total_thoughts: 5,
  next_thought_needed: true,
  available_mcp_tools: ['search-tool'],
  current_step: {
    step_description: 'Analyze the problem',
    recommended_tools: [...],
    expected_outcome: 'Problem understood'
  }
});
```

### Response Format

Success response:
```json
{
  "content": [{
    "type": "text",
    "text": "{... JSON response ...}"
  }],
  "thought_number": 1,
  "total_thoughts": 5,
  "next_thought_needed": true,
  "branches": [],
  "thought_history_length": 1
}
```

Error response:
```json
{
  "content": [{
    "type": "text",
    "text": "{\"error\":\"...\",\"status\":\"failed\"}"
  }],
  "isError": true
}
```
