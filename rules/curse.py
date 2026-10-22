"""Curses: what a curse does to the words the player types. Pure: no files, no state.

A curse's `effect:` is one of
    reverse_words        the words come out in reverse order
    mirror               every word is spelled backwards
    word_limit <n>       only the first n words come out
    suffix "<phrase>"    the phrase is tacked on the end

The mod draws the player's row with a port of these (mod/hooks/curse.ts); both are tested against the
same examples, rules/curse_vectors.json.
"""
import re

_LIMIT = re.compile(r"^word_limit\s+(\d+)$")
_SUFFIX = re.compile(r'^suffix\s+"(.+)"$')


def parse(effect):
    """'word_limit 3' -> ('word_limit', 3); 'suffix "over."' -> ('suffix', 'over.'). ValueError if unknown."""
    effect = " ".join(str(effect or "").split())
    if effect in ("reverse_words", "mirror"):
        return effect, None
    m = _LIMIT.match(effect)
    if m and int(m.group(1)) >= 1:
        return "word_limit", int(m.group(1))
    m = _SUFFIX.match(effect)
    if m:
        return "suffix", m.group(1)
    raise ValueError('effect must be reverse_words, mirror, word_limit <n> or suffix "<phrase>" (got %r)' % effect)


def apply(effect, text):
    """The words as they come out under one curse."""
    kind, arg = parse(effect)
    words = text.split()
    if not words:
        return text
    if kind == "reverse_words":
        return " ".join(reversed(words))
    if kind == "mirror":
        return " ".join(w[::-1] for w in words)
    if kind == "word_limit":
        return " ".join(words[:arg]) + ("…" if len(words) > arg else "")
    return " ".join(words) + " " + arg


def describe(effect):
    """How the curse changes speech, in a few plain words, for the game master."""
    kind, arg = parse(effect)
    return {
        "reverse_words": "in reverse word order",
        "mirror": "with every word spelled backwards",
        "word_limit": "cut off after %s word%s" % (arg, "" if arg == 1 else "s"),
        "suffix": 'with "%s" tacked on the end' % arg,
    }[kind]
