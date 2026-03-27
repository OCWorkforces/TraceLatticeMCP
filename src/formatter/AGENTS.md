# FORMATTER MODULE

## OVERVIEW

ThoughtFormatter produces human-readable thought output with recommendation, confidence, and metadata display.

## WHERE TO LOOK

- `src/formatter/ThoughtFormatter.ts` - Thought formatting pipeline; builds thought header, content lines, and recommendation summary.
## CONVENTIONS

- Formatter is presentation-only; no business logic or state changes.
- Output includes a thought header plus optional recommendation block in a single formatted string.
- Metadata display is conditional: revision, branch, and ancestry fields only when present.
