/**
 * LRU Cache for tool/skill discovery results with TTL support.
 * Evicts least recently used entries when maxSize is reached.
 */
export interface CacheEntry<T> {
	data: T[];
	timestamp: number;
	accessCount: number; // For LRU tracking
}

export interface DiscoveryCacheOptions {
	maxSize?: number;
	ttl?: number; // Time-to-live in milliseconds
}

export class DiscoveryCache<T> {
	private _cache: Map<string, CacheEntry<T>>;
	private _maxSize: number;
	private _ttl: number;

	constructor(options: DiscoveryCacheOptions = {}) {
		this._cache = new Map();
		this._maxSize = options.maxSize ?? 100;
		this._ttl = options.ttl ?? 300000; // 5 minutes default
	}

	/**
	 * Get a value from the cache by key.
	 * Returns null if key doesn't exist or entry has expired.
	 * Updates access time for LRU tracking.
	 */
	get(key: string): T[] | null {
		const entry = this._cache.get(key);
		if (!entry) return null;

		const now = Date.now();
		const age = now - entry.timestamp;

		// Check TTL
		if (age > this._ttl) {
			this._cache.delete(key);
			return null;
		}

		// Update access metadata for LRU
		entry.accessCount++;
		entry.timestamp = now;

		// Move to end (most recently used)
		this._cache.delete(key);
		this._cache.set(key, entry);

		return entry.data;
	}

	/**
	 * Set a value in the cache by key.
	 * Enforces maxSize with LRU eviction when full.
	 */
	set(key: string, data: T[]): void {
		// Enforce max size with LRU eviction
		if (this._cache.size >= this._maxSize && !this._cache.has(key)) {
			// Remove least recently used (first entry)
			const lruKey = this._cache.keys().next().value;
			if (lruKey) {
				this._cache.delete(lruKey);
			}
		}

		this._cache.set(key, {
			data,
			timestamp: Date.now(),
			accessCount: 0,
		});
	}

	/**
	 * Check if a key exists and hasn't expired.
	 */
	has(key: string): boolean {
		const entry = this._cache.get(key);
		if (!entry) return false;

		const age = Date.now() - entry.timestamp;
		return age <= this._ttl;
	}

	/**
	 * Invalidate a specific cache entry.
	 */
	invalidate(key: string): void {
		this._cache.delete(key);
	}

	/**
	 * Clear all entries from the cache.
	 */
	clear(): void {
		this._cache.clear();
	}

	/**
	 * Get the current number of entries in the cache.
	 */
	size(): number {
		return this._cache.size;
	}

	/**
	 * Get cache statistics including size and all keys.
	 */
	getStats(): { size: number; keys: string[] } {
		return {
			size: this._cache.size,
			keys: Array.from(this._cache.keys()),
		};
	}
}
