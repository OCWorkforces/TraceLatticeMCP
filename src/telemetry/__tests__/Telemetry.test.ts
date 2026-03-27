import { describe, it, expect } from 'vitest';
import { readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Telemetry } from '../Telemetry.js';

describe('Telemetry', () => {
	it('records span when telemetry is enabled', () => {
		const telemetry = new Telemetry({ enabled: true, serviceName: 'test-service' });
		const span = telemetry.startSpan('processThought', 'consumer', { thought_number: 1 });
		span.end();

		const spans = telemetry.getSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]!.name).toBe('processThought');
		expect(spans[0]!.attributes.service).toBe('test-service');
		expect(spans[0]!.durationMs).toBeTypeOf('number');
	});

	it('does not retain spans when telemetry is disabled', () => {
		const telemetry = new Telemetry({ enabled: false });
		const span = telemetry.startSpan('noop', 'internal');
		span.end();

		expect(telemetry.getSpans()).toHaveLength(0);
	});

	it('captures error message on failed span', () => {
		const telemetry = new Telemetry({ enabled: true });
		const span = telemetry.startSpan('failing-op', 'server');
		span.end(new Error('boom'));

		const spans = telemetry.getSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]!.error).toBe('boom');
	});

	it('getSpans returns empty array when no spans recorded', () => {
		const telemetry = new Telemetry({ enabled: true });

		expect(telemetry.getSpans()).toEqual([]);
	});

	it('getSpans returns array of recorded spans', () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('one', 'internal').end();
		telemetry.startSpan('two', 'client').end();

		const spans = telemetry.getSpans();
		expect(Array.isArray(spans)).toBe(true);
		expect(spans).toHaveLength(2);
	});

	it('getSpans returns spans in recording order', () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('first', 'internal').end();
		telemetry.startSpan('second', 'internal').end();
		telemetry.startSpan('third', 'internal').end();

		expect(telemetry.getSpans().map((span) => span.name)).toEqual(['first', 'second', 'third']);
	});

	it('clear clears all recorded spans', () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('one', 'internal').end();
		telemetry.startSpan('two', 'internal').end();

		telemetry.clear();

		expect(telemetry.getSpans()).toHaveLength(0);
	});

	it('after clear, getSpans returns empty array', () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('one', 'internal').end();
		telemetry.clear();

		expect(telemetry.getSpans()).toEqual([]);
	});

	it('spans can be recorded again after clear', () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('first', 'internal').end();
		telemetry.clear();
		telemetry.startSpan('second', 'internal').end();

		const spans = telemetry.getSpans();
		expect(spans).toHaveLength(1);
		expect(spans[0]!.name).toBe('second');
	});

	it('exportToJSON returns valid JSON string', () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('json-op', 'producer').end();

		expect(() => JSON.parse(telemetry.exportToJSON())).not.toThrow();
	});

	it('exportToJSON contains span data (name, kind, attributes)', () => {
		const telemetry = new Telemetry({ enabled: true, serviceName: 'json-service' });
		telemetry.startSpan('json-op', 'consumer', { requestId: 'req-1' }).end();

		const parsed = JSON.parse(telemetry.exportToJSON()) as Array<{
			name: string;
			kind: string;
			attributes: Record<string, string | number | boolean>;
		}>;

		expect(parsed).toHaveLength(1);
		expect(parsed[0]!.name).toBe('json-op');
		expect(parsed[0]!.kind).toBe('consumer');
		expect(parsed[0]!.attributes.service).toBe('json-service');
		expect(parsed[0]!.attributes.requestId).toBe('req-1');
	});

	it('exportToJSON returns "[]" when no spans', () => {
		const telemetry = new Telemetry({ enabled: true });

		expect(telemetry.exportToJSON()).toBe('[]');
	});

	it('exportToFile creates file with JSON content', async () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('file-op', 'server').end();

		const filePath = join(tmpdir(), 'telemetry-test-' + Date.now() + '.json');

		try {
			await telemetry.exportToFile(filePath);
			const content = await readFile(filePath, 'utf-8');
			expect(content).toContain('file-op');
		} finally {
			await unlink(filePath).catch(() => undefined);
		}
	});

	it("exportToFile creates parent directories if they don't exist", async () => {
		const telemetry = new Telemetry({ enabled: true });
		const rootDir = join(tmpdir(), `telemetry-test-${Date.now()}-dir`);
		const filePath = join(rootDir, 'nested', 'deep', 'telemetry.json');

		try {
			await telemetry.exportToFile(filePath);
			const content = await readFile(filePath, 'utf-8');
			expect(content).toBe('[]');
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});

	it('exportToFile content matches exportToJSON output', async () => {
		const telemetry = new Telemetry({ enabled: true });
		telemetry.startSpan('one', 'server').end();
		telemetry.startSpan('two', 'client', { retry: 1 }).end();

		const rootDir = join(tmpdir(), `telemetry-test-${Date.now()}-match`);
		const filePath = join(rootDir, 'spans.json');

		try {
			await telemetry.exportToFile(filePath);
			const fileContent = await readFile(filePath, 'utf-8');
			expect(fileContent).toBe(telemetry.exportToJSON());
		} finally {
			await rm(rootDir, { recursive: true, force: true });
		}
	});

	it('when maxSpans is exceeded, oldest spans are evicted', () => {
		const telemetry = new Telemetry({ enabled: true, maxSpans: 2 });
		telemetry.startSpan('oldest', 'internal').end();
		telemetry.startSpan('middle', 'internal').end();
		telemetry.startSpan('newest', 'internal').end();

		expect(telemetry.getSpans().map((span) => span.name)).toEqual(['middle', 'newest']);
	});

	it('getSpans never returns more than maxSpans entries', () => {
		const telemetry = new Telemetry({ enabled: true, maxSpans: 3 });
		for (let index = 0; index < 20; index += 1) {
			telemetry.startSpan(`span-${index}`, 'internal').end();
		}

		expect(telemetry.getSpans()).toHaveLength(3);
	});

	it("disabled mode: startSpan returns SpanContext but doesn't record", () => {
		const telemetry = new Telemetry({ enabled: false });
		const spanContext = telemetry.startSpan('disabled-op', 'internal');

		expect(spanContext).toHaveProperty('span');
		expect(spanContext.end).toBeTypeOf('function');
		spanContext.end();
		expect(telemetry.getSpans()).toEqual([]);
	});

	it('disabled mode: getSpans stays empty after startSpan().end()', () => {
		const telemetry = new Telemetry({ enabled: false });
		telemetry.startSpan('disabled-op', 'internal').end();

		expect(telemetry.getSpans()).toHaveLength(0);
	});

	it('disabled mode: exportToJSON returns "[]"', () => {
		const telemetry = new Telemetry({ enabled: false });
		telemetry.startSpan('disabled-op', 'internal').end();

		expect(telemetry.exportToJSON()).toBe('[]');
	});

	it('startSpan includes serviceName in attributes', () => {
		const telemetry = new Telemetry({ enabled: true, serviceName: 'svc-a' });
		telemetry.startSpan('attr-op', 'client').end();

		const spans = telemetry.getSpans();
		expect(spans[0]!.attributes.service).toBe('svc-a');
	});

	it('startSpan merges custom attributes with service name', () => {
		const telemetry = new Telemetry({ enabled: true, serviceName: 'svc-b' });
		telemetry
			.startSpan('attr-op', 'client', {
				requestId: 'abc',
				retries: 2,
				sampled: true,
			})
			.end();

		const spans = telemetry.getSpans();
		expect(spans[0]!.attributes).toMatchObject({
			service: 'svc-b',
			requestId: 'abc',
			retries: 2,
			sampled: true,
		});
	});

	it('span.end with Error argument records error message', () => {
		const telemetry = new Telemetry({ enabled: true });
		const span = telemetry.startSpan('error-op', 'server');
		span.end(new Error('error-from-error-object'));

		expect(telemetry.getSpans()[0]!.error).toBe('error-from-error-object');
	});

	it('span.end with string error records the string', () => {
		const telemetry = new Telemetry({ enabled: true });
		const span = telemetry.startSpan('error-op', 'server');
		span.end('string-error');

		expect(telemetry.getSpans()[0]!.error).toBe('string-error');
	});

	it('span.end without error has no error property', () => {
		const telemetry = new Telemetry({ enabled: true });
		const span = telemetry.startSpan('ok-op', 'server');
		const ended = span.end();

		expect(ended.error).toBeUndefined();
		expect(telemetry.getSpans()[0]!.error).toBeUndefined();
	});
});
