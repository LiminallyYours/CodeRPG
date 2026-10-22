#!/usr/bin/env python3
"""The game owner's library tool:  python3 tools/library.py <command> [--game <id>]

    list                every entry in the game's library, those worth keeping first
    keep <id>           make an entry permanent: write it into games/<id>/ as authored content, check the
                        game, and drop it from the library. If the game no longer validates, nothing changes.
    forget <id>         the entry is never brought back again (no reuse, no carrying over)
    unforget <id>       undo forget

The library (state/library/<game>.json) holds everything generated or player-made in the game's runs.
On its own it only decides what may come back in later runs; `keep` makes something part of the game for
good. The game master can't run this: it isn't in the project's allowed commands, so only the owner
decides what becomes permanent. Without --game it uses the game being played.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "rules"))
import content  # noqa: E402
import library  # noqa: E402
import rpg  # noqa: E402

KIND_NAMES = {"rooms": "place", "characters": "person", "items": "thing"}
RUN_ONLY = ("generated", "made_by", "carried", "depth", "tier", "fights", "extra")  # meta that means nothing in content


def fail(msg):
    print("library: %s" % msg)
    sys.exit(1)


def front_matter(meta):
    lines = ["---"]
    for k, v in meta.items():
        if isinstance(v, dict):
            lines.append("%s:" % k)
            lines += ["  %s: %s" % kv for kv in v.items()]
        elif isinstance(v, list):
            lines.append("%s:" % k)
            lines += ["  - %s" % x for x in v]
        elif v is not None:
            lines.append("%s: %s" % (k, v))
    return "\n".join(lines + ["---"])


def edit_block(text, key, add=None, remove=None):
    """Add a line to the front-matter block `key:` of a content file, or remove its `remove:` line (and the
    block, once empty)."""
    lines = text.split("\n")
    end = lines.index("---", 1)
    start = next((i for i in range(1, end) if not lines[i].startswith((" ", "\t")) and lines[i].split(":")[0].strip() == key), None)
    if start is None:
        if add:
            lines[end:end] = ["%s:" % key, add]
        return "\n".join(lines)
    last = start
    while last + 1 < end and lines[last + 1].startswith((" ", "\t")):
        last += 1
    if add:
        lines.insert(last + 1, add)
    if remove:
        rest = [l for l in lines[start + 1:last + 1] if not l.strip().startswith(remove + ":")]
        lines[start:last + 1] = [lines[start]] + rest if rest else []
    return "\n".join(lines)


def set_key(text, key, value):
    """Set a top-level front-matter key to a one-line value, replacing any block it had; None removes it."""
    lines = text.split("\n")
    end = lines.index("---", 1)
    start = next((i for i in range(1, end) if not lines[i].startswith((" ", "\t")) and lines[i].split(":")[0].strip() == key), None)
    new = [] if value is None else ["%s: %s" % (key, value)]
    if start is None:
        lines[end:end] = new
    else:
        last = start
        while last + 1 < end and lines[last + 1].startswith((" ", "\t")):
            last += 1
        lines[start:last + 1] = new
    return "\n".join(lines)


class Changes:
    """Files written by `keep`, so all of them can be put back if the game no longer validates."""

    def __init__(self):
        self.before = {}

    def write(self, path, text):
        if path not in self.before:
            self.before[path] = path.read_text(encoding="utf-8") if path.exists() else None
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")

    def edit(self, path, **kw):
        self.write(path, edit_block(path.read_text(encoding="utf-8"), **kw))

    def set(self, path, key, value):
        self.write(path, set_key(path.read_text(encoding="utf-8"), key, value))

    def undo(self):
        for path, text in self.before.items():
            if text is None:
                path.unlink()
            else:
                path.write_text(text, encoding="utf-8")


def content_file(kind, record, promoted=False):
    meta = {k: v for k, v in record["meta"].items() if k not in RUN_ONLY}
    body = record.get("body", "").replace("- Generated for this run.", "- Kept from an earlier run.")
    if kind == "characters" and promoted:
        meta["minor"] = "no"
    body = re.sub(r"\n*(\n## )", r"\n\1", body.strip())  # a blank line before each section, as authored files have
    return front_matter(meta) + "\n" + body + "\n"


def keep(game, data, ident):
    e = data["entries"].get(ident)
    if not e:
        fail("no entry %r in the library" % ident)
    parts = [(e["kind"], ident, e["record"], True)] + [(b["kind"], b["id"], b["record"], b.get("placed", False)) for b in e.get("bundle") or []]
    for k, i, _, _ in parts:
        if content.exists(k, i):
            fail("%s is already part of the game (%s/%s.md)" % (i, k, i))
    room_of = lambda r: content.path_of("rooms", r)  # noqa: E731
    ch = Changes()
    if e["kind"] == "rooms":
        parent = (e.get("attach") or {}).get("room")
        d = (e.get("attach") or {}).get("direction")
        if not content.exists("rooms", parent or ""):
            fail("%s opens off %s, which isn't part of the game; keep that place first" % (ident, parent))
        ch.edit(room_of(parent), key="exits", add="  %s: %s" % (d, ident))
        meta = content.load("rooms", parent)
        if d in (meta.get("build") or {}):
            ch.edit(room_of(parent), key="build", remove=d)
        if d in rpg.options_of(meta.get("expand") or ""):  # the way it grew is an exit now
            ch.set(room_of(parent), "expand", ", ".join(x for x in rpg.options_of(meta["expand"]) if x != d) or "no")
        record = json.loads(json.dumps(e["record"]))
        for k, i, _, placed in parts[1:]:
            if k == "characters":
                record["meta"].setdefault("characters", []).append(i)
            elif placed:
                record["meta"].setdefault("items", []).append(i)
        ch.write(content.path_of("rooms", ident), content_file("rooms", record))
    else:
        where = e.get("where")
        if e["kind"] == "characters" and not content.exists("rooms", where or ""):
            fail("%s lives at %s, which isn't part of the game; keep that place first" % (ident, where))
        ch.write(content.path_of(e["kind"], ident), content_file(e["kind"], e["record"], promoted=bool(e.get("promoted"))))
        if e["kind"] == "characters":
            ch.edit(room_of(where), key="characters", add="  - %s" % ident)
        elif content.exists("rooms", where or ""):  # an item found somewhere stays there; a made one is just known
            ch.edit(room_of(where), key="items", add="  - %s" % ident)
    for k, i, rec, _ in parts[1:]:
        ch.write(content.path_of(k, i), content_file(k, rec))
    check = subprocess.run([sys.executable, str(ROOT / "rules" / "rpg.py"), "validate", "--game", game], capture_output=True, text=True)
    if check.returncode != 0:
        ch.undo()
        print(check.stdout.strip())
        fail("keeping %s would break the game, so nothing was changed" % ident)
    del data["entries"][ident]
    library.save(game, data)
    print("KEPT: %s is now part of %s:" % (e["record"]["meta"].get("name", ident), game))
    for path in ch.before:
        print("  %s %s" % ("wrote" if ch.before[path] is None else "changed", path.relative_to(ROOT)))
    print("It's authored content from now on: read it over, and mention it in its room's prose if it should be noticed.")


def show(data):
    entries = data["entries"]
    if not entries:
        print("The library is empty: nothing has been generated or made in this game yet.")
        return
    rank = lambda i: (entries[i].get("forgotten", False), not (entries[i].get("suggested") or entries[i].get("worth_keeping")), i)  # noqa: E731
    for i in sorted(entries, key=rank):
        e = entries[i]
        marks = [m for m in (
            "worth keeping: %s" % e["worth_keeping"] if e.get("worth_keeping") else "",
            "the game master suggests keeping: %s" % e["suggested"] if e.get("suggested") else "",
            "a friend, remembers: %s" % e["friend"]["line"] if e.get("friend") else "",
            "promoted" if e.get("promoted") else "",
            "forgotten" if e.get("forgotten") else "") if m]
        print("%s  %s, made by the %s, in %d run%s (last %s)" % (i, KIND_NAMES[e["kind"]], e["origin"], e.get("runs", 1),
                                                                "" if e.get("runs", 1) == 1 else "s", e.get("last_seen", "?")))
        print("    %s" % library.summary(e))
        for m in marks:
            print("    * %s" % m)


def main(argv):
    if "--game" in argv:
        i = argv.index("--game")
        game = argv[i + 1] if i + 1 < len(argv) else ""
        argv = argv[:i] + argv[i + 2:]
    else:
        game = rpg.active_game()
    if game not in content.list_games():
        fail("no game %r (games: %s)" % (game, ", ".join(content.list_games())))
    if not argv:
        print(__doc__.strip())
        return 2
    rpg.choose_game(game)
    data = library.load(game)
    cmd, args = argv[0], argv[1:]
    if cmd == "list":
        print("LIBRARY of %s: %d of %d entries" % (game, len(data["entries"]), rpg.lib_limit()))
        show(data)
        return 0
    if cmd not in ("keep", "forget", "unforget") or not args:
        fail("use: list | keep <id> | forget <id> | unforget <id>")
    if args[0] not in data["entries"]:
        fail("no entry %r in the library" % args[0])
    if cmd == "keep":
        keep(game, data, args[0])
        return 0
    data["entries"][args[0]]["forgotten"] = cmd == "forget"
    library.save(game, data)
    print("%s: %s %s" % ("FORGOTTEN" if cmd == "forget" else "UNFORGOTTEN", args[0],
                         "won't be brought back again" if cmd == "forget" else "may be brought back again"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
