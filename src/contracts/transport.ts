/**
 * Transport kind discriminator.
 */
export type TransportKind = 'sse' | 'http' | 'streamable-http';

/**
 * Shared lifecycle interface for MCP transports.
 *
 * All transports (SSE, HTTP, Streamable HTTP) implement this interface.
 * Share lifecycle only — request/response shapes genuinely differ across transports.
 */
export interface ITransport {
	/** Discriminator for transport type identification. */
	readonly kind: TransportKind;

	/** Connect the transport to an MCP server. */
	connect(mcpServer: import('tmcp').McpServer): Promise<void>;

	/** Stop the transport with graceful shutdown. */
	stop(timeout?: number): Promise<void>;

	/** Number of currently active client connections. */
	readonly clientCount: number;

	/** Whether the transport is in the process of shutting down. */
	readonly isShuttingDown: boolean;

	/** The server URL for client connections. */
	readonly serverUrl: string;
}
