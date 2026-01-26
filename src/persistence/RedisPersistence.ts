/**
 * Redis-based persistence backend.
 *
 * Provides high-performance persistence using Redis for distributed
 * scenarios and horizontal scaling of MCP server instances.
 *
 * @remarks
 * **Advantages over file-based persistence:**
 * - Faster read/write operations
 * - Supports clustering and distributed systems
 * - Lower latency for frequently accessed data
 * - Better horizontal scaling support
 *
 * **Configuration:**
 * - Redis connection options (host, port, password, etc.)
 * - Key prefix for namespacing
 * - TTL for data expiration
 *
 * @example
 * ```typescript
 * const backend = await RedisPersistence.create({
 *   host: 'localhost',
 *   port: 6379,
 *   keyPrefix: 'mcp:',
 *   ttl: 3600,  // 1 hour
 *   options: { maxHistorySize: 10000 }
 * });
 * ```
 */

import type { PersistenceBackend, PersistenceConfig } from './PersistenceBackend.js';
import type { ThoughtData } from '../types.js';

interface RedisConfig {
	/** Redis server host */
	host?: string;

	/** Redis server port */
	port?: number;

	/** Redis password */
	password?: string;

	/** Redis database index (default: 0) */
	db?: number;

	/** Key prefix for namespacing */
	keyPrefix?: string;

	/** Time-to-live for thoughts in seconds */
	ttl?: number;
}

interface RedisClient {
	get(key: string): Promise<string | null>;
	set(key: string, value: string, ttl?: number): Promise<void>;
	del(key: string): Promise<void>;
	keys(pattern: string): Promise<string[]>;
}

/**
 * Redis-based persistence backend implementation.
 */
export class RedisPersistence implements PersistenceBackend {
	private _client: RedisClient;
	private _maxHistorySize: number;
	private _keyPrefix: string;
	private _defaultTtl: number;

	constructor(client: RedisClient, options: RedisConfig) {
		this._client = client;
		this._maxHistorySize = options.maxHistorySize ?? 10000;
		this._keyPrefix = options.keyPrefix ?? 'mcp:';
		this._defaultTtl = options.ttl ?? 3600;
	}

	async saveThought(thought: ThoughtData): Promise<void> {
		const key = this._keyPrefix + `thought:${thought.thought_number}`;
		const value = JSON.stringify(thought);

		await this._client.set(key, value, this._defaultTtl);
	}

	async saveBranch(branchId: string, thoughts: ThoughtData[]): Promise<void> {
		const key = this._keyPrefix + `branch:${branchId}`;
		const value = JSON.stringify(thoughts);

		await this._client.set(key, value, this._defaultTtl);
	}

	async loadHistory(): Promise<ThoughtData[]> {
		const pattern = this._keyPrefix + 'thought:*';
		const keys = await this._client.keys(pattern);
		const thoughts: ThoughtData[] = [];

		for (const key of keys) {
			const value = await this._client.get(key);
			if (value) {
				thoughts.push(JSON.parse(value));
			}
		}

		thoughts.sort((a, b) => a.thought_number - b.thought_number);

		if (thoughts.length > this._maxHistorySize) {
			thoughts.slice(-this._maxHistorySize);
		}

		return thoughts;
	}

	async loadBranch(branchId: string): Promise<ThoughtData[] | undefined> {
		const key = this._keyPrefix + `branch:${branchId}`;
		const value = await this._client.get(key);

		if (!value) {
			return undefined;
		}

		return JSON.parse(value);
	}

	async listBranches(): Promise<string[]> {
		const pattern = this._keyPrefix + 'branch:*';
		const keys = await this._client.keys(pattern);
		const branchIds: string[] = [];

		for (const key of keys) {
			const id = key.replace(this._keyPrefix + 'branch:', '');
			branchIds.push(id);
		}

		return branchIds;
	}

	async clear(): Promise<void> {
		const pattern = this._keyPrefix + '*';
		const keys = await this._client.keys(pattern);

		if (keys.length > 0) {
			await this._client.del(...keys);
		}
	}

	async close(): Promise<void> {}
}

/**
 * Create a RedisPersistence instance with given Redis client.
 *
 * @param client - Redis client instance
 * @param options - Configuration options
 * @returns A configured RedisPersistence instance
 *
 * @example
 * ```typescript
 * import { createClient } from 'redis';
 * const client = createClient({ host: 'localhost', port: 6379 });
 * const backend = await RedisPersistence.create(client, {
 *   maxHistorySize: 10000,
 *   ttl: 3600
 * });
 * ```
 */
export async function create(
	client: RedisClient,
	options?: RedisConfig
): Promise<RedisPersistence> {
	const config: PersistenceConfig = {
		maxHistorySize: options?.maxHistorySize,
		persistBranches: true,
		options,
	};

	return new RedisPersistence(client, config);
}
