# MCP Sequential Thinking Server

An MCP (Model Context Protocol) server that provides sequential thinking capabilities with intelligent tool and skill recommendations for AI assistants.

## Features

- **Sequential Thinking Framework**: Break down complex problems into structured thought steps
- **Tool Recommendations**: AI-driven tool selection with confidence scores and rationales
- **Skill Integration**: Support for Claude Code skills with automatic discovery
- **Branching & Revision**: Non-linear thinking paths with thought revision support
- **History Management**: Configurable thought history with automatic trimming
- **Type-Safe**: Full TypeScript support with Valibot validation

## Install

Requires [Node.js](https://nodejs.org/) v18+.

From the project root:

```bash
npm install -g tracelattice
```

## Configure MCP Client

The server uses **stdio transport** by default — no extra configuration needed. Add it to your MCP client:

### Claude Code

**User-scoped** (`~/.claude.json`) or **project-scoped** (`.mcp.json` in project root):

```json
{
  "mcpServers": {
    "tracelattice": {
      "command": "tracelattice"
    }
  }
}
```

Or via CLI:

```bash
claude mcp add tracelattice -- tracelattice
```

### Codex CLI

**User-scoped** (`~/.codex/config.toml`) or **project-scoped** (`.codex/config.toml`):

```toml
[mcp_servers.tracelattice]
command = "tracelattice"
```

Or via CLI:

```bash
codex mcp add tracelattice -- tracelattice
```

### OpenCode

**Global** (`~/.config/opencode/opencode.json`) or **project-scoped** (`.opencode.json`):

```json
{
  "mcpServers": {
    "tracelattice": {
      "type": "local",
      "command": [
        "npx",
        "-y",
        "tracelattice"
      ],
      "enabled": true,
      "environment": {
        "MAX_HISTORY_SIZE": "10000"
      }
    },
  }
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_HISTORY_SIZE` | `1000` | Maximum thoughts to keep in history |

## Transports

The server supports three transports via the `TRANSPORT_TYPE` environment variable:

| Transport | Use Case | Command |
|-----------|----------|---------|
| `stdio` (default) | Local MCP clients | `tracelattice` |
| `sse` (legacy) | Multi-user, backwards compat | `TRANSPORT_TYPE=sse tracelattice` |
| `streamable-http` | Production deployments | `TRANSPORT_TYPE=streamable-http tracelattice` |
## Development

```bash
npm install
npm run dev        # MCP inspector
npm test
npm run type-check
npm run lint
```

## License

MIT
