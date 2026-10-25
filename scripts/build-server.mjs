import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
rmSync('dist-server', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], { stdio: 'inherit' });
mkdirSync('dist-server/server', { recursive: true });
cpSync('server/postgres-worker.mjs', 'dist-server/server/postgres-worker.mjs');
cpSync('server/certs', 'dist-server/server/certs', { recursive: true });
