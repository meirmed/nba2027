// Copies /shared into /functions/shared so Cloud Functions bundle the SAME scoring code as the client.
import { cpSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'shared');
const dst = join(root, 'functions', 'shared');
rmSync(dst, { recursive: true, force: true });
cpSync(src, dst, { recursive: true, filter: (p) => !p.endsWith('.test.js') });
console.log('synced shared ->', dst, readdirSync(dst));
