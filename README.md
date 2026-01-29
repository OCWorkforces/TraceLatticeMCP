# MCP Sequential Thinking Server

An MCP (Model Context Protocol) server that provides sequential thinking capabilities with intelligent tool and skill recommendations for AI assistants.

## Features

- **Sequential Thinking Framework**: Break down complex problems into structured thought steps
- **Tool Recommendations**: AI-driven tool selection with confidence scores and rationales
- **Skill Integration**: Support for Claude Code skills with automatic discovery
- **Branching & Revision**: Non-linear thinking paths with thought revision support
- **History Management**: Configurable thought history with automatic trimming
- **Type-Safe**: Full TypeScript support with Valibot validation

## Installation

```bash
npm install sequentialthinking-tools
```

## Quick Start

```typescript
import { McpServer } from 'tmcp';
import { ToolAwareSequentialThinkingServer } from 'sequentialthinking-tools';

const thinkingServer = new ToolAwareSequentialThinkingServer({
	maxHistorySize: 1000,
});

// Discover Claude Code skills automatically
thinkingServer.discoverSkills();

// Register with MCP server
server.tool(
	{
		name: 'sequentialthinking_tools',
		description: 'Sequential thinking with tool recommendations',
		schema: SequentialThinkingSchema,
	},
	async (input) => {
		return thinkingServer.processThought(input);
	}
);
```

## Usage

### Basic Usage

```typescript
await thinkingServer.processThought({
	thought: 'I need to analyze the codebase structure',
	thought_number: 1,
	total_thoughts: 5,
	next_thought_needed: true,
	available_mcp_tools: ['mcp-omnisearch', 'mcp-turso-cloud'],
	current_step: {
		step_description: 'Explore project structure',
		recommended_tools: [
			{
				tool_name: 'mcp-omnisearch',
				confidence: 0.9,
				rationale: 'Best for file discovery and code search',
				priority: 1,
			},
		],
		expected_outcome: 'List of main project directories and files',
	},
});
```

### Skill Discovery

The server automatically discovers skills from:

- `.claude/skills/` (project-local, highest priority)
- `~/.claude/skills/` (user-global)

Skills are defined in `SKILL.md` or `skill.md` files with YAML frontmatter:

```yaml
---
name: commit
description: Handles git commit workflow
user-invocable: true
allowed-tools: [git]
---
# Commit Skill

Guidelines for git commits...
```

## Configuration

### Environment Variables

| Variable           | Default | Description                                   |
| ------------------ | ------- | --------------------------------------------- |
| `MAX_HISTORY_SIZE` | `1000`  | Maximum number of thoughts to keep in history |

### Constructor Options

```typescript
interface ServerOptions {
	maxHistorySize?: number; // Default: 1000
}
```

## API Reference

### Methods

#### `addTool(tool: Tool): void`

Register an MCP tool with the server.

#### `addSkill(skill: Skill): void`

Register a Claude Code skill with the server.

#### `removeTool(name: string): boolean`

Remove a tool by name. Returns `true` if successful.

#### `removeSkill(name: string): boolean`

Remove a skill by name. Returns `true` if successful.

#### `updateTool(name: string, updates: Partial<Tool>): boolean`

Update tool properties. Returns `true` if successful.

#### `updateSkill(name: string, updates: Partial<Skill>): boolean`

Update skill properties. Returns `true` if successful.

#### `getAvailableTools(): Tool[]`

Get all registered tools.

#### `getAvailableSkills(): Skill[]`

Get all registered skills.

#### `discoverSkills(): number`

Scan for skills in standard locations. Returns the number of skills discovered.

#### `clearHistory(): void`

Clear thought history and branches.

#### `processThought(input): Promise<ToolResponse>`

Process a thought step in the sequential thinking chain.

## Development

```bash
# Install dependencies
npm install

# Run in development mode with MCP inspector
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint

# Format code
npm run format
```

## License

MIT
