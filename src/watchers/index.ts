/**
 * File system watchers for dynamic tool and skill discovery.
 *
 * @module watchers
 */

/**
 * File system watcher for skill directory changes.
 *
 * @example
 * ```typescript
 * import { SkillWatcher } from './watchers/index.js';
 * import { SkillRegistry } from './registry/SkillRegistry.js';
 *
 * const registry = new SkillRegistry();
 * const watcher = new SkillWatcher(registry);
 * // Watcher automatically starts monitoring skill directories
 * ```
 */
export { SkillWatcher } from './SkillWatcher.js';

/**
 * File system watcher for tool directory changes.
 *
 * @example
 * ```typescript
 * import { ToolWatcher } from './watchers/index.js';
 * import { ToolRegistry } from './registry/ToolRegistry.js';
 *
 * const registry = new ToolRegistry();
 * const watcher = new ToolWatcher(registry);
 * // Watcher automatically starts monitoring tool directories
 * ```
 */
export { ToolWatcher } from './ToolWatcher.js';
