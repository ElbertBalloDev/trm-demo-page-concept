# Synthesized lofi bed (free, no licensing): 78 BPM ii-V-I-vi Rhodes-ish chords, swung hats, dusty kick/snare,
# sine bass, vinyl crackle, tape wobble, everything low-passed. Writes lofi.wav of the requested length.
import sys, wave, numpy as np
from scipy.signal import butter, sosfilt
SR = 48000; T = float(sys.argv[1]) if len(sys.argv) > 1 else 60; N = int(T * SR) + SR
rng = np.random.default_rng(11); BPM = 78; beat = 60 / BPM; bar = 4 * beat
lp = lambda x, f: sosfilt(butter(2, f, 'lowpass', fs=SR, output='sos'), x)
hp = lambda x, f: sosfilt(butter(2, f, 'highpass', fs=SR, output='sos'), x)
bp = lambda x, a, b: sosfilt(butter(2, [a, b], 'bandpass', fs=SR, output='sos'), x)
m2f = lambda m: 440 * 2 ** ((m - 69) / 12)
out = np.zeros(N); keys = np.zeros(N); drums = np.zeros(N); bass = np.zeros(N)
def put(buf, x, t, g=1.0):
    a = int(t * SR)
    if a < N: buf[a:a + len(x)] += g * x[:N - a]
# Dm9, G13, Cmaj9, Am9 voicings (midi)
CH = [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 52, 55, 60, 64]]
ROOT = [38, 31, 36, 33]
def rhodes(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    mod = np.sin(2 * np.pi * f * 2 * t) * 1.2 * np.exp(-t * 3)          # FM bark on the attack
    x = np.sin(2 * np.pi * f * t + mod) + .25 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t * 2)
    return x * np.exp(-t * 1.1) * np.minimum(1, t / .01) * (1 + .15 * np.sin(2 * np.pi * 4.5 * t))
def kick():
    n = int(.35 * SR); t = np.arange(n) / SR; return np.sin(2 * np.pi * (48 + 70 * np.exp(-t * 30)) * t) * np.exp(-t * 9)
def snare():
    n = int(.3 * SR); t = np.arange(n) / SR
    return bp(rng.standard_normal(n), 1200, 5000) * np.exp(-t * 14) * .8 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25) * .4
def hat():
    n = int(.06 * SR); t = np.arange(n) / SR; return hp(rng.standard_normal(n), 7000) * np.exp(-t * 70)
nb = int(T / bar) + 2
for b in range(nb):
    t0 = b * bar; c = b % 4
    for k, m in enumerate(CH[c]):  # slightly strummed chord, re-struck on the "and" of 3
        put(keys, rhodes(m2f(m), bar), t0 + k * .018, .16)
        put(keys, rhodes(m2f(m), bar * .45), t0 + 2.5 * beat + k * .015, .07)
    n = int(bar * SR); tt = np.arange(n) / SR
    put(bass, np.sin(2 * np.pi * m2f(ROOT[c]) * tt) * np.exp(-tt * .6) * np.minimum(1, tt / .02), t0, .5)
    for s in range(4):
        tb = t0 + s * beat
        if s in (0, 2) or (s == 3 and b % 2): put(drums, kick(), tb + (0.5 * beat if s == 3 else 0), .9)
        if s in (1, 3): put(drums, snare(), tb + .012, .45)
        put(drums, hat(), tb, .22); put(drums, hat(), tb + beat * .62, .14)   # swung 8ths
# tape wobble on the keys (slow pitch drift via variable delay)
idx = np.arange(N) - (0.0025 * SR) * (1 + np.sin(2 * np.pi * .35 * np.arange(N) / SR))
keys = np.interp(idx, np.arange(N), keys)
crackle = np.zeros(N); pops = rng.random(N) < 4 / SR; crackle[pops] = rng.standard_normal(pops.sum())
crackle = hp(crackle, 1500) * 1.5 + hp(rng.standard_normal(N), 4000) * .006
out = lp(keys, 2600) + lp(bass, 400) + lp(drums, 5500) * .9 + crackle
fade = np.minimum(1, np.arange(N) / (1.2 * SR)) * np.clip((T - np.arange(N) / SR) / 2.0, 0, 1)
out = (out * fade)[:int(T * SR)]; out /= np.abs(out).max() / .9
w = wave.open('lofi.wav', 'w'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype('<i2').tobytes()); w.close()
print('lofi.wav', T, 's')
