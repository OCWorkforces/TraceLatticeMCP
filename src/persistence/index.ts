/**
 * Persistence exports for backend factory and implementations.
 *
 * This module re-exports the persistence backend interface, configuration types,
 * factory function, and all persistence backend implementations for convenient
 * importing.
 *
 * @example
 * ```typescript
 * import {
 *   createPersistenceBackend,
 *   PersistenceBackend,
 *   PersistenceConfig,
 *   FilePersistence,
 *   MemoryPersistence,
 *   SqlitePersistence
 * } from './persistence/index.js';
 *
 * // Create a configured persistence backend
 * const backend = await createPersistenceBackend({
 *   enabled: true,
 *   backend: 'file',
 *   options: { dataDir: './data' }
 * });
 *
 * // Or use a specific implementation
 * const fileBackend = new FilePersistence({ dataDir: './data' });
 * ```
 * @module persistence
 */

export {
	PersistenceBackend,
	PersistenceConfig,
	createPersistenceBackend,
} from './PersistenceBackend.js';
export { FilePersistence } from './FilePersistence.js';
export { MemoryPersistence } from './MemoryPersistence.js';
export { SqlitePersistence } from './SqlitePersistence.js';
