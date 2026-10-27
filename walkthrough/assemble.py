# Usage: python3 assemble.py <frames-dir> -> walkthrough.mp4 (frames at their real timestamps, narration at the scene marks,
# the synthesized lo-fi explainer bed from lofi.py, ducked under the voice)
import json, subprocess, sys, os
F = sys.argv[1]; D = os.path.dirname(os.path.abspath(__file__))
fr = json.load(open(F + '/index.json')); m = json.load(open(D + '/marks.json'))
t0 = fr[0]['t']; end = m['tEnd'] - t0
with open(F + '/list.txt', 'w') as f:
    for a, b in zip(fr, fr[1:] + [{'t': m['tEnd']}]):
        f.write(f"file '{F}/{a['file']}'\nduration {max(b['t'] - a['t'], 0.001):.4f}\n")
    f.write(f"file '{F}/{fr[-1]['file']}'\n")
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', F + '/list.txt', '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-t', f'{end:.2f}', F + '/video.mp4'], check=True)
subprocess.run([sys.executable, D + '/lofi.py', f'{end + 1:.1f}'], cwd=D, check=True)   # writes lofi.wav (no licensing)
MUSIC = D + '/lofi.wav'
ins, flt = ['-i', F + '/video.mp4'], []
for i, t in enumerate(m['marks']):
    ins += ['-i', f'{D}/audio/l{i}.wav']; ms = int((t - t0 + 0.35) * 1000)
    flt.append(f'[{i+1}:a]adelay={ms}|{ms},aformat=channel_layouts=stereo[v{i}]')
n = len(m['marks'])
ins += ['-i', MUSIC]
flt.append(''.join(f'[v{i}]' for i in range(n)) + f'amix=inputs={n}:normalize=0,asplit=2[vo][sc]')
# same balance as the explainers' mix.py: music about 13 dB under the voice, ducked further while she speaks
flt.append(f'[{n+1}:a]aformat=channel_layouts=stereo,volume=0.22,afade=t=in:d=2,afade=t=out:st={end-3:.2f}:d=3,atrim=0:{end:.2f}[mu0]')
flt.append('[mu0][sc]sidechaincompress=threshold=0.03:ratio=3:attack=40:release=400[mu]')
flt.append('[vo][mu]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[a]')   # web loudness, like the explainers
subprocess.run(['ffmpeg', '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(flt), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-t', f'{end:.2f}', '-movflags', '+faststart', D + '/walkthrough.mp4'], check=True)
print('ok', round(end, 1), 's')
