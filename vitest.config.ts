import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.nuxt/**'],
		include: ['src/**/*.{test,spec}.{ts,tsx}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['**/*.test.ts', '**/types.ts', 'dist/**', 'node_modules/**'],
			thresholds: {
				branches: 60,
				functions: 70,
				lines: 70,
				statements: 70,
			},
		},
	},
});
