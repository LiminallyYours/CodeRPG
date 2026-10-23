#!/usr/bin/env python3
"""Draws the room pictures as small pixel art, 44 x 28 (the margin's mosaic: 44 cells, two pixels each).

    python3 tools/pictures.py                 # redraw every picture
    python3 tools/pictures.py --preview p.png # also a sheet of all of them, enlarged, to look at

Writes the kit's terrain pictures (rules/art/terrain/<terrain>-<n>.png), each game's own terrain pictures
(games/<id>/art/terrain/) and one per authored room (games/<id>/art/<room>.png). Any of them can be replaced by
a hand-made PNG of the same name (4:3 or wider, at most 256 pixels wide); nothing else needs to change.
Standard library only; the drawing is seeded, so a redraw gives the same pictures.

What reads at the margin's size (about 8 screen pixels a pixel, on a dark terminal), learned the hard way:
no dithering (the terminal shows full color; a dither pattern becomes a checkerboard), almost no per-pixel
grain (it turns to mush), a mid-key scene with one clear light source and one main subject against it
(dark-on-dark vanishes into the terminal's background), and a few deliberate details rather than scattered
speckle. Above all, one iconic subject a picture, filling much of the frame (a lighthouse, a boat, a heap of
treasure), in flat colors and bold shapes no smaller than about three pixels: a whole scene doesn't read at
44x28. Check every picture with --preview before keeping it."""

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

    def vgrad(self, y0, y1, c0, c1, x0=0, x1=W):
        """A vertical gradient, one color a row. No dithering: the terminal shows full color, and a dither
        pattern reads as a checkerboard at the size the margin draws."""
        a, b = rgb(c0), rgb(c1)
        for y in range(y0, y1):
            t = (y - y0) / max(1, y1 - y0 - 1)
            for x in range(x0, x1):
                self.set(x, y, mix(a, b, t))

    def hshade(self, x0, x1, y0, y1, dark, edge=0.5):
        """Darken a region toward its left and right edges: a curved wall, a vignette."""
        mid, half = (x0 + x1 - 1) / 2, max(1, (x1 - x0) / 2)
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                t = (abs(x - mid) / half) ** 2 * edge
                self.set(x, y, mix(self.get(x, y), rgb(dark), t))

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
        """A region of `base`, each pixel nudged a touch lighter or darker: stone, wood, grass. Kept faint (a
        third of `var`): stronger grain turns to mush at the size the margin draws."""
        for y in range(max(0, y0), min(H, y1)):
            for x in range(max(0, x0), min(W, x1)):
                d = round(self.rnd.randint(-var, var) / 3)
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


