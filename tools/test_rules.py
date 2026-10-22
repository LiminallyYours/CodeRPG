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
        for d in ("rules", "games", "proposals", "tools", ".claude/hooks"):
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

    def meter(self):
        return self.save()["view"]["meter"]["left"]

    def meter_file(self):
        return json.loads((self.dir / "state" / "meter.json").read_text())["left"]

    def set_meter(self, left):
        self.write("state/meter.json", json.dumps({"left": left}))

    def run_py(self, script, *args, stdin=""):
        r = subprocess.run([sys.executable, script, *args], cwd=self.dir, input=stdin, capture_output=True, text=True, timeout=30)
        self.assertNotIn("Traceback", r.stderr, r.stderr)
        return r

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

    def test_a_games_settings_and_balance_override_only_what_they_name(self):
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=3)
        moves = ["north", "south"] * 2
        outs = [self.rpg("move", d) for d in moves]
        self.assertIn("WORLD TURN DUE", outs[3])  # the station's settings: every 4 moves, not the preset's 5
        self.assertNotIn("WORLD TURN DUE", "".join(outs[:3]))
        s = self.save()
        self.assertEqual(s["view"]["carry_limit"], 6 + 2 * s["stats"]["might"])  # its balance.json: carry_base 6

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

    # ---------------------------------------------------------------- seeds and daily worlds (no RPG_SEED)

    def play(self, seed):
        """A fixed little session from a named seed: what it rolled and printed."""
        outs = [self.rpg("newgame", seed)]
        for d in ("north", "south", "north"):
            outs.append(self.rpg("move", d))
        outs += [self.rpg("check", "wits", "normal") for _ in range(3)]
        outs.append(self.rpg("roll", "3d6"))
        s = self.save()
        return s["run"]["rolls"], s["run"]["variants"], s["run"]["clock"], s["run"]["weather"], outs[1:]

    def test_a_named_seed_rolls_the_same_run_for_anyone(self):
        for g in GAMES:
            self.rpg("game", "switch", g)
            first, again = self.play("kestrel-0042"), self.play("kestrel-0042")
            self.assertEqual(first, again)
            self.assertNotEqual(first, self.play("kestrel-0043"))

    def test_each_roll_moves_the_stream_on(self):
        self.rpg("newgame", "moss-1")
        checks = [self.rpg("check", "wits", "normal") for _ in range(6)]
        self.assertGreater(len(set(checks)), 1, "checks in a seeded run must not repeat one result")
        self.assertGreater(self.save()["run"]["dice_n"], 6)

    def test_a_seed_belongs_to_its_game(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", "same-seed")
        lighthouse = [self.rpg("roll", "1d1000") for _ in range(3)]
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", "same-seed")
        self.assertNotEqual(lighthouse, [self.rpg("roll", "1d1000") for _ in range(3)])

    def test_daily_world_and_the_run_label(self):
        import datetime
        today = datetime.date.today().isoformat()
        out = self.rpg("newgame", "daily")
        self.assertIn("SEED: %s, today's daily world" % today, out)
        s = self.save()
        self.assertEqual(s["run"]["seed"], today)
        self.assertEqual(s["view"]["run_label"], "%s · daily world" % today)
        self.rpg("newgame", "Ember-7")
        self.assertEqual(self.save()["view"]["run_label"], "%s · seed ember-7" % today)
        self.rpg("newgame")
        self.assertRegex(self.save()["run"]["seed"], r"^[a-z]+-\d{4}$")
        self.assertIn("a seed is", self.rpg("newgame", "no spaces!", ok=False))

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


    # ---------------------------------------------------------------- the meter and the owner's switches

    def at_the_lighthouse(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=20)
        self.rpg("move", "west")  # Ysolde, an agent character, is here

    def test_every_preset_has_the_same_switches(self):
        presets = json.loads((ROOT / "rules" / "presets.json").read_text())

        def shape(d):
            return {k: shape(v) if isinstance(v, dict) and k != "characters" else type(v).__name__ for k, v in d.items()}
        self.assertEqual({"thrifty", "normal", "rich"}, set(presets))
        for name, p in presets.items():
            self.assertEqual(shape(p), shape(presets["normal"]), name)

    def test_only_extras_drain_the_meter_and_it_refills(self):
        self.at_the_lighthouse()
        self.rpg("meter", "refill")
        self.assertEqual(self.meter(), 30)
        for args in (("look",), ("move", "east"), ("move", "west"), ("check", "wits", "normal"),
                     ("npc-brief", "ysolde"), ("show", "characters", "ysolde")):
            self.rpg(*args)
        self.assertEqual(self.meter(), 30, "baseline play, authored agents included, is free")
        self.rpg("move", "east")
        self.rpg("world-brief", "room")  # generating something new: 2
        self.assertEqual(self.meter(), 28)
        self.rpg("world-brief", "turn")  # a world turn: 2
        self.assertEqual(self.meter(), 26)
        self.set_meter(3)
        self.rpg("world-brief", "room")
        self.assertEqual(self.meter(), 1)
        self.assertIn("spent until the next session", self.rpg("world-brief", "room", ok=False))
        self.assertEqual(self.meter(), 1, "a refused extra costs nothing")
        self.rpg("meter", "refill")
        self.assertEqual(self.meter(), 30)

    def test_a_spent_meter_stops_the_extras_and_play_goes_on(self):
        self.at_the_lighthouse()
        self.set_meter(0)
        look = self.rpg("look")
        self.assertIn("METER SPENT", look)
        self.assertIn("ysolde [agent]", look)  # agents are baseline: the meter never silences them
        self.assertIn("You are Ysolde", self.rpg("npc-brief", "ysolde"))
        self.rpg("move", "east")
        self.assertNotIn("may grow", self.rpg("look"))
        self.assertIn("spent", self.rpg("world-brief", "room", ok=False))
        for d in ("north", "south") * 4:  # moves still work, and no world turn falls due
            self.assertNotIn("WORLD TURN DUE", self.rpg("move", d))

    def test_the_meter_outlasts_new_games_and_switches(self):
        self.at_the_lighthouse()
        self.set_meter(12)
        self.rpg("newgame", seed=21)
        self.assertEqual(self.meter(), 12)
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=22)
        self.assertEqual(self.meter(), 12)
        self.assertIn("METER: Power 12/30", self.rpg("look"))

    def settings_tool(self, *args, ok=True):
        r = self.run_py("tools/settings.py", *args)
        self.assertEqual(r.returncode == 0, ok, r.stdout)
        return r.stdout

    def test_the_owners_switches_are_enforced_by_the_rules(self):
        self.at_the_lighthouse()
        self.settings_tool("preset", "thrifty")
        look = self.rpg("look")
        self.assertIn("ysolde [minor, agent resting]", look)
        self.assertIn("METER: Lamp oil 10/10", look)
        self.assertIn("off in this game", self.rpg("world-brief", "turn", ok=False))
        self.assertIn("can appear in this game", self.rpg("world-brief", "character", ok=False))
        self.settings_tool("preset", "normal")
        self.settings_tool("set", "npc_agents.characters.ysolde", "false")
        self.assertIn("ysolde [minor, agent resting]", self.rpg("look"))
        self.settings_tool("unset", "npc_agents.characters.ysolde")
        self.assertIn("ysolde [agent]", self.rpg("look"))
        self.settings_tool("set", "world_turns.on", "false")
        self.rpg("newgame", seed=23)
        self.assertNotIn("WORLD TURN DUE", "".join(self.rpg("move", d) for d in ("north", "south") * 3))
        self.settings_tool("reset")
        self.assertIn("NPC AGENTS: on", self.rpg("settings"))
        self.assertIn("unknown setting", self.settings_tool("set", "npc_agents.loudness", "3", ok=False))
        self.assertIn("preset <", self.settings_tool("preset", "lavish", ok=False))

    def test_the_owners_cap_on_generation_holds(self):
        self.at_the_lighthouse()
        self.settings_tool("set", "generation.max_per_run", "1")
        self.rpg("move", "east")
        self.write("proposals/a.json", json.dumps({"id": "tin_whistle", "name": "Tin Whistle", "description": "A dented whistle.", "tier": "trinket"}))
        self.rpg("generate", "item", "proposals/a.json")
        self.rpg("move", "north")
        self.write("proposals/b.json", json.dumps({"id": "bone_dice", "name": "Bone Dice", "description": "Two worn dice.", "tier": "trinket"}))
        self.assertIn("as much as it may (1)", self.rpg("generate", "item", "proposals/b.json", ok=False))

    def test_validate_catches_bad_settings(self):
        g = "games/dark_lighthouse/settings.json"
        self.write(g, json.dumps({"preset": "lavish"}))
        self.assertIn("unknown preset 'lavish'", self.rpg("validate", "--game", "dark_lighthouse", ok=False))
        self.write(g, json.dumps({"preset": "normal", "overrides": {"world_turns": {"evry_moves": 3}},
                                  "extra": 1}))
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        self.assertIn("unknown key 'evry_moves'", out)
        self.assertIn("unknown key 'extra'", out)
        self.write(g, json.dumps({"overrides": {"npc_agents": {"characters": {"pell": False, "nobody": False}}}}))
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        self.assertIn("'pell' is minor", out)
        self.assertIn("unknown character 'nobody'", out)

    def test_the_prompt_hook_reminds_without_charging_and_opening_refills(self):
        self.at_the_lighthouse()
        self.set_meter(9)
        hook = ".claude/hooks/turn_reminder.py"
        self.assertIn("gm-turn procedure", self.run_py(hook, stdin=json.dumps({"prompt": "I ask Ysolde about the lens."})).stdout)
        self.assertEqual(self.meter_file(), 9, "a turn is baseline play: free")
        hand_back = '<agent-message from="af36dd">\n[Subagent hand-back] The text below is the final report of a subagent.'
        for quiet in ("ooc: how does the meter work?", "/budget", "/newgame daily", hand_back,
                      "<task-notification>\n<task-id>b1</task-id>"):
            self.assertEqual(self.run_py(hook, stdin=json.dumps({"prompt": quiet})).stdout, "", quiet)
        self.assertEqual(self.run_py(".claude/hooks/session_start.py", stdin="{}").stdout, "")
        self.assertEqual(self.meter_file(), 30)
        self.assertEqual(self.meter(), 30)  # and the save's view shows it

    def test_the_save_carries_the_meter_and_switches_for_the_interface(self):
        self.at_the_lighthouse()
        v = self.save()["view"]
        self.assertEqual(set(v["meter"]), {"left", "capacity", "state"})
        self.assertEqual(v["settings"]["preset"], "normal")
        self.assertEqual(v["settings"]["prices"], {"generate": 2, "world_turn": 2})
        self.set_meter(9)
        self.rpg("world-brief", "turn")
        self.assertEqual(self.save()["view"]["meter"]["state"], "low")  # 7 of 30
        self.set_meter(2)
        self.rpg("world-brief", "turn")
        self.assertEqual(self.save()["view"]["meter"]["state"], "spent")


if __name__ == "__main__":
    unittest.main(verbosity=2)
