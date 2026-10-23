#!/usr/bin/env python3
"""Draws the room pictures as small pixel art, 44 x 28 (the margin's mosaic: 44 cells, two pixels each).

    python3 tools/pictures.py                 # redraw every picture
    python3 tools/pictures.py --preview p.png # also a sheet of all of them, enlarged, to look at

Writes the kit's terrain pictures (rules/art/terrain/<terrain>-<n>.png), each game's own terrain pictures
(games/<id>/art/terrain/) and one per authored room (games/<id>/art/<room>.png). Any of them can be replaced by
a hand-made PNG of the same name (4:3 or wider, at most 256 pixels wide); nothing else needs to change.
Standard library only; the drawing is seeded, so a redraw gives the same pictures."""

import argparse
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "rules"))
import png  # noqa: E402

W, H = png.MOSAIC_W, png.MOSAIC_H


def rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]


class Canvas:
    def __init__(self, seed, fill="#000000"):
        self.px = [[rgb(fill)] * W for _ in range(H)]
        self.rnd = random.Random(seed)

    def set(self, x, y, c):
        if 0 <= x < W and 0 <= y < H:
            self.px[int(y)][int(x)] = rgb(c) if isinstance(c, str) else c

    def get(self, x, y):
        return self.px[int(y)][int(x)]

    def rect(self, x0, y0, x1, y1, c):
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                self.set(x, y, c)

    def vgrad(self, y0, y1, c0, c1, x0=0, x1=W, steps=None):
        """A vertical gradient, dithered between bands so it reads as pixel art."""
        a, b = rgb(c0), rgb(c1)
        n = steps or max(2, (y1 - y0) // 2)
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0 - 1)
            for x in range(x0, x1):
                k = t * (n - 1)
                lo = math.floor(k)
                up = (k - lo) > (BAYER[y % 4][x % 4] + 0.5) / 16
                self.set(x, y, mix(a, b, min(n - 1, lo + up) / (n - 1)))

    def ellipse(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                    self.set(x, y, c)

    def poly(self, pts, c):
        """Fill a polygon (scanline, pixel centers)."""
        for y in range(H):
            yc = y + 0.5
            xs = []
            for (x0, y0), (x1, y1) in zip(pts, pts[1:] + pts[:1]):
                if (y0 <= yc < y1) or (y1 <= yc < y0):
                    xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                for x in range(math.ceil(a - 0.5), math.floor(b - 0.5) + 1):
                    self.set(x, y, c)

    def line(self, x0, y0, x1, y1, c):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n):
            t = i / max(1, n - 1)
            self.set(round(x0 + (x1 - x0) * t), round(y0 + (y1 - y0) * t), c)

    def speckle(self, x0, y0, x1, y1, colors, density, where=None):
        """Scatter pixels of `colors` over a region; `where(x, y)` limits it."""
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                if self.rnd.random() < density and (where is None or where(x, y)):
                    self.set(x, y, self.rnd.choice(colors))

    def texture(self, x0, y0, x1, y1, base, var=10):
        """Each pixel of a region nudged a little lighter or darker: stone, wood, grass."""
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                d = self.rnd.randint(-var, var)
                self.set(x, y, tuple(max(0, min(255, v + d)) for v in rgb(base)))

    def stars(self, y1, n, c="#d8d4c0"):
        for _ in range(n):
            self.set(self.rnd.randrange(W), self.rnd.randrange(y1), c)

    def save(self, path):
        path.parent.mkdir(parents=True, exist_ok=True)
        png.write(path, W, H, self.px)


# ---------------------------------------------------------------- shared pieces

DUSK = ("#3b3550", "#7a5f6e", "#b98a6e")       # top, middle, horizon
NIGHT = ("#10131f", "#1b2236", "#2c3550")
GREY = ("#4a5058", "#6b7177", "#8a8f92")


