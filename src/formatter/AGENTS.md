# FORMATTER MODULE

## OVERVIEW

ThoughtFormatter produces human-readable thought output with recommendation, confidence, and metadata display.

## WHERE TO LOOK

- `src/formatter/ThoughtFormatter.ts` Thought formatting pipeline; builds thought header, content lines, and recommendation summary.
- `src/formatter/ThoughtFormatter.ts` Recommendation display for tools/skills, priorities, rationales, confidence, alternatives, and suggested inputs.
- `src/formatter/ThoughtFormatter.ts` Pretty output styling (icons/boxed header) and metadata cues for revisions and branches.

## CONVENTIONS

- Formatter is presentation-only; no business logic or state changes.
- Output includes a thought header plus optional recommendation block in a single formatted string.
- Metadata display is conditional: revision, branch, and ancestry fields only when present.
