/**
 * Service registry type definitions for the DI container.
 *
 * Maps service keys to their concrete types for type-safe resolution.
 * Interface types are imported from contracts/ to reduce coupling.
 * Concrete types are imported only where needed for DI resolution.
 */

import type { PersistenceBackend } from '../persistence/PersistenceBackend.js';
// Concrete types — needed for DI container resolution type safety
import type { HistoryManager } from '../core/HistoryManager.js';
import type { EdgeStore } from '../core/graph/EdgeStore.js';
import type { ICalibrator } from '../contracts/calibrator.js';
import type { IOutcomeRecorder } from '../contracts/interfaces.js';
import type { IReasoningStrategy } from '../contracts/strategy.js';
import type { ThoughtEvaluator } from '../core/ThoughtEvaluator.js';
import type { ThoughtFormatter } from '../core/ThoughtFormatter.js';
import type { ThoughtProcessor } from '../core/ThoughtProcessor.js';
import type { StructuredLogger } from '../logger/StructuredLogger.js';
import type { Metrics } from '../metrics/metrics.impl.js';
import type { SkillRegistry } from '../registry/SkillRegistry.js';
import type { ToolRegistry } from '../registry/ToolRegistry.js';
import type { ServerConfig } from '../ServerConfig.js';
import type { ISummaryStore } from '../contracts/summary.js';
import type { CompressionService } from '../core/compression/CompressionService.js';
import type { ISuspensionStore } from '../contracts/suspension.js';

export interface ServiceRegistry {
	Logger: StructuredLogger;
	Config: ServerConfig;
	FileConfig: Record<string, unknown>;
	HistoryManager: HistoryManager;
	ThoughtProcessor: ThoughtProcessor;
	ThoughtFormatter: ThoughtFormatter;
	ThoughtEvaluator: ThoughtEvaluator;
	Persistence: PersistenceBackend | null;
	ToolRegistry: ToolRegistry;
	SkillRegistry: SkillRegistry;
	Metrics: Metrics;
	EdgeStore: EdgeStore;
	reasoningStrategy: IReasoningStrategy;
	outcomeRecorder: IOutcomeRecorder;
	calibrator: ICalibrator;
	summaryStore: ISummaryStore;
	compressionService: CompressionService;
	suspensionStore: ISuspensionStore;
}

export type ServiceKey = keyof ServiceRegistry;
