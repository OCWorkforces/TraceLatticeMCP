import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.node,
				process: 'readonly',
				console: 'readonly',
				Buffer: 'readonly',
				__dirname: 'readonly',
				__filename: 'readonly',
			},
			ecmaVersion: 'latest',
			sourceType: 'module',
		},
		rules: {
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
	{
		ignores: ['dist/**', 'node_modules/**', '*.config.js', 'coverage/**'],
	},
];
