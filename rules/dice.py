"""Dice. The only place randomness happens.

Dice strings look like "1d20", "2d4+1", "1d6-1" or a plain number "3".

Where the faces come from, first match wins:
- the env var RPG_SEED: one seeded generator per process (for testing);
- a run's stream (use_stream): each die is drawn from its key and its position in the run, so a run
  started from the same seed rolls the same dice in the same order on any machine;
- otherwise the system's randomness.
"""
import os
import random
import re

_seed = os.environ.get("RPG_SEED")
_rng = random.Random(_seed) if _seed is not None else random.SystemRandom()
_stream = None  # [key, position] while a run's seed drives the dice


def use_stream(key, position=0):
    """Draw every die from the run stream `key`, starting at `position` (how many dice it has rolled)."""
    global _stream
    _stream = [str(key), int(position)]


def position():
    """How many dice the run stream has rolled so far, or None when no stream is in use."""
    return _stream[1] if _stream else None


def _face(sides):
    if _seed is None and _stream:
        key, n = _stream
        _stream[1] += 1
        return random.Random("%s:%d" % (key, n)).randint(1, sides)
    return _rng.randint(1, sides)


def fresh_choice(options):
    """A choice that isn't part of any run's stream, e.g. a new run's seed. RPG_SEED still fixes it."""
    return _rng.choice(options)

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
    faces = [_face(sides) for _ in range(count)]
    return sum(faces) + mod, faces, mod


def describe(spec, total, faces, mod):
    """Human-readable roll, e.g. '2d4+1 → [3, 1] +1 = 5'."""
    if not faces:
        return str(total)
    parts = str(faces)
    if mod:
        parts += (" %+d" % mod)
    return "%s → %s = %d" % (spec, parts.strip(), total)
