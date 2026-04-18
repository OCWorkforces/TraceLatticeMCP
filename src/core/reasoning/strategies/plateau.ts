/**
 * Detect if scores have plateaued (no meaningful improvement).
 *
 * A plateau is detected when the recent `window` scores show:
 * 1. Low variance (range < epsilon)
 * 2. No upward trend (last - first <= epsilon)
 *
 * @param scores - Array of sequential confidence/quality scores
 * @param window - Number of recent scores to examine (default 3)
 * @param epsilon - Minimum meaningful change threshold (default 0.02)
 * @returns true if the last `window` scores show no upward trend
 *
 * @example
 * detectPlateau([0.5, 0.5, 0.5]); // true
 * detectPlateau([0.1, 0.5, 0.9]); // false (upward trend)
 */
export function detectPlateau(
	scores: readonly number[],
	window: number = 3,
	epsilon: number = 0.02,
): boolean {
	if (scores.length < window) return false;

	const recent = scores.slice(-window);

	const min = Math.min(...recent);
	const max = Math.max(...recent);
	const range = max - min;

	const hasUpwardTrend = recent[recent.length - 1]! - recent[0]! > epsilon;

	return range < epsilon && !hasUpwardTrend;
}
