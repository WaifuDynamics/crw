import { buildApp } from './app.js';
import { migrate, closeDB } from './db.js';
import { config } from './config.js';
import { runJobs } from './worker.js';
await migrate();
const app = await buildApp();
await app.listen({ port: config.port, host: process.env.HOST || '0.0.0.0' });
let running = false;
const tick = async () => {
  if (running) return;
  running = true;
  try {
    await runJobs();
  } catch (error) {
    app.log.error(error);
  } finally {
    running = false;
  }
};
const worker = setInterval(tick, 30000);
void tick();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    clearInterval(worker);
    await app.close();
    await closeDB();
    process.exit(0);
  });
