# CLAUDE.md

This directory contains registry components for managing tools and skills.

## Files

- `ToolRegistry.ts` - Tool registration and management
- `SkillRegistry.ts` - Skill registration and discovery

## ToolRegistry

The `ToolRegistry` class manages MCP tool registration, lookup, and CRUD operations.

### Usage

```typescript
import { ToolRegistry } from './registry/ToolRegistry.js';

const registry = new ToolRegistry(logger, cache);

// Add a tool
registry.addTool({
  name: 'my-tool',
  description: 'A custom tool',
  inputSchema: { type: 'object' }
});

// Get a tool
const tool = registry.getTool('my-tool');

// List all tools
const tools = registry.listTools();

// Remove a tool
registry.removeTool('my-tool');

// Clear all tools
registry.clearTools();
```

## SkillRegistry

The `SkillRegistry` class manages skill discovery, registration, and CRUD operations for Claude Code skills.

### Skill Discovery

Skills are discovered from directories in priority order:
1. `.claude/skills/` (project-local, highest priority)
2. `~/.claude/skills/` (user-global)

### Skill File Format

Skills are defined in `SKILL.md` or `skill.md` files:

```markdown
---
name: commit
description: Handles git commit workflow
user-invocable: true
allowed-tools: [git, bash]
---

# Commit Skill

Guidelines for git commits...
```

### Usage

```typescript
import { SkillRegistry } from './registry/SkillRegistry.js';

const registry = new SkillRegistry({
  logger,
  cache,
  skillDirs: ['.claude/skills', '~/.claude/skills'],
  lazyDiscovery: false
});

// Discover skills asynchronously
const count = await registry.discoverAsync();

// Add a skill manually
registry.addSkill({
  name: 'my-skill',
  description: 'A custom skill',
  user_invocable: true,
  allowed_tools: ['bash']
});

// Get a skill
const skill = registry.getSkill('my-skill');

// List all skills
const skills = registry.listSkills();

// Remove a skill
registry.removeSkill('my-skill');

// Clear all skills
registry.clearSkills();
```

## Environment Overrides

Tools and skills can be overridden via environment variables:

```bash
# Override tool list
export AVAILABLE_TOOLS="tool1,tool2,tool3"

# Override skill list
export AVAILABLE_SKILLS="commit,review-pr,pdf"
```

## Cache Integration

Both registries support optional caching to avoid repeated discovery operations:

```typescript
import { DiscoveryCache } from './cache/DiscoveryCache.js';

const cache = new DiscoveryCache({ ttl: 300, maxSize: 100 });
const registry = new SkillRegistry({ cache });
```
