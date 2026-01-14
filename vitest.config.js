import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        globals: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: ['**/*.test.ts', '**/types.ts', 'dist/**', 'node_modules/**'],
        },
    },
});
//# sourceMappingURL=vitest.config.js.map