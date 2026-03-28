/**
 * Interface for history and branch management.
 *
 * This module provides the `IHistoryManager` interface which defines the contract
 * for history manager implementations. This allows for decoupling and testability.
 *
 * @module IHistoryManager
 */

import type { ThoughtData } from './types/thought.js';

/**
 * Interface for history and branch management.
 *
 * This interface defines the contract for history manager implementations,
 * allowing for decoupling between components like ThoughtProcessor and
 * concrete implementations. It supports dependency injection and mocking
 * for testing purposes.
 *
 * @example
 * ```typescript
 * // Using the interface for dependency injection
 * class MyComponent {
 *   constructor(private history: IHistoryManager) {}
 *
 *   addThought(thought: ThoughtData) {
 *     this.history.addThought(thought);
 *   }
 * }
 *
 * // Mock implementation for testing
 * class MockHistoryManager implements IHistoryManager {
 *   private _history: ThoughtData[] = [];
 *   addThought(thought: ThoughtData): void { this._history.push(thought); }
 *   getHistory(): ThoughtData[] { return this._history; }
 *   getHistoryLength(): number { return this._history.length; }
 *   getBranches(): Record<string, ThoughtData[]> { return {}; }
 *   getBranchIds(): string[] { return []; }
 *   clear(): void { this._history = []; }
 * }
 * ```
 */
export interface IHistoryManager {
	/**
	 * Adds a thought to the history.
	 *
	 * @param thought - The thought data to add
	 */
	addThought(thought: ThoughtData): void;

	/**
	 * Gets the complete thought history.
	 *
	 * @returns An array of all thoughts in chronological order
	 */
	getHistory(): ThoughtData[];

	/**
	 * Gets the current length of the thought history.
	 *
	 * @returns The number of thoughts in history
	 */
	getHistoryLength(): number;

	/**
	 * Gets all branches.
	 *
	 * @returns A record mapping branch IDs to their thought arrays
	 */
	getBranches(): Record<string, ThoughtData[]>;

	/**
	 * Gets all branch IDs.
	 *
	 * @returns An array of branch identifiers
	 */
	getBranchIds(): string[];

	/**
	 * Clears all history and branches.
	 */
	clear(): void;
	/**
	 * Gets the most recently available MCP tools from the session.
	 *
	 * @returns The last-seen array of MCP tool names, or undefined if never set
	 */
	getAvailableMcpTools(): string[] | undefined;

	/**
	 * Gets the most recently available skills from the session.
	 *
	 * @returns The last-seen array of skill names, or undefined if never set
	 */
	getAvailableSkills(): string[] | undefined;

}
