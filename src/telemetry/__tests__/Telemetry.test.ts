import { describe, it, expect } from 'vitest';
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
});
