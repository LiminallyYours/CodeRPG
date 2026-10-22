"""Synthesizes the mod's sound effects as small mono WAV files. Run: python3 generate.py"""
import math
import random
import struct
import wave
from pathlib import Path

RATE = 22050
HERE = Path(__file__).resolve().parent
rng = random.Random(7)


def write(name, samples, gain=0.6):
    peak = max(1e-9, max(abs(x) for x in samples))
    with wave.open(str(HERE / name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(32767 * gain * x / peak)) for x in samples))


def silence(sec):
    return [0.0] * int(RATE * sec)


def tone(freq, sec, decay=6.0, shape="sine"):
    out = []
    for i in range(int(RATE * sec)):
        t = i / RATE
        ph = 2 * math.pi * freq * t
        v = math.sin(ph) if shape == "sine" else (1 if math.sin(ph) > 0 else -1) * 0.5
        out.append(v * math.exp(-decay * t))
    return out


def noise(sec, decay=30.0, smooth=0.0):
    out, prev = [], 0.0
    for i in range(int(RATE * sec)):
        x = rng.uniform(-1, 1)
        prev = smooth * prev + (1 - smooth) * x
        out.append(prev * math.exp(-decay * i / RATE))
    return out


def mix(*parts):
    n = max(len(p) for p in parts)
    return [sum(p[i] for p in parts if i < len(p)) for i in range(n)]


def seq(*parts):
    return [x for p in parts for x in p]


# dice rattling then settling
write("dice.wav", seq(*[seq(noise(0.025, 120), silence(gap)) for gap in (0.04, 0.03, 0.06, 0.05, 0.09)], noise(0.04, 60)), 0.5)
# a heavy hit: low thump plus crunch
write("hit.wav", mix(tone(70, 0.35, 9), noise(0.12, 35, 0.6)), 0.8)
# a miss: soft airy whoosh
write("miss.wav", [x * math.sin(math.pi * i / (RATE * 0.3)) for i, x in enumerate(noise(0.3, 2, 0.85))], 0.5)
# coins: two bright pings
write("coin.wav", seq(mix(tone(1975, 0.12, 25), tone(2637, 0.12, 25)), mix(tone(2637, 0.3, 12), tone(3520, 0.3, 14))), 0.45)
# healing: rising soft chime
write("heal.wav", seq(*[tone(f, 0.16, 8) for f in (523, 659, 784, 1047)]), 0.45)
# footsteps for entering a new place
write("step.wav", seq(mix(tone(110, 0.08, 40), noise(0.05, 80, 0.7)), silence(0.18), mix(tone(100, 0.08, 40), noise(0.05, 80, 0.7))), 0.45)
# quest complete: little fanfare
write("fanfare.wav", seq(tone(523, 0.14, 5, "square"), tone(659, 0.14, 5, "square"), tone(784, 0.14, 5, "square"),
                         mix(tone(1047, 0.7, 3, "square"), tone(784, 0.7, 3))), 0.4)
# defeat: slow falling minor notes
write("defeat.wav", seq(tone(392, 0.35, 3), tone(311, 0.35, 3), tone(262, 0.8, 2)), 0.45)
# a quick wipe as the scene changes: a rising breath of noise
write("wipe.wav", [x * math.sin(math.pi * i / (RATE * 0.18)) for i, x in enumerate(noise(0.18, 1, 0.6))], 0.3)
# typing: a few soft ticks
write("type.wav", seq(*[seq(mix(tone(1800, 0.012, 200), noise(0.01, 300, 0.2)), silence(gap)) for gap in (0.05, 0.07, 0.04, 0.06, 0.05)]), 0.25)
# the meter running low: two falling soft tones
write("meter_low.wav", seq(tone(660, 0.18, 7), tone(494, 0.32, 5)), 0.3)
# waiting phases: one gentle chime each, low to high
write("chime_low.wav", mix(tone(392, 0.6, 5), tone(588, 0.6, 7)), 0.2)
write("chime_mid.wav", mix(tone(523, 0.5, 6), tone(784, 0.5, 8)), 0.2)
write("chime_high.wav", mix(tone(784, 0.45, 7), tone(1175, 0.45, 9)), 0.2)
# a wet footstep, for flooded places
write("splash.wav", seq(mix(noise(0.14, 18, 0.5), tone(180, 0.06, 50)), silence(0.12), mix(noise(0.12, 20, 0.55), tone(160, 0.05, 50))), 0.4)
print("wrote", sorted(p.name for p in HERE.glob("*.wav")))
