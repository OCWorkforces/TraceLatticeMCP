import { defineConfig } from '@rslib/core';

export default defineConfig({
	lib: [
		{
			format: 'esm',
			bundle: false,
			dts: {
				bundle: false,
				tsconfigPath: './tsconfig.build.json',
			},
		},
	],
	source: {
		entry: {
			index: ['./src/**/*.ts', '!./src/**/*.test.ts', '!./src/**/*.spec.ts', '!./src/__tests__/**'],
		},
	},
	output: {
		target: 'node',
		distPath: {
			root: './dist',
		},
		sourceMap: {
			js: 'source-map',
		},
	},
});
