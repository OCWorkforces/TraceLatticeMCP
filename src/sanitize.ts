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
