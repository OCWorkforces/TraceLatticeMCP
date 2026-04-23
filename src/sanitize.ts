/**
 * Input sanitization for the sequential thinking MCP tool.
 *
 * Provides pure functions for stripping dangerous content from free-text fields.
 * Uses a targeted blocklist approach: only removes HTML tags that can execute code,
 * while preserving generic angle-bracket content like TypeScript generics (`Array<string>`),
 * mathematical comparisons (`x < 5`), and markdown formatting.
 *
 * @module sanitize
 */

/**
 * Regex matching dangerous HTML tags that can execute JavaScript or load external resources.
 * Targets: script, iframe, img, style, svg, embed, object, link, meta, base, form.
 * Preserves: `Array<string>`, `x < 5 && y > 3`, `<details>`, `<code>`, `<pre>`, etc.
 */
const DANGEROUS_TAG_REGEX =
	/<\/?(script|iframe|img|style|svg|embed|object|link|meta|base|form)(\s[^>]*)?\s*\/?>/gi;

/**
 * Null bytes and C0 control characters (except tab \t, newline \n, carriage return \r).
 * These can cause truncation in C bindings, file I/O, and some databases.
 */
// eslint-disable-next-line no-control-regex -- intentional: matches C0 control chars to strip them
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

/**
 * Strip dangerous HTML tags that can execute JavaScript or load external resources.
 *
 * Uses a targeted blocklist to remove only tags known to be dangerous (script, iframe,
 * img, style, svg, embed, object, link, meta, base, form) while preserving safe
 * angle-bracket content like TypeScript generics and mathematical comparisons.
 *
 * @param input - The string to sanitize
 * @returns The input with dangerous HTML tags removed
 *
 * @example
 * ```ts
 * stripDangerousTags('<script>alert(1)</script>hello'); // 'hello'
 * stripDangerousTags('Array<string>'); // 'Array<string>' (preserved)
 * stripDangerousTags('x < 5 && y > 3'); // 'x < 5 && y > 3' (preserved)
 * ```
 */
export function stripDangerousTags(input: string): string {
	return input.replace(DANGEROUS_TAG_REGEX, '');
}

/**
 * Strip null bytes and C0 control characters from a string.
 *
 * Removes characters in the range U+0000–U+0008, U+000B, U+000C, U+000E–U+001F.
 * Preserves tab (`\t`, U+0009), newline (`\n`, U+000A), and carriage return (`\r`, U+000D)
 * as these are commonly used in thought content.
 *
 * @param input - The string to sanitize
 * @returns The input with control characters removed
 *
 * @example
 * ```ts
 * stripControlChars('a\x00b'); // 'ab'
 * stripControlChars('a\tb\nc'); // 'a\tb\nc' (tab and newline preserved)
 * ```
 */
export function stripControlChars(input: string): string {
	return input.replace(CONTROL_CHAR_REGEX, '');
}

/**
 * Sanitize a string by stripping both control characters and dangerous HTML tags.
 *
 * Composes {@link stripControlChars} and {@link stripDangerousTags} in sequence.
 * Does not trim whitespace — thought content may depend on leading/trailing spaces.
 * Always returns a string, even if the input is empty.
 *
 * @param input - The string to sanitize
 * @returns The fully sanitized string
 *
 * @example
 * ```ts
 * sanitizeString('<script>alert(1)</script>hello\x00world'); // 'helloworld'
 * sanitizeString('Array<string>\x00'); // 'Array<string>'
 * ```
 */
export function sanitizeString(input: string): string {
	return stripDangerousTags(stripControlChars(input));
}


/**
 * Forbidden object keys that enable prototype pollution.
 * These keys allow attackers to inject properties onto Object.prototype,
 * affecting all subsequent objects in the runtime.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Default options for {@link enforceJsonShape}.
 */
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_BYTES = 16384;

export interface EnforceJsonShapeOptions {
	maxDepth?: number;
	maxBytes?: number;
}

export class JsonShapeError extends Error {
	public readonly reason: string;
	constructor(reason: string) {
		super(reason);
		this.name = 'JsonShapeError';
		this.reason = reason;
	}
}

