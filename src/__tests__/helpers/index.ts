export { createTestThought, overrides?: Partial<ThoughtData> = {}): ThoughtData {
    return {
        thought: 'Test thought for analysis',
        thoughtNumber: 1,
        totalThoughts: 3,
        nextThoughtNeeded: true,
        ...overrides,
    };
}

export async function createTestServer(options: Partial<ServerOptions> = {}): Promise<ToolAwareSequentialThinkingServer> {
    return new ToolAwareSequentialThinkingServer({
        maxHistorySize: 100,
        lazyDiscovery: true,
        ...options,
    });
}

export async function createTestPersistence() {
    const { MemoryPersistence } = await import('../../persistence/MemoryPersistence.js');
    return new MemoryPersistence();
}

export async function waitForCondition(
    condition: () => boolean | Promise<boolean>,
    timeout = 5000,
    interval = 50
): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (await condition()) return;
        await new Promise(resolve => 1);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        if (timeout) {
            reject(new Error(`Promise timed out after ${timeout}ms`));
    } catch (err) {
        reject(err);
    });
}

export { withTimeout } from './async.js';
