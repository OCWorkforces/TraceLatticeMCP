import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FSWatcher } from 'chokidar';

// Event handler storage for the mock watcher
type WatcherEventHandler = (...args: unknown[]) => void;
let eventHandlers: Map<string, WatcherEventHandler>;
let mockWatcher: {
	on: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
};

// Mock chokidar before importing SkillWatcher
vi.mock('chokidar', () => {
	return {
		watch: vi.fn(() => {
			eventHandlers = new Map();
			mockWatcher = {
				on: vi.fn((event: string, handler: WatcherEventHandler) => {
					eventHandlers.set(event, handler);
					return mockWatcher;
				}),
				close: vi.fn(),
			};
			return mockWatcher as unknown as FSWatcher;
		}),
	};
});

// Mock node:os to avoid real homedir
vi.mock('node:os', () => ({
	homedir: () => '/mock/home',
}));

import { SkillWatcher } from '../watchers/SkillWatcher.js';
import { watch } from 'chokidar';
import type { SkillRegistry } from '../registry/SkillRegistry.js';
import type { Logger } from '../logger/StructuredLogger.js';

function createMockRegistry(): SkillRegistry {
	return {
		discoverAsync: vi.fn().mockResolvedValue(0),
		removeSkillByName: vi.fn(),
		// Satisfy the SkillRegistry interface shape used by SkillWatcher
		add: vi.fn(),
		remove: vi.fn(),
		has: vi.fn(),
		get: vi.fn(),
		getAll: vi.fn().mockReturnValue([]),
		size: vi.fn().mockReturnValue(0),
		clear: vi.fn(),
	} as unknown as SkillRegistry;
}

function createMockLogger(): Logger {
	return {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		setLevel: vi.fn(),
		getLevel: vi.fn().mockReturnValue('info'),
	};
}

