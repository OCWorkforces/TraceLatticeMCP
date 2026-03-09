import { describe, it, expect, beforeEach } from 'vitest';
import { Metrics } from '../metrics.impl.js';

describe('Metrics', () => {
	let metrics: Metrics;

	beforeEach(() => {
		metrics = new Metrics({ prefix: 'test' });
	});

	describe('Counters', () => {
		it('should create and increment counters', () => {
			metrics.counter('requests_total', 1, { method: 'GET' });
			metrics.counter('requests_total', 1, { method: 'POST' });

			expect(metrics.get('requests_total', { method: 'GET' })).toBe(1);
			expect(metrics.get('requests_total', { method: 'POST' })).toBe(1);
		});

		it('should increment counter by 1 when using inc()', () => {
			metrics.inc('requests_total', { method: 'GET' });
			expect(metrics.get('requests_total', { method: 'GET' })).toBe(1);
		});
	});

	describe('Gauges', () => {
		it('should set gauge values', () => {
			metrics.gauge('active_connections', 5);
			metrics.gauge('active_connections', 3);

			expect(metrics.get('active_connections')).toBe(3);
		});

		it('should increment gauge by 1 when using inc()', () => {
			metrics.gauge('active_connections', 5);
			metrics.inc('active_connections');
			expect(metrics.get('active_connections')).toBe(6);
		});

		it('should decrement gauge by 1 when using dec()', () => {
			metrics.gauge('active_connections', 5);
			metrics.dec('active_connections');
			expect(metrics.get('active_connections')).toBe(4);
		});
	});

	describe('Histograms', () => {
		it('should record histogram observations', () => {
			metrics.histogram('request_duration_seconds', 0.01);
			metrics.histogram('request_duration_seconds', 0.1);
			metrics.histogram('request_duration_seconds', 0.5);
			metrics.histogram('request_duration_seconds', 2.5);

			expect(metrics.getOperationCount()).toBe(4);
		});

		it('should bucket values correctly', () => {
			metrics.histogram('test_ms', 0.023);
			metrics.histogram('test_ms', 0.047);
			metrics.histogram('test_ms', 0.153);
			metrics.histogram('test_ms', 1.235);

			const exported = metrics.export();
			expect(exported).toContain('test_ms_bucket{le="0.005"} 0');
			expect(exported).toContain('test_ms_bucket{le="0.025"} 1');
			expect(exported).toContain('test_ms_bucket{le="0.1"} 2');
			expect(exported).toContain('test_ms_bucket{le="+Inf"} 4');
		});
	});

	describe('Labels', () => {
		it('should apply default labels to all metrics', () => {
			metrics.counter('requests_total', 1);

			expect(metrics.get('requests_total')).toBe(1);
			expect(metrics.get('requests_total', { custom: 'label' })).toBeUndefined();
		});

		it('should merge default labels with provided labels', () => {
			metrics = new Metrics({ prefix: 'test', defaultLabels: { env: 'prod' } });
			metrics.counter('requests_total', 1, { method: 'GET' });

			expect(metrics.get('requests_total', { method: 'GET', env: 'prod' })).toBe(1);
		});
	});

	describe('Export', () => {
		it('should export in Prometheus text format', () => {
			metrics.counter('test_counter', 42);
			metrics.gauge('test_gauge', 7);
			metrics.histogram('test_histogram', 0.5);

			const exported = metrics.export();

			expect(exported).toContain('# HELP test_counter');
			expect(exported).toContain('# HELP test_gauge');
			expect(exported).toContain('# TYPE test_histogram histogram');
			expect(exported).toContain('test_counter{} 42');
			expect(exported).toContain('test_gauge{} 7');
			expect(exported).toMatch(/test_histogram_sum/);
			expect(exported).toMatch(/test_histogram_count/);
			expect(exported).toMatch(/test_histogram_bucket\{/);
		});

		it('should handle empty metrics', () => {
			metrics = new Metrics({ prefix: 'test' });
			const exported = metrics.export();

			expect(exported).toBe('');
		});

		it('should handle histogram buckets correctly', () => {
			metrics.histogram('latency_ms', 0.023);
			metrics.histogram('latency_ms', 0.047);

			const exported = metrics.export();
			expect(exported).toContain('latency_ms_bucket{le="0.005"} 0');
			expect(exported).toContain('latency_ms_bucket{le="0.05"} 2');
			expect(exported).toContain('latency_ms_bucket{le="+Inf"} 2');
		});
	});

	describe('Reset', () => {
		it('should reset all metrics', () => {
			metrics.counter('test', 1);
			metrics.gauge('test', 5);
			metrics.histogram('test', 0.5);

			expect(metrics.get('test')).toBe(5);
			expect(metrics.getOperationCount()).toBe(3);

			metrics.reset();

			expect(metrics.get('test')).toBeUndefined();
			expect(metrics.getOperationCount()).toBe(0);
		});
	});

	describe('Operation Counting', () => {
		it('should track metric operations', () => {
			metrics.counter('a', 1);
			metrics.counter('b', 1);
			metrics.counter('c', 1);

			expect(metrics.getOperationCount()).toBe(3);
		});

		it('should track histogram operations as 1 each', () => {
			metrics.histogram('a', 0.5);
			metrics.histogram('b', 0.5);

			expect(metrics.getOperationCount()).toBe(2);
		});
	});
});
