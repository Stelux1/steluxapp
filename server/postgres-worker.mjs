import { parentPort, workerData } from 'node:worker_threads';
import pg from 'pg';

// The existing domain layer is synchronous. Keep one dedicated pg connection
// in a worker so every statement in a domain transaction uses the same session.
pg.types.setTypeParser(20, value => Number(value));
const client = new pg.Client(workerData.config);
let failure;
client.on('error', () => { failure = 'The PostgreSQL connection was lost. Restart the server to reconnect.'; });
try {
  await client.connect();
  await client.query("SET statement_timeout = '30s'; SET lock_timeout = '15s'; SET idle_in_transaction_session_timeout = '60s'");
} catch (error) {
  failure = `Cannot connect to PostgreSQL (${error.code || 'connection failed'}). Check the database host, password, TLS certificate and network access.`;
}

parentPort.on('message', async ({ sql, values, control, output, close }) => {
  const state = new Int32Array(control);
  let response;
  try {
    if (failure) throw new Error(failure);
    if (close) { await client.end(); response = { rows: [] }; }
    else {
      const result = await client.query(sql, values?.length ? values : undefined);
      const last = Array.isArray(result) ? result.at(-1) : result;
      response = { rows: last?.rows || [], rowCount: last?.rowCount || 0 };
    }
  } catch (error) {
    // Do not send database DETAIL fields: they can contain credentials or data.
    response = { error: { message: error.message, code: error.code } };
  }
  const bytes = Buffer.from(JSON.stringify(response));
  if (bytes.length > output.byteLength) {
    const message = Buffer.from(JSON.stringify({ error: { message: 'Database response exceeds 64 MiB. Narrow the query.' } }));
    new Uint8Array(output).set(message);
    Atomics.store(state, 1, message.length);
  } else {
    new Uint8Array(output).set(bytes);
    Atomics.store(state, 1, bytes.length);
  }
  Atomics.store(state, 0, 1);
  Atomics.notify(state, 0);
});