/**
 * Enforce safety constraints on a JSON-shaped value.
 *
 * Rejects:
 * - Prototype-pollution keys (`__proto__`, `constructor`, `prototype`) at any depth
 * - Nesting deeper than `maxDepth` (default 8)
 * - Serialized JSON byte length exceeding `maxBytes` (default 16384)
 * - Functions, symbols, and other non-JSON-safe values
 *
 * Used as a defense-in-depth gate for untrusted structured input such as
 * `tool_arguments` from an LLM.
 *
 * @param value - The value to validate
 * @param opts - Optional limits
 * @throws {JsonShapeError} when any constraint is violated
 *
 * @example
 * ```ts
 * enforceJsonShape({ q: 'hello' }); // ok
 * enforceJsonShape({ __proto__: { polluted: true } }); // throws
 * enforceJsonShape({ a: { b: { c: { d: { e: { f: { g: { h: { i: 1 } } } } } } } } }); // throws (depth)
 * ```
 */
export function enforceJsonShape(value: unknown, opts: EnforceJsonShapeOptions = {}): void {
	const maxDepth = opts.maxDepth ?? DEFAULT_MAX_DEPTH;
	const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;

	const seen = new WeakSet<object>();

	const walk = (node: unknown, depth: number): void => {
		if (depth > maxDepth) {
			throw new JsonShapeError(`exceeds max depth of ${maxDepth}`);
		}
		if (node === null) return;
		const type = typeof node;
		if (type === 'string' || type === 'number' || type === 'boolean') return;
		if (type === 'undefined') return;
		if (type === 'function' || type === 'symbol' || type === 'bigint') {
			throw new JsonShapeError(`unsupported value type '${type}'`);
		}
		if (type !== 'object') {
			throw new JsonShapeError(`unsupported value type '${type}'`);
		}
		const obj = node as object;
		if (seen.has(obj)) {
			throw new JsonShapeError('circular reference detected');
		}
		seen.add(obj);

		if (Array.isArray(node)) {
			for (const item of node) walk(item, depth + 1);
			return;
		}

		for (const key of Object.keys(obj)) {
			if (FORBIDDEN_KEYS.has(key)) {
				throw new JsonShapeError(`forbidden key '${key}'`);
			}
			walk((obj as Record<string, unknown>)[key], depth + 1);
		}
	};

	walk(value, 0);

	let serialized: string;
	try {
		serialized = JSON.stringify(value);
	} catch {
		throw new JsonShapeError('value is not JSON-serializable');
	}
	if (serialized === undefined) return;
	const bytes = Buffer.byteLength(serialized, 'utf8');
	if (bytes > maxBytes) {
		throw new JsonShapeError(`exceeds max serialized size of ${maxBytes} bytes (got ${bytes})`);
	}
}

/**
 * Urgency/imperative phrases that could be used for prompt injection.
 * Matched case-insensitively and replaced with [redacted-urgency].
 */
const URGENCY_PHRASES =
	/\b(URGENT(?:LY)?|IMMEDIATELY|MUST\s+RUN|CRITICAL:|ACTION\s+REQUIRED|DO\s+NOT\s+IGNORE|EXECUTE\s+NOW|RUN\s+THIS\s+NOW)/gi;

/**
 * Strip urgency/imperative phrases from a string.
 * These phrases could be used for prompt injection when reflected to a host LLM.
 *
 * @param input - The string to strip urgency phrases from
 * @returns The string with urgency phrases replaced by '[redacted-urgency]'
 *
 * @example
 * ```ts
 * stripUrgencyPhrases('URGENT: do this'); // '[redacted-urgency] do this'
 * stripUrgencyPhrases('Best for web search'); // 'Best for web search'
 * ```
 */
export function stripUrgencyPhrases(input: string): string {
	return input.replace(URGENCY_PHRASES, '[redacted-urgency]');
}
/**
 * Maximum allowed length for rationale strings.
 */
const MAX_RATIONALE_LENGTH = 2000;

