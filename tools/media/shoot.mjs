// Screenshots of the running hub at 1920x1080 with a prepared browser state (language, setup done, focused era, open sheet).
// Usage: node tools/media/shoot.mjs <baseUrl> <outDir> <lang>   (CHROME_PATH, PUPPETEER_CORE_DIR, GAP_TOPIC optional)
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
// puppeteer-core is not a dependency of the hub: install it (`npm i -D puppeteer-core`) or point PUPPETEER_CORE_DIR at a node_modules that has it.
const puppeteer = createRequire(process.env.PUPPETEER_CORE_DIR ? process.env.PUPPETEER_CORE_DIR + '/' : import.meta.url)('puppeteer-core');

const [base, outDir, lang = 'en'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--hide-scrollbars'] });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

async function shot(name, state, actions = async () => {}) {
  await page.evaluateOnNewDocument((st) => { localStorage.clear(); for (const [k, v] of Object.entries(st)) localStorage.setItem(k, v); }, { 'hub.lang': lang, 'hub.sky': JSON.stringify({ flashes: false }), ...state });
  await page.goto(base, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 1500));
  await actions();
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('shot', name);
}

await shot('onboarding', {});
await shot('era1-log', { 'hub.setup': '1', 'hub.tree.focus': 'S0', 'hub.tree.sel': 'exam:S0' });
await shot('tree', { 'hub.setup': '1', 'hub.tree.focus': 'G1', 'hub.tree.sel': 'era:G1' });
// topic with a check history: open the sheet, expand the history
await shot('topic-check', { 'hub.setup': '1', 'hub.tree.focus': 'G1', 'hub.tree.sel': process.env.GAP_TOPIC ?? 'G1/hooks-intro' }, async () => {
  const btn = await page.$$('.starsheet button');
  for (const b of btn) { const t = (await b.evaluate((e) => e.textContent)) ?? ''; if (/history|история|previous|прошл/i.test(t)) { await b.click(); break; } }
});
await shot('evolution', { 'hub.setup': '1', 'hub.tree.focus': 'G1', 'hub.tree.sel': 'exam:G1' });
await browser.close();
