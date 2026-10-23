"""PNG files for room pictures, standard library only: reading (for the mosaic the mod draws), checking (for
validate) and writing (for tools/pictures.py).

The margin draws a picture as a mosaic 44 cells wide and 14 rows tall, each cell two pixels stacked, so 44 x 28
pixels. A picture of any size from 4:3 to wider is cropped to that shape around its middle and averaged down."""

import base64
import struct
import zlib

MOSAIC_W, MOSAIC_H = 44, 28
MAX_BYTES = 64 * 1024     # a picture file; text files have their character cap
MAX_WIDTH = 256           # pixels: a picture for a 44-pixel mosaic needs no more, and decoding stays quick
MIN_RATIO = 4 / 3         # 4:3 or wider

_SIG = b"\x89PNG\r\n\x1a\n"
_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}


def _chunks(data):
    if data[:8] != _SIG:
        raise ValueError("not a PNG file")
    i = 8
    while i + 8 <= len(data):
        n, kind = struct.unpack(">I4s", data[i:i + 8])
        yield kind, data[i + 8:i + 8 + n]
        i += 12 + n


def header(data):
    """(width, height, bit depth, color type, interlace) from the IHDR chunk."""
    for kind, body in _chunks(data):
        if kind == b"IHDR":
            w, h, depth, ctype, _, _, interlace = struct.unpack(">IIBBBBB", body)
            return w, h, depth, ctype, interlace
        break
    raise ValueError("not a PNG file (no header)")


def problem(data):
    """Why this PNG can't be a room picture, or None."""
    try:
        w, h, depth, ctype, interlace = header(data)
    except (ValueError, struct.error) as e:
        return str(e)
    if len(data) > MAX_BYTES:
        return "%d bytes; a picture is at most %d" % (len(data), MAX_BYTES)
    if w > MAX_WIDTH:
        return "%d pixels wide; a picture is at most %d (it's drawn %d wide)" % (w, MAX_WIDTH, MOSAIC_W)
    if not h or w / h < MIN_RATIO - 1e-9:
        return "%dx%d; a picture is 4:3 or wider" % (w, h)
    if ctype not in _CHANNELS or depth not in ((1, 2, 4, 8) if ctype in (0, 3) else (8, 16)):
        return "color type %d at %d bits isn't supported" % (ctype, depth)
    if interlace:
        return "interlaced PNGs aren't supported; save it without interlacing"
    try:
        pixels(data)
    except (ValueError, zlib.error, IndexError) as e:
        return "can't be read (%s)" % e
    return None


def _paeth(a, b, c):
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def pixels(data):
    """(width, height, rows): each row a list of (r, g, b), transparency laid over black."""
    w, h, depth, ctype, interlace = header(data)
    if interlace:
        raise ValueError("interlaced")
    palette, idat = [], b""
    for kind, body in _chunks(data):
        if kind == b"PLTE":
            palette = [tuple(body[i:i + 3]) for i in range(0, len(body) - 2, 3)]
        elif kind == b"IDAT":
            idat += body
        elif kind == b"IEND":
            break
    raw = zlib.decompress(idat)
    bits = _CHANNELS[ctype] * depth
    bpp = max(1, bits // 8)               # bytes per pixel, for the filters
    stride = (w * bits + 7) // 8
    rows, prev, i = [], bytearray(stride), 0
    for _ in range(h):
        kind, line = raw[i], bytearray(raw[i + 1:i + 1 + stride])
        i += 1 + stride
        if len(line) < stride:
            raise ValueError("image data ends early")
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if kind == 1:
                line[x] = (line[x] + a) & 255
            elif kind == 2:
                line[x] = (line[x] + b) & 255
            elif kind == 3:
                line[x] = (line[x] + ((a + b) >> 1)) & 255
            elif kind == 4:
                line[x] = (line[x] + _paeth(a, b, c)) & 255
            elif kind:
                raise ValueError("unknown filter %d" % kind)
        rows.append(_decode_row(line, w, depth, ctype, palette))
        prev = line
    return w, h, rows


def _decode_row(line, w, depth, ctype, palette):
    if depth < 8:  # packed grey or palette indices
        per = 8 // depth
        vals = [(line[x // per] >> (8 - depth * (x % per + 1))) & ((1 << depth) - 1) for x in range(w)]
        if ctype == 3:
            return [palette[v] if v < len(palette) else (0, 0, 0) for v in vals]
        scale = 255 // ((1 << depth) - 1)
        return [(v * scale,) * 3 for v in vals]
    step = 2 if depth == 16 else 1      # 16-bit: the high byte
    n = _CHANNELS[ctype]
    out = []
    for x in range(w):
        px = [line[(x * n + k) * step] for k in range(n)]
        if ctype == 0:
            out.append((px[0],) * 3)
        elif ctype == 2:
            out.append(tuple(px))
        elif ctype == 3:
            out.append(palette[px[0]] if px[0] < len(palette) else (0, 0, 0))
        elif ctype == 4:
            v = px[0] * px[1] // 255
            out.append((v, v, v))
        else:
            out.append(tuple(c * px[3] // 255 for c in px[:3]))
    return out


def mosaic(data, w=MOSAIC_W, h=MOSAIC_H):
    """The picture cropped to w:h around its middle and averaged down to w x h pixels, as base64 of r, g, b bytes."""
    sw, sh, rows = pixels(data)
    # crop to the mosaic's shape: trim the sides of a wider picture, the top and bottom of a taller one
    if sw * h > sh * w:
        cw, ch = sh * w / h, sh
    else:
        cw, ch = sw, sw * h / w
    x0, y0 = (sw - cw) / 2, (sh - ch) / 2
    out = bytearray()
    for y in range(h):
        ya, yb = int(y0 + ch * y / h), max(int(y0 + ch * y / h) + 1, int(y0 + ch * (y + 1) / h))
        for x in range(w):
            xa, xb = int(x0 + cw * x / w), max(int(x0 + cw * x / w) + 1, int(x0 + cw * (x + 1) / w))
            cells = [rows[j][i] for j in range(ya, min(yb, sh)) for i in range(xa, min(xb, sw))]
            for k in range(3):
                out.append(sum(c[k] for c in cells) // len(cells))
    return base64.b64encode(bytes(out)).decode("ascii")


def write(path, w, h, rows):
    """Write rows of (r, g, b) as an 8-bit RGB PNG."""
    raw = b"".join(b"\x00" + bytes(c for px in row for c in px) for row in rows)

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)

    data = _SIG + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)
