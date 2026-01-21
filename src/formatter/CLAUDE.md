# CLAUDE.md

This directory contains response formatting components.

## Files

- `ThoughtFormatter.ts` - Formats thought responses for display

## ThoughtFormatter

The `ThoughtFormatter` class formats thought data into human-readable output with support for tool and skill recommendations.

### Output Format

```
┌──────────────────┐
│ 💭 Thought N/M │
├──────────────────┤
│ Thought content  │
└──────────────────┘

Recommendation:
Step: [step description]
Recommended Tools:
  - tool-name (priority: N)
    Rationale: [explanation]
    Confidence: 0.X
    [Alternatives: alt1, alt2]
    [Suggested Inputs: {...}]
Recommended Skills:
  - skill-name (priority: N)
    Rationale: [explanation]
    Confidence: 0.X
    [Allowed Tools: [...]]
    [User Invocable: true/false]
Expected Outcome: [outcome]
[Next Step Conditions: [...]]
```

### Usage

```typescript
import { ThoughtFormatter } from './formatter/ThoughtFormatter.js';

const formatter = new ThoughtFormatter();

const formatted = formatter.formatThought({
  thought: 'I need to search the codebase',
  thought_number: 1,
  total_thoughts: 3,
  next_thought_needed: true,
  current_step: {
    step_description: 'Search for files',
    recommended_tools: [...],
    expected_outcome: 'List of matching files'
  }
});

console.log(formatted);
```

## Features

- **Pretty Output**: Boxed formatting for thought content
- **Recommendation Display**: Formatted display of tools/skills with priorities
- **Confidence Scores**: Visual indication of recommendation confidence
- **Alternatives**: Shows alternative tools/skills when available
- **Metadata**: Displays branch/revision information when present

## Metadata Display

The formatter includes thought metadata in the output when available:

| Metadata | Display Format |
|----------|---------------|
| `is_revision` | `🔄 Revision of thought N` |
| `branch_id` | `🌿 Branch: branch-name` |
| `branch_from_thought` | `🌿 Branched from thought N` |
| `revises_thought` | `🔄 Revises thought N` |
