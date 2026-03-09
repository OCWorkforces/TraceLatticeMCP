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
				branches: 55,
				functions: 60,
				lines: 65,
				statements: 65,
			},
		},
	},
});
