import { basename, dirname, join, resolve, sep } from 'node:path';
import { existsSync, realpathSync } from 'node:fs';
import { releaseProfile } from '../shared/release.ts';

// Resolve existing parent symlinks even before a new workspace directory exists.
function canonical(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(canonical(dirname(path)), basename(path));
}

export function runtimeConfig(env: NodeJS.ProcessEnv, root = process.cwd()) {
  const profile = releaseProfile(env.STELUX_RELEASE_PROFILE);
  const fullDataDir = resolve(root, env.STELUX_DATA_DIR || '.data');
  const dataDir = profile === 'welding-demo' ? resolve(root, env.STELUX_DEMO_DATA_DIR || '.data/welding-demo') : fullDataDir;
  if (profile === 'welding-demo') {
    const demoPath = canonical(dataDir); const fullPath = canonical(fullDataDir); const uploads = canonical(join(fullDataDir, 'uploads'));
    if (demoPath === fullPath || demoPath === uploads || demoPath.startsWith(uploads + sep)) throw new Error('The evaluation workspace needs its own data directory.');
  }
  return { profile, dataDir, port: Number(env.PORT || (env.NODE_ENV === 'production' ? profile === 'welding-demo' ? 3002 : 3000 : 3001)), databaseUrl: profile === 'full' ? env.DATABASE_URL : undefined, distDir: resolve(root, profile === 'welding-demo' ? 'dist-welding-demo' : 'dist') };
}
