/**
 * Lightweight structured logging without external dependencies.
 * Writes to stderr for MCP server compatibility.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: string;
	context?: string;
	meta?: Record<string, unknown>;
}

export interface LoggerOptions {
	level?: LogLevel;
	context?: string;
	pretty?: boolean; // Pretty print for development
}

export class StructuredLogger {
	private _level: LogLevel;
	private _context: string;
	private _pretty: boolean;

	// Log level priority order
	private static readonly LEVEL_PRIORITY: Record<LogLevel, number> = {
		debug: 0,
		info: 1,
		warn: 2,
		error: 3,
	};

	constructor(options: LoggerOptions = {}) {
		this._level = options.level ?? 'info';
		this._context = options.context ?? 'SequentialThinking';
		this._pretty = options.pretty ?? true;
	}

	private shouldLog(level: LogLevel): boolean {
		return StructuredLogger.LEVEL_PRIORITY[level] >= StructuredLogger.LEVEL_PRIORITY[this._level];
	}

	private format(entry: LogEntry): string {
		if (this._pretty) {
			const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
			return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.context ? ` [${entry.context}]` : ''} ${entry.message}${metaStr}`;
		}
		return JSON.stringify(entry);
	}

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
	 */
	debug(message: string, meta?: Record<string, unknown>): void {
		this.log('debug', message, meta);
	}

	/**
	 * Log an info message.
	 */
	info(message: string, meta?: Record<string, unknown>): void {
		this.log('info', message, meta);
	}

	/**
	 * Log a warning message.
	 */
	warn(message: string, meta?: Record<string, unknown>): void {
		this.log('warn', message, meta);
	}

	/**
	 * Log an error message.
	 */
	error(message: string, meta?: Record<string, unknown>): void {
		this.log('error', message, meta);
	}

	/**
	 * Create a child logger with inherited settings and additional context.
	 */
	createChild(context: string): StructuredLogger {
		return new StructuredLogger({
			level: this._level,
			context: `${this._context}:${context}`,
			pretty: this._pretty,
		});
	}

	/**
	 * Set the log level.
	 */
	setLevel(level: LogLevel): void {
		this._level = level;
	}

	/**
	 * Get the current log level.
	 */
	getLevel(): LogLevel {
		return this._level;
	}
}
