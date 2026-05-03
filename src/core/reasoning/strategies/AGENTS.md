# REASONING STRATEGIES

## OVERVIEW

Leaf policies that decide what the thinking loop does next. Each strategy is a pure function over a `StrategyContext` (graph snapshot, history, stats, current thought) and returns a `StrategyDecision`. No mutable state, no I/O, no side effects. The parent `IReasoningStrategy` contract lives in `src/contracts/strategy.ts`; see `src/core/AGENTS.md` for its shape.

Selection happens in `StrategyFactory` based on the `reasoningStrategy` feature flag (`'sequential' | 'tot'`). Default is `sequential`.

## STRUCTURE

```
strategies/
├── SequentialStrategy.ts    # Linear default: always continue
├── TreeOfThoughtStrategy.ts # BFS/beam ToT with plateau exit (178L)
├── StrategyFactory.ts       # Flag-driven dispatch
├── totScoring.ts            # scoreThought, selectBeam, breadthFirstFrontier
└── plateau.ts               # Score-gain threshold detection
```

## WHERE TO LOOK

| Task                              | Location                  |
| --------------------------------- | ------------------------- |
| Add a new strategy variant        | `StrategyFactory.ts`      |
| Tune ToT beam width or scoring    | `totScoring.ts`           |
| Adjust plateau exit sensitivity   | `plateau.ts`              |
| Type-weight per `ThoughtType`     | `totScoring.ts` (weights) |
| Default linear behavior           | `SequentialStrategy.ts`   |

## CONVENTIONS

- **Pure policy**: strategies receive `StrategyContext` and return `StrategyDecision`. Never mutate the graph, never persist, never log to side channels.
- **No barrel**: each file imported directly by its consumer. Don't add `index.ts`.
- **Exhaustiveness**: `StrategyFactory` uses `assertNever` on the selector string; `totScoring` uses `assertNever` on the `ThoughtType` union (11 variants). When you add a thought type or strategy name, the compiler will point at the missing branch.
- **Sequential is trivial**: always returns `{ action: 'continue' }`. Keep it that way; complexity belongs in ToT.
- **ToT scoring shape**: `score = confidence × novelty × type_weight`. Frontier comes from `breadthFirstFrontier`, beam from `selectBeam`, exit from `detectPlateau` (gain below threshold).
- **Depth-4 leaves**: these files sit at the bottom of the layer graph. They may import from `contracts/` and `core/` types only, never from infrastructure or DI.

## NOTES

- Feature flag `reasoningStrategy` gates the write path only. Both strategies are always compiled and testable; the factory just picks one per request.
- Plateau detection is the single exit signal for ToT. If you need richer termination (budget caps, confidence floors), add a separate predicate rather than overloading `detectPlateau`.
- `StrategyContext.graph` is a read-only snapshot. If you find yourself wanting to write back, you're in the wrong layer, push the mutation up to `ThoughtProcessor`.
- Scoring weights are heuristic and not calibrated. Treat changes as behavioral and cover them with tests in `src/__tests__/`.
