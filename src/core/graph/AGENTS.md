# GRAPH

**Parent:** ../AGENTS.md

## OVERVIEW

DAG substrate for thoughts: typed edges, per-session storage, read-only traversal.

## STRUCTURE

```
graph/
├── Edge.ts       # Edge interface + EdgeKind union (8 kinds)
├── EdgeStore.ts  # Per-session CRUD with adjacency Maps. Implements IEdgeStore.
└── GraphView.ts  # Read-only traversal: chronological, topological, ancestors/descendants, leaves, branchThoughts
```

## WHERE TO LOOK

| Task                              | File                                         |
| --------------------------------- | -------------------------------------------- |
| Add a new edge kind               | `Edge.ts` (extend `EdgeKind` union) + emitter wiring in `core/EdgeEmitter.ts` |
| Edge lookup by id / endpoint      | `EdgeStore.getEdge` / `outgoing` / `incoming` |
| Walk ancestors or descendants     | `GraphView.ancestors` / `descendants`        |
| Topological sort                  | `GraphView.topological` (Kahn's algorithm)   |
| Find frontier of a branch         | `GraphView.leaves` / `branchThoughts`        |
| Wipe a session's edges            | `EdgeStore.clearSession`                     |
| Self-edge guard                   | `EdgeStore.addEdge` throws `InvalidEdgeError` |

## CONVENTIONS

- **Branded IDs everywhere**: `EdgeId`, `ThoughtId`, `SessionId`, `BranchId` from `contracts/ids.ts`. Never raw strings.
- **Session-scoped**: edges in one session are invisible to another. `edgesForSession(sessionId)` is the only enumeration entry.
- **`IEdgeStore` is the contract** (7 methods: `addEdge`, `getEdge`, `outgoing`, `incoming`, `edgesForSession`, `clearSession`, `size`). Code outside this dir depends on the interface, not the class.
- **`GraphView` is read-only**: it takes an `IEdgeStore` and never mutates. Mutation lives in `core/EdgeEmitter.ts`.
- **Adjacency Maps**: `EdgeStore` keeps `byId`, `outgoing`, `incoming` in sync. All three update atomically per `addEdge`.

## ANTI-PATTERNS

- **No cross-session edges**: an edge's `from`, `to`, and `sessionId` must agree. Don't add escape hatches.
- **No self-edges**: `from === to` throws `InvalidEdgeError`. Don't catch and swallow upstream.
- **No mutation in `GraphView`**: if you need to change the graph, do it through `EdgeEmitter` + `EdgeStore`.

## NOTES

- `EdgeStore` is **always registered in DI**, even when `dagEdges` is off. The flag gates the WRITE path in `EdgeEmitter` only. Read paths stay safe so consumers can query an empty store without branching on the flag.
- `GraphView.topological()` throws `CycleDetectedError` when Kahn's algorithm can't drain the queue. Callers should treat this as a programmer error: edges are append-only and the emitter never produces cycles.
- `EdgeKind` has 8 variants: `sequence`, `branch`, `merge`, `verifies`, `critiques`, `derives_from`, `tool_invocation`, `revises`. Adding a 9th means updating `EdgeEmitter` (when to emit) and any GraphView traversal that filters by kind.
- Edges are append-only. There's no `removeEdge`. Session reset goes through `clearSession`.
