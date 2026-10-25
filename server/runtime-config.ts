import { basename, dirname, join, resolve, sep } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { releaseProfile } from '../shared/release.ts';

// Resolve existing parent symlinks even before a new workspace directory exists.
function canonical(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(canonical(dirname(path)), basename(path));
}

export function runtimeConfig(env: NodeJS.ProcessEnv, root = process.cwd()) {
  const profile = releaseProfile(env.STELUX_RELEASE_PROFILE);
  const cloud = env.STELUX_RUNTIME === 'cloud';
  if (env.STELUX_RUNTIME && !['local', 'cloud'].includes(env.STELUX_RUNTIME)) throw new Error('Unknown STELUX_RUNTIME.');
  if (cloud && profile !== 'welding-demo') throw new Error('The cloud entry point requires the welding-demo profile.');
  const fullDataDir = resolve(root, env.STELUX_DATA_DIR || '.data');
  const dataDir = profile === 'welding-demo' ? resolve(root, env.STELUX_DEMO_DATA_DIR || '.data/welding-demo') : fullDataDir;
  if (profile === 'welding-demo') {
    const demoPath = canonical(dataDir); const fullPath = canonical(fullDataDir); const uploads = canonical(join(fullDataDir, 'uploads'));
    if (demoPath === fullPath || demoPath === uploads || demoPath.startsWith(uploads + sep)) throw new Error('The evaluation workspace needs its own data directory.');
  }
  const databaseUrl = profile === 'full' ? env.DATABASE_URL : cloud ? env.STELUX_DEMO_DATABASE_URL : undefined;
  if (cloud && !databaseUrl) throw new Error('Set STELUX_DEMO_DATABASE_URL to a separate evaluation PostgreSQL database.');
  if (cloud && env.DATABASE_URL) {
    const identity = (value: string) => { const url = new URL(value); return `${url.hostname.toLowerCase()}:${url.port || 5432}${url.pathname || '/postgres'}`; };
    if (identity(databaseUrl!) === identity(env.DATABASE_URL)) throw new Error('The evaluation database must be separate from DATABASE_URL.');
  }
  let publicOrigin: string | undefined;
  if (env.STELUX_PUBLIC_URL) {
    const url = new URL(env.STELUX_PUBLIC_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) throw new Error('STELUX_PUBLIC_URL must be an HTTP(S) origin without a path or credentials.');
    if (cloud && url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('The public cloud URL must use HTTPS.');
    publicOrigin = url.origin;
  }
  if (cloud && !publicOrigin) throw new Error('Set STELUX_PUBLIC_URL to the public HTTPS origin.');
  const port = Number(env.PORT || (cloud ? 3000 : env.NODE_ENV === 'production' ? profile === 'welding-demo' ? 3002 : 3000 : 3001));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { profile, cloud, dataDir, port, host: env.STELUX_HOST || (cloud ? '0.0.0.0' : '127.0.0.1'), databaseUrl, publicOrigin, secureCookies: publicOrigin?.startsWith('https:') || false, documentStorage: cloud ? 'database' as const : 'disk' as const, distDir: resolve(root, profile === 'welding-demo' ? 'dist-welding-demo' : 'dist') };
}
