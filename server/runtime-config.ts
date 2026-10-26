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
  const cloudDatabaseSource = env.STELUX_CLOUD_DATABASE || 'evaluation';
  if (env.STELUX_RUNTIME && !['local', 'cloud'].includes(env.STELUX_RUNTIME)) throw new Error('Unknown STELUX_RUNTIME.');
  if (cloud && !['welding-demo', 'welding-workspace'].includes(profile)) throw new Error('The cloud entry point requires the welding-demo or welding-workspace profile.');
  if (cloud && !['evaluation', 'workspace'].includes(cloudDatabaseSource)) throw new Error('STELUX_CLOUD_DATABASE must be evaluation or workspace.');
  const fullDataDir = resolve(root, env.STELUX_DATA_DIR || '.data');
  const dataDir = profile === 'access-prototype' ? resolve(root, env.STELUX_PROTOTYPE_DATA_DIR || '.data/access-prototype') : profile === 'welding-workspace' ? resolve(root, env.STELUX_WELDING_DATA_DIR || '.data/welding-workspace') : profile === 'welding-demo' ? resolve(root, env.STELUX_DEMO_DATA_DIR || '.data/welding-demo') : fullDataDir;
  if (profile !== 'full') {
    const demoPath = canonical(dataDir); const fullPath = canonical(fullDataDir); const uploads = canonical(join(fullDataDir, 'uploads'));
    if (demoPath === fullPath || demoPath === uploads || demoPath.startsWith(uploads + sep)) throw new Error('The evaluation workspace needs its own data directory.');
    if (profile === 'access-prototype' || profile === 'welding-workspace') {
      const evaluationPath = canonical(resolve(root, env.STELUX_DEMO_DATA_DIR || '.data/welding-demo'));
      if (demoPath === evaluationPath || demoPath.startsWith(evaluationPath + sep) || evaluationPath.startsWith(demoPath + sep)) throw new Error('The Access prototype needs its own data directory.');
    }
  }
  const databaseUrl = profile === 'full' || (cloud && cloudDatabaseSource === 'workspace') ? env.DATABASE_URL : cloud ? env.STELUX_DEMO_DATABASE_URL : undefined;
  if (cloud && !databaseUrl) throw new Error(cloudDatabaseSource === 'workspace' ? 'Set DATABASE_URL to the existing workspace PostgreSQL database.' : 'Set STELUX_DEMO_DATABASE_URL to a separate evaluation PostgreSQL database.');
  if (cloud && cloudDatabaseSource === 'evaluation' && env.DATABASE_URL) {
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
  const port = Number(env.PORT || (cloud ? 3000 : env.NODE_ENV === 'production' ? profile === 'access-prototype' ? 3003 : profile === 'welding-demo' ? 3002 : 3000 : 3001));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  return { profile, cloud, cloudDatabaseSource, dataDir, port, host: profile === 'access-prototype' ? '127.0.0.1' : env.STELUX_HOST || (cloud ? '0.0.0.0' : '127.0.0.1'), databaseUrl, publicOrigin: profile === 'access-prototype' ? undefined : publicOrigin, secureCookies: profile === 'access-prototype' ? false : publicOrigin?.startsWith('https:') || false, documentStorage: cloud ? 'database' as const : 'disk' as const, distDir: resolve(root, profile === 'access-prototype' ? 'dist-access-prototype' : profile === 'welding-demo' || profile === 'welding-workspace' ? 'dist-welding-demo' : 'dist') };
}
