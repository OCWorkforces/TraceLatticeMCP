/**
 * Shared utility helpers.
 *
 * @module utils
 */

/**
 * Asserts that a value is `never`. Use in switch default cases to enforce
 * exhaustiveness over discriminated unions. TypeScript will error at compile
 * time if any variant of the union is unhandled.
 *
 * @param value - The value that should be statically `never`.
 * @param message - Optional error message override.
 * @returns Never returns; always throws.
 *
 * @example
 * ```ts
 * function handle(t: ThoughtType): string {
 *   switch (t) {
 *     case 'regular': return 'r';
 *     // ... all other cases ...
 *     default: assertNever(t);
 *   }
 * }
 * ```
 */
export function assertNever(value: never, message?: string): never {
	throw new Error(message ?? `Unexpected value: ${String(value)}`);
}
