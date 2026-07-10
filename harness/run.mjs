// Playback harness runner — drives the unified rig page (samples/rig/index.html)
// in one browser engine for one (player × scenario × trackerVersion), waits for
// telemetry, and appends a SUMMARY.txt row: `player  scenario  ok|timeout  elapsed  viewId`.
//
// Env:
//   BASE_URL                default http://127.0.0.1:8899
//   PLAYER  SCENARIO  TVER  (required)
//   LEG                     chromium | firefox | webkit  (default chromium)
//   RUN_ID  DURATION_MS
//   MT_URL                  MediaTailor URL (ad-ssai only)
//   NEW_RELIC_LICENSE_KEY   passed to the page as ?key= (from CI secret / local env)
//   OUT                     summary file to append (default ./SUMMARY.txt)
import { chromium, firefox, webkit } from 'playwright';
import fs from 'node:fs';

const E = process.env;
const BASE = E.BASE_URL || 'http://127.0.0.1:8899';
const PLAYER = E.PLAYER, SCEN = E.SCENARIO, TVER = E.TVER || 'latest';
const LEG = E.LEG || 'chromium';
const RUN_ID = E.RUN_ID || 'local';
const OUT = E.OUT || 'SUMMARY.txt';
const isAd = SCEN.startsWith('ad');
const isLifecycle = SCEN.includes('lifecycle');   // must run the full scripted pause/resume/seek
const DUR = parseInt(E.DURATION_MS || (isAd ? '230000' : isLifecycle ? '50000' : '75000'), 10);

const params = new URLSearchParams({
  player: PLAYER, scenario: SCEN, trackerVersion: TVER, runId: RUN_ID, leg: LEG,
  key: E.NEW_RELIC_LICENSE_KEY || '',
});
if (E.MT_URL) params.set('mtUrl', E.MT_URL);
const url = `${BASE}/samples/rig/index.html?${params.toString()}`;

const engines = { chromium, firefox, webkit };
const engine = engines[LEG];
if (!engine) { console.error('unknown leg', LEG); process.exit(2); }

const t0 = Date.now();
const browser = await engine.launch({
  args: LEG === 'chromium' ? ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] : [],
});
const page = await (await browser.newContext()).newPage();
let rig = {};
try {
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  const deadline = Date.now() + DUR;
  while (Date.now() < deadline) {
    rig = await page.evaluate(() => ({
      status: window.__rig?.status, viewId: window.__rig?.viewId, error: window.__rig?.error || null,
      acts: [...new Set((window.__rig?.events || []).map((e) => e.actionName))],
    }));
    // plain content: stop once we have a viewId + START. ads + lifecycle: run the
    // full window (to capture the break / the scripted pause-resume-seek).
    if (!isAd && !isLifecycle && rig.viewId && rig.acts.some((a) => /START/.test(a))) break;
    await page.waitForTimeout(3000);
  }
} catch (e) {
  rig.error = String((e && e.message) || e);
}
const elapsed = Math.round((Date.now() - t0) / 1000);
const status = rig.viewId ? 'ok' : 'timeout';
const row = `${PLAYER}\t${SCEN}\t${status}\t${elapsed}s\t${rig.viewId || '(none)'}`;
fs.appendFileSync(OUT, row + '\n');
console.log(row, '| acts:', (rig.acts || []).join(','), rig.error ? '| err:' + rig.error : '');
await browser.close();
process.exit(0);
