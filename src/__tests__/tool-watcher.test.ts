import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FSWatcher } from 'chokidar';

// Event handler storage for the mock watcher
type WatcherEventHandler = (...args: unknown[]) => void;
let eventHandlers: Map<string, WatcherEventHandler>;
let mockWatcher: {
	on: ReturnType<typeof vi.fn>;
	close: ReturnType<typeof vi.fn>;
};

// Mock chokidar before importing ToolWatcher
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

import { ToolWatcher } from '../watchers/ToolWatcher.js';
import { watch } from 'chokidar';
import type { ToolRegistry } from '../registry/ToolRegistry.js';
import type { Logger } from '../logger/StructuredLogger.js';

function createMockRegistry(): ToolRegistry {
	return {
		discoverAsync: vi.fn().mockResolvedValue(0),
		removeTool: vi.fn(),
		add: vi.fn(),
		remove: vi.fn(),
		has: vi.fn(),
		get: vi.fn(),
		getAll: vi.fn().mockReturnValue([]),
		size: vi.fn().mockReturnValue(0),
		clear: vi.fn(),
		addTool: vi.fn(),
		hasTool: vi.fn(),
		getTool: vi.fn(),
	} as unknown as ToolRegistry;
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

describe('ToolWatcher', () => {
	let mockRegistry: ToolRegistry;
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
		it('should create a watcher with a valid ToolRegistry', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			expect(watcher).toBeInstanceOf(ToolWatcher);
			watcher.stop();
		});

		it('should call chokidar.watch with tool directories on construction', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			expect(watch).toHaveBeenCalledWith(
				['.claude/tools', '/mock/home/.claude/tools'],
				expect.objectContaining({
					persistent: true,
				})
			);
			watcher.stop();
		});

		it('should configure chokidar to ignore node_modules and .DS_Store', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			expect(watch).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({
					ignored: [/node_modules/, /\.DS_Store$/],
				})
			);
			watcher.stop();
		});

		it('should register event handlers for add and unlink', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			expect(mockWatcher.on).toHaveBeenCalledWith('add', expect.any(Function));
			expect(mockWatcher.on).toHaveBeenCalledWith('unlink', expect.any(Function));
			watcher.stop();
		});

		it('should work without a logger (uses noop logger)', () => {
			const watcher = new ToolWatcher(mockRegistry);
			expect(watcher).toBeInstanceOf(ToolWatcher);
			watcher.stop();
		});

		it('should use noop logger that handles add events without errors', async () => {
			const watcher = new ToolWatcher(mockRegistry);
			const addHandler = eventHandlers.get('add');
			expect(addHandler).toBeDefined();

			await addHandler!('/path/to/.claude/tools/noop-tool.tool.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});

		it('should use noop logger that handles unlink events without errors', async () => {
			const watcher = new ToolWatcher(mockRegistry);
			const unlinkHandler = eventHandlers.get('unlink');
			expect(unlinkHandler).toBeDefined();

			await unlinkHandler!('/path/to/.claude/tools/noop-tool.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('noop-tool');
			watcher.stop();
		});

		it('should use noop logger error path when discoverAsync fails', async () => {
			(mockRegistry.discoverAsync as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Noop discovery failed')
			);
			const watcher = new ToolWatcher(mockRegistry);
			const addHandler = eventHandlers.get('add');

			// Should not throw — error is caught and logged to noop logger
			await addHandler!('/path/to/.claude/tools/fail.tool.md');
			watcher.stop();
		});

		it('should use noop logger error path when removeTool fails', async () => {
			(mockRegistry.removeTool as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Noop remove failed');
			});
			const watcher = new ToolWatcher(mockRegistry);
			const unlinkHandler = eventHandlers.get('unlink');

			// Should not throw — error is caught and logged to noop logger
			await unlinkHandler!('/path/to/.claude/tools/fail.tool.md');
			watcher.stop();
		});
	});

	describe('start (auto-setup)', () => {
		it('should begin watching immediately upon construction', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			expect(watch).toHaveBeenCalledTimes(1);
			watcher.stop();
		});
	});

	describe('stop', () => {
		it('should close the underlying watcher', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			watcher.stop();
			expect(mockWatcher.close).toHaveBeenCalledTimes(1);
		});

		it('should set watcher to null after stopping', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			watcher.stop();
			// Calling stop again should not throw
			watcher.stop();
			expect(mockWatcher.close).toHaveBeenCalledTimes(1);
		});

		it('should be safe to call stop multiple times', () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			watcher.stop();
			watcher.stop();
			watcher.stop();
			expect(mockWatcher.close).toHaveBeenCalledTimes(1);
		});
	});

	describe('file change detection - add event', () => {
		it('should trigger discoverAsync when a .tool.md file is added', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');
			expect(addHandler).toBeDefined();

			await addHandler!('/path/to/.claude/tools/my-tool.tool.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalledTimes(1);
			watcher.stop();
		});

		it('should ignore non-.tool.md files on add', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/.claude/tools/readme.md');
			expect(mockRegistry.discoverAsync).not.toHaveBeenCalled();
			watcher.stop();
		});

		it('should ignore .txt files on add', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/.claude/tools/notes.txt');
			expect(mockRegistry.discoverAsync).not.toHaveBeenCalled();
			watcher.stop();
		});

		it('should ignore files with partial .tool.md match', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			// Does not end with .tool.md
			await addHandler!('/path/to/.claude/tools/tool.md.bak');
			expect(mockRegistry.discoverAsync).not.toHaveBeenCalled();
			watcher.stop();
		});
	});

	describe('file change detection - unlink event (tool removal)', () => {
		it('should call removeTool when a .tool.md file is deleted', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');
			expect(unlinkHandler).toBeDefined();

			await unlinkHandler!('/path/to/.claude/tools/my-tool.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('my-tool');
			watcher.stop();
		});

		it('should extract correct tool name from filename', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.claude/tools/search-and-replace.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('search-and-replace');
			watcher.stop();
		});

		it('should ignore non-.tool.md files on unlink', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.claude/tools/readme.md');
			expect(mockRegistry.removeTool).not.toHaveBeenCalled();
			watcher.stop();
		});

		it('should ignore other file types on unlink', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.claude/tools/config.json');
			expect(mockRegistry.removeTool).not.toHaveBeenCalled();
			watcher.stop();
		});
	});

	describe('error handling', () => {
		it('should not throw when removeTool throws', async () => {
			(mockRegistry.removeTool as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw new Error('Tool not found');
			});

			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			// Should not throw
			await unlinkHandler!('/path/to/.claude/tools/nonexistent.tool.md');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining("Tool 'nonexistent' not registered: Tool not found")
			);
			watcher.stop();
		});

		it('should handle non-Error objects thrown by removeTool', async () => {
			(mockRegistry.removeTool as ReturnType<typeof vi.fn>).mockImplementation(() => {
				throw 'string error';
			});

			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/.claude/tools/bad-tool.tool.md');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining("Tool 'bad-tool' not registered: string error")
			);
			watcher.stop();
		});

		it('should log error when discoverAsync fails on add', async () => {
			(mockRegistry.discoverAsync as ReturnType<typeof vi.fn>).mockRejectedValue(
				new Error('Discovery failed')
			);

			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			// The handler catches the error internally and logs it
			await addHandler!('/path/to/tools/new.tool.md');
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('Failed to discover tools:'),
				expect.objectContaining({ error: expect.any(Error) })
			);
			watcher.stop();
		});
	});

	describe('tool name extraction', () => {
		it('should correctly extract simple tool name', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/tools/grep.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('grep');
			watcher.stop();
		});

		it('should correctly extract hyphenated tool name', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/tools/my-custom-tool.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('my-custom-tool');
			watcher.stop();
		});

		it('should correctly extract tool name with dots in path', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/home/user/.claude/tools/test.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('test');
			watcher.stop();
		});
	});

	describe('registry delegation', () => {
		it('should delegate discovery to the tool registry on .tool.md add', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');

			await addHandler!('/path/to/tools/new.tool.md');
			expect(mockRegistry.discoverAsync).toHaveBeenCalled();
			watcher.stop();
		});

		it('should delegate removal to the tool registry on .tool.md unlink', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			await unlinkHandler!('/path/to/tools/removed.tool.md');
			expect(mockRegistry.removeTool).toHaveBeenCalledWith('removed');
			watcher.stop();
		});

		it('should not delegate for non-tool files', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const addHandler = eventHandlers.get('add');
			const unlinkHandler = eventHandlers.get('unlink');

			await addHandler!('/path/to/tools/readme.txt');
			await unlinkHandler!('/path/to/tools/readme.txt');

			expect(mockRegistry.discoverAsync).not.toHaveBeenCalled();
			expect(mockRegistry.removeTool).not.toHaveBeenCalled();
			watcher.stop();
		});
	});

		it('should handle .tool.md file where toolName becomes empty string', async () => {
			const watcher = new ToolWatcher(mockRegistry, mockLogger);
			const unlinkHandler = eventHandlers.get('unlink');

			// File named exactly '.tool.md' results in empty string toolName
			await unlinkHandler!('/path/to/.claude/tools/.tool.md');
			// Empty string is falsy, so removeTool should not be called
			expect(mockRegistry.removeTool).not.toHaveBeenCalled();
			watcher.stop();
		});
});
