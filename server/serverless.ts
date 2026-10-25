import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { createCloudApp } from './cloud-app.ts';

// Amplify supplies environment values during its build. This allowlisted JSON
// is included only in the server trace, outside Next's public/static folders.
const environmentFile = new URL('./runtime-env.json', import.meta.url);
const saved: NodeJS.ProcessEnv = existsSync(environmentFile) ? JSON.parse(readFileSync(environmentFile, 'utf8')) : {};
let runtime: ReturnType<typeof createCloudApp> | undefined;

export default function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    // A frozen SSR instance can outlive its TCP connection. Recreate it for
    // the next request; never automatically replay a failed mutation.
    if (runtime && !runtime.database.usable) { runtime.store.close(); runtime = undefined; }
    runtime ||= createCloudApp({ ...saved, ...process.env });
    runtime.app(req, res);
  } catch {
    // Configuration and connection strings must never reach a browser or log.
    console.error('The welding API could not initialize. Check its private environment and database preparation.');
    res.statusCode = 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'The workspace database is unavailable. Please try again later.' }));
  }
}
