/**
 * Registry exports for tool and skill management.
 *
 * This module re-exports the `ToolRegistry` and `SkillRegistry` classes
 * for convenient importing.
 *
 * @example
 * ```typescript
 * import { ToolRegistry, SkillRegistry } from './registry/index.js';
 *
 * const toolRegistry = new ToolRegistry();
 * const skillRegistry = new SkillRegistry();
 * ```
 * @module registry
 */

export { ToolRegistry } from './ToolRegistry.js';
export { SkillRegistry } from './SkillRegistry.js';
export { BaseRegistry } from './BaseRegistry.js';
export type { BaseRegistryOptions } from './BaseRegistry.js';
