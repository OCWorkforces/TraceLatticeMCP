/**
 * Dependency injection container exports.
 *
 * This module re-exports the `Container` class and its type definition
 * for convenient importing.
 *
 * @example
 * ```typescript
 * import { Container, createDefaultContainer } from './di/index.js';
 * import type { CreateContainerOptions } from './di/index.js';
 *
 * // Create a container
 * const container = new Container();
 *
 * // Create with default services
 * const container2 = createDefaultContainer({
 *   logger: myLogger,
 *   config: myConfig
 * });
 * ```
 * @module di
 */

export { Container, createDefaultContainer } from './Container.js';
export type { CreateContainerOptions } from './Container.js';
