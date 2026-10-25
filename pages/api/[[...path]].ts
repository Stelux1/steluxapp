import type { NextApiRequest, NextApiResponse } from 'next';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

type Handler = (req: NextApiRequest, res: NextApiResponse) => void;
let loaded: Promise<{ default: Handler }> | undefined;

export const config = { api: { bodyParser: false, externalResolver: true, responseLimit: false } };

export default async function api(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Express consumes the original JSON/multipart stream and full /api URL.
    // Loading only on a request keeps the build independent of the live DB.
    loaded ||= import(/* webpackIgnore: true */ pathToFileURL(resolve(process.cwd(), 'dist-server/server/serverless.js')).href);
    const { default: handler } = await loaded;
    await new Promise<void>((done, reject) => {
      res.once('finish', done); res.once('close', done);
      try { handler(req, res); } catch (error) { reject(error); }
    });
  } catch {
    loaded = undefined;
    if (res.writableEnded) return;
    res.status(503).setHeader('Cache-Control', 'no-store');
    res.json({ error: 'The workspace API is unavailable. Please try again later.' });
  }
}
