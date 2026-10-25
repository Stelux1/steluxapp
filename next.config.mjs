import { readFileSync } from 'node:fs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  typescript: { tsconfigPath: 'tsconfig.next.json' },
  // Keep Node's PostgreSQL worker and private certificates as ordinary files.
  // The API loads this compiled ESM module instead of bundling worker_threads.
  outputFileTracingIncludes: {
    '/api/*': [
      './dist-server/server/**/*', './dist-server/shared/**/*',
      ...JSON.parse(readFileSync(new URL('./dist-server/runtime-trace.json', import.meta.url), 'utf8')).map(file => './' + file),
    ],
  },
  outputFileTracingExcludes: {
    '**/*': ['./.data/**/*', './backups/**/*', './.env*', './test-results/**/*', './output/**/*', './reference/**/*', './tests/**/*'],
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
    ] }];
  },
};
export default nextConfig;
