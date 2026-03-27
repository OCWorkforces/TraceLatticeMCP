import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../context/RequestContext.js', () => ({
	getRequestId: vi.fn(() => undefined),
}));

import { StructuredLogger } from '../logger/StructuredLogger.js';
import { NullLogger } from '../logger/NullLogger.js';
import { getRequestId } from '../context/RequestContext.js';

const mockGetRequestId = vi.mocked(getRequestId);

describe('StructuredLogger', () => {
	let logger: StructuredLogger;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		mockGetRequestId.mockReturnValue(undefined);
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	describe('defaults', () => {
		it('should default to info level', () => {
			logger = new StructuredLogger();
			expect(logger.getLevel()).toBe('info');
		});

		it('should accept custom level', () => {
			logger = new StructuredLogger({ level: 'debug' });
			expect(logger.getLevel()).toBe('debug');
		});

		it('should default context to SequentialThinking', () => {
			logger = new StructuredLogger();
			// Verify via output format
			logger.info('test');
			expect(consoleSpy.mock.calls[0][0]).toContain('[SequentialThinking]');
		});

		it('should accept custom context', () => {
			logger = new StructuredLogger({ context: 'MyApp' });
			logger.info('test');
			expect(consoleSpy.mock.calls[0][0]).toContain('[MyApp]');
		});

		it('should default pretty to true', () => {
			logger = new StructuredLogger();
			logger.info('test');
			// Pretty format starts with [, JSON would start with {
			expect(consoleSpy.mock.calls[0][0]).toMatch(/^\[/);
		});
	});

	describe('level filtering', () => {
		it('should only log error when level is error', () => {
			logger = new StructuredLogger({ level: 'error' });
			logger.debug('debug msg');
			logger.info('info msg');
			logger.warn('warn msg');
			logger.error('error msg');

			expect(consoleSpy).toHaveBeenCalledTimes(1);
			expect(consoleSpy.mock.calls[0][0]).toContain('error msg');
		});

		it('should log error and warn when level is warn', () => {
			logger = new StructuredLogger({ level: 'warn' });
			logger.debug('debug msg');
			logger.info('info msg');
			logger.warn('warn msg');
			logger.error('error msg');

			expect(consoleSpy).toHaveBeenCalledTimes(2);
			expect(consoleSpy.mock.calls[0][0]).toContain('warn msg');
			expect(consoleSpy.mock.calls[1][0]).toContain('error msg');
		});

		it('should log error, warn, info when level is info', () => {
			logger = new StructuredLogger({ level: 'info' });
			logger.debug('debug msg');
			logger.info('info msg');
			logger.warn('warn msg');
			logger.error('error msg');

			expect(consoleSpy).toHaveBeenCalledTimes(3);
			expect(consoleSpy.mock.calls[0][0]).toContain('info msg');
			expect(consoleSpy.mock.calls[1][0]).toContain('warn msg');
			expect(consoleSpy.mock.calls[2][0]).toContain('error msg');
		});

		it('should log all levels when level is debug', () => {
			logger = new StructuredLogger({ level: 'debug' });
			logger.debug('debug msg');
			logger.info('info msg');
			logger.warn('warn msg');
			logger.error('error msg');

			expect(consoleSpy).toHaveBeenCalledTimes(4);
		});
	});

	describe('pretty formatting', () => {
		it('should include timestamp, level, context, and message', () => {
			logger = new StructuredLogger({ level: 'debug', context: 'TestCtx' });
			logger.info('hello world');

			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toMatch(/^\[\d{4}-\d{2}-\d{2}T/); // ISO timestamp
			expect(output).toContain('[INFO]');
			expect(output).toContain('[TestCtx]');
			expect(output).toContain('hello world');
		});

		it('should include meta as JSON when provided', () => {
			logger = new StructuredLogger({ level: 'debug' });
			logger.info('test', { key: 'value', count: 42 });

			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toContain('"key":"value"');
			expect(output).toContain('"count":42');
		});

		it('should not include meta section when no meta', () => {
			logger = new StructuredLogger({ level: 'debug' });
			logger.info('test');

			const output = consoleSpy.mock.calls[0][0] as string;
			// Should not have trailing JSON object
			expect(output).toMatch(/test$/);
		});

		it('should include request ID when getRequestId returns value', () => {
			mockGetRequestId.mockReturnValue('req-123');
			logger = new StructuredLogger({ level: 'debug' });
			logger.info('test');

			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toContain('[req-123]');
		});

		it('should not include request ID when getRequestId returns undefined', () => {
			mockGetRequestId.mockReturnValue(undefined);
			logger = new StructuredLogger({ level: 'debug' });
			logger.info('test');

			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).not.toContain('[undefined]');
		});
	});

	describe('JSON formatting', () => {
		it('should output valid JSON when pretty is false', () => {
			logger = new StructuredLogger({ level: 'debug', pretty: false, context: 'TestCtx' });
			logger.info('hello');

			const output = consoleSpy.mock.calls[0][0] as string;
			const parsed = JSON.parse(output);
			expect(parsed.level).toBe('info');
			expect(parsed.message).toBe('hello');
			expect(parsed.context).toBe('TestCtx');
			expect(parsed.timestamp).toBeDefined();
		});

		it('should include meta in JSON output', () => {
			logger = new StructuredLogger({ level: 'debug', pretty: false });
			logger.info('test', { foo: 'bar' });

			const output = consoleSpy.mock.calls[0][0] as string;
			const parsed = JSON.parse(output);
			expect(parsed.meta).toEqual({ foo: 'bar' });
		});

		it('should include requestId in JSON output', () => {
			mockGetRequestId.mockReturnValue('req-456');
			logger = new StructuredLogger({ level: 'debug', pretty: false });
			logger.info('test');

			const output = consoleSpy.mock.calls[0][0] as string;
			const parsed = JSON.parse(output);
			expect(parsed.requestId).toBe('req-456');
		});

		it('should omit requestId when undefined in JSON output', () => {
			mockGetRequestId.mockReturnValue(undefined);
			logger = new StructuredLogger({ level: 'debug', pretty: false });
			logger.info('test');

			const output = consoleSpy.mock.calls[0][0] as string;
			const parsed = JSON.parse(output);
			expect(parsed.requestId).toBeUndefined();
		});
	});

	describe('setLevel / getLevel', () => {
		it('should return current level with getLevel', () => {
			logger = new StructuredLogger({ level: 'warn' });
			expect(logger.getLevel()).toBe('warn');
		});

		it('should change filtering with setLevel', () => {
			logger = new StructuredLogger({ level: 'error' });
			logger.info('should not log');
			expect(consoleSpy).not.toHaveBeenCalled();

			logger.setLevel('debug');
			logger.info('should log');
			expect(consoleSpy).toHaveBeenCalledTimes(1);
		});
	});

	describe('createChild', () => {
		it('should create child with combined context', () => {
			logger = new StructuredLogger({ level: 'debug', context: 'App' });
			const child = logger.createChild('Database');

			child.info('connected');
			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toContain('[App:Database]');
		});

		it('should inherit parent level', () => {
			logger = new StructuredLogger({ level: 'error' });
			const child = logger.createChild('Module');

			child.info('should not log');
			expect(consoleSpy).not.toHaveBeenCalled();
		});

		it('should inherit parent pretty setting', () => {
			logger = new StructuredLogger({ level: 'debug', pretty: false });
			const child = logger.createChild('Module');

			child.info('test');
			const output = consoleSpy.mock.calls[0][0] as string;
			expect(() => JSON.parse(output)).not.toThrow();
		});

		it('should support deeply nested contexts', () => {
			logger = new StructuredLogger({ level: 'debug', context: 'A' });
			const child1 = logger.createChild('B');
			const child2 = child1.createChild('C');

			child2.info('deep');
			const output = consoleSpy.mock.calls[0][0] as string;
			expect(output).toContain('[A:B:C]');
		});

		it('should not be affected by parent setLevel after creation', () => {
			logger = new StructuredLogger({ level: 'error' });
			const child = logger.createChild('Module');

			// Change parent level after child was created
			logger.setLevel('debug');

			// Child should still have error level (copied at creation)
			child.info('should not log');
			expect(consoleSpy).not.toHaveBeenCalled();
		});
	});
});

describe('NullLogger', () => {
	let nullLogger: NullLogger;
	let consoleSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		nullLogger = new NullLogger();
	});

	afterEach(() => {
		consoleSpy.mockRestore();
	});

	it('should not output for debug', () => {
		nullLogger.debug('msg');
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('should not output for info', () => {
		nullLogger.info('msg');
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('should not output for warn', () => {
		nullLogger.warn('msg');
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('should not output for error', () => {
		nullLogger.error('msg');
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('should not output with meta', () => {
		nullLogger.info('msg', { key: 'value' });
		expect(consoleSpy).not.toHaveBeenCalled();
	});

	it('should default to error level', () => {
		expect(nullLogger.getLevel()).toBe('error');
	});

	it('should support setLevel and getLevel', () => {
		nullLogger.setLevel('debug');
		expect(nullLogger.getLevel()).toBe('debug');
		nullLogger.setLevel('warn');
		expect(nullLogger.getLevel()).toBe('warn');
	});

	it('should return NullLogger from createChild', () => {
		const child = nullLogger.createChild('Module');
		expect(child).toBeInstanceOf(NullLogger);
	});

	it('should not output from child logger', () => {
		const child = nullLogger.createChild('Module');
		child.info('msg');
		expect(consoleSpy).not.toHaveBeenCalled();
	});
});
