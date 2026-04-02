**Updated:** 2026-04-02
# WATCHERS MODULE

## OVERVIEW
**Commit:** 4d84f2e

Chokidar-backed watchers keep tool/skill registries in sync with filesystem changes.

## WHERE TO LOOK

- `src/watchers/SkillWatcher.ts` - Watches `.claude/skills/` (project) + `~/.claude/skills/` (user); events: `add`, `change`, `unlink` (214L).
- `src/watchers/ToolWatcher.ts` - Watches `.claude/tools/` (project) + `~/.claude/tools/` (user); events: `add`, `unlink` for `.tool.md` only (184L).
## CONVENTIONS

- **File filters:** skills accept `.md`, `.yml`, `.yaml`; tools accept `.tool.md` only.
- **Event handling:** skills re-discover on `add`/`change`, remove on `unlink`; tools re-discover on `add`, remove on `unlink`.
- **Registry updates:** skills call `discoverAsync()` / `removeSkillByName()`; tools call `discoverAsync()` / `removeTool()`.
- **Watcher config:** `chokidar` with `ignored: /node_modules/`, `persistent: true`.
- **Logging:** errors to `console.error()` (SkillWatcher direct, ToolWatcher via `log()`).
