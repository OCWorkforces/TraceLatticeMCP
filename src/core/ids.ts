/**
 * Unique identifier generation utilities for thoughts and edges.
 *
 * @module core/ids
 */

import * as crypto from 'node:crypto';

/**
 * Generate a unique lexicographically-sortable identifier.
 *
 * Format: 8-char base36 timestamp + 20-char hex random (10 random bytes).
 * Result is up to 28 characters, sortable by creation time.
 *
 * @returns A unique string identifier.
 *
 * @example
 * ```typescript
 * const id = generateUlid(); // '01h2k3m400a1b2c3d4e5f6...'
 * ```
 */
export function generateUlid(): string {
	const timestamp = Date.now().toString(36).padStart(8, '0');
	const random = crypto.randomBytes(10).toString('hex');
	return `${timestamp}${random}`;
}

/**
 * Valid session ID pattern: alphanumeric, hyphens, underscores.
 *
 * Length is enforced separately via {@link MAX_SESSION_ID_LENGTH}.
 * Same character set as branch IDs.
 */
export const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * Maximum session ID length (in characters).
 *
 * Allows compound identifiers (e.g. `user-123_task-abc`).
 */
export const MAX_SESSION_ID_LENGTH = 100;
