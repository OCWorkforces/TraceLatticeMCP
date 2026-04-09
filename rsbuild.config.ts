import { defineConfig } from '@rsbuild/core';

/**
 * Rsbuild config for bundling the CLI entry point (src/cli.ts) into a single file.
 *
 * Build order:
 * 1. rslib build → produces all library files in dist/ (bundleless)
 * 2. rsbuild build -c rsbuild.config.ts → bundles CLI, overwrites dist/cli.js
 * 3. postbuild script → injects shebang + chmod
 *
 * Externalization strategy:
 * - npm dependencies → externalized (resolved from node_modules at runtime)
 * - Node.js builtins → externalized
 * - Local files with dynamic imports → externalized (resolve to rslib output in dist/)
 * - Local files with only static imports → bundled into cli.js
 */
export default defineConfig({
	source: {
		entry: {
			cli: './src/cli.ts',
		},
	},
	output: {
		target: 'node',
		cleanDistPath: false,
		distPath: {
			root: './dist',
		},
		filename: {
			js: '[name].js',
		},
		sourceMap: false,
	},
	tools: {
		rspack: (config) => {
			// ESM output
			config.output = {
				...config.output,
				module: true,
				chunkFormat: 'module',
				chunkLoading: 'import',
				library: { type: 'module' },
				asyncChunks: false,
			};

			config.experiments = {
				...config.experiments,
				outputModule: true,
			};

			// Preserve import.meta.url — don't replace with build-time paths
			config.node = {
				__filename: false,
				__dirname: false,
			};

			// Don't evaluate import.meta expressions at build time
			const existingParser = config.module?.parser ?? {};
			config.module = {
				...config.module,
				parser: {
					...existingParser,
					javascript: {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						...(existingParser as any).javascript,
						importMeta: false,
					},
				},
			};

			config.externals = [
				// npm dependencies
				/^(@tmcp|tmcp|chalk|valibot|chokidar|yaml|better-sqlite3)/,
				// Node.js builtins
				/^node:/,
				// Local files used via dynamic import() — resolve to rslib output in dist/.
				// lib.js is both statically and dynamically imported; externalizing it is fine
				// because dist/lib.js exists from the rslib build.
				'./lib.js',
			];

			// Single output file — no code splitting
			config.optimization = {
				...config.optimization,
				splitChunks: false,
			};

			return config;
		},
	},
});
