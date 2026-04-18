# TraceLattice

[![npm version](https://img.shields.io/npm/v/tracelattice?color=blue&label=npm)](https://www.npmjs.com/package/tracelattice)

An MCP server that gives AI agents structured sequential thinking. Thoughts live in a DAG, reasoning strategies are pluggable, and confidence scores get calibrated against actual outcomes.

## Features

- 11 thought types: regular, hypothesis, verification, critique, synthesis, meta, tool_call, tool_observation, assumption, decomposition, backtrack
- DAG-based thought graph with 8 edge kinds (sequence, branch, merge, verifies, critiques, derives_from, tool_invocation, revises) and topological traversal
- Pluggable reasoning strategies. Sequential by default, or Tree-of-Thought with BFS/beam search and plateau detection
- Tool interleave: suspend a thinking chain, run a tool call, then resume where you left off
- Confidence calibration using Beta(2,2) priors, Brier score, and Expected Calibration Error (ECE)
- Branch compression: cold branches get rolled into summaries automatically, with a sliding-window dehydration policy
- Outcome recording for tool_call/tool_observation results with metadata
- Tool and skill recommendations with confidence scores, rationales, and automatic discovery
- Per-session isolation with TTL eviction and LRU caching
- Three transports: stdio (default), SSE (legacy), Streamable HTTP (production)
- Strict TypeScript, Valibot validation, 1913 tests, 18-service DI container

## Install

Requires [Node.js](https://nodejs.org/) v22+.

```bash
npm install -g tracelattice
```

## Configure your MCP client

The default transport is stdio. Add the server to your client:

### Claude Code

User-scoped (`~/.claude.json`) or project-scoped (`.mcp.json` in project root):

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

User-scoped (`~/.codex/config.toml`) or project-scoped (`.codex/config.toml`):

```toml
[mcp_servers.tracelattice]
command = "tracelattice"
```

Or via CLI:

```bash
codex mcp add tracelattice -- tracelattice
```

### OpenCode

Global (`~/.config/opencode/opencode.json`) or project-scoped (`.opencode.json`):

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
    }
}
```

## Configuration

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_HISTORY_SIZE` | `1000` | Maximum thoughts to keep in history |
| `MAX_BRANCHES` | `50` | Maximum number of branches |
| `MAX_BRANCH_SIZE` | `100` | Maximum size of each branch |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `PRETTY_LOG` | `true` | Enable pretty log output |

### Feature flags

All flags default to `false`. Set to `true` or `1` to enable.

| Variable | Description |
|----------|-------------|
| `TRACELATTICE_FEATURES_DAG_EDGES` | Enable DAG edges for thought relationships |
| `TRACELATTICE_FEATURES_CALIBRATION` | Enable confidence calibration with Beta(2,2) priors |
| `TRACELATTICE_FEATURES_COMPRESSION` | Enable branch compression for cold branches |
| `TRACELATTICE_FEATURES_TOOL_INTERLEAVE` | Enable suspend/resume for tool calls |
| `TRACELATTICE_FEATURES_NEW_THOUGHT_TYPES` | Enable tool_call, tool_observation, assumption, decomposition, backtrack |
| `TRACELATTICE_FEATURES_OUTCOME_RECORDING` | Enable outcome recording for tool results |
| `TRACELATTICE_FEATURES_REASONING_STRATEGY` | Strategy: `sequential` (default) or `tot` |

### Transport

| Variable | Default | Description |
|----------|---------|-------------|
| `TRANSPORT_TYPE` | `stdio` | Transport: `stdio`, `sse`, or `streamable-http` |
| `STREAMABLE_HTTP_PORT` | `3000` | Port for Streamable HTTP server |
| `STREAMABLE_HTTP_HOST` | `localhost` | Host for Streamable HTTP server |
| `STREAMABLE_HTTP_STATEFUL` | `true` | Enable stateful session tracking |
| `SSE_PORT` | `3000` | Port for SSE server |
| `SSE_HOST` | `localhost` | Host for SSE server |
| `SSE_ENABLE_POOL` | `true` | Enable connection pool for session isolation |
| `SSE_MAX_SESSIONS` | `100` | Maximum concurrent SSE sessions |
| `SSE_SESSION_TIMEOUT` | `300000` | SSE session timeout (ms) |
| `CORS_ORIGIN` | `*` | CORS origin |
| `ENABLE_CORS` | `true` | Enable CORS preflight |
| `ALLOWED_HOSTS` | (all) | Comma-separated allowed hosts |

### Skill discovery

| Variable | Default | Description |
|----------|---------|-------------|
| `SKILL_DIRS` | (none) | Colon-separated skill directories |
| `DISCOVERY_CACHE_TTL` | `300000` | Discovery cache TTL (ms) |
| `DISCOVERY_CACHE_MAX_SIZE` | `100` | Discovery cache max entries |

## Transports

Set `TRANSPORT_TYPE` to pick one:

| Transport | When to use | Command |
|-----------|-------------|---------|
| `stdio` (default) | Local MCP clients | `tracelattice` |
| `sse` (legacy) | Multi-user setups, backwards compatibility | `TRANSPORT_TYPE=sse tracelattice` |
| `streamable-http` | Production deployments | `TRANSPORT_TYPE=streamable-http tracelattice` |

## Development

```bash
npm install
npm run dev          # MCP inspector
npm test             # 1913 tests (vitest)
npm run test:coverage # with coverage report
npm run type-check   # tsc --noEmit
npm run lint         # eslint
npm run build        # rslib + rsbuild
```

## Architecture

```
src/
├── core/               # Domain logic
│   ├── graph/          # DAG edges: Edge, EdgeStore, GraphView
│   ├── evaluator/      # SignalComputer, Aggregator, PatternDetector, Calibrator
│   ├── compression/    # CompressionService, DehydrationPolicy, SummaryStore
│   ├── reasoning/      # OutcomeRecorder + strategies (Sequential, TreeOfThought)
│   └── tools/          # InMemorySuspensionStore (suspend/resume)
├── contracts/          # Shared interfaces (cross-module coupling point)
├── persistence/        # File, SQLite, Memory backends
├── transport/          # stdio, SSE, Streamable HTTP
├── di/                 # IoC container (18 services)
├── registry/           # Tool/Skill discovery with LRU cache
└── config/             # YAML + env var loading
```

## License

MIT
