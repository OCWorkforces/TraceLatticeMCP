/**
 * Lightweight structured logging without external dependencies.
 *
 * This module provides a structured logging implementation that writes to stderr
 * for MCP server compatibility. It supports multiple log levels, pretty printing,
 * and hierarchical child loggers with inherited context.
 *
 * @module logger
 */

/**
 * Log level severity ordering.
 *
 * Levels are ordered from least severe (debug) to most severe (error).
 * Only messages at or above the configured level will be logged.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Common logger interface for all logger implementations.
 *
 * This interface defines the contract that all loggers must implement,
 * allowing them to be used interchangeably throughout the application.
 */
export interface Logger {
	/**
	 * Log a debug message.
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 */
	debug(message: string, meta?: Record<string, unknown>): void;

	/**
	 * Log an info message.
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 */
	info(message: string, meta?: Record<string, unknown>): void;

	/**
	 * Log a warning message.
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 */
	warn(message: string, meta?: Record<string, unknown>): void;

	/**
	 * Log an error message.
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 */
	error(message: string, meta?: Record<string, unknown>): void;

	/**
	 * Sets the minimum log level.
	 * @param level - The new minimum log level
	 */
	setLevel(level: LogLevel): void;

	/**
	 * Gets the current minimum log level.
	 * @returns The current log level
	 */
	getLevel(): LogLevel;
}

/**
 * A single log entry with all relevant metadata.
 *
 * @example
 * ```typescript
 * const entry: LogEntry = {
 *   level: 'info',
 *   message: 'Server started',
 *   timestamp: '2026-01-18T10:30:00.000Z',
 *   context: 'SequentialThinking',
 *   meta: { port: 3000 }
 * };
 * ```
 */
export interface LogEntry {
	/** Severity level of the log entry. */
	level: LogLevel;

	/** The primary log message. */
	message: string;

	/** ISO 8601 timestamp of when the log was created. */
	timestamp: string;

	/** Optional context/module name for categorization. */
	context?: string;

	/** Additional structured metadata to include with the log. */
	meta?: Record<string, unknown>;
}

/**
 * Configuration options for creating a `StructuredLogger` instance.
 *
 * @example
 * ```typescript
 * const options: LoggerOptions = {
 *   level: 'debug',
 *   context: 'MyModule',
 *   pretty: true
 * };
 * ```
 */
export interface LoggerOptions {
	/**
	 * Minimum log level to output.
	 * Messages below this level will be suppressed.
	 * @default 'info'
	 */
	level?: LogLevel;

	/**
	 * Default context for log messages.
	 * Can be extended with child loggers.
	 * @default 'SequentialThinking'
	 */
	context?: string;

	/**
	 * Whether to enable pretty (human-readable) output.
	 * When false, outputs JSON-formatted logs.
	 * @default true
	 */
	pretty?: boolean;
}

/**
 * Structured logger with level filtering and context support.
 *
 * This logger provides structured logging capabilities with configurable
 * output formats, log levels, and hierarchical context. All output is
 * written to stderr for compatibility with MCP servers.
 *
 * @remarks
 * **Log Level Priority** (lowest to highest):
 * - `debug` (0) - Detailed debugging information
 * - `info` (1) - General informational messages
 * - `warn` (2) - Warning messages for potential issues
 * - `error` (3) - Error messages for failures
 *
 * Only messages at or above the configured level will be output.
 *
 * **Output Formats:**
 * - Pretty (default): `[timestamp] [LEVEL] [context] message {meta}`
 * - JSON: `{"level":"info","message":"...","timestamp":"...","context":"...","meta":{...}}`
 *
 * @example
 * ```typescript
 * // Create a logger
 * const logger = new StructuredLogger({
 *   level: 'info',
 *   context: 'SequentialThinking',
 *   pretty: true
 * });
 *
 * // Log messages
 * logger.debug('Detailed debug info', { userId: '123' });
 * logger.info('Server started', { port: 3000 });
 * logger.warn('High memory usage', { usage: '85%' });
 * logger.error('Connection failed', { error: 'ECONNREFUSED' });
 *
 * // Create a child logger with extended context
 * const childLogger = logger.createChild('Database');
 * childLogger.info('Query executed', { rows: 42 });
 * // Output: [timestamp] [INFO] [SequentialThinking:Database] Query executed {"rows":42}
 * ```
 */
export class StructuredLogger {
	/** Current minimum log level. */
	private _level: LogLevel;

	/** Default context for log messages. */
	private _context: string;

	/** Whether pretty printing is enabled. */
	private _pretty: boolean;

	/**
	 * Log level priority ordering for filtering.
	 * Higher numbers = higher severity.
	 * @private
	 */
	private static readonly LEVEL_PRIORITY: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	/**
	 * Creates a new StructuredLogger instance.
	 *
	 * @param options - Configuration options for the logger
	 *
	 * @example
	 * ```typescript
	 * // Default configuration
	 * const logger1 = new StructuredLogger();
	 *
	 * // Custom configuration
	 * const logger2 = new StructuredLogger({
	 *   level: 'debug',
	 *   context: 'MyApp',
	 *   pretty: false  // JSON output
	 * });
	 * ```
	 */
	constructor(options: LoggerOptions = {}) {
		this._level = options.level ?? 'info';
		this._context = options.context ?? 'SequentialThinking';
		this._pretty = options.pretty ?? true;
	}

