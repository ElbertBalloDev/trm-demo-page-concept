// Renders intro.html frame by frame and puts it in front of walkthrough.mp4 (0.5 s crossfade).
// Usage: node intro.mjs  -> walkthrough.mp4 (the old file is kept as walkthrough-nointro.mp4 the first time)
import { chromium } from '/Users/elbertballo/Projects/staxiom-1-day-left/node_modules/playwright/index.mjs';
import fs from 'fs'; import path from 'path'; import { execFileSync } from 'child_process'; import { fileURLToPath } from 'url';
const D = path.dirname(fileURLToPath(import.meta.url)), F = path.join(D, 'intro-frames'), FPS = 30, XF = 0.5;
fs.rmSync(F, { recursive: true, force: true }); fs.mkdirSync(F);
const b = await chromium.launch({ channel: 'chrome' });
const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await pg.goto('file://' + path.join(D, 'intro.html'));
const dur = await pg.evaluate(() => window.__dur);
for (let i = 0; i < Math.round(dur * FPS); i++) {
  await pg.evaluate((t) => window.__seek(t), i / FPS);
  await pg.screenshot({ path: path.join(F, String(i).padStart(4, '0') + '.png') });
}
await b.close();

const base = path.join(D, 'walkthrough-nointro.mp4'), out = path.join(D, 'walkthrough.mp4');
if (!fs.existsSync(base)) fs.copyFileSync(out, base);
// intro audio: the start of the same lo-fi bed, at the level it has in the mix, crossfaded into the main track
execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(F, '%04d.png'),
  '-i', path.join(D, 'lofi.wav'), '-i', base, '-filter_complex', [
    `[0:v]format=yuv420p,settb=AVTB[iv]`, `[2:v]settb=AVTB[mv]`,
    `[iv][mv]xfade=transition=fade:duration=${XF}:offset=${(dur - XF).toFixed(2)},format=yuv420p[v]`,
    `[1:a]atrim=0:${dur},aformat=channel_layouts=stereo:sample_rates=48000,volume=0.9,afade=t=in:d=0.6[ia]`,
    `[2:a]aformat=sample_rates=48000[ma]`, `[ia][ma]acrossfade=d=${XF}[a]`].join(';'),
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-c:a', 'aac', '-b:a', '192k',
  '-movflags', '+faststart', out], { stdio: 'inherit' });
console.log('ok', out);
