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
        for d in ("rules", "games", "proposals", "tools", ".claude/hooks", "mod/sounds"):
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
            self.assertEqual(s["version"], 8)
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
        self.assertEqual(self.save()["version"], 8)

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
        self.assertEqual(v["settings"]["prices"], {"generate": 2, "world_turn": 2, "craft": 2, "build": 3, "reuse": 1, "promote": 2})
        self.set_meter(9)
        self.rpg("world-brief", "turn")
        self.assertEqual(self.save()["view"]["meter"]["state"], "low")  # 7 of 30
        self.set_meter(2)
        self.rpg("world-brief", "turn")
        self.assertEqual(self.save()["view"]["meter"]["state"], "spent")


    # ---------------------------------------------------------------- Stage 3: what the look needs from content

    def test_terrain_and_cards_reach_the_view(self):
        self.at_the_lighthouse()
        s = self.save()
        self.assertEqual(s["map"]["lighthouse"]["terrain"], "stone")
        self.assertEqual(s["map"]["harbor_square"]["terrain"], "water")
        ysolde = next(c for c in s["view"]["characters_here"] if c["id"] == "ysolde")
        self.assertRegex(ysolde["card"], r"^#[0-9a-f]{6}$")
        look = s["view"]["look"]
        for key in ("terrain", "sounds"):
            self.assertIn(key, look)
        self.assertIn("phases", look["phrases"])
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=30)
        look = self.save()["view"]["look"]
        self.assertIn("metal", look["terrain"])  # a game adds its own terrain kinds
        self.assertEqual(look["sounds"]["step"], "splash")

    def test_validate_checks_terrain_cards_sounds_and_times(self):
        g = "games/dark_lighthouse"
        room = self.dir / g / "rooms" / "coast_road.md"
        room.write_text(room.read_text().replace("terrain: grass", "terrain: lava"))
        ch = self.dir / g / "characters" / "pell.md"
        ch.write_text(ch.read_text().replace("card: #d19a5a", "card: not a color!"))
        look = json.loads((self.dir / g / "look.json").read_text())
        look["sounds"] = {"step": "kazoo"}
        look["palette"]["accent_by_time"]["teatime"] = "#123456"
        self.write(g + "/look.json", json.dumps(look))
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        self.assertIn("terrain 'lava' isn't in the look's terrain", out)
        self.assertIn("characters/pell.md: card must be a color", out)
        self.assertIn("no kit sound 'kazoo'", out)
        self.assertIn("'teatime' is not one of world.md's times", out)

    def test_a_generated_room_takes_a_terrain(self):
        self.at_the_lighthouse()
        self.rpg("move", "east")  # Harbor Square, water, may grow south
        room = {"id": "mooring_steps", "name": "The Mooring Steps", "direction": "south", "description": "Slick stone steps."}
        self.write("proposals/r.json", json.dumps(room))
        self.rpg("generate", "room", "proposals/r.json")
        self.rpg("move", "south")
        self.assertEqual(self.save()["map"]["mooring_steps"]["terrain"], "water")  # the room it opens off
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=31)
        self.rpg("move", "north")
        self.rpg("move", "west")  # the Lab Wing may grow north
        bad = {"id": "specimen_store", "name": "Specimen Store", "direction": "north", "terrain": "lava", "description": "Shelves of jars."}
        self.write("proposals/s.json", json.dumps(bad))
        self.assertIn("terrain must be one of", self.rpg("generate", "room", "proposals/s.json", ok=False))
        good = dict(bad, terrain="metal")
        self.write("proposals/s.json", json.dumps(good))
        self.rpg("generate", "room", "proposals/s.json")
        self.rpg("move", "north")
        self.assertEqual(self.save()["map"]["specimen_store"]["terrain"], "metal")
        self.assertEqual(self.save()["map"]["specimen_store"]["made_by"], "world")


    # ---------------------------------------------------------------- Stage 4: curses

    def test_curse_examples_hold_and_the_mod_has_the_same_ones(self):
        sys.path.insert(0, str(ROOT / "rules"))
        import curse
        vectors = json.loads((ROOT / "rules" / "curse_vectors.json").read_text())
        for v in vectors:
            self.assertEqual(curse.apply(v["effect"], v["input"]), v["output"], v)
        mod_copy = (ROOT / "mod" / "tests" / "curse_vectors.ts").read_text().split("=", 1)[1]
        self.assertEqual(json.loads(mod_copy), vectors, "mod/tests/curse_vectors.ts must match rules/curse_vectors.json")
        for bad in ("sing", "word_limit 0", "suffix over", ""):
            self.assertRaises(ValueError, curse.parse, bad)

    def test_a_curse_takes_hold_by_its_flag_and_its_cure_lifts_it(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=40)
        self.assertEqual(json.loads(self.rpg("curse-text", "go north"))["text"], "go north")
        self.rpg("flag", "set", "mirror_cursed")
        look = self.rpg("look")
        self.assertIn("CURSE: The Backwards Tongue", look)
        self.assertIn("in reverse word order", look)
        self.assertEqual(self.save()["view"]["curses"], [{"id": "backwards_tongue", "name": "The Backwards Tongue", "effect": "reverse_words"}])
        out = json.loads(self.rpg("curse-text", "I ask Pell for help"))
        self.assertEqual(out, {"curses": ["The Backwards Tongue"], "text": "help for Pell ask I"})
        self.rpg("flag", "set", "tongue_salted")
        self.assertNotIn("CURSE:", self.rpg("look"))
        self.assertEqual(self.save()["view"]["curses"], [])
        self.rpg("flag", "unset", "tongue_salted")
        self.assertIn("CURSE:", self.rpg("look"))
        self.rpg("newgame", seed=41)  # no curse survives a new game
        self.assertEqual(self.save()["view"]["curses"], [])

    def test_the_prompt_hook_tells_the_game_master_how_cursed_words_came_out(self):
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=42)
        hook = ".claude/hooks/turn_reminder.py"
        plain = self.run_py(hook, stdin=json.dumps({"prompt": "Where is the fuse?"})).stdout
        self.assertNotIn("came out as", plain)
        self.rpg("flag", "set", "radio_habit")
        out = self.run_py(hook, stdin=json.dumps({"prompt": "Where is the fuse?"})).stdout
        self.assertIn("under Radio Habit", out)
        self.assertIn("came out as: \u00abWhere is the fuse? …over.\u00bb", out)
        self.assertIn("What they meant: \u00abWhere is the fuse?\u00bb", out)
        self.assertEqual(self.run_py(hook, stdin=json.dumps({"prompt": "ooc: is the curse working?"})).stdout, "")

    def test_validate_insists_every_curse_has_a_cause_and_a_reachable_cure(self):
        d = "games/dark_lighthouse/curses/"
        self.write(d + "hiccups.md", "---\nname: Hiccups\neffect: sing loudly\ncaused_by: mirror_cursed\n---\nHic.\n")
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        self.assertIn("effect must be", out)
        self.assertIn("needs cured_by", out)
        self.write(d + "hiccups.md", "---\nname: Hiccups\neffect: word_limit 2\ncaused_by: mirror_cursed\ncured_by: hiccups_gone\n---\nHic.\n")
        self.assertIn("nothing in the game sets 'hiccups_gone'", self.rpg("validate", "--game", "dark_lighthouse", ok=False))
        self.write(d + "hiccups.md", "---\nname: Hiccups\neffect: word_limit 2\ncaused_by: mirror_cursed\ncured_by: has_no_such_thing\n---\nHic.\n")
        self.assertIn("unknown item 'no_such_thing'", self.rpg("validate", "--game", "dark_lighthouse", ok=False))


    # ---------------------------------------------------------------- Stage 5: the player leaves a mark

    def order(self, maker, proposal, ok=True):
        self.rpg("world-brief", "craft", maker)
        self.write("proposals/c.json", json.dumps(proposal))
        return self.rpg("generate", "craft", "proposals/c.json", ok=ok)

    def test_a_maker_takes_an_order_and_paying_makes_it_the_players(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=40)
        look = self.rpg("look")
        self.assertIn("MAKERS HERE: morwen makes trinket, light weapon", look)
        hook = {"id": "gaff_hook", "name": "Gaff Hook", "description": "A barbed hook on a short ash haft.", "tier": "weapon"}
        out = self.order("morwen", hook, ok=False)
        self.assertIn("tier must be one of trinket, light_weapon", out)  # outside her trade
        self.assertEqual(self.meter(), 28)  # the brief was paid for once
        self.write("proposals/c.json", json.dumps(dict(hook, tier="light_weapon")))
        out = self.rpg("generate", "craft", "proposals/c.json")  # the retry needs no new brief
        self.assertIn("COMMISSIONED: Gaff Hook (gaff_hook), light weapon, from Morwen", out)
        self.assertIn("PRICE: 3 coins, or in trade: smoked_fish", out)
        self.assertNotIn("gaff_hook", self.save()["inventory"])  # not theirs until paid
        self.assertIn("ORDERS WAITING: gaff_hook", self.rpg("look"))
        self.write("proposals/c.json", json.dumps(dict(hook, id="other_hook", name="Other Hook", tier="trinket")))
        self.assertIn("no order is open", self.rpg("generate", "craft", "proposals/c.json", ok=False))  # one brief, one order
        self.assertIn("COINS -3 -> 0", self.rpg("pay", "gaff_hook"))
        s = self.save()
        self.assertIn("gaff_hook", s["inventory"])
        self.assertTrue(next(i for i in s["view"]["items"] if i["id"] == "gaff_hook")["own"])
        self.assertEqual(s["run"]["generated"], 0)  # orders don't use up the world's own allowance
        self.assertEqual(self.rpg("show", "items", "gaff_hook").count("made_by: player"), 1)
        self.assertIn("damage: 1d4", self.rpg("show", "items", "gaff_hook"))  # stats from the tier
        self.assertIn("no unpaid order", self.rpg("pay", "gaff_hook", ok=False))

    def test_a_maker_can_turn_an_order_down_and_takes_trade_in_kind(self):
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=41)
        self.rpg("move", "north")  # the Common Deck: Bucket
        out = self.order("bucket", {"refuse": "Pump: NOT MY DEPARTMENT"}, ok=False)
        self.assertIn("Bucket turns the order down: Pump: NOT MY DEPARTMENT", out)
        self.assertIsNone(self.save()["run"]["ordering"])
        self.order("bucket", {"id": "scrap_whistle", "name": "Scrap Whistle", "description": "A whistle filed from conduit.", "tier": "trinket"})
        self.assertIn("takes no diving_knife", self.rpg("pay", "scrap_whistle", "diving_knife", ok=False))
        self.assertIn("not carrying sardine_tin", self.rpg("pay", "scrap_whistle", "sardine_tin", ok=False))
        self.rpg("gain", "sardine_tin")
        coins = self.save()["stats"]["coins"]
        self.rpg("move", "south")
        self.assertIn("isn't here", self.rpg("pay", "scrap_whistle", "sardine_tin", ok=False))
        self.rpg("move", "north")
        self.assertIn("PAID WITH: sardine_tin", self.rpg("pay", "scrap_whistle", "sardine_tin"))
        s = self.save()
        self.assertEqual(s["stats"]["coins"], coins)
        self.assertNotIn("sardine_tin", s["inventory"])
        self.assertIn("scrap_whistle", s["inventory"])

    def test_the_owners_crafting_switch_and_limit_hold(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=42)
        self.settings_tool("set", "crafting.on", "false")
        self.assertNotIn("MAKERS HERE", self.rpg("look"))
        self.assertIn("no makers take orders", self.rpg("world-brief", "craft", "morwen", ok=False))
        self.assertEqual(self.meter(), 30)
        self.settings_tool("set", "crafting.on", "true")
        self.settings_tool("set", "crafting.max_per_run", "1")
        self.order("morwen", {"id": "cork_float", "name": "Cork Float", "description": "A painted cork float.", "tier": "trinket"})
        self.assertNotIn("MAKERS HERE", self.rpg("look"))
        self.assertIn("as much work as they will", self.rpg("world-brief", "craft", "morwen", ok=False))
        self.assertIn("CRAFTING: on, at most 1 orders per run", self.rpg("settings"))
        self.assertIn("isn't here to take an order", self.rpg("world-brief", "craft", "pell", ok=False))

    def test_a_version_7_save_gains_orders_on_load(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=43)
        s = self.save()
        s["version"] = 7
        del s["run"]["commissions"], s["run"]["ordering"]
        self.write("state/save.json", json.dumps(s))
        self.assertIn("MAKERS HERE", self.rpg("look"))
        self.rpg("note", "The crate Morwen sits on is stamped HARKER.")
        s = self.save()
        self.assertEqual(s["version"], 8)
        self.assertEqual(s["run"]["commissions"], {})

    def test_validate_checks_makers(self):
        d = "games/dark_lighthouse/characters/morwen.md"
        text = (self.dir / d).read_text()
        self.write(d, text.replace("  - light_weapon", "  - harpoon").replace("  - smoked_fish", "  - kipper"))
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        self.assertIn("makes 'harpoon', which isn't an item tier", out)
        self.assertIn("unknown item 'kipper'", out)
        kit = json.loads((self.dir / "rules/balance.json").read_text())
        del kit["generation"]["craft_price"]["tonic"]
        self.write("rules/balance.json", json.dumps(kit))
        self.write(d, text)
        self.assertIn("no price for the item tier 'tonic'", self.rpg("validate", "--game", "dark_lighthouse", ok=False))


    def test_a_builder_builds_where_they_stand_and_it_takes_a_few_moves(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=50)
        look = self.rpg("look")
        self.assertIn("BUILD SPOTS HERE: southwest: the bare stone footing", look)
        self.assertIn("may grow: south ", look)  # the quay steps; the footing is kept for the player
        self.rpg("world-brief", "build", "morwen")
        self.assertEqual(self.meter(), 27)
        loft = {"id": "net_loft", "name": "The Net-Loft", "direction": "south", "description": "A tarred loft."}
        self.write("proposals/b.json", json.dumps(loft))
        self.assertIn("it can only go southwest", self.rpg("generate", "build", "proposals/b.json", ok=False))
        self.write("proposals/b.json", json.dumps(dict(loft, direction="southwest", items=[{"id": "a_net"}])))
        self.assertIn("starts empty", self.rpg("generate", "build", "proposals/b.json", ok=False))
        self.write("proposals/b.json", json.dumps(dict(loft, direction="southwest")))
        out = self.rpg("generate", "build", "proposals/b.json")
        self.assertIn("COMMISSIONED: The Net-Loft (net_loft), to be built southwest of here by Morwen", out)
        self.assertIn("PRICE: 5 coins.", out)
        self.assertIn("not enough coins", self.rpg("pay", "net_loft", ok=False))
        self.rpg("coins", "+5")
        self.assertIn("builds for coins only", self.rpg("pay", "net_loft", "worn_dagger", ok=False))
        self.assertIn("ready in 3 moves", self.rpg("pay", "net_loft"))
        look = self.rpg("look")
        self.assertIn("BEING BUILT: net_loft (The Net-Loft), southwest of harbor_square: ready in 3 moves", look)
        self.assertNotIn("BUILD SPOTS HERE", look)  # the spot is taken
        self.assertNotIn("net_loft", self.save()["run"]["rooms"])  # it doesn't exist yet
        outs = [self.rpg("move", d) for d in ("north", "south", "north")]
        self.assertNotIn("is finished", outs[0] + outs[1])
        self.assertIn("BUILT: The Net-Loft (net_loft) is finished, southwest of Harbor Square, built for the player by Morwen", outs[2])
        self.assertIn("exit southwest -> The Net-Loft", self.rpg("move", "south"))
        self.rpg("move", "southwest")
        s = self.save()
        self.assertEqual(s["map"]["net_loft"]["made_by"], "player")
        self.assertEqual(s["run"]["generated"], 0)
        self.assertTrue(any("The Net-Loft is finished" in r for r in s["run"]["rumors"]))  # people hear of it
        self.assertNotIn("BUILD SPOTS", self.rpg("look"))  # a built place offers no build spots of its own

    def test_the_world_grows_anywhere_free_but_not_too_deep(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=51)
        self.rpg("move", "west")  # the Lighthouse lists no expand: so any free cardinal way
        self.assertIn("may grow: north, west ", self.rpg("look"))  # south is the footing's square, kept for building
        for n, d in enumerate(("north", "north")):
            room = {"id": "cliff_path_%d" % n, "name": "Cliff Path %d" % n, "direction": d, "description": "A narrow path."}
            self.write("proposals/r.json", json.dumps(room))
            self.rpg("world-brief", "room")
            self.rpg("generate", "room", "proposals/r.json")
            self.rpg("move", d)
        self.assertEqual(self.save()["run"]["rooms"]["cliff_path_1"]["meta"]["depth"], 2)
        self.assertNotIn("may grow", self.rpg("look"))  # max_depth 2
        self.rpg("move", "south")
        self.assertIn("may grow: west ", self.rpg("look"))  # a generated room grows on: not back south, nor east onto the Gull
        w = self.dir / "games/dark_lighthouse/world.md"
        w.write_text(w.read_text().replace("rooms: anywhere", "rooms: yes"))
        self.assertNotIn("may grow", self.rpg("look"))  # marked: only authored rooms' expand: directions

    def test_validate_checks_build_spots(self):
        d = "games/dark_lighthouse/rooms/harbor_square.md"
        text = (self.dir / d).read_text()
        self.write(d, text.replace("  southwest: the bare", "  north: the bare"))
        self.assertIn("build direction 'north' is already an exit", self.rpg("validate", "--game", "dark_lighthouse", ok=False))
        road = "games/dark_lighthouse/rooms/coast_road.md"
        self.write(road, (self.dir / road).read_text().replace("expand: north\n", "expand: north\nbuild:\n  northwest: a lean-to\n"))
        self.write(d, text)
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        self.assertIn("coast_road.md: build direction 'northwest' would land on another room's map square", out)  # the Gull's
        self.assertIn("coast_road.md: has build spots but no builder", out)
        self.write(d, text.replace("  - morwen\n", ""))
        self.assertIn("has build spots but no builder", self.rpg("validate", "--game", "dark_lighthouse", ok=False))


    # ---------------------------------------------------------------- 5.3 the library

    def library(self, game="dark_lighthouse"):
        return json.loads((self.dir / "state" / "library" / ("%s.json" % game)).read_text())["entries"]

    def tamsin(self):
        """Generate Old Tamsin (with wares) and her side quest, and finish it."""
        self.write("proposals/c.json", json.dumps({
            "id": "old_tamsin", "name": "Old Tamsin", "role": "a fishwife mending creels", "personality": "Sharp and kind.",
            "speech": "Clipped.", "knows": ["The light has been out three nights."], "wants": "Her creels mended.",
            "trades": [{"item": {"id": "creel_charm", "name": "Creel Charm", "description": "A knot of red wool.", "tier": "trinket"}, "price": 2}],
            "tier": "weak"}))
        self.rpg("generate", "character", "proposals/c.json")
        self.write("proposals/q.json", json.dumps({
            "id": "tamsins_creels", "name": "Tamsin's Creels", "giver": "old_tamsin", "summary": "Fetch twine.",
            "objectives": [{"text": "Bring her twine", "done_when": "side_tamsins_creels_done"}], "reward": {"coins": 1, "item": None}}))
        self.rpg("generate", "quest", "proposals/q.json")

    def test_a_befriended_person_comes_back_in_the_next_game_remembering_one_line(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=60)
        self.tamsin()
        lib = self.library()
        self.assertEqual(sorted(lib), ["old_tamsin"])  # one entry; her wares ride with her; side quests aren't kept
        self.assertEqual([b["id"] for b in lib["old_tamsin"]["bundle"]], ["creel_charm"])
        self.assertIsNone(lib["old_tamsin"]["friend"])
        self.rpg("remember", "old_tamsin", "Brought twine for my creels without being asked twice.")
        self.rpg("flag", "set", "side_tamsins_creels_done")
        self.assertEqual(self.library()["old_tamsin"]["friend"]["line"], "Brought twine for my creels without being asked twice.")
        out = self.rpg("newgame", seed=61)
        self.assertIn("FROM EARLIER RUNS (they're part of this world now): Old Tamsin (a friend, at harbor_square", out)
        self.assertIn("old_tamsin [minor, generated]", out)
        s = self.save()
        self.assertEqual(s["npc_memory"]["old_tamsin"], ["Brought twine for my creels without being asked twice."])
        self.assertIn("creel_charm", s["run"]["items"])  # her wares
        self.assertNotIn("tamsins_creels", s["run"]["quests"])  # the quest was that run's
        self.assertEqual(s["run"]["generated"], 0)  # what comes back doesn't use up this run's allowance
        self.assertNotIn("side_tamsins_creels_done", s["flags"])

    def test_the_world_brings_back_a_library_entry_for_less(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=62)
        self.rpg("world-brief", "extra")
        self.write("proposals/e.json", json.dumps({"id": "jory_dockhand", "name": "Jory", "role": "a young dockhand", "look": "Freckled.",
                                                  "speech": "Fast.", "knows": ["The boats are late."]}))
        self.rpg("generate", "extra", "proposals/e.json")
        self.rpg("newgame", seed=63)
        self.rpg("meter", "refill")
        self.assertNotIn("jory", self.rpg("world-brief", "character"))  # an extra isn't offered as a character
        brief = self.rpg("world-brief", "extra")
        self.assertIn("- jory_dockhand: Jory (a young dockhand): Freckled", brief)
        self.assertIn('{"reuse": "<id from that list>"}', brief)
        self.assertEqual(self.meter(), 26)
        self.write("proposals/e.json", json.dumps({"reuse": "jory_dockhand"}))
        out = self.rpg("generate", "extra", "proposals/e.json")
        self.assertIn("brought back from an earlier run", out)
        self.assertEqual(self.meter_file(), 27)  # 2 for the brief, 1 back: reuse costs 1
        self.assertEqual(self.library()["jory_dockhand"]["runs"], 2)
        self.rpg("newgame", seed=69)
        self.write("proposals/e.json", json.dumps({"reuse": "jory_dockhand"}))
        self.rpg("generate", "extra", "proposals/e.json")  # without a brief, reuse costs its own price
        self.assertEqual(self.meter_file(), 26)
        self.rpg("newgame", seed=64)
        self.assertIn("FORGOTTEN", self.run_py("tools/library.py", "forget", "jory_dockhand").stdout)
        self.assertNotIn("jory", self.rpg("world-brief", "extra"))
        self.write("proposals/e.json", json.dumps({"reuse": "jory_dockhand"}))
        self.assertIn("isn't in the library", self.rpg("generate", "extra", "proposals/e.json", ok=False))

    def test_a_place_the_player_built_stands_in_the_next_game(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=65)
        self.rpg("world-brief", "build", "morwen")
        self.write("proposals/b.json", json.dumps({"id": "net_loft", "name": "The Net-Loft", "direction": "southwest", "description": "A tarred loft."}))
        self.rpg("generate", "build", "proposals/b.json")
        self.rpg("coins", "+5")
        self.rpg("pay", "net_loft")
        for d in ("north", "south", "north", "south"):
            self.rpg("move", d)
        self.assertEqual(self.library()["net_loft"]["worth_keeping"], "built by the player")
        out = self.rpg("newgame", seed=66)
        self.assertIn("The Net-Loft (the player's, southwest of Harbor Square)", out)
        self.assertIn("exit southwest -> The Net-Loft", out)
        self.assertNotIn("BUILD SPOTS HERE", out)
        self.rpg("move", "southwest")
        self.assertEqual(self.save()["map"]["net_loft"]["made_by"], "player")

    def test_the_owner_keeps_an_entry_for_good_and_a_bad_keep_changes_nothing(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=67)
        self.write("proposals/r.json", json.dumps({"id": "mooring_steps", "name": "The Mooring Steps", "direction": "south",
                                                  "description": "Slick stone steps.", "items": [{"id": "boat_hook", "name": "Boat Hook",
                                                  "description": "A long hook.", "tier": "weapon"}]}))
        self.rpg("generate", "room", "proposals/r.json")
        self.rpg("library", "suggest", "mooring_steps", "The player keeps coming back to fish here.")
        listing = self.run_py("tools/library.py", "list").stdout
        self.assertIn("the game master suggests keeping: The player keeps coming back to fish here.", listing)
        lib_file = self.dir / "state/library/dark_lighthouse.json"
        good = lib_file.read_text()
        bad = json.loads(good)
        bad["entries"]["mooring_steps"]["bundle"][0]["record"]["meta"]["damage"] = "lots"
        lib_file.write_text(json.dumps(bad))
        square = (self.dir / "games/dark_lighthouse/rooms/harbor_square.md").read_text()
        r = self.run_py("tools/library.py", "keep", "mooring_steps")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("nothing was changed", r.stdout)
        self.assertEqual((self.dir / "games/dark_lighthouse/rooms/harbor_square.md").read_text(), square)
        self.assertFalse((self.dir / "games/dark_lighthouse/rooms/mooring_steps.md").exists())
        lib_file.write_text(good)
        r = self.run_py("tools/library.py", "keep", "mooring_steps")
        self.assertEqual(r.returncode, 0, r.stdout)
        square = (self.dir / "games/dark_lighthouse/rooms/harbor_square.md").read_text()
        self.assertIn("  south: mooring_steps", square)
        self.assertIn("expand: no\n", square)  # its only expand: direction is an exit now
        room = (self.dir / "games/dark_lighthouse/rooms/mooring_steps.md").read_text()
        self.assertIn("exits:\n  north: harbor_square", room)
        self.assertIn("items:\n  - boat_hook", room)
        self.assertNotIn("generated", room)
        self.assertIn("damage: 1d6", (self.dir / "games/dark_lighthouse/items/boat_hook.md").read_text())
        self.assertNotIn("mooring_steps", self.library())
        self.assertIn("CONTENT OK: dark_lighthouse", self.rpg("validate"))

    def test_the_library_keeps_to_its_size(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.write("games/dark_lighthouse/balance.json", json.dumps({"library": {"max_entries": 2}}))
        self.rpg("newgame", seed=68)
        for n, ways in enumerate(((), ("north",), ("south", "east"))):  # one find each in three rooms
            for d in ways:
                self.rpg("move", d)
            self.write("proposals/i.json", json.dumps({"id": "shell_%d" % n, "name": "Shell %d" % n, "description": "A shell.", "tier": "trinket"}))
            self.rpg("generate", "item", "proposals/i.json")
        self.assertEqual(sorted(self.library()), ["shell_1", "shell_2"])  # the oldest went


    # ---------------------------------------------------------------- 5.4 promotion

    def hob(self):
        """Old Hob, a generated extra in the Gull."""
        self.rpg("move", "north")
        self.write("proposals/e.json", json.dumps({"id": "hob_netman", "name": "Old Hob", "role": "an old fisherman",
                                                  "look": "White beard.", "speech": "Slow.", "knows": ["He fished fifty years."]}))
        self.rpg("generate", "extra", "proposals/e.json")

    def test_a_generated_person_the_player_keeps_coming_back_to_gets_their_own_agent(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=70)
        self.hob()
        out = self.rpg("talk", "hob_netman")
        self.assertIn("TALK: voice Old Hob yourself, from this (conversation 1):", out)
        self.assertIn("## How they speak", out)
        self.assertIn("conversation 1", self.rpg("talk", "hob_netman"))  # the same scene counts once
        self.assertIn("authored", self.rpg("talk", "pell", ok=False))
        for d in ("south", "north"):
            self.rpg("move", d)
        self.assertIn("conversation 2", self.rpg("talk", "hob_netman"))
        self.rpg("remember", "hob_netman", "Sat with me by the fire three nights running.")
        for d in ("south", "north"):
            self.rpg("move", d)
        meter = self.meter()
        out = self.rpg("talk", "hob_netman")
        self.assertIn("PROMOTED: Old Hob now speaks through their own agent", out)
        self.assertEqual(self.meter(), meter - 2)
        self.assertIn("hob_netman [agent, generated]", self.rpg("look"))
        brief = self.rpg("npc-brief", "hob_netman")
        self.assertIn("You are Old Hob, an old fisherman.", brief)
        self.assertIn("- Sat with me by the fire three nights running.", brief)
        self.assertNotIn("GM only", brief)
        self.assertIn("own agent", self.rpg("talk", "hob_netman"))
        person = next(p for p in self.save()["view"]["people"] if p["id"] == "hob_netman")
        self.assertTrue(person["promoted"])
        e = self.library()["hob_netman"]
        self.assertTrue(e["promoted"])
        self.assertEqual(e["friend"]["line"], "Sat with me by the fire three nights running.")
        out = self.rpg("newgame", seed=71)
        self.assertIn("Old Hob (a friend, at gull_tavern", out)
        self.rpg("move", "north")
        self.assertIn("hob_netman [agent, generated]", self.rpg("look"))  # still their own voice

    def test_the_owner_decides_whether_and_when_people_are_promoted(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.settings_tool("preset", "thrifty")
        self.rpg("newgame", seed=72)
        self.hob()
        for _ in range(4):
            self.assertIn("TALK: voice Old Hob yourself", self.rpg("talk", "hob_netman"))
            self.rpg("move", "south")
            self.rpg("move", "north")
        self.settings_tool("preset", "normal")
        self.settings_tool("set", "promotion.after_conversations", "1")
        self.settings_tool("set", "promotion.max_per_run", "0")
        self.assertIn("TALK: voice Old Hob yourself", self.rpg("talk", "hob_netman"))
        self.settings_tool("set", "promotion.max_per_run", "1")
        self.settings_tool("set", "npc_agents.on", "false")
        self.assertIn("TALK: voice Old Hob yourself", self.rpg("talk", "hob_netman"))  # no agents: no promotion
        self.settings_tool("set", "npc_agents.on", "true")
        self.assertIn("PROMOTED", self.rpg("talk", "hob_netman"))
        self.assertIn("PROMOTION: on, at most 1 per run, after 1 conversations", self.rpg("settings"))

    # ---------------------------------------------------------------- Stage 7: people with plans

    def world_turn(self, proposal, ok=True):
        self.write("proposals/wt.json", json.dumps(proposal))
        return self.rpg("world-turn", "proposals/wt.json", ok=ok)

    def test_people_with_plans_act_off_screen_and_the_player_hears_only_whats_near(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.rpg("newgame", seed=80)
        self.rpg("move", "east")  # the Coast Road, next to the bridge, far from the lighthouse
        brief = self.rpg("world-brief", "turn")
        self.assertIn("grukk (Grukk), now at Greywater Bridge: forage", brief)
        self.assertIn("ysolde (Ysolde), now at The Lighthouse: to_quay", brief)
        self.assertIn('"plans": [{"who"', brief)
        out = self.world_turn({"plans": [{"who": "grukk", "step": "forage"}, {"who": "ysolde", "step": "sleep"}]})
        self.assertIn("SIGNAL", out)
        self.assertIn("Heavy bare feet thud", out)
        self.assertIn("NOW HERE: Grukk", out)
        self.assertNotIn("snoring", out, "the lighthouse is out of earshot")
        s = self.save()
        self.assertIn("grukk [agent]", self.rpg("look"))
        self.assertEqual([x["text"][:16] for x in s["view"]["signals"]], ["Heavy bare feet "])
        self.assertIn("They say Ysolde finally slept, barred in her tower like a hermit.", s["run"]["rumors"])
        self.assertIn("lighthouse [BLOCKED: needs not ysolde_asleep]", self.rpg("move", "west").replace("The Lighthouse", "lighthouse"))
        self.assertNotIn("Plan:", self.rpg("show", "characters", "ysolde"))
        self.assertIn("Plan: sleep", self.rpg("show", "characters", "ysolde", "--all"))
        # only open steps, one each, and nobody the player is with
        self.assertIn("listed as open", self.world_turn({"plans": [{"who": "ysolde", "step": "to_quay"}]}, ok=False))
        self.assertIn("at most one", self.world_turn({"plans": [{"who": "ysolde", "step": "wake"}] * 2}, ok=False))
        self.assertIn("listed as open", self.world_turn({"plans": [{"who": "morwen", "step": "x"}]}, ok=False))
        self.assertIn("must be a list", self.world_turn({"plans": "wake"}, ok=False))
        self.rpg("flag", "unset", "ysolde_asleep")  # the player hammers on the door
        self.rpg("move", "west")
        self.assertNotIn("ysolde (Ysolde), now at", self.rpg("world-brief", "turn"), "someone the player is with never acts")
        self.assertIn("listed as open", self.world_turn({"plans": [{"who": "ysolde", "step": "to_quay"}]}, ok=False))

    def test_a_plan_moves_someone_and_the_rooms_follow(self):
        self.rpg("game", "switch", "flooded_station")
        self.rpg("newgame", seed=81)
        self.rpg("move", "north")  # the Common Deck, with Bucket
        self.assertIn("bucket [agent]", self.rpg("look"))
        self.rpg("move", "south")
        self.rpg("world-brief", "turn")
        out = self.world_turn({"plans": [{"who": "bucket", "step": "mop_upstairs"}, {"who": "halloran", "step": "check_tanks"}]})
        self.assertIn("OFF-SCREEN", out)  # the landing is two rooms away from both
        self.rpg("move", "north")
        self.assertIn("CHARACTERS HERE: none", self.rpg("look"))
        self.assertIn("cargo hoist's cage is up", self.rpg("show", "rooms", "common_deck"))
        look = self.rpg("move", "west")
        self.assertIn("halloran [agent]", look)
        self.rpg("move", "east")
        look = self.rpg("move", "up")
        self.assertIn("bucket [agent]", look)
        self.assertNotIn("halloran", look.split("CHARACTERS HERE:")[1].split("\n")[0])

    def test_the_owner_can_keep_people_from_following_plans(self):
        self.rpg("game", "switch", "dark_lighthouse")
        self.settings_tool("set", "world_turns.plans", "false")
        self.rpg("newgame", seed=82)
        self.assertNotIn("People with plans", self.rpg("world-brief", "turn"))
        self.assertIn("nobody has one now", self.world_turn({"plans": [{"who": "grukk", "step": "forage"}]}, ok=False))
        self.assertIn("people with plans: off", self.rpg("settings"))
        self.settings_tool("preset", "thrifty")
        self.assertIn("WORLD TURNS: off, every 8 moves; people with plans: off", self.rpg("settings"))

    def test_validate_checks_plans(self):
        g = "games/dark_lighthouse"
        ch = (self.dir / g / "characters" / "grukk.md").read_text()
        bad = ch.replace("## GM only", """## Plan: Nap time
does: naps

## Plan: steal (if not lamp_lit)
does: grabs something
sets: lamp_lit
near: a crash

## Plan: wander
does: wanders off
sets: troll_away
near: footsteps
mood: grumpy

## Plan: forage
does: twice
sets: grukk_stuck
near: stuck

## GM only""")
        self.write(g + "/characters/grukk.md", bad)
        out = self.rpg("validate", "--game", "dark_lighthouse", ok=False)
        for want in ("a plan heading is 'Plan: <step id>", "'lamp_lit' is part of the main story",
                     "plan flags are the character's own: grukk_<word>, not 'troll_away'", "unknown line 'mood: grumpy'",
                     "two plan steps are called 'forage'", "no plan step clears 'grukk_stuck'",
                     "nothing outside this file uses 'grukk_stuck'"):
            self.assertIn(want, out)
        self.write(g + "/characters/grukk.md", ch)
        room = (self.dir / g / "rooms" / "coast_road.md").read_text()
        self.write(g + "/rooms/coast_road.md", room.replace("  - grukk (if grukk_foraging and not grukk_friend", "  - grukk (if not grukk_friend"))
        self.assertIn("grukk stands in coast_road and greywater_bridge at once", self.rpg("validate", "--game", "dark_lighthouse", ok=False))
        self.write(g + "/rooms/coast_road.md", room)
        morwen = (self.dir / g / "characters" / "morwen.md").read_text()
        self.write(g + "/characters/morwen.md", morwen + "\n## Plan: nap\ndoes: naps\nsets: morwen_nap\nnear: a snore\n")
        self.assertIn("plans are for major characters", self.rpg("validate", "--game", "dark_lighthouse", ok=False))


if __name__ == "__main__":
    unittest.main(verbosity=2)
