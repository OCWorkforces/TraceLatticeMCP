# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) server that provides sequential thinking capabilities with tool recommendations for AI assistants. It is adapted from the official MCP sequential thinking server (https://github.com/modelcontextprotocol/servers/blob/main/src/sequentialthinking/index.ts) with enhancements for MCP tool coordination.

The server runs on stdio and uses the `tmcp` framework with Valibot for schema validation.

## Commands

```bash
# Build the project
npm run build

# Start the server
npm run start

# Development mode with MCP inspector
npm run dev
```

## Project Structure

```
./
├── .env.cc              # Environment config for start-cc.sh (contains API keys - not in git)
├── .gitignore           # Standard ignores (Python + node_modules/)
├── start-cc.sh          # Shell script wrapper for running Claude Code with custom config
├── package.json         # Dependencies and npm scripts
├── tsconfig.json        # TypeScript config (extends @tsconfig/node24)
├── CLAUDE.md            # This file
├── LICENSE              # MIT License
├── README.md            # Minimal project header
└── src/                 # Source code
    ├── index.ts         # Main server: ToolAwareSequentialThinkingServer class
    ├── schema.ts        # Valibot validation schemas + SEQUENTIAL_THINKING_TOOL definition
    └── types.ts         # TypeScript interfaces (ThoughtData, ToolRecommendation, etc.)
```

## Architecture

### Core Components

- **`ToolAwareSequentialThinkingServer`** (src/index.ts:46-261): Main server class that manages thought history, branches, and tool recommendations
  - Maintains `thought_history` array (capped by `maxHistorySize`)
  - Tracks `branches` for alternative thought paths
  - Stores `available_tools` Map for tool discovery

- **`SequentialThinkingSchema`** (src/schema.ts:125-182): Valibot schema defining the input structure for the sequential thinking tool

- **`sequentialthinking_tools`**: The single MCP tool exposed by the server, accepting:
  - `available_mcp_tools`: Array of available MCP tool names
  - `thought`: Current thinking step
  - `thought_number`, `total_thoughts`: Sequence tracking
  - `current_step`: Tool recommendations with rationale
  - `previous_steps`, `remaining_steps`: Step tracking
  - Optional: `is_revision`, `revises_thought`, `branch_from_thought`, `branch_id`

### Data Flow

1. LLM calls `sequentialthinking_tools` with thought data and available tool list
2. Server validates input using Valibot (via tmcp adapter)
3. Server stores thought in history, handles branching/revisions
4. Server formats and returns thought with tool recommendations
5. Tool execution is handled by the MCP client, not this server

### Key Files

- `src/index.ts`: Main server implementation, `ToolAwareSequentialThinkingServer` class
- `src/types.ts`: TypeScript interfaces for `ThoughtData`, `ToolRecommendation`, `StepRecommendation`, `Tool`
- `src/schema.ts`: Valibot validation schemas and the `SEQUENTIAL_THINKING_TOOL` definition

## Configuration

### Environment Variables

- `MAX_HISTORY_SIZE`: Controls thought history limit (default: 1000)
- Loaded via `.env.cc` for the `start-cc.sh` wrapper script

### Server Configuration

Tool discovery is a TODO - currently tools must be added manually via `addTool()`

## Dependencies

- `tmcp`: MCP server framework
- `@tmcp/adapter-valibot`: Valibot schema adapter for MCP
- `@tmcp/transport-stdio`: Stdio transport for MCP communication
- `valibot`: Schema validation
- `chalk`: Terminal styling (for debug output to stderr)