def rain(c, density=0.012, color="#9fb3bf", y0=0, y1=H):
    """Sparse slanting streaks, three pixels long and faint: more reads as static."""
    for _ in range(int(W * (y1 - y0) * density)):
        x, y = c.rnd.randrange(W), c.rnd.randrange(y0, max(y0 + 1, y1 - 2))
        for k in range(3):
            if 0 <= x - k < W and y + k < y1:
                c.set(x - k, y + k, mix(c.get(x - k, y + k), rgb(color), 0.35))


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
    elif n == 2:    # an old wall and its arch, a lit passage beyond
        c.rect(0, 0, W, H, "#6a655c")
        for y in range(0, H, 4):
            for x in range(W):
                c.set(x, y, mix(c.get(x, y), rgb("#3a3630"), 0.35))
            for x in range((y // 4 % 2) * 4, W, 8):
                for k in range(1, 4):
                    c.set(x, y + k, mix(c.get(x, y + k), rgb("#3a3630"), 0.3))
        c.ellipse(22, 14, 8, 9, "#2a2824")
        c.rect(14, 14, 31, H, "#2a2824")
        c.vgrad(10, H, "#3a3630", "#8a7a5a", x0=17, x1=28)    # the far end of the passage, in daylight
        c.rect(19, 12, 26, 20, "#c8c0a0")
        c.rect(14, 24, 31, H, "#4a453c")
        c.speckle(0, 0, W, H, ["#5a7a40"], 0.02)
        c.hshade(0, W, 0, H, "#2a2824", 0.5)
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
        c.vgrad(0, 21, "#3a322c", "#56483a")
        for y in range(4, 21, 5):
            c.rect(0, y, W, y + 1, "#2e2822")
        c.rect(0, 21, W, H, "#3e342a")
        c.rect(19, 13, 30, 15, "#6a5038")             # a shelf with the candle on it
        for x in (4, 10, 33):
            barrel(c, x, 16, wood="#7a5432", band="#3a2e24")
        c.rect(24, 10, 25, 13, "#e8dcb0")
        c.set(24, 9, "#ffd060")
        lamp_glow(c, 24.5, 10, 20, "#e0a048", 0.55)
        c.hshade(0, W, 0, H, "#1a1612", 0.6)
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
    sky(c, DUSK, 13)
    c.vgrad(13, 22, "#3e5a6c", "#2a3e4c")                  # the harbor water
    for x, y in ((3, 15), (30, 14), (36, 17), (6, 19), (40, 20)):
        c.rect(x, y, x + 3, y + 1, "#6a8494")
    # one fishing boat at its mooring: hull, mast, furled sail on the boom
    c.poly([(8, 15), (36, 15), (32, 20), (12, 20)], "#8a3a2a")
    c.rect(8, 15, 36, 16, "#c8a070")                       # the gunwale
    c.rect(21, 2, 23, 15, "#3a2a20")                       # the mast
    c.rect(14, 11, 31, 12, "#3a2a20")                      # the boom
    c.poly([(15, 11), (30, 11), (27, 8), (18, 8)], "#d8ccb0")   # the furled sail
    c.rect(12, 20, 32, 21, "#1e2c36")                      # its shadow on the water
    # the quay and its mooring post, the rope to the boat
    c.rect(0, 22, W, 24, "#8a847a")
    c.rect(0, 24, W, H, "#5e5a54")
    c.rect(38, 19, 41, 24, "#4a3a2c")
    c.line(36, 16, 39, 19, "#c8b88a")
    for x, y in ((6, 4), (13, 6), (34, 3)):               # gulls
        c.set(x - 1, y - 1, "#e8e4d8")
        c.set(x, y, "#e8e4d8")
        c.set(x + 1, y - 1, "#e8e4d8")
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
    c.vgrad(12, H, "#3e5a6c", "#22343f")                  # the sea far below
    c.poly([(0, 12), (24, 13), (32, 28), (0, 28)], "#4f6e36")   # the clifftop, green to the edge
    c.poly([(24, 13), (32, 28), (29, 28), (22, 13)], "#6a6058") # the cliff face
    c.poly([(8, 28), (17, 13), (21, 13), (19, 28)], "#a89470")  # the road, running off along the edge
    for x, y in ((4, 17), (7, 23)):                        # gorse, yellow in flower
        c.ellipse(x, y, 3.5, 2.5, "#2e4a24")
        for dx, dy in ((-1, -1), (1, 0), (0, 1)):
            c.set(x + dx, y + dy, "#e8c040")
    for x, y in ((35, 22), (39, 25), (34, 26)):           # surf at the foot of the cliff
        c.rect(x, y, x + 3, y + 1, "#c8d8dc")
    return c


def greywater_bridge():
    c = Canvas("greywater_bridge")
    sky(c, DUSK, 12)
    # the gorge: dark cliffs falling to the river from both sides
    c.poly([(0, 9), (8, 10), (13, 22), (15, 28), (0, 28)], "#3e4038")
    c.poly([(44, 8), (35, 10), (31, 22), (29, 28), (44, 28)], "#3a3c36")
    c.poly([(0, 9), (8, 10), (9, 13), (0, 12)], "#4f5a3c")        # grass along the tops
    c.poly([(44, 8), (35, 10), (34, 13), (44, 12)], "#4b5638")
    # the river, white where it roars over the rocks
    c.vgrad(22, H, "#4f6c7a", "#2e4450", x0=0, x1=W)
    c.poly([(0, 28), (0, 24), (13, 22), (15, 28)], "#3e4038")
    c.poly([(44, 28), (44, 24), (31, 22), (29, 28)], "#3a3c36")
    for y, xs in ((23, (16, 20, 25)), (24, (14, 22, 27)), (25, (17, 24)), (26, (15, 20, 26)), (27, (18, 23, 28))):
        for x in xs:
            c.rect(x, y, x + 2, y + 1, "#d8e4e8")
    # the humpbacked bridge: deck, parapet, one round arch, piers into the water
    stone, light, dark = "#7c776e", "#99938a", "#57534d"
    deck = lambda x: 12 - 4 * math.sin(math.pi * x / (W - 1))       # the hump: 12 at the ends, 8 at the crown
    for x in range(W):
        top = round(deck(x))
        c.rect(x, top, x + 1, top + 6, stone)
        c.set(x, top, light)                                          # the parapet's lit top
        if x % 5 == 2:
            c.set(x, top + 1, dark)                                   # joints in the parapet
        c.set(x, top + 5, dark)
    for x in range(11, 34):                                           # the spandrels: solid stone down to the arch
        c.rect(x, round(deck(x)) + 5, x + 1, 23, stone)
    c.ellipse(22, 22, 8, 8, "#2a3a42")                              # the arch, the gorge seen through it
    c.rect(14, 22, 31, H, "#2a3a42")
    c.vgrad(23, H, "#3e5866", "#2a3e48", x0=15, x1=30)
    for x in (17, 21, 26):
        c.rect(x, 25, x + 2, 26, "#c8d8dc")
    c.rect(11, 14, 14, H, stone)                                     # the piers
    c.rect(30, 14, 33, H, stone)
    c.rect(11, 14, 12, H, light)
    for x, y in ((6, 10), (7, 10), (19, 8), (20, 8), (33, 9), (38, 10), (39, 10)):
        c.set(x, y - 1, "#5d7a44")                                   # moss on the parapet
    return c


def lighthouse():
    c = Canvas("lighthouse")
    sky(c, DUSK, 20)
    c.vgrad(20, H, "#2e4250", "#1e2c36")                  # the sea
    for x, y in ((3, 22), (36, 23), (30, 26), (8, 26)):
        c.rect(x, y, x + 3, y + 1, "#4e6676")
    c.poly([(6, 28), (12, 22), (32, 21), (40, 28)], "#2e2c30")  # the rock it stands on
    # the tower: white, tapering, two red bands; lit from the west
    for y in range(7, 23):
        half = 3 + (y - 7) * 2.2 / 15
        x0, x1 = round(22 - half), round(22 + half)
        band = 11 <= y <= 13 or 17 <= y <= 19
        c.rect(x0, y, x1, y + 1, "#b8443a" if band else "#e8e2d4")
        c.rect(x1 - 2, y, x1, y + 1, "#8a3028" if band else "#b8b0a2")   # the shaded side
    c.rect(20, 19, 23, 23, "#3a2a20")                      # the door
    # the gallery and the lantern room, dark: the light is out
    c.rect(17, 6, 28, 7, "#2a2a2e")
    c.rect(19, 3, 26, 6, "#34404a")
    c.rect(22, 3, 23, 6, "#2a2a2e")
    c.poly([(18, 3), (27, 3), (24, 1), (21, 1)], "#8a3028")    # the cap
    return c


def trolls_hollow():
    c = Canvas("trolls_hollow")
    c.rect(0, 0, W, H, "#1e1c1a")                          # the rock around the hollow
    c.ellipse(22, 17, 21, 15, "#3e3a34")                   # the hollow itself, lit a little from the river
    c.rect(0, 23, W, H, "#4a453c")                         # the floor
    c.rect(0, 25, 9, H, "#3e5866")                         # the river running past the mouth
    c.rect(2, 26, 5, 27, "#c8d8dc")
    # the magpie hoard: one big heap of shiny things
    c.poly([(9, 25), (16, 15), (22, 11), (29, 15), (36, 25)], "#8a6a30")
    c.poly([(16, 15), (22, 11), (25, 13), (19, 17)], "#b08a40")
    for x, y in ((18, 18), (24, 15), (28, 20), (14, 22), (22, 22), (31, 23)):
        c.rect(x, y, x + 2, y + 1, "#f0d060")
    for x, y in ((21, 8), (34, 16)):                       # two glints, as stars
        c.set(x, y, "#fff4c0")
        c.set(x - 1, y + 1, "#fff4c0"); c.set(x + 1, y + 1, "#fff4c0"); c.set(x, y + 1, "#ffffff")
        c.set(x, y + 2, "#fff4c0")
    c.rect(37, 12, 41, 22, "#a8b8c0")                      # the cracked mirror leaning on the wall
    c.line(38, 13, 40, 20, "#3a4248")
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
    elif n == 2:    # a store room half under water: a door, shelving, a wall lamp
        c.rect(4, 3, 14, 15, "#56626a")             # the door and its frame
        c.rect(5, 4, 13, 15, "#2a3438")
        c.rect(11, 9, 12, 10, "#c8a040")
        for y in (5, 9, 13):                       # shelving, boxes on it
            c.rect(22, y, 40, y + 1, "#6a747a")
        for x, y, col in ((23, 3, "#8a6a40"), (28, 3, "#5a7a8a"), (34, 7, "#8a6a40"), (25, 11, "#7a5a3a")):
            c.rect(x, y, x + 4, y + 2, col)
        c.rect(17, 4, 19, 5, "#e8e0b0")            # the wall lamp
        lamp_glow(c, 18, 4.5, 10, "#d8d0a0", 0.3)
    else:           # under the strip-lights
        for x in range(0, W, 8):
            c.rect(x, 2, x + 5, 3, "#c8e0c0")
    sea(c, 15, H, deep="#163036", light="#2c5a60", foam="#8fd0d4", ripples=0.04)
    c.rect(0, 15, W, 16, "#5a9aa0")
    if n == 3:
        for x in range(0, W, 8):
            c.rect(x, 24, x + 5, 25, "#4ad07a")
            lamp_glow(c, x + 2.5, 24.5, 6, "#3ac070", 0.4)
    return c


def the_landing():
    c = Canvas("the_landing")
    sky(c, RAIN_SKY, 15)
    c.vgrad(15, H, "#34485a", "#1e2e38")                  # the swell
    for x, y in ((2, 17), (12, 19), (33, 18), (24, 23), (40, 25)):
        c.rect(x, y, x + 3, y + 1, "#5a7080")
    # the station up on its stilts, three lit windows
    c.rect(14, 3, 40, 10, "#5a666e")
    c.rect(14, 3, 40, 4, "#7a868c")
    for x in (18, 25, 32):
        c.rect(x, 5, x + 3, 7, "#e8d070")
    for x in (16, 26, 37):
        c.rect(x, 10, x + 2, 18, "#2e3840")
    c.rect(39, 0, 40, 3, "#2e3840")                        # the antenna mast
    # the pontoon and the orange skiff tied at its edge
    c.rect(0, 20, 22, 23, "#7a766c")
    c.rect(0, 20, 22, 21, "#9a968a")
    c.poly([(4, 24), (18, 24), (15, 27), (7, 27)], "#d0602c")
    c.rect(17, 23, 19, 26, "#3a3a3e")
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
    c.rect(0, 0, W, 8, "#46525a")                          # the rain-streaked window
    for x in (6, 15, 27, 37):
        c.line(x, 1, x - 2, 6, "#7a8a94")
    c.rect(0, 8, W, 9, "#1c2226")
    # the one screen that matters: PUMP FAULT, in red
    c.rect(11, 10, 33, 21, "#1a1e22")
    c.rect(13, 12, 31, 19, "#5a1410")
    c.poly([(22, 13), (27, 18), (17, 18)], "#f04030")      # a warning triangle
    c.rect(21, 15, 23, 17, "#5a1410")
    lamp_glow(c, 22, 15, 14, "#d03020", 0.3)
    c.rect(0, 21, W, H, "#3a4448")                         # the desk
    c.rect(0, 21, W, 22, "#56626a")
    for x, col in ((4, "#60c070"), (8, "#60c070"), (36, "#e0b040"), (40, "#e04030")):
        c.rect(x, 24, x + 2, 25, col)
    return c


def lab_wing():
    c = Canvas("lab_wing")
    c.vgrad(0, 16, "#3e4a52", "#2c363e")
    # one big specimen tank, cracked and empty
    c.rect(14, 2, 30, 4, "#7a868c")                        # the lid
    c.rect(15, 4, 29, 18, "#4e8a90")                       # the glass
    c.rect(17, 5, 19, 16, "#9ad0d4")                       # its shine
    c.line(24, 5, 27, 10, "#1c2a2e")                       # the crack
    c.line(27, 10, 25, 14, "#1c2a2e")
    c.rect(4, 10, 11, 16, "#5a646a")                       # a bench, the pry bar across it
    c.rect(4, 9, 12, 10, "#a04a30")
    c.rect(33, 6, 40, 16, "#3a4448")                       # the open door to the store
    sea(c, 16, H, deep="#163036", light="#2c5a60", foam="#8fd0d4", ripples=0.03)
    c.rect(0, 16, W, 17, "#5a9aa0")
    return c


def drowned_lab():
    c = Canvas("drowned_lab")
    c.vgrad(0, 15, "#38444c", "#2c363e")
    # the steel parts locker, its door ajar, the fuse box on its top shelf
    c.rect(14, 1, 30, 15, "#6a747a")
    c.rect(15, 2, 22, 15, "#2a3236")
    c.rect(15, 4, 22, 5, "#7a848a")
    c.rect(16, 2, 20, 4, "#e0b040")
    c.poly([(22, 2), (29, 1), (29, 15), (22, 15)], "#88929a")
    c.rect(27, 7, 28, 9, "#3a4248")
    sea(c, 15, H, deep="#10282c", light="#245058", foam="#8fd0d4", ripples=0.03)
    c.rect(0, 15, W, 16, "#5a9aa0")
    for x in (2, 13, 24, 35):                              # the green strip-lights under the water
        c.rect(x, 23, x + 7, 24, "#4ad07a")
        lamp_glow(c, x + 3.5, 23.5, 6, "#3ac070", 0.35)
    return c


def pump_room():
    c = Canvas("pump_room")
    c.rect(0, 0, W, H, "#2e3236")
    c.rect(0, 3, W, 6, "#6a5a48")                          # the main pipe
    c.rect(0, 3, W, 4, "#8a7a64")
    c.rect(4, 6, 7, 24, "#6a5a48")
    # the squat iron pump, its red valve wheel
    c.rect(12, 11, 34, 24, "#4a4642")
    c.rect(12, 11, 34, 12, "#6a645c")
    c.rect(20, 6, 24, 11, "#4a4642")
    c.ellipse(23, 17.5, 5, 4.5, "#c0402c")
    c.ellipse(23, 17.5, 3, 2.6, "#4a4642")
    c.rect(22, 13, 24, 22, "#c0402c")
    c.rect(18, 17, 28, 18, "#c0402c")
    c.rect(37, 12, 40, 16, "#e0a040")                      # a hot gauge
    lamp_glow(c, 23, 8, 18, "#c88a40", 0.25)
    c.rect(0, 24, W, H, "#2e4a50")                         # water lapping round its base
    for x in (2, 15, 30, 39):
        c.rect(x, 25, x + 3, 26, "#6a9aa0")
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
