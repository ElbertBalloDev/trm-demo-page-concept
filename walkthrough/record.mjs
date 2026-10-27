// Records the walkthrough from the real page: CDP screencast frames (JPEG q92) + scene marks on the same clock.
// Usage: node record.mjs <frames-dir>  -> frames/*.jpg, frames/index.json, marks.json
import { chromium } from '/Users/elbertballo/Projects/staxiom-1-day-left/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const D = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.argv[2]; fs.mkdirSync(OUT, { recursive: true });
const DUR = JSON.parse(fs.readFileSync(D + '/audio/durations.json', 'utf8'));
const LINES = JSON.parse(fs.readFileSync(D + '/lines.json', 'utf8')).map((s) => s.replace(/\bA I\b/g, 'AI'));
const PAGE = 'file://' + path.resolve(D, '../index.html') + '?chat=on&v=a';

const b = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, reducedMotion: 'no-preference' });
const pg = await ctx.newPage();
const errs = []; pg.on('pageerror', (e) => errs.push(e.message));
await pg.goto(PAGE);
await pg.evaluate(() => { localStorage.removeItem('concept_outbox'); });
await pg.reload(); await pg.waitForTimeout(2500);

// overlays: a visible cursor, a caption bar, an end card (video only; not part of the page)
await pg.addStyleTag({ content: `
  #vc{position:fixed;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:rgba(255,255,255,.92);border:2px solid #0063e4;box-shadow:0 2px 10px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transition:transform .12s}
  #vc.down{transform:scale(.7)}
  .vr{position:fixed;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;border:2px solid #06e4f9;z-index:2147483646;pointer-events:none;animation:vr .5s ease-out forwards}
  @keyframes vr{from{transform:scale(.3);opacity:1}to{transform:scale(1.4);opacity:0}}
  #vcap{position:fixed;left:232px;bottom:20px;max-width:1080px;width:max-content;padding:12px 22px;border-radius:10px;background:rgba(7,28,44,.92);border:1px solid rgba(6,228,249,.35);color:#fff;font:500 22px/1.36 'Funnel Sans',system-ui,sans-serif;text-align:left;z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .35s}
  #vcap.on{opacity:1}
  #vend{position:fixed;inset:0;background:#00124d;color:#fff;display:grid;place-content:center;text-align:center;gap:18px;z-index:2147483647;opacity:0;transition:opacity .8s;pointer-events:none;font-family:'Funnel Sans',system-ui,sans-serif}
  #vend.on{opacity:1} #vend h1{font-size:64px;margin:0} #vend p{font:400 22px 'Space Mono',monospace;color:#06e4f9;margin:0}`});
