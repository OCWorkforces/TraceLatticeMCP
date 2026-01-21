# CLAUDE.md

This directory contains thought processing logic.

## Files

- `ThoughtProcessor.ts` - Core thought processing and validation
- `InputNormalizer.ts` - Input normalization for LLM field name mistakes

## InputNormalizer

The `InputNormalizer` module handles common LLM field name mistakes before schema validation.

### Purpose

LLMs sometimes generate field names using singular forms when plural forms are required by the schema. This module normalizes these mistakes BEFORE Valibot schema validation, allowing strict schema validation while being tolerant of common LLM errors.

### Normalization Rules

| Singular (Wrong) | Plural (Correct) | Applied To |
|-----------------|------------------|------------|
| `recommended_tool` | `recommended_tools` | `current_step`, `previous_steps` |
| `recommended_skill` | `recommended_skills` | `current_step`, `previous_steps` |

### Design Rationale

The normalization happens **before** schema validation, which allows:
- The Valibot schema to remain strict and correct
- LLMs to make common field name mistakes without causing cryptic validation errors
- Graceful handling of these mistakes without breaking the processing pipeline

### Usage

```typescript
import { normalizeInput } from './processor/InputNormalizer.js';

const input = {
  thought: 'I need to analyze the data',
  thought_number: 1,
  total_thoughts: 3,
  next_thought_needed: true,
  current_step: {
    step_description: 'Read the data file',
    recommended_tool: [{  // Singular (wrong)
      tool_name: 'Read',
      confidence: 0.9,
      rationale: 'test',
      priority: 1
    }],
    expected_outcome: 'Data loaded'
  }
};

const normalized = normalizeInput(input);
// normalized.current_step.recommended_tools exists (plural form)
```

### Key Features

- **Preserves other fields**: Only modifies specific field names, preserves all other data
- **Handles non-object inputs**: Returns input as-is if not an object
- **Array mapping**: Normalizes each step in `previous_steps` individually
- **Conditional transformation**: Only transforms if plural field doesn't already exist

## ThoughtProcessor

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
┌───────────────────┐
│ Input Normalizer  │  ← Handles singular→plural field name mistakes
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Schema Validation │  ← Valibot schema validation
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Auto-adjust       │  ← Adjusts total_thoughts if thought_number exceeds it
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Add to History    │  ← HistoryManager.addThought()
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Format Response   │  ← ThoughtFormatter.formatThought()
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ Return CallToolResult │  ← MCP tool response format
└───────────────────┘
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

### Auto-Adjustment Behavior

The processor automatically adjusts `total_thoughts` when `thought_number` exceeds it:

```typescript
// Input: thought_number=5, total_thoughts=3
// After processing: thought_number=5, total_thoughts=5 (auto-adjusted)
```

This allows LLMs to continue thinking beyond their initial estimate without validation errors.

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
