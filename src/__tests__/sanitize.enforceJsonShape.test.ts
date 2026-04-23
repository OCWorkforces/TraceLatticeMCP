import { describe, it, expect } from 'vitest';
import { enforceJsonShape, JsonShapeError } from '../sanitize.js';

describe('enforceJsonShape (WU-1.3)', () => {
	describe('prototype pollution keys', () => {
		it('rejects __proto__ as own property at top level', () => {
			const evil = JSON.parse('{"__proto__":{"polluted":true}}');
			expect(() => enforceJsonShape(evil)).toThrow(JsonShapeError);
		});

		it('rejects constructor key', () => {
			expect(() => enforceJsonShape({ constructor: 'evil' })).toThrow(/forbidden key/);
		});

		it('rejects prototype key', () => {
			expect(() => enforceJsonShape({ prototype: 'evil' })).toThrow(/forbidden key/);
		});

		it('rejects __proto__ nested deeply', () => {
			const evil = JSON.parse('{"a":{"b":{"__proto__":{}}}}');
			expect(() => enforceJsonShape(evil)).toThrow(/forbidden key/);
		});

		it('rejects forbidden keys inside arrays of objects', () => {
			const evil = JSON.parse('[{"ok":1},{"__proto__":{}}]');
			expect(() => enforceJsonShape(evil)).toThrow(/forbidden key/);
		});
	});

	describe('depth cap', () => {
		it('accepts nesting at the boundary (depth = 8)', () => {
			const v: Record<string, unknown> = { a: { b: { c: { d: { e: { f: { g: { h: 1 } } } } } } } };
			expect(() => enforceJsonShape(v)).not.toThrow();
		});

		it('rejects nesting beyond max depth', () => {
			let v: Record<string, unknown> = { leaf: 1 };
			for (let i = 0; i < 20; i++) v = { x: v };
			expect(() => enforceJsonShape(v)).toThrow(/max depth/);
		});

		it('respects custom maxDepth', () => {
			expect(() => enforceJsonShape({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toThrow(/max depth/);
		});
	});

	describe('size cap', () => {
		it('accepts payloads within the limit', () => {
			expect(() => enforceJsonShape({ q: 'short' })).not.toThrow();
		});

		it('rejects payloads exceeding maxBytes', () => {
			const big = { data: 'x'.repeat(20_000) };
			expect(() => enforceJsonShape(big)).toThrow(/max serialized size/);
		});

		it('respects custom maxBytes', () => {
			expect(() => enforceJsonShape({ q: 'hello' }, { maxBytes: 5 })).toThrow(/max serialized size/);
		});
	});

	describe('value type safety', () => {
		it('rejects functions', () => {
			expect(() => enforceJsonShape({ fn: () => 1 })).toThrow(/unsupported value type/);
		});

		it('rejects symbols', () => {
			expect(() => enforceJsonShape({ s: Symbol('x') })).toThrow(/unsupported value type/);
		});

		it('rejects bigints', () => {
			expect(() => enforceJsonShape({ n: 1n })).toThrow(/unsupported value type/);
		});

		it('rejects circular references', () => {
			const a: Record<string, unknown> = {};
			a.self = a;
			expect(() => enforceJsonShape(a)).toThrow(/circular reference/);
		});

		it('accepts primitives, arrays, and nested plain objects', () => {
			expect(() => enforceJsonShape({ a: 1, b: 'x', c: true, d: null, e: [1, 2, { f: 3 }] })).not.toThrow();
		});

		it('accepts undefined values (JSON.stringify drops them)', () => {
			expect(() => enforceJsonShape({ a: undefined })).not.toThrow();
		});
	});
});
