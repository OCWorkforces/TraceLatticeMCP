/**
 * Base error class for Sequential Thinking server errors
 */
export class SequentialThinkingError extends Error {
	constructor(message: string, public readonly code: string) {
		super(message);
		this.name = 'SequentialThinkingError';
		Error.captureStackTrace(this, this.constructor);
	}
}

/**
 * Error thrown when a requested tool is not found
 */
export class ToolNotFoundError extends SequentialThinkingError {
	constructor(toolName: string) {
		super(`Tool '${toolName}' not found`, 'TOOL_NOT_FOUND');
		this.name = 'ToolNotFoundError';
	}
}

/**
 * Error thrown when a requested skill is not found
 */
export class SkillNotFoundError extends SequentialThinkingError {
	constructor(skillName: string) {
		super(`Skill '${skillName}' not found`, 'SKILL_NOT_FOUND');
		this.name = 'SkillNotFoundError';
	}
}

/**
 * Error thrown when thought validation fails
 */
export class InvalidThoughtError extends SequentialThinkingError {
	constructor(thoughtNumber: number, reason: string) {
		super(`Invalid thought ${thoughtNumber}: ${reason}`, 'INVALID_THOUGHT');
		this.name = 'InvalidThoughtError';
	}
}

/**
 * Error thrown when skill discovery fails
 */
export class SkillDiscoveryError extends SequentialThinkingError {
	constructor(directory: string, cause: Error) {
		super(`Failed to discover skills in ${directory}: ${cause.message}`, 'SKILL_DISCOVERY_FAILED');
		this.name = 'SkillDiscoveryError';
		this.cause = cause;
	}
}

/**
 * Error thrown when history size exceeds configured limit
 */
export class HistoryLimitExceededError extends SequentialThinkingError {
	constructor(currentSize: number, maxSize: number) {
		super(`History size ${currentSize} exceeds limit ${maxSize}`, 'HISTORY_LIMIT_EXCEEDED');
		this.name = 'HistoryLimitExceededError';
	}
}
