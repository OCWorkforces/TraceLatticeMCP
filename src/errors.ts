/**
 * Custom error types for the CCSequentialThinkingMCP server.
 *
 * This module defines a hierarchy of error classes for handling various
 * error conditions that can occur in the sequential thinking server.
 * All errors extend the base `SequentialThinkingError` class with
 * specific error codes for programmatic handling.
 *
 * @example
 * ```typescript
 * import { ToolNotFoundError, SkillDiscoveryError } from './errors.js';
 *
 * // Throw a tool not found error
 * throw new ToolNotFoundError('my-tool');
 *
 * // Catch and handle specific errors
 * try {
 *   await discoverSkills(dir);
 * } catch (error) {
 *   if (error instanceof SkillDiscoveryError) {
 *     console.error(`Failed to discover skills: ${error.message}`);
 *     console.error(`Error code: ${error.code}`);
 *   }
 * }
 * ```
 * @module errors
 */

/**
 * Base error class for all Sequential Thinking server errors.
 *
 * This error extends the native `Error` class and adds a `code` property
 * for programmatic error identification and handling. All specific error
 * types in the system extend this base class.
 *
 * @remarks
 * **Error Codes:**
 * - `TOOL_NOT_FOUND` - A requested tool was not found
 * - `SKILL_NOT_FOUND` - A requested skill was not found
 * - `INVALID_THOUGHT` - Thought validation failed
 * - `SKILL_DISCOVERY_FAILED` - Skill discovery operation failed
 * - `HISTORY_LIMIT_EXCEEDED` - History size limit was exceeded
 *
 * @example
 * ```typescript
 * // Throw a custom sequential thinking error
 * throw new SequentialThinkingError('Custom error message', 'CUSTOM_CODE');
 *
 * // Check if an error is a SequentialThinkingError
 * if (error instanceof SequentialThinkingError) {
 *   console.error(`Error [${error.code}]: ${error.message}`);
 * }
 * ```
 */
export class SequentialThinkingError extends Error {
	/** The error code for programmatic identification. */
	public readonly code: string;

