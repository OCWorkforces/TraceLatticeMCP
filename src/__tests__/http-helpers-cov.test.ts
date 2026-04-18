import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
	sendJsonRpcError,
	sendJsonRpcResponse,
	readRequestBody,
	sendCorsPreflight,
} from '../transport/HttpHelpers.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

interface MockServerResponse {
	statusCode: number;
	writeHead: Mock<(code: number, headers?: Record<string, string>) => void>;
	end: Mock<(data?: string) => void>;
	write?: Mock<() => void>;
	setHeader?: Mock<(name: string, value: string | number | string[]) => void>;
	once?: Mock<(event: string | symbol, listener: (...args: unknown[]) => void) => unknown>;
}

function createMockRes(
	overrides: Partial<MockServerResponse> = {}
): MockServerResponse & ServerResponse {
	const mock: MockServerResponse = {
		statusCode: 200,
		writeHead: vi.fn(),
		end: vi.fn(),
		...overrides,
	};
	return mock as MockServerResponse & ServerResponse;
}

function createMockIncomingMessage(chunks: string[] = []): IncomingMessage {
	const emitter = new EventEmitter();
	const message = Object.assign(emitter, {
		[Symbol.asyncIterator]: async function* () {
			for (const chunk of chunks) {
				yield Buffer.from(chunk);
			}
		},
	}) as unknown as IncomingMessage;
	return message;
}

describe('HttpHelpers', () => {
	describe('sendJsonRpcError', () => {
		it('should send error response with data', () => {
			const res = createMockRes();
			sendJsonRpcError(res, 400, -32600, 'Invalid Request', 1, { details: 'test' });
			expect(res.writeHead).toHaveBeenCalledWith(400, { 'Content-Type': 'application/json' });
			const body = JSON.parse(res.end.mock.calls[0]![0] as string);
			expect(body.jsonrpc).toBe('2.0');
			expect(body.id).toBe(1);
			expect(body.error.code).toBe(-32600);
			expect(body.error.data).toEqual({ details: 'test' });
		});

		it('should send error response without data', () => {
			const res = createMockRes();
			sendJsonRpcError(res, 500, -32603, 'Internal error');
			const body = JSON.parse(res.end.mock.calls[0]![0] as string);
			expect(body.error.data).toBeUndefined();
		});

		it('should default id to null', () => {
			const res = createMockRes();
			sendJsonRpcError(res, 200, -32700, 'Parse error');
			const body = JSON.parse(res.end.mock.calls[0]![0] as string);
			expect(body.id).toBeNull();
		});
	});

	describe('sendJsonRpcResponse', () => {
		it('should send success response with default status', () => {
			const res = createMockRes();
			sendJsonRpcResponse(res, { jsonrpc: '2.0', id: 1, result: {} });
			expect(res.writeHead).toHaveBeenCalledWith(200, {
				'Content-Type': 'application/json',
			});
			expect(res.end).toHaveBeenCalled();
		});

		it('should send success response with custom status and headers', () => {
			const res = createMockRes();
			sendJsonRpcResponse(res, { jsonrpc: '2.0', id: 1, result: {} }, 201, {
				'X-Custom': 'value',
			});
			expect(res.writeHead).toHaveBeenCalledWith(201, {
				'Content-Type': 'application/json',
				'X-Custom': 'value',
			});
		});
	});

	describe('sendCorsPreflight', () => {
		it('should send 204 with no extra headers', () => {
			const res = createMockRes({ setHeader: vi.fn() });
			sendCorsPreflight(res);
			expect(res.writeHead).toHaveBeenCalledWith(204);
			expect(res.end).toHaveBeenCalled();
		});

		it('should include extra allow headers', () => {
			const res = createMockRes({ setHeader: vi.fn() });
			sendCorsPreflight(res, ['Authorization', 'X-Session']);
			expect(res.setHeader).toHaveBeenCalledWith(
				'Access-Control-Allow-Headers',
				'Content-Type, Authorization, X-Session'
			);
		});
	});

	describe('readRequestBody', () => {
		it('should read body from single chunk', async () => {
			const req = createMockIncomingMessage(['hello']);
			const body = await readRequestBody(req as IncomingMessage, 0);
			expect(body).toBe('hello');
		});

		it('should read body from multiple chunks', async () => {
			const req = createMockIncomingMessage(['hello', ' ', 'world']);
			const body = await readRequestBody(req as IncomingMessage, 0);
			expect(body).toBe('hello world');
		});

		it('should return null when body exceeds max size', async () => {
			const req = createMockIncomingMessage(['a'.repeat(200)]);
			const body = await readRequestBody(req as IncomingMessage, 100);
			expect(body).toBeNull();
		});

		it('should allow unlimited body when maxBodySize is 0', async () => {
			const req = createMockIncomingMessage(['a'.repeat(200)]);
			const body = await readRequestBody(req as IncomingMessage, 0);
			expect(body).toBe('a'.repeat(200));
		});
	});


	describe('readRequestBody with string chunks', () => {
		function createStringChunkMessage(chunks: string[]): IncomingMessage {
			const emitter = new EventEmitter();
			const message = Object.assign(emitter, {
				[Symbol.asyncIterator]: async function* () {
					for (const chunk of chunks) {
						yield chunk;
					}
				},
			}) as unknown as IncomingMessage;
			return message;
		}

		it('should handle string chunks without calling toString()', async () => {
			const req = createStringChunkMessage(['hello', ' world']);
			const body = await readRequestBody(req, 0);
			expect(body).toBe('hello world');
		});

		it('should enforce maxBodySize with string chunks', async () => {
			const req = createStringChunkMessage(['a'.repeat(200)]);
			const body = await readRequestBody(req, 100);
			expect(body).toBeNull();
		});
	});
});
