import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', '**/.nuxt/**'],
		include: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/*.eval.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: ['**/*.test.ts', '**/types.ts', 'dist/**', 'node_modules/**'],
			thresholds: {
				branches: 90,
				functions: 90,
				lines: 90,
				statements: 90,
				functions: 60,
				lines: 65,
				statements: 65,
			},
		},
	},
});
