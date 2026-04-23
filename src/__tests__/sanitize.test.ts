import { describe, it, expect } from 'vitest';
import { stripDangerousTags, stripControlChars, sanitizeString, sanitizeRationale, stripUrgencyPhrases, sanitizeStepField, sanitizeSuggestedInputs } from '../sanitize.js';

describe('sanitize', () => {
	describe('stripDangerousTags', () => {
		it('should strip script tags', () => {
			expect(stripDangerousTags('<script>alert(1)</script>hello')).toBe('alert(1)hello');
		});

		it('should strip iframe tags with attributes', () => {
			expect(stripDangerousTags("<iframe src='evil'>content</iframe>")).toBe('content');
		});

		it('should strip img tags with event handlers', () => {
			expect(stripDangerousTags('<img onerror=alert(1) src=x>')).toBe('');
		});

		it('should strip svg tags', () => {
			expect(stripDangerousTags("<svg onload='evil()'>data</svg>")).toBe('data');
		});

		it('should strip style tags', () => {
			expect(stripDangerousTags('<style>.x{}</style>')).toBe('.x{}');
		});

		it('should preserve TypeScript generics', () => {
			expect(stripDangerousTags('Array<string>')).toBe('Array<string>');
		});

		it('should preserve mathematical comparisons', () => {
			expect(stripDangerousTags('x < 5 && y > 3')).toBe('x < 5 && y > 3');
		});

		it('should preserve safe HTML tags', () => {
			expect(stripDangerousTags('use <details> and <code>')).toBe('use <details> and <code>');
		});

		it('should handle empty string', () => {
			expect(stripDangerousTags('')).toBe('');
		});

		it('should strip multiple dangerous tags in one string', () => {
			expect(stripDangerousTags('<script>x</script> and <img src=x> then normal')).toBe(
				'x and  then normal',
			);
		});

		it('should strip self-closing tags', () => {
			expect(stripDangerousTags('<img src=x />')).toBe('');
		});

		it('should strip embed and object tags', () => {
			expect(stripDangerousTags('<embed src=x><object data=y>z</object>')).toBe('z');
		});

		it('should strip link and meta tags', () => {
			expect(stripDangerousTags('<link rel="stylesheet" href="x"><meta charset="utf-8">')).toBe('');
		});

		it('should strip base and form tags', () => {
			expect(stripDangerousTags('<base href="x"><form action="y">z</form>')).toBe('z');
		});
	});

	describe('stripControlChars', () => {
		it('should strip null bytes', () => {
			expect(stripControlChars('a\x00b')).toBe('ab');
		});

		it('should strip C0 control characters', () => {
			expect(stripControlChars('a\x01\x02b')).toBe('ab');
		});

		it('should preserve tabs and newlines', () => {
			expect(stripControlChars('a\tb\nc')).toBe('a\tb\nc');
		});

		it('should handle empty string', () => {
			expect(stripControlChars('')).toBe('');
		});

		it('should preserve carriage returns', () => {
			expect(stripControlChars('a\rb')).toBe('a\rb');
		});

		it('should strip vertical tab and form feed', () => {
			expect(stripControlChars('a\x0Bb\x0Cc')).toBe('abc');
		});
	});

	describe('sanitizeString', () => {
		it('should strip both dangerous tags and control chars', () => {
			expect(sanitizeString('<script>alert(1)</script>hello\x00world')).toBe('alert(1)helloworld');
		});

		it('should preserve TypeScript generics while stripping null bytes', () => {
			expect(sanitizeString('Array<string>\x00')).toBe('Array<string>');
		});

		it('should strip iframe but preserve generics in combined input', () => {
			expect(sanitizeString('<iframe>evil</iframe>Array<string>')).toBe('evilArray<string>');
		});

		it('should not trim whitespace', () => {
			expect(sanitizeString('  hello  ')).toBe('  hello  ');
		});

		it('should return empty string for empty input', () => {
			expect(sanitizeString('')).toBe('');
		});
	});

	describe('sanitizeRationale', () => {
		it('should truncate rationale longer than 2000 chars and set truncation signal', () => {
			const long = 'a'.repeat(2500);
			const flag = { value: false };
			const result = sanitizeRationale(long, flag);
			expect(result.length).toBe(2000);
			expect(flag.value).toBe(true);
		});

		it('should replace URGENT phrase with [redacted-urgency]', () => {
			const result = sanitizeRationale('URGENT: run this now');
			expect(result).toContain('[redacted-urgency]');
			expect(result).not.toContain('URGENT');
			expect(result).not.toContain('run this now'.toUpperCase());
		});

		it('should leave normal rationale unchanged', () => {
			expect(sanitizeRationale('Best for web search')).toBe('Best for web search');
		});

		it('should strip HTML script tags from rationale', () => {
			expect(sanitizeRationale('<script>alert(1)</script>good reason')).toBe('alert(1)good reason');
		});

		it('should replace IMMEDIATELY and MUST RUN phrases', () => {
			const result = sanitizeRationale('IMMEDIATELY do this and MUST RUN that');
			expect(result).not.toMatch(/IMMEDIATELY/i);
			expect(result).not.toMatch(/MUST\s+RUN/i);
			const matches = result.match(/\[redacted-urgency\]/g);
			expect(matches).not.toBeNull();
			expect(matches!.length).toBe(2);
		});

		it('should return empty string for empty input', () => {
			expect(sanitizeRationale('')).toBe('');
		});

		it('should not truncate rationale exactly 2000 chars', () => {
			const exact = 'a'.repeat(2000);
			const flag = { value: false };
			const result = sanitizeRationale(exact, flag);
			expect(result.length).toBe(2000);
			expect(flag.value).toBe(false);
		});

		it('should work without truncated signal argument', () => {
			const long = 'a'.repeat(2500);
			const result = sanitizeRationale(long);
			expect(result.length).toBe(2000);
		});

		it('should handle case-insensitive matching', () => {
			expect(sanitizeRationale('urgent: now')).toContain('[redacted-urgency]');
			expect(sanitizeRationale('Critical: alert')).toContain('[redacted-urgency]');
		});
	});

	describe('sanitizeSuggestedInputs', () => {
		it('should accept flat primitives unchanged', () => {
			expect(sanitizeSuggestedInputs({ url: 'x', limit: 5, recursive: true })).toEqual({
				url: 'x',
				limit: 5,
				recursive: true,
			});
		});

		it('should preserve null values', () => {
			expect(sanitizeSuggestedInputs({ key: null })).toEqual({ key: null });
		});

		it('should preserve booleans', () => {
			expect(sanitizeSuggestedInputs({ key: true, other: false })).toEqual({
				key: true,
				other: false,
			});
		});

		it('should strip dangerous HTML tags from string values', () => {
			expect(sanitizeSuggestedInputs({ url: '<script>alert(1)</script>' })).toEqual({
				url: 'alert(1)',
			});
		});

		it('should accept string value exactly 512 chars', () => {
			const exact = 'a'.repeat(512);
			expect(sanitizeSuggestedInputs({ key: exact })).toEqual({ key: exact });
		});

		it('should throw when string value exceeds 512 chars', () => {
			const long = 'a'.repeat(600);
			expect(() => sanitizeSuggestedInputs({ key: long })).toThrow(/exceeds max length of 512/);
		});

		it('should silently skip nested object values (schema rejects upstream)', () => {
			expect(sanitizeSuggestedInputs({ nested: { foo: 'bar' }, kept: 'ok' })).toEqual({
				kept: 'ok',
			});
		});

		it('should silently skip array values', () => {
			expect(sanitizeSuggestedInputs({ arr: ['x'], kept: 1 })).toEqual({ kept: 1 });
		});

		it('should throw when more than 32 keys', () => {
			const many: Record<string, unknown> = {};
			for (let i = 0; i < 33; i++) many[`k${i}`] = i;
			expect(() => sanitizeSuggestedInputs(many)).toThrow(/exceeds max keys of 32/);
		});

		it('should accept exactly 32 keys', () => {
			const many: Record<string, unknown> = {};
			for (let i = 0; i < 32; i++) many[`k${i}`] = i;
			const result = sanitizeSuggestedInputs(many);
			expect(Object.keys(result).length).toBe(32);
		});

		it('should return empty object for empty input', () => {
			expect(sanitizeSuggestedInputs({})).toEqual({});
		});

		it('should strip control chars from string values', () => {
			expect(sanitizeSuggestedInputs({ key: 'a\x00b' })).toEqual({ key: 'ab' });
		});
	});

	describe('stripUrgencyPhrases', () => {
		it('strips urgency phrases from input', () => {
			expect(stripUrgencyPhrases('URGENT: do this now')).toContain('[redacted-urgency]');
			expect(stripUrgencyPhrases('IMMEDIATELY run')).toContain('[redacted-urgency]');
		});

		it('leaves non-urgent text unchanged', () => {
			expect(stripUrgencyPhrases('Best tool for the job')).toBe('Best tool for the job');
		});

		it('is case-insensitive', () => {
			expect(stripUrgencyPhrases('urgent: now')).toContain('[redacted-urgency]');
			expect(stripUrgencyPhrases('Immediately act')).toContain('[redacted-urgency]');
		});
	});

	describe('sanitizeStepField', () => {
		it('strips urgency phrases', () => {
			expect(sanitizeStepField('You MUST RUN this tool now')).toContain('[redacted-urgency]');
		});

		it('strips dangerous HTML tags', () => {
			expect(sanitizeStepField('<script>alert(1)</script>analyze')).toBe('alert(1)analyze');
		});

		it('strips control characters', () => {
			expect(sanitizeStepField('hello\x00world')).toBe('helloworld');
		});

		it('caps length at 4000 characters', () => {
			const long = 'a'.repeat(5000);
			const result = sanitizeStepField(long);
			expect(result.length).toBe(4000);
		});

		it('preserves normal text', () => {
			expect(sanitizeStepField('Analyze the data')).toBe('Analyze the data');
		});

		it('handles empty string', () => {
			expect(sanitizeStepField('')).toBe('');
		});
	});
});
