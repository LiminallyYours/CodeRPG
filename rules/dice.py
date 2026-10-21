"""Dice. The only place randomness happens.

Dice strings look like "1d20", "2d4+1", "1d6-1" or a plain number "3".
Set the env var RPG_SEED to make rolls repeatable (for testing).
"""
import os
import random
import re

_seed = os.environ.get("RPG_SEED")
_rng = random.Random(_seed) if _seed is not None else random.SystemRandom()

_DICE = re.compile(r"^\s*(?:(\d*)d(\d+))?\s*([+-]\s*\d+)?\s*$")


def parse(spec):
    """'2d4+1' -> (2, 4, 1). A bare number '3' -> (0, 0, 3)."""
    spec = str(spec).strip()
    if spec.lstrip("+-").isdigit():
        return 0, 0, int(spec)
    m = _DICE.match(spec)
    if not m or not m.group(2):
        raise ValueError("bad dice: %r (use forms like 1d20, 2d4+1, 3)" % spec)
    count = int(m.group(1) or 1)
    sides = int(m.group(2))
    mod = int(m.group(3).replace(" ", "")) if m.group(3) else 0
    return count, sides, mod


def roll(spec, extra_dice=False):
    """Roll a dice string. Returns (total, faces, mod).
    extra_dice=True doubles the number of dice (used for critical hits)."""
    count, sides, mod = parse(spec)
    if extra_dice:
        count *= 2
    faces = [_rng.randint(1, sides) for _ in range(count)]
    return sum(faces) + mod, faces, mod


def describe(spec, total, faces, mod):
    """Human-readable roll, e.g. '2d4+1 → [3, 1] +1 = 5'."""
    if not faces:
        return str(total)
    parts = str(faces)
    if mod:
        parts += (" %+d" % mod)
    return "%s → %s = %d" % (spec, parts.strip(), total)
