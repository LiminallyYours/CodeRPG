#!/usr/bin/env python3
"""The game owner's tool for forged worlds:  python3 tools/worlds.py <command>

    list                the worlds forged in play (state/worlds/), with what was asked for and whether
                        there's a game of each in progress
    keep <id>           make a forged world one of the kit's games: move it into games/<id>/, where git tracks it
                        and tools/check.sh checks it. If it doesn't pass the checks there, nothing changes.
    forget <id> --yes   delete a forged world for good, with its saved game and its library. Without --yes it
                        only says what would go. Not the world being played: switch away from it first.

Forged worlds are made by `/newworld` and belong to the player, not the kit; the checks leave them out. The
game master can't run this tool: it isn't in the project's allowed commands.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "rules"))
import content  # noqa: E402
import library  # noqa: E402
import rpg  # noqa: E402


def fail(msg):
    print("worlds: %s" % msg)
    sys.exit(1)


def forged():
    return [g for g in content.list_games() if content.is_forged(g)]


def save_of(ident):
    """Where the world's saved game is, if it has one: the save being played, or one waiting on the shelf."""
    active = rpg.read_json(rpg.SAVE)
    if isinstance(active, dict) and active.get("game") == ident:
        return rpg.SAVE
    return rpg.shelved(ident) if rpg.shelved(ident).is_file() else None


def show():
    worlds = forged()
    if not worlds:
        print("No forged worlds yet. The player makes them with /newworld.")
        return
    for g in worlds:
        info = rpg.read_json(content.WORLDS / g / "forged.json") or {}
        save = save_of(g)
        print("%s: %s, forged %s from %s; %s" % (
            g, info.get("title") or rpg.title_of(g), info.get("forged", "?"),
            '"%s"' % info["sentence"] if info.get("sentence") else "no request (a surprise)",
            "no game yet" if not save else rpg.save_summary(rpg.read_json(save)) + (" (being played)" if save == rpg.SAVE else "")))


def keep(ident):
    src, dst = content.WORLDS / ident, content.GAMES / ident
    if dst.exists():
        fail("games/%s already exists" % ident)
    shutil.move(str(src), str(dst))
    r = subprocess.run([sys.executable, str(ROOT / "rules" / "rpg.py"), "validate", "--game", ident], cwd=ROOT,
                       capture_output=True, text=True)
    if r.returncode != 0:
        shutil.move(str(dst), str(src))
        fail("%s doesn't pass the kit's checks, so it stays a forged world:\n%s" % (ident, (r.stdout + r.stderr).strip()))
    print("KEPT: %s is now one of the kit's games, in games/%s/ (git doesn't track it until you commit it)." % (ident, ident))


def forget(ident, sure):
    if save_of(ident) == rpg.SAVE:
        fail("%s is the world being played; switch to another game first (/game <id>)" % ident)
    doomed = [content.WORLDS / ident, rpg.shelved(ident), library.path(ident)]
    doomed = [p for p in doomed if p.exists()]
    if not sure:
        print("Would delete, for good: %s. Run again with --yes to do it." % ", ".join(str(p.relative_to(ROOT)) for p in doomed))
        return
    for p in doomed:
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    active = rpg.read_json(rpg.ACTIVE)
    if isinstance(active, dict) and active.get("game") == ident:
        rpg.ACTIVE.unlink()
    print("FORGOTTEN: %s is gone." % ident)


def main(argv):
    if not argv:
        print(__doc__.strip())
        return 2
    cmd, args = argv[0], argv[1:]
    if cmd == "list":
        show()
        return 0
    if cmd not in ("keep", "forget") or not args:
        fail("use: list | keep <id> | forget <id> --yes")
    if args[0] not in forged():
        fail("no forged world %r (forged: %s)" % (args[0], ", ".join(forged()) or "none"))
    if cmd == "keep":
        keep(args[0])
    else:
        forget(args[0], "--yes" in args)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
