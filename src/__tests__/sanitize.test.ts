import { describe, it, expect } from 'vitest';
import { stripDangerousTags, stripControlChars, sanitizeString } from '../sanitize.js';

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
});
