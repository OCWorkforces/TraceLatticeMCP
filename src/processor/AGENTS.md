# PROCESSOR MODULE


## OVERVIEW

Core logic for validating, normalizing, and processing thought requests.

## STRUCTURE

```
```
src/processor/
├── ThoughtProcessor.ts  # Main logic (Validate → History → Format)
└── InputNormalizer.ts   # Fixes common LLM field mistakes (singular vs plural)
```

## LOGIC FLOW

1. **Normalize**: `InputNormalizer` fixes `recommended_tool` -> `recommended_tools`.
2. **Validate**: Valibot schema check.
3. **Adjust**: Auto-correct `total_thoughts` if exceeded.
4. **Persist**: Add to `HistoryManager`.
5. **Format**: Generate MCP response via `ThoughtFormatter`.

## KEY CONVENTIONS

- **Normalization**: Happens _before_ validation to be tolerant but safe.
- **Auto-Adjustment**: Prevents validation errors on long chains.
