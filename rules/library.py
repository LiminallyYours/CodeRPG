"""A game's library: everything generated or player-made in its runs, kept across new games.

state/library/<game>.json holds one entry per place, person or thing (side quests aren't kept: they belong
to one run's people). Each entry is the run record it was made from, plus what came with it (a room's
items and person, a person's wares), where it was, and what has happened to it since:

    {"kind": "rooms|characters|items", "origin": "world|player", "record": {"meta": …, "body": …},
     "bundle": [{"kind": …, "id": …, "record": …}], "where": "<room id>", "attach": {"room": …, "direction": …},
     "first_seen": "<date>", "last_seen": "<date>", "runs": <count>,
     "friend": null | {"why": …, "line": …}, "worth_keeping": null | "<reason>", "suggested": null | "<reason>",
     "forgotten": false}

rpg.py records and reads entries during play; the owner's tools/library.py lists, keeps and forgets them.
Nothing here knows a particular game. Pure apart from reading and writing the one file.
"""
import datetime
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "state" / "library"
KINDS = ("rooms", "characters", "items")


def path(game):
    return DIR / ("%s.json" % game)


def load(game):
    try:
        data = json.loads(path(game).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = None
    if not isinstance(data, dict) or not isinstance(data.get("entries"), dict):
        data = {"entries": {}}
    return data


def save(game, data):
    p = path(game)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    os.replace(tmp, p)


def today():
    return datetime.date.today().isoformat()


def protected(e):
    """Entries the size limit never drops: the player's own places, friends, and anything marked for keeping."""
    return bool(e.get("friend") or e.get("worth_keeping") or e.get("suggested") or (e["origin"] == "player" and e["kind"] == "rooms"))


def make_room(data, limit):
    """Drop entries until there's room for one more: forgotten ones first, then the least recently seen."""
    entries = data["entries"]
    while len(entries) >= limit:
        loose = [i for i, e in entries.items() if e.get("forgotten")] or \
                sorted((i for i, e in entries.items() if not protected(e)), key=lambda i: entries[i].get("last_seen", ""))
        if not loose:
            return False
        del entries[loose[0]]
    return True


def add(data, limit, ident, kind, origin, record, bundle=(), where=None, attach=None, worth_keeping=None):
    """Record a new entry (or refresh one with the same id). False when the library is full of entries it keeps."""
    entries = data["entries"]
    old = entries.get(ident)
    if old is None and not make_room(data, limit):
        return False
    e = old or {"first_seen": today(), "runs": 0, "friend": None, "suggested": None, "forgotten": False}
    e.update(kind=kind, origin=origin, record=record, bundle=list(bundle), where=where, attach=attach,
             last_seen=today(), runs=e.get("runs", 0) + 1, worth_keeping=worth_keeping or e.get("worth_keeping"))
    entries[ident] = e
    return True


def seen(data, ident):
    e = data["entries"].get(ident)
    if e:
        e.update(last_seen=today(), runs=e.get("runs", 0) + 1)


def befriend(data, ident, why, line):
    """A person the player befriended: they come back in later runs, remembering this one line."""
    e = data["entries"].get(ident)
    if not e or e["kind"] != "characters":
        return False
    e["friend"] = {"why": why, "line": line}
    e["worth_keeping"] = e.get("worth_keeping") or why
    return True


def fitting(data, kind, extra, here, exclude, most):
    """Up to `most` entries the world may reuse for a new `kind`: world-made, not forgotten, not already in play.
    Ones first made where the player is come first, then the most recently seen."""
    out = []
    for i, e in data["entries"].items():
        if e["kind"] != kind or e["origin"] != "world" or e.get("forgotten") or i in exclude:
            continue
        if kind == "characters" and (e["record"]["meta"].get("extra") == "yes") != extra:
            continue
        out.append(i)
    near = [i for i in out if data["entries"][i].get("where") == here]
    far = sorted((i for i in out if data["entries"][i].get("where") != here), key=lambda i: data["entries"][i].get("last_seen", ""), reverse=True)
    return (near + far)[:most]


def summary(e):
    """One line about an entry, for the world brief and the owner's list."""
    meta = e["record"]["meta"]
    what = meta.get("role") or (meta.get("tier", "").replace("_", " ") if e["kind"] == "items" else "") or "a place"
    prose = [l for l in e["record"].get("body", "").splitlines() if l.strip() and not l.startswith(("#", "- "))]
    first = " ".join(" ".join(prose).split()).split(". ")[0][:120]
    return "%s (%s): %s" % (meta.get("name", "?"), what, first)
