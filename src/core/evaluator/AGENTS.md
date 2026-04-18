# EVALUATOR

## OVERVIEW

Decomposed evaluation pipeline. `ThoughtEvaluator` (parent) is a thin facade delegating to 4 specialists. Stateless per-call; no shared mutable state across components.

## COMPONENTS

| File | Role |
| --- | --- |
| `SignalComputer.ts` | Computes `ConfidenceSignals` per response. Owns `structural_quality` geomean + `quality_components` (floored) + `quality_components_raw` (pre-floor, debug). Uses `roundToPrecision()` for FP-safe averages. |
| `Aggregator.ts` | Builds `ReasoningStats`: hypothesis chains (id → verifications/critiques), type distribution, averages. Uses `roundToPrecision()` for FP-safe averages. |
| `PatternDetector.ts` | 6 detectors → priority-ranked hints (all emit `warning` severity, except `healthy_verification` which is `info`-only). Cooldown + max-3 cap applied at selection. |
| `Calibrator.ts` | Beta(2,2) prior smoothing of confidence; Brier + ECE (10 bins); temperature search over fixed grid. |
| `internals.ts` | Shared private helpers reused across the four. Not exported from `src/index.ts`. |

## QUALITY SCORING

Geometric mean over 4 components (weighted), floored at `FLOOR = 0.01` to prevent collapse:

- `QUALITY_WEIGHTS` — td=0.3, vc=0.3, de=0.2, cs=0.2
- `QUALITY_WEIGHTS_NO_CS` — td=0.375, vc=0.375, de=0.25 (used when `confidence_stability` is null)
- `confidence_stability` returns `null` when n &lt; 2 (single sample has no variance signal); excluded from the geomean and weights renormalize.

Components: `type_diversity`, `verification_coverage`, `depth_efficiency`, `confidence_stability`. Raw (pre-floor) values surface as `quality_components_raw`.

## PATTERNS

Priority order (lower fires first, max 3 hints per response):

1. `confidence_drift`
2. `unverified_hypothesis` — needs ≥ 3 thoughts AFTER the hypothesis before firing
3. `consecutive_without_verification`
4. `monotonic_type` — gated on `history.length ≥ 5` AND `runLength ≥ 4`. Severity: `warning`.
5. `no_alternatives_explored` — Severity: `warning`.
6. `healthy_verification` (info-only, severity: `info`)

Per-pattern cooldown is configurable per session.

## CALIBRATION

- Beta(2,2) priors smooth low-sample bins.
- Brier score + ECE (10 equal-width bins) reported in `CalibrationMetrics`.
- Temperature scaling: searches `TEMPERATURE_GRID = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]`.
- Requires `MIN_OUTCOMES_FOR_TEMPERATURE = 10` recorded outcomes; otherwise returns identity.
- Gated by `outcomeRecording` feature flag (records `tool_call`/`tool_observation` outcomes via `HistoryManager`).

## NOTES

- All four specialists are pure: no I/O, no clocks, no DI lookups beyond constructor injection.
- Adding a pattern: extend `PatternDetector`, assign a priority, add cooldown default. Don't bypass the selection cap.
- Adding a quality component: update both weight tables and renormalization logic. Floor must remain.