	/**
	 * Determines whether a message at the given level should be logged.
	 * @param level - The log level to check
	 * @returns true if the level meets the threshold, false otherwise
	 * @private
	 */
	private shouldLog(level: LogLevel): boolean {
		return StructuredLogger.LEVEL_PRIORITY[level] >= StructuredLogger.LEVEL_PRIORITY[this._level];
	}

	/**
	 * Formats a log entry for output.
	 * @param entry - The log entry to format
	 * @returns Formatted string representation
	 * @private
	 */
	private format(entry: LogEntry): string {
		if (this._pretty) {
			const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
			return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.context ? ` [${entry.context}]` : ''} ${entry.message}${metaStr}`;
		}
		return JSON.stringify(entry);
	}

	/**
	 * Internal logging method that handles level filtering and output.
	 * @param level - The log level for this message
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 * @private
	 */
	private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
		if (!this.shouldLog(level)) return;

		const entry: LogEntry = {
			level,
			message,
			timestamp: new Date().toISOString(),
			context: this._context,
			meta,
		};

		const formatted = this.format(entry);

		// Write to stderr for MCP server compatibility
		console.error(formatted);
	}

	/**
	 * Log a debug message.
	 *
	 * Debug messages contain detailed information typically used for
	 * troubleshooting and development. Only output when log level is 'debug'.
	 *
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 *
	 * @example
	 * ```typescript
	 * logger.debug('Processing request', { path: '/api/users', method: 'GET' });
	 * ```
	 */
	debug(message: string, meta?: Record<string, unknown>): void {
		this.log('debug', message, meta);
	}

	/**
	 * Log an info message.
	 *
	 * Info messages contain general informational messages about normal operation.
	 * Output when log level is 'info' or lower.
	 *
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 *
	 * @example
	 * ```typescript
	 * logger.info('Server started', { port: 3000, env: 'production' });
	 * ```
	 */
	info(message: string, meta?: Record<string, unknown>): void {
		this.log('info', message, meta);
	}

	/**
	 * Log a warning message.
	 *
	 * Warning messages indicate potential issues that don't prevent operation
	 * but may require attention. Output when log level is 'warn' or lower.
	 *
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 *
	 * @example
	 * ```typescript
	 * logger.warn('High memory usage detected', { usage: '85%', threshold: '80%' });
	 * ```
	 */
	warn(message: string, meta?: Record<string, unknown>): void {
		this.log('warn', message, meta);
	}

	/**
	 * Log an error message.
	 *
	 * Error messages indicate failures or error conditions. Always output
	 * regardless of log level setting.
	 *
	 * @param message - The message to log
	 * @param meta - Optional structured metadata
	 *
	 * @example
	 * ```typescript
	 * logger.error('Database connection failed', { error: err.message, code: err.code });
	 * ```
	 */
	error(message: string, meta?: Record<string, unknown>): void {
		this.log('error', message, meta);
	}

	/**
	 * Creates a child logger with inherited settings and extended context.
	 *
	 * Child loggers inherit the parent's log level and pretty print setting,
	 * but have their context appended to the parent's context for hierarchical logging.
	 *
	 * @param context - Additional context to append to the parent's context
	 * @returns A new logger instance with extended context
	 *
	 * @example
	 * ```typescript
	 * const parentLogger = new StructuredLogger({ context: 'App' });
	 * const dbLogger = parentLogger.createChild('Database');
	 * const queryLogger = dbLogger.createChild('Query');
	 *
	 * parentLogger.info('Starting up');
	 * // Output: [timestamp] [INFO] [App] Starting up
	 *
	 * dbLogger.info('Connected');
	 * // Output: [timestamp] [INFO] [App:Database] Connected
	 *
	 * queryLogger.info('Executed in 5ms');
	 * // Output: [timestamp] [INFO] [App:Database:Query] Executed in 5ms
	 * ```
	 */
	createChild(context: string): StructuredLogger {
		return new StructuredLogger({
			level: this._level,
			context: `${this._context}:${context}`,
			pretty: this._pretty,
		});
	}

	/**
	 * Sets the minimum log level.
	 *
	 * Only messages at or above this level will be output.
	 *
	 * @param level - The new minimum log level
	 *
	 * @example
	 * ```typescript
	 * logger.setLevel('debug');  // Enable all logging
	 * logger.setLevel('error');  // Only show errors
	 * ```
	 */
	setLevel(level: LogLevel): void {
		this._level = level;
	}

	/**
	 * Gets the current minimum log level.
	 *
	 * @returns The current log level
	 *
	 * @example
	 * ```typescript
	 * const currentLevel = logger.getLevel();
	 * console.log(`Current level: ${currentLevel}`);
	 * ```
	 */
	getLevel(): LogLevel {
		return this._level;
	}
}
