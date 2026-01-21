# CLAUDE.md

This directory contains file system watchers for dynamic tool and skill discovery.

## Files

- `SkillWatcher.ts` - File watcher for skill directory changes
- `ToolWatcher.ts` - File watcher for tool directory changes

## Overview

Both watchers use the `chokidar` library to monitor file system changes and automatically update their respective registries. When files are added, modified, or removed, the watchers trigger re-discovery or removal operations to keep the registries in sync with the filesystem.

## SkillWatcher

The `SkillWatcher` class monitors skill directories for changes and automatically updates the `SkillRegistry`.

### Watched Directories

- `.claude/skills/` (project-local, highest priority)
- `~/.claude/skills/` (user-global)

### Watched Events

| Event | Trigger | Behavior |
|-------|---------|----------|
| `add` | New skill file created | Triggers full skill re-discovery via `discoverAsync()` |
| `change` | Skill file modified | Triggers full skill re-discovery via `discoverAsync()` |
| `unlink` | Skill file deleted | Extracts skill name and calls `removeSkillByName()` |

### File Types

Watches for files with these extensions:
- `.md` (Markdown skill files)
- `.yml` (YAML skill files)
- `.yaml` (YAML skill files)

### Usage

```typescript
import { SkillWatcher } from './watchers/SkillWatcher.js';
import { SkillRegistry } from './registry/SkillRegistry.js';

const registry = new SkillRegistry();
const watcher = new SkillWatcher(registry);
// Watcher automatically starts monitoring skill directories

// When a skill file is added/modified, re-discovery is triggered
// When a skill file is deleted, it's removed from the registry

// When done, stop the watcher
watcher.stop();
```

### Configuration

The watcher uses `chokidar` with these settings:
- `ignored: /node_modules/` - Ignores node_modules directories
- `persistent: true` - Continues watching even if files are temporarily deleted

### Error Handling

- Re-discovery failures are logged to stderr
- Skill removal failures are caught and logged (doesn't throw)
- Uses `console.error()` for all logging

## ToolWatcher

The `ToolWatcher` class monitors tool directories for changes and automatically updates the `ToolRegistry`.

### Watched Directories

- `.claude/tools/` (project-local)
- `~/.claude/tools/` (user-global)

### Watched Events

| Event | Trigger | Behavior |
|-------|---------|----------|
| `add` | New tool file created | Triggers tool rediscovery via `discoverAsync()` (only for `.tool.md` files) |
| `unlink` | Tool file deleted | Extracts tool name and calls `removeTool()` (only for `.tool.md` files) |

### File Types

**Only watches for `.tool.md` files** - other file types are ignored, including:
- Regular `.md` files
- `.yml` / `.yaml` files
- Any other file extensions

### Usage

```typescript
import { ToolWatcher } from './watchers/ToolWatcher.js';
import { ToolRegistry } from './registry/ToolRegistry.js';

const registry = new ToolRegistry();
const watcher = new ToolWatcher(registry);
// Watcher automatically starts monitoring tool directories

// When a .tool.md file is added, rediscovery is triggered
// When a .tool.md file is deleted, it's removed from the registry

// When done, stop the watcher
watcher.stop();
```

### Configuration

The watcher uses `chokidar` with these settings:
- `ignored: /node_modules/` - Ignores node_modules directories
- `persistent: true` - Continues watching even if files are temporarily deleted

### Error Handling

- Discovery failures after file add are logged
- Tool removal failures are logged (tool may not have been registered)
- Uses internal `log()` method that writes to `console.error()`

## Key Differences

| Feature | SkillWatcher | ToolWatcher |
|---------|-------------|-------------|
| **Change Events** | Handles `change` events | Does NOT handle `change` events |
| **File Types** | `.md`, `.yml`, `.yaml` | Only `.tool.md` |
| **Name Extraction** | Uses full filename with extension | Removes `.tool.md` extension |
| **Removal Method** | `removeSkillByName()` | `removeTool()` |

## Integration with Server

Both watchers are automatically started by the main server when `enableWatcher` option is `true`:

```typescript
import { ToolAwareSequentialThinkingServer } from './index.js';

const server = await ToolAwareSequentialThinkingServer.create({
    enableWatcher: true  // Enables both SkillWatcher and ToolWatcher
});

// Watchers run automatically in the background
// Call server.stop() to stop watchers
```

## Performance Considerations

### Current Behavior
- **Full Re-discovery**: Both watchers trigger full re-discovery on file changes
- **No Debouncing**: Rapid file changes can trigger multiple discovery operations
- **Cache Integration**: Registries use `DiscoveryCache` to reduce filesystem overhead

### Recommendations
- For large numbers of skill/tool files, consider adding debouncing
- Watchers are most useful during development; consider disabling in production
- Cache TTL can be adjusted to balance freshness vs performance

## Lifecycle

1. **Startup**: Watchers start automatically when instantiated
2. **Monitoring**: Continuously monitor directories for changes
3. **Events**: Trigger appropriate registry updates on file changes
4. **Shutdown**: Call `stop()` to clean up resources (closes chokidar watcher)

## Logging

Both watchers use `console.error()` for logging:
- SkillWatcher logs: "Skill added:", "Skill modified:", "Skill removed:"
- ToolWatcher logs: "Tool file added:", "Tool file removed:", "Unregistered tool:"
