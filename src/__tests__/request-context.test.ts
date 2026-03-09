import { describe, it, expect } from 'vitest';
import { runWithContext, getRequestId, generateRequestId } from '../context/RequestContext.js';

describe('RequestContext', () => {
	it('getRequestId returns undefined outside context', () => {
		expect(getRequestId()).toBeUndefined();
	});

	it('runWithContext makes requestId available inside callback', async () => {
		await runWithContext('test-id-123', async () => {
			expect(getRequestId()).toBe('test-id-123');
		});
	});

	it('nested contexts use inner value', async () => {
		await runWithContext('outer', async () => {
			expect(getRequestId()).toBe('outer');
			await runWithContext('inner', async () => {
				expect(getRequestId()).toBe('inner');
			});
			expect(getRequestId()).toBe('outer');
		});
	});

	it('async continuations preserve context', async () => {
		await runWithContext('async-test', async () => {
			await new Promise((resolve) => setTimeout(resolve, 10));
			expect(getRequestId()).toBe('async-test');
		});
	});

	it('generateRequestId returns a UUID string', () => {
		const id = generateRequestId();
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
	});

	it('generateRequestId returns unique IDs', () => {
		const ids = new Set<string>();
		for (let i = 0; i < 100; i++) {
			ids.add(generateRequestId());
		}
		expect(ids.size).toBe(100);
	});
});