describe('SkillWatcher', () => {
	let mockRegistry: SkillRegistry;
	let mockLogger: Logger;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRegistry = createMockRegistry();
		mockLogger = createMockLogger();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('constructor', () => {
		it('should create a watcher with a valid SkillRegistry', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			expect(watcher).toBeInstanceOf(SkillWatcher);
			watcher.stop();
		});

		it('should call chokidar.watch with skill directories on construction', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			expect(watch).toHaveBeenCalledWith(
				['.claude/skills', '/mock/home/.claude/skills'],
				expect.objectContaining({
					persistent: true,
				})
			);
			watcher.stop();
		});

		it('should configure chokidar to ignore node_modules and .DS_Store', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			expect(watch).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({
					ignored: [/node_modules/, /\.DS_Store$/],
				})
			);
			watcher.stop();
		});

		it('should register event handlers for add, change, and unlink', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
			expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
			expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
			watcher.stop();
		});

		it('should work without a logger (uses noop logger)', () => {
			const watcher = new SkillWatcher(mockRegistry);
			expect(watcher).toBeInstanceOf(SkillWatcher);
			watcher.stop();
		});

		it('should use noop logger that handles add events without errors', async () => {
			const watcher = new SkillWatcher(mockRegistry);
			const addHandler = eventHandlers.get('add');
			expect(addHandler).toBeDefined();

			// Trigger event on watcher with noop logger — should not throw
			await addHandler!('/path/to/.claude/skills/test-skill.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});

		it('should use noop logger that handles change events without errors', async () => {
			const watcher = new SkillWatcher(mockRegistry);
			const changeHandler = eventHandlers.get('change');
			expect(changeHandler).toBeDefined();

			await changeHandler!('/path/to/.claude/skills/test-skill.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});

		it('should use noop logger that handles unlink events without errors', async () => {
			const watcher = new SkillWatcher(mockRegistry);
			const unlinkHandler = eventHandlers.get('unlink');
			expect(unlinkHandler).toBeDefined();

			await unlinkHandler!('/path/to/.claude/skills/remove-skill.md');
			expect(mockRegistry.removeSkillByName).toHaveBeenCalledWith('remove-skill.md');
			watcher.stop();
		});

		it('should use noop logger verbose add path without errors', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry);
			const addHandler = eventHandlers.get('add');

			// With verbose + noop logger, log() calls _logger.error() which is a no-op
			await addHandler!('/path/to/.claude/skills/verbose-skill.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should use noop logger verbose change path without errors', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry);
			const changeHandler = eventHandlers.get('change');

			await changeHandler!('/path/to/.claude/skills/verbose-change.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should use noop logger verbose unlink path without errors', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.claude/skills/verbose-unlink.md');
			expect(mockRegistry.removeSkillByName).toHaveBeenCalledWith('verbose-unlink.md');

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});
	});

	describe('start (auto-setup)', () => {
		it('should begin watching immediately upon construction', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			expect(watch).toHaveBeenCalledTimes(1);
			watcher.stop();
		});
	});

	describe('stop', () => {
		it('should close the underlying watcher', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			watcher.stop();
			expect(mockWatcher.close).toHaveBeenCalledTimes(1);
		});

		it('should set watcher to null after stopping', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			watcher.stop();
			// Calling stop again should not throw (watcher is null)
			watcher.stop();
			expect(mockWatcher.close).toHaveBeenCalledTimes(1);
		});

		it('should be safe to call stop multiple times', () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			watcher.stop();
			watcher.stop();
			watcher.stop();
			// close should only be called once since watcher is nulled
			expect(mockWatcher.close).toHaveBeenCalledTimes(1);
		});
	});

	describe('file change detection - add event', () => {
		it('should trigger discoverAsync when a skill file is added', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');
			expect(addHandler).toBeDefined();

			await addHandler!('/path/to/.claude/skills/commit.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});

		it('should trigger discoverAsync even for .DS_Store files (still discovers)', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/.DS_Store');
			// discoverAsync is still called, just logging is suppressed for .DS_Store
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});
	});

	describe('file change detection - change event', () => {
		it('should trigger discoverAsync when a skill file is modified', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const changeHandler = eventHandlers.get('change');
			expect(changeHandler).toBeDefined();

			await changeHandler!('/path/to/.claude/skills/review-pr.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});
	});

	describe('file change detection - unlink event (skill removal)', () => {
		it('should call removeSkillByName when a skill file is deleted', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');
			expect(unlinkHandler).toBeDefined();

			await unlinkHandler!('/path/to/.claude/skills/commit.md');
			expect(mockRegistry.removeSkillByName).toHaveBeenCalledWith('commit.md');
			watcher.stop();
		});

		it('should extract correct skill name from path with directories', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/home/user/.claude/skills/review-pr.yml');
			expect(mockRegistry.removeSkillByName).toHaveBeenCalledWith('review-pr.yml');
			watcher.stop();
		});

		it('should handle Windows-style paths', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('C:\\Users\\test\\.claude\\skills\\my-skill.md');
			expect(mockRegistry.removeSkillByName).toHaveBeenCalledWith('my-skill.md');
			watcher.stop();
		});

		it('should not call removeSkillByName for empty path segments', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			// Path ending with a separator yields empty last segment -> null
			await unlinkHandler!('/path/to/skills/');
			expect(mockRegistry.removeSkillByName).not.toHaveBeenCalled();
			watcher.stop();
		});
	});

	describe('error handling', () => {
		it('should not throw when removeSkillByName throws', async () => {
			(mockRegistry.removeSkillByName as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Skill not found');
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			// Should not throw
			await unlinkHandler!('/path/to/.claude/skills/nonexistent.md');
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to remove skill nonexistent.md'),
				expect.stringContaining('Skill not found')
			);

			consoleSpy.mockRestore();
			watcher.stop();
		});

		it('should handle non-Error objects thrown by removeSkillByName', async () => {
			(mockRegistry.removeSkillByName as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw 'string error';
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.claude/skills/bad-skill.md');
			expect(consoleSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to remove skill bad-skill.md'),
				'string error'
			);

			consoleSpy.mockRestore();
			watcher.stop();
		});

		it('should not swallow errors from discoverAsync', async () => {
			(mockRegistry.discoverAsync as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Discovery failed')
			);

			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			// The handler is async - the error will propagate as a rejected promise
			await expect(addHandler!('/path/to/skills/new-skill.md')).rejects.toThrow('Discovery failed');
			watcher.stop();
		});
	});

	describe('logging behavior', () => {
		it('should not log when WATCHER_VERBOSE is not set', async () => {
			delete process.env.WATCHER_VERBOSE;
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/skills/test.md');
			// Logger error should not be called because WATCHER_VERBOSE is not 'true'
			expect(mockLogger.error).not.toHaveBeenCalled();
			watcher.stop();
		});

		it('should log when WATCHER_VERBOSE is true', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/skills/test.md');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('[Watcher] Skill added: test.md')
			);

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should not log .DS_Store file events even when verbose', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/.DS_Store');
			// Logging is suppressed for .DS_Store
			expect(mockLogger.error).not.toHaveBeenCalled();

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should log change events when WATCHER_VERBOSE is true', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const changeHandler = eventHandlers.get('change');

			await changeHandler!('/path/to/skills/modified.md');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('[Watcher] Skill modified: modified.md')
			);

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should log unlink events when WATCHER_VERBOSE is true', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/skills/removed.md');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('[Watcher] Skill removed: removed.md')
			);

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should not log .DS_Store change events even when verbose', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const changeHandler = eventHandlers.get('change');

			await changeHandler!('/path/to/.DS_Store');
			expect(mockLogger.error).not.toHaveBeenCalled();

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});

		it('should not log .DS_Store unlink events even when verbose', async () => {
			process.env.WATCHER_VERBOSE = 'true';
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.DS_Store');
			expect(mockLogger.error).not.toHaveBeenCalled();

			delete process.env.WATCHER_VERBOSE;
			watcher.stop();
		});
	});

	describe('registry delegation', () => {
		it('should delegate discovery to the skill registry on add', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/skills/new.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalled();
			watcher.stop();
		});

		it('should delegate discovery to the skill registry on change', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const changeHandler = eventHandlers.get('change');

			await changeHandler!('/path/to/skills/existing.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalled();
			watcher.stop();
		});

		it('should delegate removal to the skill registry on unlink', async () => {
			const watcher = new SkillWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/skills/removed.md');
			expect(mockRegistry.removeSkillByName).toHaveBeenCalledWith('removed.md');
			watcher.stop();
		});
	});
});
