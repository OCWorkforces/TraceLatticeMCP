#!/usr/bin/env node
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(__dirname, '..', 'dist', 'cli.js');
const content = readFileSync(CLI_PATH, 'utf-8');

if (!content.startsWith('#!')) {
	writeFileSync(CLI_PATH, `#!/usr/bin/env bun\n${content}`);
}
chmodSync(CLI_PATH, 0o755);
console.log('postbuild: CLI shebang injected and permissions set');