def sky(c, kind, horizon):
    """The sky down to the horizon, and its lowest color below it, so nothing drawn later leaves a gap."""
    top, mid, low = kind
    c.vgrad(0, horizon // 2 + 1, top, mid)
    c.vgrad(horizon // 2, horizon, mid, low)
    c.rect(0, horizon, W, H, low)


def sea(c, y0, y1, deep="#26394a", light="#3d5a6c", foam="#9fb4bc", ripples=0.06):
    """Water: a gradient, darker nearer, with short lighter ripples that lengthen toward the viewer."""
    c.vgrad(y0, y1, light, deep)
    for y in range(y0, y1):
        n = 1 + (y - y0) * 3 // max(1, y1 - y0)
        for x in range(W):
            if c.rnd.random() < ripples:
                for k in range(n):
                    if x + k < W:
                        c.set(x + k, y, mix(c.get(x + k, y), rgb(foam), 0.45))


def boat(c, x, y, hull="#5a3b28", mast="#2b2420", sail=None):
    c.poly([(x - 4, y), (x + 4, y), (x + 3, y + 2), (x - 3, y + 2)], hull)
    c.line(x, y - 6, x, y - 1, mast)
    if sail:
        c.poly([(x + 0.5, y - 6), (x + 4, y - 1), (x + 0.5, y - 1)], sail)


def cobbles(c, y0, y1, base="#5c5650"):
    c.texture(0, y0, W, y1, base, 8)
    for y in range(y0, y1):
        for x in range(W):
            if (x + (y // 2) * 3) % 5 == 0 or y % 2 == 0 and (x * 7 + y) % 11 == 0:
                c.set(x, y, mix(c.get(x, y), (30, 28, 26), 0.35))


def gorse(c, x, y, r=3, green="#3d5a2c", dark="#2a3f20", bloom="#d8b440"):
    c.ellipse(x, y, r + 1, r * 0.75, dark)
    c.ellipse(x - 0.5, y - 0.5, r, r * 0.6, green)
    c.speckle(int(x - r), int(y - r), int(x + r + 1), int(y + r), [bloom, "#e6c860"], 0.18,
              where=lambda px, py: c.get(px, py) == rgb(green))


def rain(c, density=0.025, color="#9fb3bf"):
    for _ in range(int(W * H * density)):
        x, y = c.rnd.randrange(W), c.rnd.randrange(H - 1)
        c.set(x, y, mix(c.get(x, y), rgb(color), 0.5))
        c.set(x - 1, y + 1, mix(c.get(x - 1, y + 1), rgb(color), 0.3))


def lamp_glow(c, cx, cy, r, color, strength=0.5):
    for y in range(H):
        for x in range(W):
            d = math.hypot(x + 0.5 - cx, (y + 0.5 - cy))
            if d < r:
                c.set(x, y, mix(c.get(x, y), rgb(color), strength * (1 - d / r) ** 1.5))


def barrel(c, x, y, wood="#6b4a2c", band="#2e2a26"):
    c.rect(x, y, x + 4, y + 5, wood)
    c.rect(x, y + 1, x + 4, y + 2, band)
    c.rect(x, y + 3, x + 4, y + 4, band)
    c.set(x, y, mix(rgb(wood), (0, 0, 0), 0.3))
    c.set(x + 3, y, mix(rgb(wood), (0, 0, 0), 0.3))


# ---------------------------------------------------------------- kit terrain pictures

def kit_water(n):
    c = Canvas("water-%d" % n)
    if n == 1:      # open sea under a grey sky
        sky(c, GREY, 12)
        sea(c, 12, H)
        c.rect(30, 11, 37, 12, "#3a4148")    # a far headland
    elif n == 2:    # a shore at dusk
        sky(c, DUSK, 11)
        sea(c, 11, 21)
        c.vgrad(21, H, "#8c7d62", "#6a5e4a")
        for x in range(W):
            c.set(x, 21 + (x // 5) % 2, "#c9c3b0")
    else:           # night water and stars
        sky(c, NIGHT, 14)
        c.stars(12, 14)
        c.ellipse(34, 5, 2.5, 2.5, "#e8e2c8")
        sea(c, 14, H, deep="#0f1b28", light="#1d3042", foam="#5f7686", ripples=0.04)
        for y in range(15, H, 2):
            c.set(34 + (y % 3) - 1, y, "#b8b29a")
    return c


def kit_grass(n):
    c = Canvas("grass-%d" % n)
    if n == 1:      # rolling fields
        sky(c, ("#5d7590", "#8fa3b4", "#c3c9c4"), 12)
        c.poly([(0, 14), (14, 10), (30, 13), (44, 9), (44, 28), (0, 28)], "#4f6b3a")
        c.poly([(0, 19), (20, 15), (44, 18), (44, 28), (0, 28)], "#5f7d42")
        c.texture(0, 20, W, H, "#5f7d42", 9)
        c.speckle(0, 21, W, H, ["#c9b24a", "#d8d0b8"], 0.04)
    elif n == 2:    # moor at dusk
        sky(c, DUSK, 15)
        c.poly([(0, 16), (12, 13), (24, 15), (36, 12), (44, 14), (44, 28), (0, 28)], "#3c4a30")
        c.texture(0, 17, W, H, "#47553a", 10)
        for x, y in ((8, 21), (30, 19), (38, 24)):
            gorse(c, x, y, 2)
    else:           # a meadow with a lone tree
        sky(c, ("#7f97ab", "#a7b8c2", "#d2d4c8"), 14)
        c.rect(0, 14, W, H, "#5a7a3e")
        c.texture(0, 14, W, H, "#5a7a3e", 8)
        c.rect(30, 8, 32, 17, "#4a3626")
        c.ellipse(31, 7, 6, 4.5, "#36532c")
        c.ellipse(30, 6, 4, 3, "#44663a")
        c.speckle(0, 16, W, H, ["#e0d8a0", "#c86e5a"], 0.03)
    return c


def kit_stone(n):
    c = Canvas("stone-%d" % n)
    if n == 1:      # grey crags
        sky(c, ("#6f8394", "#98a6b0", "#c0c6c4"), 14)
        crag = [(0, 28), (0, 12), (7, 6), (13, 11), (20, 4), (28, 10), (35, 7), (44, 13), (44, 28)]
        c.poly(crag, "#55585e")
        for x0, y0 in ((7, 6), (20, 4), (35, 7)):      # lit faces on the left of each peak
            c.poly([(x0, y0), (x0 - 4, y0 + 6), (x0, y0 + 9)], "#73767a")
        c.poly([(0, 28), (0, 18), (12, 15), (26, 19), (44, 16), (44, 28)], "#3e4044")
        c.texture(0, 18, W, H, "#3e4044", 7)
    elif n == 2:    # an old wall and its arch
        c.texture(0, 0, W, H, "#5e5a54", 10)
        for y in range(0, H, 4):
            for x in range(W):
                c.set(x, y, mix(c.get(x, y), (25, 24, 22), 0.5))
            for x in range((y // 4 % 2) * 4, W, 8):
                for k in range(4):
                    c.set(x, y + k, mix(c.get(x, y + k), (25, 24, 22), 0.5))
        c.ellipse(22, 16, 8, 9, "#1c1c20")
        c.rect(14, 16, 31, H, "#1c1c20")
        c.speckle(0, 0, W, H, ["#4f6a3a"], 0.05)
    else:           # a scree slope under stars
        sky(c, NIGHT, 16)
        c.stars(14, 12)
        c.poly([(0, 28), (0, 10), (44, 20), (44, 28)], "#3e4046")
        c.texture(0, 11, W, H, "#3e4046", 5)
        for _ in range(16):                              # boulders, lit from the moon's side
            x, y = c.rnd.randrange(W), c.rnd.randrange(14, H)
            if y > 11 + x * 10 / 44:
                c.ellipse(x, y, 1.6, 1, "#5a5c62")
                c.set(x - 1, y - 1, "#7a7c80")
    return c


def kit_indoors(n):
    c = Canvas("indoors-%d" % n)
    if n == 1:      # a plain room with a window
        c.texture(0, 0, W, 20, "#5a4636", 6)
        c.rect(0, 20, W, H, "#3e2e22")
        for x in range(0, W, 5):
            c.rect(x, 20, x + 1, H, "#33261c")
        c.rect(16, 5, 28, 14, "#2c3550")
        c.rect(21, 5, 23, 14, "#4a3a2c")
        c.rect(16, 9, 28, 10, "#4a3a2c")
        c.rect(15, 4, 29, 5, "#4a3a2c")
    elif n == 2:    # a cellar by candlelight
        c.texture(0, 0, W, H, "#3a322c", 8)
        c.rect(0, 22, W, H, "#2a2420")
        for x in (6, 11, 33):
            barrel(c, x, 17)
        c.rect(24, 15, 25, 18, "#e6d6a0")
        c.set(24, 14, "#ffcf60")
        lamp_glow(c, 24.5, 14.5, 14, "#d8963c", 0.45)
    else:           # a hall with a hearth
        c.texture(0, 0, W, H, "#4a3c30", 7)
        c.rect(0, 0, W, 3, "#2c221a")
        c.rect(0, 22, W, H, "#3a2c20")
        c.rect(15, 10, 29, 22, "#5e5a54")
        c.rect(18, 13, 26, 22, "#1a1412")
        c.ellipse(22, 20, 3, 2.5, "#d86a28")
        c.ellipse(22, 20.5, 1.6, 1.5, "#f2c050")
        lamp_glow(c, 22, 19, 16, "#c8702c", 0.4)
    return c


# ---------------------------------------------------------------- The Dark Lighthouse

def harbor_square():
    c = Canvas("harbor_square")
    sky(c, DUSK, 10)
    # the headland and the dark lighthouse, a black finger against the sky
    c.poly([(0, 11), (0, 7), (5, 6), (10, 9), (12, 11)], "#2a2a33")
    c.rect(4, 1, 6, 7, "#1a1a22")
    c.rect(3, 0, 7, 2, "#22222b")
    sea(c, 10, 18)
    boat(c, 18, 15, sail="#a89878")
    boat(c, 29, 16)
    boat(c, 38, 14, hull="#4a3428")
    # the quay wall
    c.texture(0, 18, W, 20, "#6e6a62", 8)
    c.rect(0, 20, W, 21, "#3c3934")
    cobbles(c, 21, H)
    # the heap of nets, and the mender on her crate
    c.ellipse(36, 24, 7, 3, "#4d5236")
    c.speckle(29, 21, W, H, ["#6a6e48", "#3a3d28"], 0.3, where=lambda x, y: c.get(x, y) in (rgb("#4d5236"),))
    c.rect(30, 22, 32, 25, "#6b4a2c")    # the crate
    c.rect(30, 19, 32, 22, "#5a5a6a")    # the mender
    c.set(30, 18, "#c8a088")
    c.set(31, 18, "#c8a088")
    # gulls
    for x, y in ((14, 4), (24, 6), (27, 3)):
        c.set(x, y, "#d8d4c8")
        c.set(x + 1, y - 1, "#d8d4c8")
        c.set(x - 1, y - 1, "#d8d4c8")
    return c


def gull_tavern():
    c = Canvas("gull_tavern")
    c.texture(0, 0, W, 22, "#4e3a2a", 6)
    for y in (0, 1, 6):                   # low beams
        c.rect(0, y, W, y + 1, "#2a1e16")
    for x in (2, 15, 30, 42):
        c.rect(x, 0, x + 1, 7, "#2a1e16")
    for x in range(20, 29, 2):            # strings of smoked fish
        c.line(x, 1, x, 4, "#3a2a1c")
        c.set(x, 5, "#a0703c")
    c.rect(0, 22, W, H, "#33261c")        # the floor
    # the hearth
    c.texture(2, 9, 14, 22, "#6a645c", 8)
    c.rect(4, 13, 12, 22, "#1a1210")
    c.ellipse(8, 20, 3, 2.5, "#c85a20")
    c.ellipse(8, 19.5, 2, 2, "#e8902c")
    c.ellipse(8, 20, 1, 1, "#f8d060")
    # the bar
    c.rect(24, 14, W, 22, "#5e3e24")
    c.rect(24, 13, W, 14, "#7a5434")
    c.rect(33, 11, 37, 13, "#d8d0c0")     # the cloth over the honey cakes
    c.rect(28, 11, 29, 13, "#8a6a3a")     # a cup
    c.rect(40, 10, 41, 13, "#3a5a40")     # a bottle
    # fishermen hunched over their cups
    for x in (17, 21):
        c.rect(x, 17, x + 3, 22, "#3c4450")
        c.ellipse(x + 1.5, 16, 1.5, 1.5, "#a07860")
    lamp_glow(c, 8, 18, 22, "#d0782c", 0.45)
    return c


def coast_road():
    c = Canvas("coast_road")
    sky(c, DUSK, 12)
    sea(c, 12, H, deep="#22323f", light="#33495a")
    # the clifftop: gorse on the left, the road along the edge, the drop on the right
    c.poly([(0, 11), (16, 12), (30, 16), (36, 28), (0, 28)], "#3e5230")
    c.texture(0, 12, 34, H, "#46593a", 9)
    c.poly([(30, 16), (36, 28), (33, 28), (28, 17)], "#5a5048")   # the cliff face
    c.poly([(10, 28), (20, 14), (24, 14), (24, 28)], "#7a6a52")   # the road
    for y in range(15, H, 2):
        c.set(int(20 + (28 - y) * 0.2), y, "#5e5040")             # ruts
        c.set(int(22 + (28 - y) * 0.05), y, "#5e5040")
    for x, y, r in ((4, 18, 3), (11, 14, 2), (5, 25, 3), (14, 22, 2)):
        gorse(c, x, y, r)
    for y in range(20, H):                                       # surf breaking at the foot of the cliff
        x = int(35 + (y - 16) * 0.35) + c.rnd.randrange(2)
        c.rect(x, y, x + 2, y + 1, "#c8d8dc")
    return c


def greywater_bridge():
    c = Canvas("greywater_bridge")
    sky(c, DUSK, 8)
    # the gorge walls
    c.poly([(0, 6), (10, 8), (14, 28), (0, 28)], "#3a3c40")
    c.poly([(44, 5), (32, 8), (30, 28), (44, 28)], "#36383c")
    c.texture(0, 6, 14, H, "#3a3c40", 9)
    c.texture(30, 5, W, H, "#36383c", 9)
    # the river, roaring white below
    c.vgrad(19, H, "#4a6470", "#2c3e48", x0=12, x1=32)
    c.speckle(10, 19, 34, H, ["#d8e4e8", "#a8bcc4"], 0.3, where=lambda x, y: 11 + (y - 19) * 0.2 < x < 33 - (y - 19) * 0.2)
    # the humpbacked bridge and its arch
    c.poly([(0, 12), (22, 8), (44, 12), (44, 17), (0, 17)], "#6e6c68")
    c.texture(0, 9, W, 17, "#6e6c68", 10)
    c.ellipse(22, 19, 9, 7, "#1a1c20")
    c.vgrad(21, H, "#2c3e48", "#1a262c", x0=14, x1=31)             # the river seen through the arch
    for x in range(14, 31, 3):
        c.set(x + (x // 3) % 2, 23, "#a8bcc4")
    c.rect(0, 17, 4, 19, "#5a5854")
    c.rect(40, 17, W, 19, "#5a5854")
    c.speckle(0, 8, W, 12, ["#4f6a3a", "#5d7a44"], 0.35, where=lambda x, y: y >= 8 + abs(x - 22) * 4 / 22 - 0.5)  # moss
    return c


def lighthouse():
    c = Canvas("lighthouse")
    c.vgrad(0, H, "#22242a", "#4a463e")
    # the round stone wall, its blocks curving away at the edges
    for y in range(0, 23, 3):
        for x in range(W):
            c.set(x, y, mix(c.get(x, y), (18, 18, 20), 0.6))
        for x in range((y // 3 % 2) * 3, W, 6 + abs(22 - W // 2) // 6):
            for k in range(3):
                c.set(x, y + k, mix(c.get(x, y + k), (18, 18, 20), 0.4))
    c.rect(0, 23, W, H, "#3a3630")
    # a slit window with the last of the dusk in it
    c.vgrad(5, 12, "#7a5f6e", "#b98a6e", x0=37, x1=39)
    # the iron stair spiralling up into the dark, the column at its heart
    c.rect(21, 0, 24, 23, "#26262a")
    for i in range(11):
        y = 21 - i * 2
        w = round(math.sin(i * 0.95) * 7)
        x0, x1 = (22, 23 + w) if w > 0 else (22 + w, 23)
        c.rect(x0, y, x1 + 1, y + 1, "#8a8478" if w > 0 else "#5e5a54")
        c.set(x1 if w > 0 else x0, y - 1, "#4a4640")
    c.vgrad(0, 7, "#08080a", "#1e2024", x0=12, x1=33)
    # barrels of lamp oil, coils of rope, the cot
    for x in (2, 6):
        barrel(c, x, 18)
    c.ellipse(12, 25, 3, 1.5, "#8a7a58")
    c.ellipse(12, 25, 1.5, 0.8, "#5a4e3a")
    c.rect(32, 21, 42, 23, "#7a6a50")
    c.rect(32, 23, 33, 25, "#4a3a2a")
    c.rect(41, 23, 42, 25, "#4a3a2a")
    c.rect(33, 20, 36, 21, "#c8c0a8")
    return c


def trolls_hollow():
    c = Canvas("trolls_hollow")
    c.texture(0, 0, W, H, "#2a2a2c", 8)
    # the mouth of the cave, the river bright beyond it
    c.ellipse(9, 14, 8, 11, "#5e7c88")
    mouth = rgb("#5e7c88")
    for y in range(3, H):
        for x in range(0, 18):
            if c.get(x, y) == mouth:
                t = (y - 3) / 22
                col = mix(rgb("#5a7480"), rgb("#22323a"), t)    # brighter at the top: the dusk outside
                if 17 <= y <= 21 and (x * 2 + y * 5) % 9 < 3:
                    col = rgb("#b8c8cc")                         # the river's white water going past
                c.set(x, y, col)
    c.rect(0, 22, W, H, "#323028")
    c.texture(0, 22, W, H, "#34322a", 8)
    # the magpie hoard against the back wall
    c.poly([(20, 24), (28, 13), (36, 12), (44, 18), (44, 24)], "#4a4236")
    c.speckle(20, 12, W, 24, ["#e0c060", "#f0e8d0", "#7ac0c8", "#c87850", "#a0a8b0"], 0.22,
              where=lambda x, y: c.get(x, y) == rgb("#4a4236"))
    c.rect(37, 9, 41, 15, "#8a9aa4")      # the cracked mirror
    c.line(38, 9, 40, 14, "#3a4248")
    c.set(30, 20, "#e8e0c8")              # bones
    c.line(26, 21, 29, 20, "#d8d0b8")
    c.speckle(0, 0, W, 6, ["#1a1a1c"], 0.3)
    return c


# ---------------------------------------------------------------- The Flooded Station

RAIN_SKY = ("#2e3840", "#46525a", "#5e6a70")


def station_metal(n):
    c = Canvas("metal-%d" % n)
    if n == 1:      # a corridor of riveted panels
        c.vgrad(0, H, "#3a464e", "#2a3238")
        c.poly([(0, 0), (14, 9), (14, 19), (0, 28)], "#4a565e")
        c.poly([(44, 0), (30, 9), (30, 19), (44, 28)], "#44505a")
        c.rect(14, 9, 30, 19, "#1c2328")
        for x in (4, 9, 35, 40):                         # panel seams and their rivets
            top, bottom = (x * 9 / 14, 28 - x * 9 / 14) if x < 22 else ((44 - x) * 9 / 14, 28 - (44 - x) * 9 / 14)
            c.line(x, top, x, bottom, "#34404a")
            for y in range(int(top) + 2, int(bottom), 3):
                c.set(x + (1 if x < 22 else -1), y, "#7a868c")
        for x in (19, 24):
            c.rect(x, 9, x + 1, 10, "#d8e0b0")
    elif n == 2:    # a hatch in a bulkhead
        c.texture(0, 0, W, H, "#47535b", 7)
        for x in range(0, W, 11):
            c.rect(x, 0, x + 1, H, "#323c42")
        c.ellipse(22, 14, 8, 9, "#2c363c")
        c.ellipse(22, 14, 6, 7, "#56646c")
        c.rect(21, 7, 23, 21, "#3a464c")
        c.rect(15, 13, 29, 15, "#3a464c")
        c.set(9, 4, "#e05a40")
    else:           # a deck under rain
        sky(c, RAIN_SKY, 10)
        c.rect(0, 10, W, H, "#3e4a52")
        for y in range(11, H, 3):
            c.rect(0, y, W, y + 1, "#323c44")
        c.rect(0, 9, W, 10, "#58646c")
        for x in range(2, W, 6):
            c.rect(x, 6, x + 1, 10, "#58646c")
        rain(c)
    return c


def station_flooded(n):
    c = Canvas("flooded-%d" % n)
    c.vgrad(0, 15, "#38444c", "#2c363e")
    if n == 1:      # a flooded corridor
        c.poly([(0, 0), (13, 8), (13, 15), (0, 15)], "#46525a")
        c.poly([(44, 0), (31, 8), (31, 15), (44, 15)], "#404c54")
        c.rect(13, 8, 31, 15, "#1a2226")
    elif n == 2:    # a room half under water
        c.rect(6, 4, 18, 13, "#4e5a60")
        c.rect(26, 6, 38, 13, "#4a565c")
    else:           # under the strip-lights
        for x in range(0, W, 8):
            c.rect(x, 2, x + 5, 3, "#c8e0c0")
    c.vgrad(15, H, "#2c5a60", "#163036")
    for y in range(15, H):
        for x in range(W):
            if (x + y * 2) % 9 == 0:
                c.set(x, y, mix(c.get(x, y), rgb("#8fd0d4"), 0.4))
    c.rect(0, 15, W, 16, "#5a9aa0")
    if n == 3:
        for x in range(0, W, 8):
            c.rect(x, 24, x + 5, 25, "#4ad07a")
            lamp_glow(c, x + 2.5, 24.5, 6, "#3ac070", 0.4)
    return c


def the_landing():
    c = Canvas("the_landing")
    sky(c, RAIN_SKY, 14)
    # the station up on its stilts
    c.rect(18, 2, 40, 9, "#4a565e")
    c.rect(18, 2, 40, 3, "#5e6a72")
    for x in (21, 26, 31, 36):
        c.rect(x, 4, x + 2, 6, "#c8b860")
    for x in (19, 27, 38):
        c.rect(x, 9, x + 1, 16, "#2e3840")
    c.line(39, 9, 39, 1, "#2e3840")       # the antenna mast
    c.line(30, 16, 38, 9, "#5a666e")      # the stair
    sea(c, 14, H, deep="#1e2e38", light="#34485a", foam="#8aa0ac")
    # the pontoon and the skiff tied at its edge
    c.rect(0, 20, 28, 23, "#5e5a52")
    c.texture(0, 20, 28, 22, "#6a665e", 8)
    c.rect(0, 23, 28, 24, "#2e2c28")
    c.poly([(4, 25), (16, 25), (14, 28), (6, 28)], "#a85a38")
    c.rect(16, 24, 18, 27, "#3a3a3e")     # the outboard
    c.line(28, 19, 44, 21, "#6a5a40")     # the rope walkway
    c.line(28, 20, 44, 22, "#4a3e2c")
    rain(c)
    return c


def common_deck():
    c = Canvas("common_deck")
    c.vgrad(0, H, "#3e4a52", "#2a3238")
    c.rect(0, 0, W, 3, "#2a3238")
    for x in (6, 20, 34):                 # ceiling lights, one dead
        c.rect(x, 3, x + 5, 4, "#d8dcc0" if x != 20 else "#4a5054")
    c.rect(0, 4, W, 5, "#56626a")
    # tables, plates slid into the water
    for x in (4, 18):
        c.rect(x, 15, x + 10, 17, "#6a7278")
        c.rect(x + 1, 17, x + 2, 21, "#4a5258")
        c.rect(x + 8, 17, x + 9, 21, "#4a5258")
    # the dead radio on the wall, the ladder up
    c.rect(30, 8, 37, 12, "#2c3236")
    c.rect(31, 9, 33, 11, "#5a4a3a")
    for y in range(4, 21, 2):
        c.rect(39, y, 43, y + 1, "#8a8f92")
    c.rect(39, 4, 40, 21, "#8a8f92")
    c.rect(42, 4, 43, 21, "#8a8f92")
    # ankle-deep water
    c.vgrad(21, H, "#2e5258", "#1c3238")
    for x in range(W):
        if x % 5 == 0:
            c.set(x, 22, "#7ab8bc")
    c.set(8, 24, "#d8d8d0")
    c.set(22, 25, "#d8d8d0")
    return c


def control_room():
    c = Canvas("control_room")
    c.rect(0, 0, W, H, "#2c3438")
    # windows streaked with rain
    for x in (2, 16, 30):
        c.vgrad(2, 10, "#3e4a54", "#5a666e", x0=x, x1=x + 12)
        c.rect(x, 1, x + 12, 2, "#1c2226")
    rain(c, 0.08)
    c.rect(0, 10, W, 11, "#1c2226")
    # the desk of dark screens, and the one red word
    c.rect(0, 15, W, 22, "#3a4448")
    for x in range(2, W - 4, 7):
        c.rect(x, 12, x + 5, 15, "#141a1e")
    c.rect(16, 12, 21, 15, "#5a1410")
    c.rect(17, 13, 20, 14, "#f04030")
    lamp_glow(c, 18.5, 13.5, 9, "#d03020", 0.35)
    c.speckle(0, 16, W, 22, ["#60c070", "#d0c050", "#e04030"], 0.06)   # switches and lamps
    c.rect(0, 22, W, H, "#22282c")
    c.rect(40, 11, 41, H, "#8a8f92")      # the ladder down
    c.rect(43, 11, 44, H, "#8a8f92")
    return c


def lab_wing():
    c = station_flooded(1)
    c.rnd.seed("lab_wing")
    # tanks along both walls, most of them empty and cracked
    for x0, x1, s in ((1, 6, 1), (7, 11, 1), (33, 37, 1), (38, 43, 1)):
        c.rect(x0, 4, x1, 15, "#3e6a70")
        c.rect(x0, 4, x1, 5, "#7a8a90")
        c.rect(x0 + 1, 6, x0 + 2, 13, "#7ab0b4")
    c.line(8, 6, 10, 11, "#1c2a2e")
    c.line(39, 5, 41, 9, "#1c2a2e")
    c.rect(16, 12, 28, 14, "#6a7278")     # the bench, the pry bar across it
    c.line(18, 11, 25, 11, "#9a4a30")
    return c


def drowned_lab():
    c = station_flooded(3)
    c.rnd.seed("drowned_lab")
    # the parts locker on the far wall, its door ajar, the fuse box on its top shelf
    c.rect(26, 2, 36, 15, "#5a646a")
    c.rect(27, 3, 31, 15, "#2a3236")
    c.rect(27, 4, 31, 5, "#6a7278")
    c.rect(28, 3, 30, 4, "#c8a040")
    c.poly([(31, 3), (35, 2), (35, 15), (31, 15)], "#6a747a")
    c.rect(4, 4, 12, 15, "#3a4448")       # the stairwell up
    for y in range(5, 15, 2):
        c.rect(5, y, 11, y + 1, "#56626a")
    return c


def pump_room():
    c = Canvas("pump_room")
    c.rect(0, 0, W, H, "#2e3236")
    # pipes everywhere
    for y, col in ((2, "#6a5a48"), (5, "#5a6066")):
        c.rect(0, y, W, y + 2, col)
        c.rect(0, y, W, y + 1, mix(rgb(col), (255, 255, 255), 0.15))
    for x, col in ((3, "#6a5a48"), (38, "#5a6066")):
        c.rect(x, 0, x + 2, H, col)
    # the squat iron pump bolted to the floor
    c.rect(12, 12, 32, 23, "#3e3a36")
    c.rect(12, 12, 32, 13, "#5a544e")
    c.ellipse(22, 17, 5, 4, "#2a2622")
    c.ellipse(22, 17, 2, 2, "#5a544e")
    c.rect(26, 8, 28, 12, "#3e3a36")
    for x in (13, 30):
        c.set(x, 22, "#8a847a")
    c.rect(34, 14, 36, 17, "#c87830")     # a hot gauge
    lamp_glow(c, 22, 6, 20, "#c88a40", 0.3)
    # water lapping round its base
    c.vgrad(23, H, "#2e4a50", "#1a2c30")
    for x in range(1, W, 4):
        c.set(x, 23, "#7aa8ac")
    return c


# ---------------------------------------------------------------- what goes where

def pictures():
    out = []
    kit = ROOT / "rules" / "art" / "terrain"
    for name, draw in (("water", kit_water), ("grass", kit_grass), ("stone", kit_stone), ("indoors", kit_indoors)):
        for n in (1, 2, 3):
            out.append((kit / ("%s-%d.png" % (name, n)), lambda d=draw, k=n: d(k)))
    lh, st = ROOT / "games" / "dark_lighthouse" / "art", ROOT / "games" / "flooded_station" / "art"
    for name, draw in (("metal", station_metal), ("flooded", station_flooded)):
        for n in (1, 2, 3):
            out.append((st / "terrain" / ("%s-%d.png" % (name, n)), lambda d=draw, k=n: d(k)))
    for room, draw in (("harbor_square", harbor_square), ("gull_tavern", gull_tavern), ("coast_road", coast_road),
                       ("greywater_bridge", greywater_bridge), ("lighthouse", lighthouse), ("trolls_hollow", trolls_hollow)):
        out.append((lh / ("%s.png" % room), draw))
    for room, draw in (("the_landing", the_landing), ("common_deck", common_deck), ("control_room", control_room),
                       ("lab_wing", lab_wing), ("drowned_lab", drowned_lab), ("pump_room", pump_room)):
        out.append((st / ("%s.png" % room), draw))
    return out


def preview(canvases, path, scale=6, per_row=6):
    """A sheet of every picture, enlarged, two pixels of gap between them."""
    rows = (len(canvases) + per_row - 1) // per_row
    gw, gh = W * scale + 4, H * scale + 4
    sheet = [[(23, 26, 33)] * (gw * per_row) for _ in range(gh * rows)]
    for i, c in enumerate(canvases):
        ox, oy = (i % per_row) * gw + 2, (i // per_row) * gh + 2
        for y in range(H * scale):
            for x in range(W * scale):
                sheet[oy + y][ox + x] = c.px[y // scale][x // scale]
    png.write(path, gw * per_row, gh * rows, sheet)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--preview", help="also write a sheet of every picture, enlarged")
    a = ap.parse_args()
    drawn = []
    for path, draw in pictures():
        c = draw()
        c.save(path)
        drawn.append(c)
        print(path.relative_to(ROOT))
    if a.preview:
        preview(drawn, Path(a.preview))


if __name__ == "__main__":
    main()