	/**
	 * Creates a new SequentialThinkingError.
	 *
	 * @param message - Human-readable error message
	 * @param code - Error code for programmatic handling
	 *
	 * @example
	 * ```typescript
	 * const error = new SequentialThinkingError(
	 *   'Something went wrong',
	 *   'CUSTOM_ERROR'
	 * );
	 * console.log(error.code); // 'CUSTOM_ERROR'
	 * ```
	 */
	constructor(message: string, code: string) {
		super(message);
		this.code = code;
		this.name = 'SequentialThinkingError';
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Error thrown when a requested tool is not found in the registry.
 *
 * This error is thrown when attempting to retrieve, update, or delete
 * a tool that doesn't exist in the tool registry.
 *
 * @example
 * ```typescript
 * const tool = registry.getTool('non-existent-tool');
 * if (!tool) {
 *   throw new ToolNotFoundError('non-existent-tool');
 * }
 * ```
 */
export class ToolNotFoundError extends SequentialThinkingError {
	/**
	 * Creates a new ToolNotFoundError.
	 *
	 * @param toolName - The name of the tool that was not found
	 *
	 * @example
	 * ```typescript
	 * throw new ToolNotFoundError('my-custom-tool');
	 * // Error: Tool 'my-custom-tool' not found
	 * // Code: TOOL_NOT_FOUND
	 * ```
	 */
	constructor(toolName: string) {
		super(`Tool '${toolName}' not found`, 'TOOL_NOT_FOUND');
		this.name = 'ToolNotFoundError';
	}
}

/**
 * Error thrown when a requested skill is not found in the registry.
 *
 * This error is thrown when attempting to retrieve, update, or delete
 * a skill that doesn't exist in the skill registry.
 *
 * @example
 * ```typescript
 * const skill = registry.getSkill('non-existent-skill');
 * if (!skill) {
	 *   throw new SkillNotFoundError('non-existent-skill');
 * }
 * ```
 */
export class SkillNotFoundError extends SequentialThinkingError {
	/**
	 * Creates a new SkillNotFoundError.
	 *
	 * @param skillName - The name of the skill that was not found
	 *
	 * @example
	 * ```typescript
	 * throw new SkillNotFoundError('my-custom-skill');
	 * // Error: Skill 'my-custom-skill' not found
	 * // Code: SKILL_NOT_FOUND
	 * ```
	 */
	constructor(skillName: string) {
		super(`Skill '${skillName}' not found`, 'SKILL_NOT_FOUND');
		this.name = 'SkillNotFoundError';
	}
}

/**
 * Error thrown when thought validation fails.
 *
 * This error is thrown when a thought fails validation, typically due to
 * invalid values, missing required fields, or constraint violations.
 *
 * @example
 * ```typescript
 * // Validate thought number
 * if (thought.thought_number < 1) {
 *   throw new InvalidThoughtError(thought.thought_number, 'thought_number must be >= 1');
 * }
 * ```
 */
export class InvalidThoughtError extends SequentialThinkingError {
	/**
	 * Creates a new InvalidThoughtError.
	 *
	 * @param thoughtNumber - The thought number that failed validation
	 * @param reason - Human-readable explanation of why validation failed
	 *
	 * @example
	 * ```typescript
	 * throw new InvalidThoughtError(5, 'thought_number exceeds total_thoughts');
	 * // Error: Invalid thought 5: thought_number exceeds total_thoughts
	 * // Code: INVALID_THOUGHT
	 * ```
	 */
	constructor(thoughtNumber: number, reason: string) {
		super(`Invalid thought ${thoughtNumber}: ${reason}`, 'INVALID_THOUGHT');
		this.name = 'InvalidThoughtError';
	}
}

/**
 * Error thrown when skill discovery fails.
 *
 * This error is thrown when the skill discovery process encounters an issue,
 * such as filesystem errors, invalid skill files, or parsing failures.
 *
 * @remarks
 * The original error that caused the discovery failure is preserved in the
 * `cause` property for debugging purposes.
 *
 * @example
 * ```typescript
 * try {
 *   await discoverSkills('./skills');
 * } catch (error) {
 *   throw new SkillDiscoveryError('./skills', error as Error);
 * }
 * ```
 */
export class SkillDiscoveryError extends SequentialThinkingError {
	/** The underlying error that caused the discovery failure. */
	public readonly cause: Error;

	/**
	 * Creates a new SkillDiscoveryError.
	 *
	 * @param directory - The directory where discovery failed
	 * @param cause - The underlying error that caused the failure
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   const skills = await loadSkills('./invalid-directory');
	 * } catch (error) {
	 *   throw new SkillDiscoveryError('./invalid-directory', error as Error);
	 * }
	 * ```
	 */
	constructor(directory: string, cause: Error) {
		super(`Failed to discover skills in ${directory}: ${cause.message}`, 'SKILL_DISCOVERY_FAILED');
		this.name = 'SkillDiscoveryError';
		this.cause = cause;
	}
}

/**
 * Error thrown when history size exceeds the configured limit.
 *
 * This error is thrown when an operation would cause the history size
 * to exceed the maximum configured size limit.
 *
 * @example
 * ```typescript
 * if (history.length >= maxSize) {
 *   throw new HistoryLimitExceededError(history.length, maxSize);
 * }
 * ```
 */
export class HistoryLimitExceededError extends SequentialThinkingError {
	/**
	 * Creates a new HistoryLimitExceededError.
	 *
	 * @param currentSize - The current history size
	 * @param maxSize - The maximum allowed size
	 *
	 * @example
	 * ```typescript
	 * throw new HistoryLimitExceededError(1500, 1000);
	 * // Error: History size 1500 exceeds limit 1000
	 * // Code: HISTORY_LIMIT_EXCEEDED
	 * ```
	 */
	constructor(currentSize: number, maxSize: number) {
		super(`History size ${currentSize} exceeds limit ${maxSize}`, 'HISTORY_LIMIT_EXCEEDED');
		this.name = 'HistoryLimitExceededError';
	}
}
