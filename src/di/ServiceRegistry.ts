import type { StructuredLogger } from '../logger/StructuredLogger.js';
import type { ServerConfig } from '../ServerConfig.js';
import type { HistoryManager } from '../HistoryManager.js';
import type { ThoughtProcessor } from '../processor/ThoughtProcessor.js';
import type { ThoughtFormatter } from '../formatter/ThoughtFormatter.js';
import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';

export interface ServiceRegistry {
	Logger: StructuredLogger;
	Config: ServerConfig;
	FileConfig: Record<string, unknown>;
	HistoryManager: HistoryManager;
	ThoughtProcessor: ThoughtProcessor;
	ThoughtFormatter: ThoughtFormatter;
	Persistence: PersistenceBackend | null;
}

export type ServiceKey = keyof ServiceRegistry;