await pg.evaluate(() => {
  const c = document.createElement('div'); c.id = 'vc'; document.body.appendChild(c);
  addEventListener('mousemove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('mousedown', (e) => { c.classList.add('down'); const r = document.createElement('div'); r.className = 'vr'; r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; document.body.appendChild(r); setTimeout(() => r.remove(), 600); }, true);
  addEventListener('mouseup', () => c.classList.remove('down'), true);
  const cap = document.createElement('div'); cap.id = 'vcap'; document.body.appendChild(cap);
  const end = document.createElement('div'); end.id = 'vend'; end.innerHTML = '<h1>Form, chat, and the ops view underneath</h1><p>Concept by Elbert Ballo · not a TRM page · demo data is made up</p>'; document.body.appendChild(end);
});
let mx = 960, my = 600; await pg.mouse.move(mx, my);

// screencast
const cdp = await ctx.newCDPSession(pg);
const frames = []; let n = 0;
cdp.on('Page.screencastFrame', async (f) => {
  const file = `f${String(n++).padStart(5, '0')}.jpg`;
  fs.writeFileSync(path.join(OUT, file), Buffer.from(f.data, 'base64'));
  frames.push({ file, t: f.metadata.timestamp });
  cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await pg.waitForTimeout(600);

const now = () => Date.now() / 1000;
const wait = (s) => pg.waitForTimeout(s * 1000);
// keep every action in the safe zone: below the banner, above the caption (bottom 190 px); fixed panels are left alone
const SAFE_TOP = 70, SAFE_BOTTOM = 190;
async function frame(sel) {
  const loc = pg.locator(sel).first(); if (!(await loc.count())) return;
  const dy = await loc.evaluate((el, [top, bottom]) => {
    for (let p = el; p; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return 0;
    const r = el.getBoundingClientRect(), safeH = innerHeight - top - bottom;
    if (r.top >= top && r.bottom <= innerHeight - bottom) return 0;
    const d = r.height > safeH ? r.top - top : r.top + r.height / 2 - (top + safeH * 0.55);
    scrollBy({ top: d, behavior: 'smooth' }); return d;
  }, [SAFE_TOP, SAFE_BOTTOM]);
  if (dy) await wait(Math.min(1.2, 0.4 + Math.abs(dy) / 1500));
}
async function moveTo(sel, opt = {}) {
  await frame(sel);
  const loc = pg.locator(sel).first();
  const bx = await loc.boundingBox(); const x = bx.x + bx.width * (opt.fx ?? 0.5), y = bx.y + bx.height * (opt.fy ?? 0.5);
  const steps = Math.max(12, Math.round(Math.hypot(x - mx, y - my) / 22));
  await pg.mouse.move(x, y, { steps }); mx = x; my = y; await wait(0.15);
}
async function click(sel, opt) { await moveTo(sel, opt); await pg.mouse.down(); await wait(0.08); await pg.mouse.up(); await wait(0.35); }
async function typeAnswer(text) { await pg.locator('#chat-in').pressSequentially(text, { delay: 55 }); await wait(0.25); await pg.keyboard.press('Enter'); await wait(0.7); }
const caption = (t) => pg.evaluate((t) => { const c = document.getElementById('vcap'); c.textContent = t; c.classList.toggle('on', !!t); }, t);
const tab = (p) => click(`.tab[data-p=${p}]`);

const SCENES = [
  async () => { await moveTo('#hero-h1', { fx: 0.3 }); await wait(3); await moveTo('#hero-globe', { fx: 0.4, fy: 0.45 }); },
  // the globe: drag to spin, switch modes, follow a trace from the queue
  async () => {
    await moveTo('#hero-globe', { fx: 0.35, fy: 0.45 });
    await pg.mouse.down(); await pg.mouse.move(mx + 280, my + 40, { steps: 50 }); await pg.mouse.up(); mx += 280; my += 40; await wait(1.5);
    await click('#globe-mode [data-mode=investigate]'); await wait(2.5);
    await click('.gq-row'); await wait(3.5);
    await click('#globe-mode [data-mode=compliance]');
  },
  // the wallet screen: the preview video plays, then a sample wallet runs live
  async () => {
    await pg.evaluate(() => document.getElementById('tryit').scrollIntoView({ behavior: 'smooth', block: 'start' })); await wait(1.5);
    await moveTo('[data-pv]', { fx: 0.3, fy: 0.3 }); await wait(5);
    await click('.wcard[data-w="0"]'); await wait(1.5); await moveTo('#inv', { fx: 0.55, fy: 0.45 });
  },
  // risk rules re-score live
  async () => {
    await click('#inv summary', { fx: 0.15 }); await wait(1);
    await click('label.tog:has([data-rule=bridgeSignal])', { fx: 0.05 }); await wait(1.2);
    await moveTo('.inv-results', { fx: 0.08, fy: 0.5 });
  },
  async () => { await click('.chat-launch'); await wait(1.2); await click('.chat-sugg .chip-q:not(.chip-cta)'); },
  async () => { await pg.evaluate(() => document.querySelector('.chat-sugg').scrollLeft = 9999); await wait(0.4); await click('.chat-sugg .chip-q >> text=I was scammed'); },
  async () => {
    await pg.evaluate(() => document.querySelector('.chat-sugg').scrollLeft = 0); await wait(0.3);
    await click('.chip-cta'); await wait(1);
    await pg.evaluate(() => document.getElementById('demo').scrollIntoView({ behavior: 'smooth', block: 'start' })); await wait(1.2);
    await moveTo('#chat-in', { fx: 0.4 });
    for (const a of ['dana.lee@examplebank.co.uk', 'Dana', 'Lee', 'Example Bank', 'Head of Compliance']) await typeAnswer(a);
    await click('.cap-chips .chip-q >> text=Transaction monitoring'); await wait(0.6);
    await click('.cap-chips .chip-q >> text=Skip');
  },
  async () => { await click('.cs-yes'); await wait(2.5); await moveTo('#result', { fx: 0.3, fy: 0.4 }); },
  async () => { await click('#uth-toggle'); await wait(1); await moveTo('#p-events', { fy: 0.2 }); },
  async () => { await tab('record'); await moveTo('#p-record', { fy: 0.3 }); },
  async () => { await tab('score'); await moveTo('#p-score', { fy: 0.25 }); },
  async () => { await tab('outbox'); await wait(1); await moveTo('.ob-btn[data-a=csv]'); await wait(2); await moveTo('#p-outbox .ev', { fx: 0.97, fy: 0.15 }); },
  async () => { await tab('chatqa'); await moveTo('#p-chatqa', { fy: 0.25 }); },
  async () => { await click('#uth-toggle'); await wait(0.6); await click('.chat-launch'); await wait(4); await moveTo('#chat-in', { fx: 0.4 }); await typeAnswer("What's the weather in Paris?"); },
  async () => { await click('.chat-x'); await pg.evaluate(() => scrollTo({ top: 0, behavior: 'smooth' })); await wait(1.5); await moveTo('#hero-h1', { fx: 0.4 }); },
];
const marks = [];
for (const [i, run] of SCENES.entries()) {
  const t0 = now(); marks.push(t0);
  await caption(LINES[i]);
  await run();
  const left = DUR[i] + 0.7 - (now() - t0);
  if (i === SCENES.length - 1) { await wait(Math.max(0, left - 0.5)); await caption(''); await pg.evaluate(() => document.getElementById('vend').classList.add('on')); await wait(3.5); }
  else if (left > 0) await wait(left);
}
const tEnd = now();
await cdp.send('Page.stopScreencast');
await wait(0.3);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(frames));
fs.writeFileSync(D + '/marks.json', JSON.stringify({ marks, tEnd, first: frames[0].t }));
console.log('frames', frames.length, 'span', (frames.at(-1).t - frames[0].t).toFixed(1) + 's', 'fps≈', (frames.length / (frames.at(-1).t - frames[0].t)).toFixed(1), 'errors', errs);
await pg.screenshot({ path: path.join(D, 'last.png') });
await b.close();