/**
 * Sanitize a rationale string by stripping urgency phrases, capping length,
 * and applying standard string sanitization.
 *
 * Applied to `recommended_tools[].rationale` and `recommended_skills[].rationale`
 * to prevent prompt-injection via urgency language.
 *
 * @param input - The rationale string to sanitize
 * @param truncated - Optional object to receive truncation signal (sets `.value = true` if truncated)
 * @returns The sanitized rationale
 *
 * @example
 * ```ts
 * sanitizeRationale('URGENT: run this now'); // '[redacted-urgency] run this now'
 * sanitizeRationale('Best for web search'); // 'Best for web search' (unchanged)
 * ```
 */
export function sanitizeRationale(input: string, truncated?: { value: boolean }): string {
	let result = sanitizeString(input);
	result = stripUrgencyPhrases(result);
	if (result.length > MAX_RATIONALE_LENGTH) {
		result = result.slice(0, MAX_RATIONALE_LENGTH);
		if (truncated) truncated.value = true;
	}
	return result;
}

/**
 * Maximum allowed length for step-level string fields (step_description, expected_outcome, meta_observation).
 */
const MAX_STEP_FIELD_LENGTH = 4000;

/**
 * Sanitize a step-level string field by stripping urgency phrases, capping length,
 * and applying standard string sanitization.
 *
 * Applied to `step_description`, `expected_outcome`, `meta_observation`, and
 * `next_step_conditions` items to prevent prompt injection through urgency language.
 *
 * @param input - The string to sanitize
 * @returns The sanitized string
 *
 * @example
 * ```ts
 * sanitizeStepField('You MUST RUN this tool'); // 'You [redacted-urgency] this tool'
 * sanitizeStepField('Analyze the code'); // 'Analyze the code' (unchanged)
 * ```
 */
export function sanitizeStepField(input: string): string {
	let result = sanitizeString(input);
	result = stripUrgencyPhrases(result);
	if (result.length > MAX_STEP_FIELD_LENGTH) {
		result = result.slice(0, MAX_STEP_FIELD_LENGTH);
	}
	return result;
}

/**
 * Maximum number of keys allowed in suggested_inputs.
 */
const MAX_SUGGESTED_INPUTS_KEYS = 32;

/**
 * Maximum string value length in suggested_inputs.
 */
const MAX_SUGGESTED_INPUT_VALUE_LENGTH = 512;

/**
 * Sanitize suggested_inputs: cap string value lengths, strip control chars and dangerous tags.
 *
 * Only processes flat primitive values (string | number | boolean | null).
 * Non-primitive values (nested objects, arrays) are silently skipped — schema validation
 * is expected to reject them upstream.
 *
 * @param inputs - The suggested_inputs record to sanitize
 * @returns The sanitized record with cleaned string values
 * @throws {Error} if string value exceeds max length, or if more than 32 keys are present
 *
 * @example
 * ```ts
 * sanitizeSuggestedInputs({ url: 'x', limit: 5 }); // { url: 'x', limit: 5 }
 * sanitizeSuggestedInputs({ url: '<script>alert(1)</script>' }); // { url: 'alert(1)' }
 * ```
 */
export function sanitizeSuggestedInputs(
	inputs: Record<string, unknown>,
): Record<string, string | number | boolean | null> {
	const keys = Object.keys(inputs);
	if (keys.length > MAX_SUGGESTED_INPUTS_KEYS) {
		throw new Error(
			`suggested_inputs exceeds max keys of ${MAX_SUGGESTED_INPUTS_KEYS} (got ${keys.length})`,
		);
	}
	const result: Record<string, string | number | boolean | null> = {};
	for (const key of keys) {
		const value = inputs[key];
		if (typeof value === 'string') {
			if (value.length > MAX_SUGGESTED_INPUT_VALUE_LENGTH) {
				throw new Error(
					`suggested_inputs value for key '${key}' exceeds max length of ${MAX_SUGGESTED_INPUT_VALUE_LENGTH}`,
				);
			}
			result[key] = sanitizeString(value);
		} else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
			result[key] = value;
		}
		// Skip other types (shouldn't reach here if schema validates first)
	}
	return result;
}