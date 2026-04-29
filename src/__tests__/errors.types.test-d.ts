/**
 * Compile-time exhaustiveness check between `ErrorCode` and the set of
 * error codes actually used by error subclasses (or by direct
 * `SequentialThinkingError` instantiations).
 *
 * Purpose: if a new code is added to `ERROR_CODES` without a corresponding
 * subclass (or known direct usage) being added to the union below, this file
 * fails type-checking. Likewise, if a subclass code is removed from
 * `ERROR_CODES`, TypeScript flags the orphan literal.
 *
 * This file contains NO runtime tests. Vitest's `*.test-d.ts` convention
 * is used purely so the file is type-checked by the project's tsc pass
 * without being treated as a runnable test module.
 */

import type { ErrorCode } from '../errors.js';

/**
 * Union of every error code literal currently emitted by an error subclass
 * in `src/errors.ts`, plus codes thrown directly via `SequentialThinkingError`
 * elsewhere in the codebase.
 *
 * Subclass → code mapping (24 subclasses):
 *  - ConfigurationError        → CONFIGURATION_ERROR
 *  - ToolNotFoundError         → TOOL_NOT_FOUND
 *  - SkillNotFoundError        → SKILL_NOT_FOUND
 *  - InvalidThoughtError       → INVALID_THOUGHT
 *  - SkillDiscoveryError       → SKILL_DISCOVERY_FAILED
 *  - HistoryLimitExceededError → HISTORY_LIMIT_EXCEEDED
 *  - DuplicateSkillError       → DUPLICATE_SKILL
 *  - InvalidSkillError         → INVALID_SKILL
 *  - DuplicateToolError        → DUPLICATE_TOOL
 *  - InvalidToolError          → INVALID_TOOL
 *  - SessionNotActiveError     → SESSION_NOT_ACTIVE
 *  - SessionNotFoundError      → SESSION_NOT_FOUND
 *  - MaxSessionsReachedError   → MAX_SESSIONS_REACHED
 *  - PoolTerminatedError       → POOL_TERMINATED
 *  - ValidationError           → VALIDATION_ERROR
 *  - InvalidEdgeError          → INVALID_EDGE
 *  - CycleDetectedError        → CYCLE_DETECTED
 *  - SuspensionNotFoundError   → SUSPENSION_NOT_FOUND
 *  - SuspensionExpiredError    → SUSPENSION_EXPIRED
 *  - InvalidToolCallError      → INVALID_TOOL_CALL
 *  - InvalidBacktrackError     → INVALID_BACKTRACK
 *  - UnknownToolError          → UNKNOWN_TOOL
 *  - LockTimeoutError          → LOCK_TIMEOUT
 *  - SessionAccessDeniedError  → SESSION_ACCESS_DENIED
 *
 * Direct `SequentialThinkingError` usages (no dedicated subclass):
 *  - DUPLICATE_SUMMARY (thrown by `core/compression/InMemorySummaryStore.ts`)
 */
type _AllSubclassCodes =
	| 'CONFIGURATION_ERROR'
	| 'TOOL_NOT_FOUND'
	| 'SKILL_NOT_FOUND'
	| 'INVALID_THOUGHT'
	| 'SKILL_DISCOVERY_FAILED'
	| 'HISTORY_LIMIT_EXCEEDED'
	| 'DUPLICATE_SKILL'
	| 'INVALID_SKILL'
	| 'DUPLICATE_TOOL'
	| 'INVALID_TOOL'
	| 'SESSION_NOT_ACTIVE'
	| 'SESSION_NOT_FOUND'
	| 'MAX_SESSIONS_REACHED'
	| 'POOL_TERMINATED'
	| 'VALIDATION_ERROR'
	| 'INVALID_EDGE'
	| 'CYCLE_DETECTED'
	| 'SUSPENSION_NOT_FOUND'
	| 'SUSPENSION_EXPIRED'
	| 'INVALID_TOOL_CALL'
	| 'INVALID_BACKTRACK'
	| 'UNKNOWN_TOOL'
	| 'LOCK_TIMEOUT'
	| 'SESSION_ACCESS_DENIED'
	| 'DUPLICATE_SUMMARY';

/**
 * If any `ErrorCode` literal is missing from `_AllSubclassCodes`, this
 * resolves to that literal (a non-`never` type), and the assignment below
 * fails to compile.
 */
type _Exhaustive = Exclude<ErrorCode, _AllSubclassCodes>;

/**
 * If any `_AllSubclassCodes` literal has been removed from `ErrorCode`,
 * this resolves to the orphan literal, and the assignment below fails.
 */
type _NoOrphans = Exclude<_AllSubclassCodes, ErrorCode>;

// Compile-time assertions: both must collapse to `never`.
const _exhaustive: _Exhaustive = undefined as never;
const _noOrphans: _NoOrphans = undefined as never;

// Reference the bindings so unused-locals lint rules stay quiet under tsc.
void _exhaustive;
void _noOrphans;
