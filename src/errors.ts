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
	 * @param action - Optional action being performed (e.g., 'remove', 'update')
	 *
	 * @example
	 * ```typescript
	 * throw new ToolNotFoundError('my-custom-tool');
	 * // Error: tool 'my-custom-tool' not found
	 *
	 * throw new ToolNotFoundError('my-custom-tool', 'remove');
	 * // Error: tool 'my-custom-tool' not found, cannot remove
	 * // Code: TOOL_NOT_FOUND
	 * ```
	 */
	constructor(toolName: string, action?: string) {
		const message = action
			? `Tool '${toolName}' not found, cannot ${action}`
			: `Tool '${toolName}' not found`;
		super(message, 'TOOL_NOT_FOUND');
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
	 * @param action - Optional action being performed (e.g., 'remove', 'update')
	 *
	 * @example
	 * ```typescript
	 * throw new SkillNotFoundError('my-custom-skill');
	 * // Error: skill 'my-custom-skill' not found
	 *
	 * throw new SkillNotFoundError('my-custom-skill', 'remove');
	 * // Error: skill 'my-custom-skill' not found, cannot remove
	 * // Code: SKILL_NOT_FOUND
	 * ```
	 */
	constructor(skillName: string, action?: string) {
		const message = action
			? `Skill '${skillName}' not found, cannot ${action}`
			: `Skill '${skillName}' not found`;
		super(message, 'SKILL_NOT_FOUND');
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

/**
 * Error thrown when attempting to add a skill that already exists.
 *
 * This error is thrown when trying to register a skill with a name that
 * is already present in the skill registry.
 *
 * @example
 * ```typescript
 * if (registry.hasSkill(skill.name)) {
 *   throw new DuplicateSkillError(skill.name);
 * }
 * ```
 */
export class DuplicateSkillError extends SequentialThinkingError {
	/**
	 * Creates a new DuplicateSkillError.
	 *
	 * @param skillName - The name of the duplicate skill
	 *
	 * @example
	 * ```typescript
	 * throw new DuplicateSkillError('my-skill');
	 * // Error: skill 'my-skill' already exists
	 * // Code: DUPLICATE_SKILL
	 * ```
	 */
	constructor(skillName: string) {
		super(`skill '${skillName}' already exists`, 'DUPLICATE_SKILL');
		this.name = 'DuplicateSkillError';
	}
}

/**
 * Error thrown when a skill has invalid data.
 *
 * This error is thrown when a skill fails validation, typically due to
 * missing required fields or invalid values.
 *
 * @example
 * ```typescript
 * if (!skill.name) {
 *   throw new InvalidSkillError('Skill must have a valid name');
 * }
 * ```
 */
export class InvalidSkillError extends SequentialThinkingError {
	/**
	 * Creates a new InvalidSkillError.
	 *
	 * @param reason - The reason for the validation failure
	 *
	 * @example
	 * ```typescript
	 * throw new InvalidSkillError('Skill must have a valid name');
	 * // Error: Invalid skill: Skill must have a valid name
	 * // Code: INVALID_SKILL
	 * ```
	 */
	constructor(reason: string) {
		super(`Invalid skill: ${reason}`, 'INVALID_SKILL');
		this.name = 'InvalidSkillError';
	}
}

/**
 * Error thrown when attempting to add a tool that already exists.
 *
 * This error is thrown when trying to register a tool with a name that
 * is already present in the tool registry.
 *
 * @example
 * ```typescript
 * if (registry.hasTool(tool.name)) {
 *   throw new DuplicateToolError(tool.name);
 * }
 * ```
 */
export class DuplicateToolError extends SequentialThinkingError {
	/**
	 * Creates a new DuplicateToolError.
	 *
	 * @param toolName - The name of the duplicate tool
	 *
	 * @example
	 * ```typescript
	 * throw new DuplicateToolError('my-tool');
	 * // Error: tool 'my-tool' already exists
	 * // Code: DUPLICATE_TOOL
	 * ```
	 */
	constructor(toolName: string) {
		super(`tool '${toolName}' already exists`, 'DUPLICATE_TOOL');
		this.name = 'DuplicateToolError';
	}
}

/**
 * Error thrown when a tool has invalid data.
 *
 * This error is thrown when a tool fails validation, typically due to
 * missing required fields or invalid values.
 *
 * @example
 * ```typescript
 * if (!tool.name) {
 *   throw new InvalidToolError('Tool must have a valid name');
 * }
 * ```
 */
export class InvalidToolError extends SequentialThinkingError {
	/**
	 * Creates a new InvalidToolError.
	 *
	 * @param reason - The reason for the validation failure
	 *
	 * @example
	 * ```typescript
	 * throw new InvalidToolError('Tool must have a valid name');
	 * // Error: Invalid tool: Tool must have a valid name
	 * // Code: INVALID_TOOL
	 * ```
	 */
	constructor(reason: string) {
		super(`Invalid tool: ${reason}`, 'INVALID_TOOL');
		this.name = 'InvalidToolError';
	}
}

/**
 * Error thrown when attempting to process a session that is not active.
 *
 * This error is thrown when trying to use a session that has been closed
 * or deactivated.
 *
 * @example
 * ```typescript
 * if (!session.isActive) {
 *   throw new SessionNotActiveError(sessionId);
 * }
 * ```
 */
export class SessionNotActiveError extends SequentialThinkingError {
	/**
	 * Creates a new SessionNotActiveError.
	 *
	 * @param sessionId - The ID of the inactive session
	 *
	 * @example
	 * ```typescript
	 * throw new SessionNotActiveError('session-123');
	 * // Error: Session 'session-123' is not active
	 * // Code: SESSION_NOT_ACTIVE
	 * ```
	 */
	constructor(sessionId: string) {
		super(`Session '${sessionId}' is not active`, 'SESSION_NOT_ACTIVE');
		this.name = 'SessionNotActiveError';
	}
}

/**
 * Error thrown when a requested session is not found in the pool.
 *
 * This error is thrown when attempting to retrieve, process, or close
 * a session that doesn't exist in the session pool.
 *
 * @example
 * ```typescript
 * const session = pool.getSession('non-existent-session');
 * if (!session) {
 *   throw new SessionNotFoundError('non-existent-session');
 * }
 * ```
 */
export class SessionNotFoundError extends SequentialThinkingError {
	/**
	 * Creates a new SessionNotFoundError.
	 *
	 * @param sessionId - The ID of the session that was not found
	 *
	 * @example
	 * ```typescript
	 * throw new SessionNotFoundError('session-123');
	 * // Error: Session not found: session-123
	 * // Code: SESSION_NOT_FOUND
	 * ```
	 */
	constructor(sessionId: string) {
		super(`Session not found: ${sessionId}`, 'SESSION_NOT_FOUND');
		this.name = 'SessionNotFoundError';
	}
}

/**
 * Error thrown when the maximum number of sessions has been reached.
 *
 * This error is thrown when trying to create a new session when the
 * pool has reached its configured maximum session limit.
 *
 * @example
 * ```typescript
 * if (pool.sessionCount >= pool.maxSessions) {
 *   throw new MaxSessionsReachedError(pool.maxSessions);
 * }
 * ```
 */
export class MaxSessionsReachedError extends SequentialThinkingError {
	/**
	 * Creates a new MaxSessionsReachedError.
	 *
	 * @param maxSessions - The maximum number of sessions allowed
	 *
	 * @example
	 * ```typescript
	 * throw new MaxSessionsReachedError(100);
	 * // Error: Max sessions (100) reached. Wait for a session to close or increase maxSessions.
	 * // Code: MAX_SESSIONS_REACHED
	 * ```
	 */
	constructor(maxSessions: number) {
		super(
			`Max sessions (${maxSessions}) reached. Wait for a session to close or increase maxSessions.`,
			'MAX_SESSIONS_REACHED'
		);
		this.name = 'MaxSessionsReachedError';
	}
}

/**
 * Error thrown when attempting to use a terminated connection pool.
 *
 * This error is thrown when trying to create sessions or process requests
 * after the connection pool has been terminated.
 *
 * @example
 * ```typescript
 * if (pool.isTerminated) {
 *   throw new PoolTerminatedError();
 * }
 * ```
 */
export class PoolTerminatedError extends SequentialThinkingError {
	/**
	 * Creates a new PoolTerminatedError.
	 *
	 * @example
	 * ```typescript
	 * throw new PoolTerminatedError();
	 * // Error: ConnectionPool has been terminated
	 * // Code: POOL_TERMINATED
	 * ```
	 */
	constructor() {
		super('ConnectionPool has been terminated', 'POOL_TERMINATED');
		this.name = 'PoolTerminatedError';
	}
}

/**
 * Error thrown when input validation fails due to invalid or malicious data.
 *
 * This error is thrown when user input fails security or format validation,
 * such as path traversal attempts or invalid identifier formats.
 *
 * @example
 * ```typescript
 * if (!BRANCH_ID_PATTERN.test(branchId)) {
 *   throw new ValidationError('branchId', 'Invalid format');
 * }
 * ```
 */
export class ValidationError extends SequentialThinkingError {
	/** The field that failed validation. */
	public readonly field: string;

	constructor(field: string, reason: string) {
		super(`Validation failed for '${field}': ${reason}`, 'VALIDATION_ERROR');
		this.name = 'ValidationError';
		this.field = field;
	}
}
