import type { ThoughtData } from '../../types.js';
import { MemoryPersistence } from '../../persistence/MemoryPersistence.js';
import { createTestServer } from '../../index.js';
import type { ServerOptions } from '../../ServerConfig.js';

/**
 * Create a test thought with sensible defaults and optional overrides.
 */
export function createTestThought(overrides: Partial<ThoughtData> = {}): ThoughtData {
	return {
		thought: 'Test thought for analysis',
		thoughtNumber: 1,
		totalThoughts: 3,
		nextThoughtNeeded: true,
		...overrides,
	};
}

/**
 * Create a server instance configured for testing (no discovery, no persistence).
 */
export async function createTestServer(
	options: Partial<ServerOptions> = {}
): Promise<ToolAwareSequentialThinkingServer> {
	return new ToolAwareSequentialThinkingServer({
		maxHistorySize: 100,
		lazyDiscovery: true,
		...options,
	});
}

/**
 * Create an in-memory persistence backend for testing.
 */
export async function createTestPersistence(): Promise<MemoryPersistence> {
	return new MemoryPersistence();
}
