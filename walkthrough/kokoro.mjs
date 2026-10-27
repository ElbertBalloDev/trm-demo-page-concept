// Usage: node kokoro.mjs [index...] -> audio/l<i>.wav (all lines when no index), local Kokoro voice af_heart (the explainer voice), sentence by sentence.
import { KokoroTTS } from '/Users/elbertballo/Projects/staxiom-strategy-video/node_modules/kokoro-js/dist/kokoro.js';
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const D = path.dirname(fileURLToPath(import.meta.url));
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
const lines = JSON.parse(fs.readFileSync(D + '/lines.json', 'utf8'));
const wav = (f32, sr) => { const b = Buffer.alloc(44 + f32.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2); return b; };
const idx = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : lines.map((_, i) => i);
const DP = D + '/audio/durations.json';
const durs = fs.existsSync(DP) ? JSON.parse(fs.readFileSync(DP, 'utf8')) : [];
for (const i of idx) {
  const text = lines[i];
  const sents = text.split(/(?<=[.?!])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  const parts = []; let sr = 24000;
  for (const s of sents) { const a = await tts.generate(s, { voice: 'af_heart', speed: 0.95 }); sr = a.sampling_rate; parts.push(a.audio, new Float32Array(Math.round(sr * 0.3))); }
  const n = parts.reduce((k, p) => k + p.length, 0), out = new Float32Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  fs.writeFileSync(`${D}/audio/l${i}.wav`, wav(out, sr)); durs[i] = +(n / sr).toFixed(2); console.log('line', i, (n / sr).toFixed(1) + 's');
}
fs.writeFileSync(DP, JSON.stringify(durs));
