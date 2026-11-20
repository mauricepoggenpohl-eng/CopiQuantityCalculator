import sys, wave
import numpy as np
SR = 44100
OUT = sys.argv[1]
DUR = 28.0
BPM = 96
beat = 60 / BPM
N = int(SR * DUR)
t = np.arange(N) / SR
mix = np.zeros(N)
rng = np.random.default_rng(6)

def add(sig, start):
    i = int(start * SR)
    if i >= N: return
    e = min(N, i + len(sig))
    mix[i:e] += sig[:e - i]

def env(n, a=0.005, r=0.2):
    x = np.arange(n) / SR
    return np.minimum(1, x / a) * np.exp(-x / r)

def lp(x, alpha):
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc); y[i] = acc
    return y

def note(m): return 440 * 2 ** ((m - 69) / 12)

# chords: Am F C G (2 beats? -> 1 bar each)
prog = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
bar = 4 * beat
start_music = 0.4
nbars = int((DUR - start_music) / bar) + 1

# pad (detuned saw, lowpassed once at end)
pad = np.zeros(N)
for b in range(nbars):
    root, ch = prog[b % 4]
    s0 = start_music + b * bar
    n = int(bar * SR)
    x = np.arange(n) / SR
    sig = np.zeros(n)
    for m in ch:
        for det in (-0.12, 0.12):
            f = note(m + 12) * 2 ** (det / 12)
            sig += 2 * ((x * f) % 1) - 1
    e = np.minimum(1, x / 0.3) * np.minimum(1, (bar - x) / 0.1)
    i = int(s0 * SR); j = min(N, i + n)
    if i < N: pad[i:j] += (sig * e)[:j - i]
pad = lp(pad, 0.06) * 0.05

# bass: 8th note pulse
bass = np.zeros(N)
for b in range(nbars):
    root, _ = prog[b % 4]
    for k in range(8):
        s0 = start_music + b * bar + k * beat / 2
        n = int(beat / 2 * SR)
        x = np.arange(n) / SR
        m = root - 12 + (12 if k % 2 else 0)
        f = note(m)
        sig = (2 * ((x * f) % 1) - 1) * env(n, 0.003, 0.12)
        i = int(s0 * SR); j = min(N, i + n)
        if i < N: bass[i:j] += sig[:j - i]
bass = lp(bass, 0.08) * 0.35

# arp lead
lead = np.zeros(N)
for b in range(nbars):
    _, ch = prog[b % 4]
    seq = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2], ch[1], ch[0] + 12, ch[2]]
    for k in range(16):
        if b < 2: break
        s0 = start_music + b * bar + k * beat / 4
        n = int(beat / 4 * SR)
        x = np.arange(n) / SR
        f = note(seq[k % 8] + 12)
        sig = np.sign(np.sin(2 * np.pi * f * x)) * env(n, 0.002, 0.05)
        i = int(s0 * SR); j = min(N, i + n)
        if i < N: lead[i:j] += sig[:j - i]
lead = lp(lead, 0.15) * 0.06

# drums
drums = np.zeros(N)
nb = int((DUR - start_music) / beat)
for k in range(nb):
    s0 = start_music + k * beat
    if s0 < start_music + 2 * bar and k % 4 != 0:
        continue
    n = int(0.35 * SR); x = np.arange(n) / SR
    f = 50 + 120 * np.exp(-x / 0.03)
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, 0.001, 0.15)
    add(kick * 0.9, s0)
    if k % 2 == 1 and s0 >= start_music + 2 * bar:
        n2 = int(0.5 * SR); x2 = np.arange(n2) / SR
        sn = rng.standard_normal(n2) * env(n2, 0.001, 0.12) + np.sin(2 * np.pi * 190 * x2) * env(n2, 0.001, 0.05)
        add(sn * 0.35, s0)
    if s0 >= start_music + 2 * bar:
        for h in (0, 0.5):
            n3 = int(0.05 * SR)
            hh = np.diff(rng.standard_normal(n3 + 1)) * env(n3, 0.001, 0.015)
            add(hh * 0.08, s0 + h * beat)

mix += pad + bass + lead + drums

# impacts at cuts
cuts = [3.0, 5.5, 7.1, 9.4, 12.1, 13.7, 16.6, 21.43, 24.03]
for c in cuts:
    n = int(1.2 * SR); x = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (40 + 60 * np.exp(-x / 0.08)) * x) * env(n, 0.002, 0.45)
    add(boom * 0.6, c)
    # whoosh before
    n = int(0.45 * SR); x = np.arange(n) / SR
    w = lp(rng.standard_normal(n), 0.2) * (x / 0.45) ** 2
    add(w * 0.5, max(0, c - 0.45))

# fade in/out
fade = np.ones(N)
fi = int(0.4 * SR); fo = int(1.5 * SR)
fade[:fi] = np.linspace(0, 1, fi)
end = int(27.23 * SR)
fade[end - fo:end] = np.linspace(1, 0, fo); fade[end:] = 0
mix *= fade
mix = np.tanh(mix * 1.4)
mix /= np.max(np.abs(mix)) + 1e-9
mix *= 0.89
st = np.stack([mix, mix], 1)
pcm = (st * 32767).astype(np.int16)
with wave.open(OUT, "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("ok")
