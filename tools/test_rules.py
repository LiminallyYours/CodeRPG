#!/usr/bin/env python3
"""Tests for the rules engine, run against a throwaway copy of the project:  python3 tools/test_rules.py

Each test gets a fresh temp copy of rules/, games/ and proposals/ with an empty state/, and drives
rules/rpg.py as the game master would, through its command line. The real save is never touched.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAMES = sorted(p.name for p in (ROOT / "games").glob("*") if (p / "world.md").is_file())


class Engine(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp(prefix="rpg-test-"))
        for d in ("rules", "games", "proposals"):
            shutil.copytree(ROOT / d, self.dir / d, ignore=shutil.ignore_patterns("__pycache__", "*.json.tmp"))
        (self.dir / "state").mkdir()
        for stale in (self.dir / "proposals").glob("*.json"):
            stale.unlink()

    def tearDown(self):
        shutil.rmtree(self.dir)

    def rpg(self, *args, seed=None, ok=True):
        """Run one rpg.py command; by default it must succeed. Returns its output."""
        env = dict(os.environ)
        env.pop("RPG_SEED", None)
        if seed is not None:
            env["RPG_SEED"] = str(seed)
        r = subprocess.run([sys.executable, "rules/rpg.py", *args], cwd=self.dir, env=env,
                           capture_output=True, text=True, timeout=30)
        self.assertNotIn("Traceback", r.stderr, r.stderr)
        if ok is not None:
            self.assertEqual(r.returncode == 0, ok, "%s -> %d\n%s" % (" ".join(args), r.returncode, r.stdout))
        return r.stdout

    def save(self):
        return json.loads((self.dir / "state" / "save.json").read_text())

    def write(self, rel, text):
        p = self.dir / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)
        return p

    # ---------------------------------------------------------------- the kit and its games

    def test_every_game_validates(self):
        out = self.rpg("validate")
        for g in GAMES:
            self.assertIn("CONTENT OK: %s:" % g, out)

    def test_validate_catches_typos_in_a_games_json(self):
        self.write("games/%s/look.json" % GAMES[0], json.dumps({"palete": {}, "tabs": ["here", "inventory"]}))
        out = self.rpg("validate", "--game", GAMES[0], ok=False)
        self.assertIn("unknown key 'palete'", out)
        self.assertIn("unknown tab 'inventory'", out)
        self.write("games/%s/balance.json" % GAMES[0], json.dumps({"npc": {"memory_lnes": 3}}))
        self.assertIn("unknown key 'memory_lnes'", self.rpg("validate", "--game", GAMES[0], ok=False))

    def test_a_new_game_belongs_to_its_game_and_carries_its_look(self):
        for g in GAMES:
            self.rpg("game", "switch", g)
            self.rpg("newgame", seed=1)
            s = self.save()
            self.assertEqual(s["version"], 7)
            self.assertEqual(s["game"], g)
            self.assertEqual(s["view"]["game"]["id"], g)
            look = s["view"]["look"]
            for key in ("palette", "stat_labels", "stat_short", "currency", "tabs", "phrases"):
                self.assertIn(key, look)

    def test_the_station_names_its_own_stats_and_money(self):
        self.rpg("game", "switch", "flooded_station")
        out = self.rpg("newgame", seed=2)
        self.assertIn("Grit (might)", out)
        self.assertIn("Credits", out)
        self.assertEqual(self.save()["view"]["look"]["palette"]["accent"], "#4fc3c7")

    def test_a_games_balance_overrides_only_what_it_names(self):
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=3)
        moves = ["north", "south"] * 2
        outs = [self.rpg("move", d) for d in moves]
        self.assertIn("WORLD TURN DUE", outs[3])  # the station's turn_every_moves is 4, not the kit's 5
        self.assertNotIn("WORLD TURN DUE", "".join(outs[:3]))

    def test_an_old_save_is_refused_and_a_new_game_replaces_it(self):
        self.write("state/save.json", json.dumps({"version": 6, "adventure": "The Dark Lighthouse", "status": "playing"}))
        self.assertIn("older version", self.rpg("look", ok=False))
        self.assertIn("an old save", self.rpg("game", "list"))
        self.rpg("newgame", seed=4)
        self.assertEqual(self.save()["version"], 7)

    def test_switching_games_keeps_each_ones_save(self):
        first, second = GAMES[0], GAMES[1]
        self.rpg("game", "switch", first)
        self.rpg("newgame", seed=5)
        start = self.save()["location"]
        exit_dir = next(iter(self.save()["map"][start]["exits"]))
        self.rpg("move", exit_dir)
        moved_to = self.save()["location"]
        self.assertIn("No game yet", self.rpg("game", "switch", second))
        self.assertFalse((self.dir / "state" / "save.json").exists())
        self.rpg("newgame", seed=6)
        self.assertEqual(self.save()["game"], second)
        listing = self.rpg("game", "list")
        self.assertIn("* %s" % second, listing)
        self.assertIn("playing, 1 move in", listing)
        self.assertIn("The saved game continues", self.rpg("game", "switch", first))
        self.assertEqual(self.save()["location"], moved_to)
        self.assertTrue((self.dir / "state" / "shelf" / ("%s.json" % second)).is_file())
        self.assertIn("ALREADY PLAYING", self.rpg("game", "switch", first))
        self.assertIn("one of", self.rpg("game", "switch", "no_such_game", ok=False))

    def test_show_leaves_out_if_sections_that_dont_hold(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=7)
        flags = self.save()["flags"]
        craving = "craves_honey" if "craves_honey" in flags else "craves_fish"
        other = "craves_fish" if craving == "craves_honey" else "craves_honey"
        out = self.rpg("show", "characters", "grukk")
        self.assertIn("## If %s" % craving, out)
        self.assertNotIn("## If %s" % other, out)
        self.assertIn("## GM only", out)
        self.assertIn("## If %s" % other, self.rpg("show", "characters", "grukk", "--all"))
        self.assertIn("## Opening", self.rpg("show", "world"))
        self.assertIn("kind must be one of", self.rpg("show", "nonsense", "x", ok=False))

    def test_quests_finish_and_fail_by_their_flags(self):
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=8)
        self.rpg("flag", "set", "pump_running")
        quest = self.save()["view"]["quests"][0]
        self.assertTrue(quest["complete"])
        # a fresh game where the tide wins: walk back and forth until the clock runs out
        self.rpg("newgame", seed=9)
        for i in range(40):
            out = self.rpg("move", "north" if i % 2 == 0 else "south")
            if "station_lost" in out:
                break
        quest = self.save()["view"]["quests"][0]
        self.assertTrue(quest["failed"])
        self.assertIn("station_lost", self.save()["flags"])

    def test_the_same_seed_rolls_the_same_run(self):
        a = self.rpg("newgame", seed=11).splitlines()[:4]
        b = self.rpg("newgame", seed=11).splitlines()[:4]
        self.assertEqual(a, b)

    # ---------------------------------------------------------------- proposals never crash the script

    def test_malformed_proposals_are_refused_not_crashed(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=12)
        for text in ("not json", "[1, 2]", '{"id": 5}', '{"id": "ok_name", "name": "A", "tier": "laser"}',
                     '{"id": "x"}', '{"items": "lots"}'):
            p = self.write("proposals/bad.json", text)
            out = self.rpg("generate", "item", str(p.relative_to(self.dir)), ok=False)
            self.assertIn("REFUSED", out)
            self.assertFalse(p.exists(), "a refused proposal file is cleaned up")


if __name__ == "__main__":
    unittest.main(verbosity=2)
