/**
 * Runtime server configuration type.
 *
 * @module types/server-config
 */

import type { Skill } from './skill.js';
import type { Tool } from './tool.js';

/**
 * Runtime server configuration containing available tools and skills.
 *
 * This interface represents the active configuration at runtime,
 * providing access to the registry of available tools and skills.
 *
 * @example
 * ```typescript
 * const config: ServerConfig = {
 *   available_tools: new Map([
 *     ['Read', { name: 'Read', description: '...', inputSchema: {...} }]
 *   ]),
 *   available_skills: new Map([
 *     ['commit', { name: 'commit', description: '...', user_invocable: true }]
 *   ])
 * };
 * ```
 */
export interface ServerConfig {
	/** Map of registered tools indexed by their unique names. */
	available_tools: Map<string, Tool>;

	/** Map of registered skills indexed by their unique names. */
	available_skills: Map<string, Skill>;
}
