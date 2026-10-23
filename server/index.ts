// Local hub server: UI, pack v2, progress, mentor (topic check) and artifact exams. Listens on 127.0.0.1 only.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { makeConfig } from './config.ts';
import { createApp } from './app.ts';
import { killAll } from './adapter.ts';

// Running agents are in their own process groups (macOS/Linux), out of reach of the terminal's Ctrl+C: they stop with the hub.
// A signal gives them a second after SIGTERM (a second signal exits at once); whatever is left at exit gets SIGKILL.
process.on('exit', () => killAll('SIGKILL'));
let exiting = false;
for (const [sig, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]] as const) {
  process.on(sig, () => {
    if (exiting || !killAll('SIGTERM')) process.exit(code);
    exiting = true;
    setTimeout(() => process.exit(code), 1000);
  });
}

const config = makeConfig();
const { app, stale, port: PORT, packId: PACK_ID } = createApp(config);
if (stale) console.log(`${stale} exam(s) left running by a previous start were marked stopped`);

// UI: the built Vite bundle. In dev mode Vite serves it itself on :5173.
if (existsSync(config.webDir)) {
  app.use('/*', serveStatic({ root: relative(process.cwd(), config.webDir) || '.' }));
  app.get('*', (c) => c.html(readFileSync(join(config.webDir, 'index.html'), 'utf8')));
}

serve({ fetch: app.fetch, port: PORT, hostname: '127.0.0.1' }, () => {
  console.log(`Astrolabe: http://127.0.0.1:${PORT}  (pack: ${PACK_ID}, mentor: ${config.mentorMode}${config.demo ? ', demo' : ''}, data: ${config.dataDir})`);
});
