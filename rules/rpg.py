#!/usr/bin/env python3
"""CodeRPG rules engine. Every change to state/save.json goes through this script.

Usage: python3 rules/rpg.py <command> [args]   (run with no args for the command list)

Output is plain text meant for the game master to narrate from.
A refused action prints "REFUSED: <reason>" and exits with status 1; state is unchanged.

The world is the active game's authored content (games/<id>/) plus this run's generated content,
kept in the save's `run` section. Both are looked up through ent(); generated entries win nothing
over authored ones (their ids can't collide), they only add.

state/save.json is the active game's save. Other games' saves wait in state/shelf/<game>.json and
are swapped in by `game switch`, so switching loses nothing.
"""
import datetime
import json
import os
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import content  # noqa: E402
import curse  # noqa: E402
import dice  # noqa: E402
import generate  # noqa: E402
import library  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SAVE = ROOT / "state" / "save.json"
SHELF = ROOT / "state" / "shelf"
ACTIVE = ROOT / "state" / "active.json"
METER = ROOT / "state" / "meter.json"
BALANCE = {}  # the active game's rule numbers; set by choose_game()
SETTINGS = {}  # the owner's switches for the active game (preset + overrides); set by choose_game()
STATE_VERSION = 8
OLDEST_VERSION = 7  # older saves are from before the game kit and aren't upgraded
STATS = ("might", "agility", "wits")
GEN_KINDS = ("extras", "rooms", "items", "characters", "side_quests")
SEED = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")
# words for a new run's seed when the player doesn't name one: plain, and no game's in particular
SEED_WORDS = ("amber", "birch", "cinder", "drift", "ember", "fennel", "gale", "hollow", "iris", "juniper",
              "kestrel", "lantern", "moss", "nettle", "onyx", "pebble", "quill", "rook", "sorrel", "thistle",
              "umber", "vale", "willow", "yarrow")


def empty_run():
    return {"id": uuid.uuid4().hex[:12], "variants": {}, "rolls": {}, "clock": None, "moves": 0, "weather": None,
            "rooms": {}, "characters": {}, "items": {}, "quests": {},
            "exits": {}, "placements": {}, "notes": {}, "chronicle": [], "rumors": [],
            "used_encounters": [], "world_turn_due": False, "generated": 0,
            "commissions": {}, "ordering": None}


def _v7_to_v8(state):
    """Version 8: orders placed with makers (`run.commissions`, `run.ordering`)."""
    state["run"].setdefault("commissions", {})
    state["run"].setdefault("ordering", None)
    return state


# Each entry upgrades a save from version N to N+1.
MIGRATIONS = {7: _v7_to_v8}


class Refused(Exception):
    pass


# ---------------------------------------------------------------- which game

def read_json(path):
    """A JSON file's contents, or None if it's missing or unreadable."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def write_json(path, data):
    """Write atomically, so a reader never sees half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2) + "\n")
    os.replace(tmp, path)


def active_game():
    """Which game is being played: the save's, else state/active.json's, else the first installed."""
    games = content.list_games()
    if not games:
        raise Refused("no games installed in games/")
    save, active = read_json(SAVE), read_json(ACTIVE)
    for data in (save, active):
        ident = data.get("game") if isinstance(data, dict) else None
        if ident in games:
            return ident
    return games[0]


def choose_game(ident):
    global BALANCE, SETTINGS
    content.use_game(ident)
    BALANCE = content.balance()
    try:
        SETTINGS = content.settings()
    except ValueError:
        SETTINGS = dict(content.kit_presets()["normal"], preset="normal")  # validate reports the bad file


# ---------------------------------------------------------------- the meter: what the extras cost
# Baseline play is free: every game-master turn, every rules command, and the authored characters
# speaking through their agents. Only extras beyond the game as written have a price (the game's
# balance.json `meter.prices`): generating something new, a world turn, and later stages' extras. The
# owner's settings give the capacity. It refills each time Claude Code is opened in the folder
# (`meter refill`, from the SessionStart hook). When it can't pay for an extra, that extra doesn't
# happen: nothing new is generated and the world doesn't stir off-screen, and the game as written plays
# on. It lives outside every save, so it carries across games.

def resource():
    return content.look()["resource"]


def meter():
    cap = int(SETTINGS["meter"]["capacity"])
    data = read_json(METER)
    left = data.get("left", cap) if isinstance(data, dict) else cap
    return {"left": max(0, min(cap, int(left))), "capacity": cap}


def price(kind):
    prices = BALANCE["meter"]["prices"]
    if kind not in prices:
        raise Refused("no price for %r (kinds: %s)" % (kind, ", ".join(prices)))
    return int(prices[kind])


def can_pay(kind):
    return meter()["left"] >= price(kind)


def charge(kind):
    """Take the price of one `kind` of action from the meter. It never goes below 0."""
    m = meter()
    left = max(0, m["left"] - price(kind))
    write_json(METER, {"left": left})
    return left


def meter_state(m=None):
    m = m or meter()
    low = m["left"] * 100 <= m["capacity"] * BALANCE["meter"]["low_at_percent"]
    return "spent" if m["left"] == 0 else "low" if low else "ok"


def active_curses(state):
    """The curses on the player now, in id order: each while its `caused_by` holds and its `cured_by` doesn't.
    They follow from flags, so none survives a new game."""
    flags = condition_flags(state)
    out = []
    for c in content.ids("curses"):
        meta = content.load("curses", c)
        if content.condition_holds(meta.get("caused_by"), flags) and not content.condition_holds(meta.get("cured_by"), flags):
            out.append(dict(meta, id=c))
    return out


def cursed_words(state, text):
    """The player's words as they come out under every curse on them, in order."""
    for c in active_curses(state):
        text = curse.apply(c["effect"], text)
    return text


def agents_resting(ident):
    """Why a non-minor character can't speak through its own agent right now (the owner's switches), or None.
    Agents are baseline play, so the meter never silences them."""
    agents = SETTINGS["npc_agents"]
    if not agents["on"]:
        return "the owner has the game master voice every character"
    if not agents["characters"].get(ident, True):
        return "the owner has the game master voice this character"
    return None


# ---------------------------------------------------------------- the world: content + this run

_RUN = empty_run()  # the loaded save's run section; set by load_state and newgame


def ent(kind, ident):
    """One room, character, item or quest, authored or generated, as a dict with `id` and `body`."""
    if content.exists(kind, ident):
        e = content.load(kind, ident)
    elif ident in _RUN.get(kind, {}):
        g = _RUN[kind][ident]
        e = json.loads(json.dumps(g["meta"]))
        e.update(id=ident, body=g.get("body", ""), generated="yes")
    else:
        raise Refused("no %s named %r in content or in this run" % (kind[:-1], ident))
    if kind == "rooms":
        e["exits"] = dict(e.get("exits") or {}, **_RUN.get("exits", {}).get(ident, {}))
        # once: someone the owner kept for good (tools/library.py) may still be placed by this run too
        e["characters"] = list(dict.fromkeys(list(e.get("characters") or []) + list(_RUN.get("placements", {}).get(ident, []))))
    return e


def ent_exists(kind, ident):
    return content.exists(kind, ident) or ident in _RUN.get(kind, {})


def ent_ids(kind):
    return content.ids(kind) + sorted(_RUN.get(kind, {}))


def is_generated(kind, ident):
    return not content.exists(kind, ident) and ident in _RUN.get(kind, {})


def made_by(kind, ident):
    """Who made a run entity: "player" (ordered from a maker or builder), "world" (generated), or None (authored)."""
    if not is_generated(kind, ident):
        return None
    return _RUN[kind][ident]["meta"].get("made_by", "world")


def world():
    return content.load_world()


def policy():
    """What may be generated now: the content allows it and the owner's settings switch it on."""
    gen = world().get("generation") or {}
    owner = SETTINGS["generation"]
    allowed = {k: str(gen.get(k, "no")).lower() in (("yes", "marked", "anywhere") if k == "rooms" else ("yes",)) for k in GEN_KINDS}
    return {k: allowed[k] and owner["on"] and owner["kinds"].get(k, False) for k in GEN_KINDS}


def growth():
    """Where the world may grow new places: "anywhere" (any free way, unless a room says otherwise), "marked"
    (only the directions rooms list in `expand:`), or "no". world.md's `generation: rooms:` sets it; yes = marked."""
    v = str((world().get("generation") or {}).get("rooms", "no")).lower()
    return "anywhere" if v == "anywhere" else "marked" if v in ("yes", "marked") else "no"


# ---------------------------------------------------------------- orders: what the player has made
# A maker is a character whose content gives `makes:` (item tiers) and maybe `accepts:` (material items
# that pay for the work instead of money). The player describes what they want; the world agent shapes
# it within the maker's tiers (`world-brief craft <maker>`, then `generate craft`). It waits as an order
# in `run.commissions` until the player pays (`pay <id>`); then it's theirs, marked made_by: player.
# Prices come from balance.json, never from an agent.

def makes(ident):
    """The item tiers a character makes to order (none for anyone else)."""
    tiers = BALANCE["generation"]["item_tiers"]
    return [t for t in options_of(ent("characters", ident).get("makes") or "") if t in tiers]


def accepts(ident):
    """The items a maker takes as payment instead of money."""
    return options_of(ent("characters", ident).get("accepts") or "")


def builds(ident):
    """Whether a character builds places to order (`builds: yes`)."""
    return str(ent("characters", ident).get("builds", "no")).lower() == "yes"


ORDER_KINDS = {"craft": ("item", "crafting", "makers"), "build": ("room", "building", "builders")}


def why_no_order(state, kind="craft"):
    """Why no maker (craft) or builder (build) takes a new order now: the owner's switches, this run's orders,
    the meter. None when one can be placed."""
    what, switch_name, who = ORDER_KINDS[kind]
    switch = SETTINGS[switch_name]
    if not switch["on"]:
        return "no %s take orders in this game (the owner's settings)" % who
    if sum(1 for c in state["run"]["commissions"].values() if c["kind"] == what) >= int(switch["max_per_run"]):
        return "the %s have taken as much work as they will this run (%d orders)" % (who, int(switch["max_per_run"]))
    if not can_pay(kind):
        return "the %s is spent until the next session, so no new work is taken on" % resource()["name"].lower()
    return None


def order_name(ident, com):
    return com["record"]["meta"]["name"] if "record" in com else item(ident).get("name", ident)


def price_text(com):
    """'3 coins, or in trade: smoked_fish' for an order. Only made items can be paid for in trade."""
    trade = accepts(com["maker"]) if com["kind"] == "item" and ent_exists("characters", com["maker"]) else []
    return "%d %s%s" % (com["price"], currency(), ", or in trade: %s" % ", ".join(trade) if trade else "")


# ---------------------------------------------------------------- where new places can go
# Every room has a square on the map, found by walking the exits from the start room (up and down are drawn
# as north and south, as the mod draws them). A new place may only go where its square is free, so the map
# never overlaps. Build spots (`build:` on a room) are reserved for the player: the world never grows there.

STEP = {"north": (0, -1), "south": (0, 1), "east": (1, 0), "west": (-1, 0), "up": (0, -1), "down": (0, 1),
        "northeast": (1, -1), "northwest": (-1, -1), "southeast": (1, 1), "southwest": (-1, 1)}
CARDINAL = ("north", "south", "east", "west")


def layout():
    """Every reachable room's map square, from the start room through every exit (open or not)."""
    start = world()["start_room"]
    pos, queue = {start: (0, 0)}, [start]
    taken = {(0, 0)}
    while queue:
        r = queue.pop(0)
        x, y = pos[r]
        for d, target in (ent("rooms", r).get("exits") or {}).items():
            dest = content.split_condition(target)[0]
            if d not in STEP or dest in pos or not ent_exists("rooms", dest):
                continue
            sq = (x + STEP[d][0], y + STEP[d][1])
            if sq in taken:
                continue
            pos[dest] = sq
            taken.add(sq)
            queue.append(dest)
    return pos


def square_of(room_id, d, pos):
    """The map square a new place `d` of this room would take, or None (in and out aren't drawn)."""
    if d not in STEP or room_id not in pos:
        return None
    x, y = pos[room_id]
    return (x + STEP[d][0], y + STEP[d][1])


def reserved_squares(pos):
    """The squares every authored build spot will take: kept free for the player."""
    out = set()
    for r in content.ids("rooms"):
        spots = content.load("rooms", r).get("build")
        for d in (spots if isinstance(spots, dict) else {}):
            sq = square_of(r, d, pos)
            if sq:
                out.add(sq)
    return out


def square_free(room_id, d, pos, keep=frozenset()):
    """Whether a new place `d` of this room would have a map square of its own, not one of `keep`
    (always free for in and out, and for a room the map can't place)."""
    sq = square_of(room_id, d, pos)
    if sq is None:
        return d not in STEP or room_id not in pos
    return sq not in set(pos.values()) and sq not in keep


def room_depth(room):
    """How many generated rooms deep a room is: 0 for authored ones."""
    return int(room.get("depth", 1)) if room.get("generated") else 0


def build_spots(state, room):
    """This room's free build spots, {direction: what could go there}: content lists them, and none has an exit
    or a paid-for building yet. Generated and built rooms have none."""
    spots = room.get("build") if not room.get("generated") else None
    if not isinstance(spots, dict):
        return {}
    busy = {c["direction"] for c in state["run"]["commissions"].values()
            if c["kind"] == "room" and c["room"] == room["id"] and c["status"] != "ordered"}
    return {d: str(t) for d, t in spots.items() if d not in (room.get("exits") or {}) and d not in busy}


# ---------------------------------------------------------------- the library: what lasts across runs
# Everything generated or player-made in a run goes into the game's library (rules/library.py, kept in
# state/library/<game>.json, outside every save). A new game brings back the places the player built and
# the people they befriended; the world agent is shown a few fitting entries and may bring one back instead
# of inventing. Only the owner keeps an entry for good or forgets it (tools/library.py).

def lib():
    return library.load(content.game_id())


def lib_save(data):
    library.save(content.game_id(), data)


def lib_limit():
    return int(BALANCE["library"]["max_entries"])


REQUEST_KIND = {"extra": "characters", "character": "characters", "room": "rooms", "item": "items"}


def record_patch(state, request, patch):
    """Put what one generation made into the library: one entry, with what came with it."""
    kind = REQUEST_KIND.get(request)
    if not kind or not patch[kind]:
        return
    ident = next(iter(patch[kind]))
    placed = {i for items in patch["room_items"].values() for i in items}
    bundle = [{"kind": k, "id": i, "record": patch[k][i], "placed": i in placed}
              for k in library.KINDS for i in patch[k] if i != ident]
    attach = None
    if kind == "rooms":
        attach = {"room": state["location"], "direction": next(iter(patch["exits"][state["location"]]))}
    data = lib()
    library.add(data, lib_limit(), ident, kind, "world", patch[kind][ident], bundle, state["location"], attach)
    lib_save(data)


def note_friends(state):
    """People the player befriended by finishing the side quest they gave: the library brings them back in
    later runs, remembering one line (their last memory of the player, or the job done)."""
    run = state["run"]
    done = run.setdefault("befriended", [])
    flags = condition_flags(state)
    new = [(q, rec["meta"].get("giver")) for q, rec in run["quests"].items()
           if rec["meta"].get("giver") in run["characters"] and rec["meta"].get("giver") not in done
           and quest_view(q, flags)["complete"]]
    if not new:
        return
    data = lib()
    for q, giver in new:
        name = ent("quests", q).get("name", q)
        memory = state.get("npc_memory", {}).get(giver) or []
        library.befriend(data, giver, "finished their side quest (%s)" % name, memory[-1] if memory else "Did right by me once: %s." % name)
        done.append(giver)
    lib_save(data)


def carry_over(state):
    """Bring back what lasts from earlier runs: places the player had built (at their build spots, if the
    content still has them) and the people they befriended (where they were, remembering one line). Stats
    come from today's tiers. Returns a line for each."""
    data, run, back = lib(), state["run"], []
    order = sorted(data["entries"].items(), key=lambda kv: kv[1]["kind"] != "rooms")  # places first: friends may live there
    for ident, e in order:
        if e.get("forgotten") or content.exists(e["kind"], ident):
            continue
        if e["kind"] == "rooms" and e["origin"] == "player":
            a = e.get("attach") or {}
            if not content.exists("rooms", a.get("room", "")):
                continue
            parent = content.load("rooms", a["room"])
            if a.get("direction") not in (parent.get("build") or {}) or a["direction"] in (parent.get("exits") or {}):
                continue
            rec = generate.retier("rooms", e["record"], BALANCE["generation"])
            rec["meta"]["carried"] = "yes"
            run["rooms"][ident] = dict(rec, made_at_move=0)
            run["exits"].setdefault(a["room"], {})[a["direction"]] = ident
            back.append("%s (the player's, %s of %s)" % (rec["meta"]["name"], a["direction"], parent.get("name", a["room"])))
        elif e["kind"] == "characters" and e.get("friend"):
            where = e.get("where")
            if not (content.exists("rooms", where or "") or where in run["rooms"]):
                continue
            rec = generate.retier("characters", e["record"], BALANCE["generation"])
            rec["meta"]["carried"] = "yes"
            run["characters"][ident] = dict(rec, made_at_move=0)
            for b in e.get("bundle") or []:  # their wares
                if b["kind"] == "items" and not content.exists("items", b["id"]):
                    run["items"][b["id"]] = dict(generate.retier("items", b["record"], BALANCE["generation"]), made_at_move=0)
            run["placements"].setdefault(where, []).append(ident)
            state["npc_memory"][ident] = [e["friend"]["line"]]
            run.setdefault("befriended", []).append(ident)
            back.append("%s (a friend, at %s, remembers: %s)" % (rec["meta"].get("name", ident), where, e["friend"]["line"]))
        else:
            continue
        library.seen(data, ident)
    lib_save(data)
    return back


def refund(amount):
    """Give back part of an extra's price (a world brief answered by reusing a library entry)."""
    m = meter()
    write_json(METER, {"left": min(m["capacity"], m["left"] + amount)})


# ---------------------------------------------------------------- state I/O

def load_state():
    global _RUN
    if not SAVE.is_file():
        raise Refused("no save file. Start a game with /newgame.")
    state = json.loads(SAVE.read_text())
    if state.get("version", 1) < OLDEST_VERSION:
        raise Refused("this save is from an older version of CodeRPG and can't be continued. Start a new game with /newgame.")
    state = migrate(state)
    _RUN = state["run"]
    if _RUN.get("seed"):
        dice.use_stream(stream_key(state), _RUN.get("dice_n", 0))
    return state


def stream_key(state):
    """The run's dice stream: the same game and seed roll the same dice, in the same order."""
    return "%s:%s" % (state["game"], state["run"]["seed"])


def migrate(state):
    v = state.get("version", 1)
    if v > STATE_VERSION:
        raise Refused("save is version %d but this engine only knows up to %d" % (v, STATE_VERSION))
    while v < STATE_VERSION:
        state = MIGRATIONS[v](state)
        v += 1
        state["version"] = v
    return state


def condition_flags(state):
    """The names content conditions are checked against: the story flags, plus two automatic kinds
    that are true while they hold: has_<item> (carrying it) and met_<character> (seen them in a room)."""
    return (list(state["flags"]) + ["has_" + i for i in state["inventory"]]
            + ["met_" + c for c in state.get("met", [])])


_DONE = re.compile(r"^(.*?)\s*\(done when\s+(.+)\)\s*$")


def quest_view(ident, flags):
    """A quest's journal: objectives done so far, then the current one; later ones stay hidden."""
    q = ent("quests", ident)
    objectives = []
    for line in q.get("objectives") or []:
        m = _DONE.match(str(line))
        text, cond = (m.group(1), m.group(2)) if m else (str(line), None)
        done = cond is not None and content.condition_holds(cond, flags)
        objectives.append({"text": text, "done": done})
    complete = content.condition_holds(q.get("completed_by"), flags) if q.get("completed_by") else False
    failed = not complete and bool(q.get("failed_by")) and content.condition_holds(q.get("failed_by"), flags)
    shown, current_found = [], False
    for o in objectives:
        if o["done"] or complete:
            shown.append(o)
        elif not current_found and not failed:
            shown.append(o)
            current_found = True
    return {"id": ident, "name": q.get("name", ident), "complete": complete, "failed": failed,
            "side": is_generated("quests", ident), "objectives": shown}


def time_of_day(state):
    times = world().get("times") or []
    clock = state["run"].get("clock")
    if not times:
        return None
    if not clock:
        return times[0]
    return times[min(len(times) - 1, state["run"]["moves"] * len(times) // max(1, clock["total"]))]


def refresh_view(state):
    """Derived fields for interfaces (the mod's pane, /map, /inventory), so they never read content.
    `map` and `met` are history: rooms visited (with the exits open when last there) and characters seen.
    `view` is a snapshot recomputed on every save."""
    room = room_here(state)
    here = characters_here(state)
    met = state.setdefault("met", [])
    met.extend(c for c in here if c not in met)
    flags = condition_flags(state)
    exits = {}
    for d, target in (room.get("exits") or {}).items():
        dest, cond = content.split_condition(target)
        if content.condition_holds(cond, flags):
            exits[d] = dest
    state.setdefault("map", {})[room["id"]] = {
        "name": room.get("name", room["id"]), "exits": exits,
        "terrain": room.get("terrain"), "color": room.get("color"),  # how the map tile looks
        "made_by": made_by("rooms", room["id"]),
        # where those exits lead, by name: the player can see or has been told, even before visiting
        "neighbors": {dest: ent("rooms", dest).get("name", dest) for dest in exits.values() if ent_exists("rooms", dest)},
    }
    for entry in state["map"].values():  # rooms visited before neighbors were recorded
        if "neighbors" not in entry:
            entry["neighbors"] = {d: ent("rooms", d).get("name", d) for d in entry["exits"].values() if ent_exists("rooms", d)}

    def who(c):
        ch = ent("characters", c)
        return {"id": c, "name": ch.get("name", c), "role": ch.get("role", ""), "generated": is_generated("characters", c),
                "card": ch.get("card")}

    art = content.game_dir() / "art" / ("%s.txt" % room["id"])
    run = state["run"]
    clock = run.get("clock")
    state["view"] = {
        "game": {"id": state["game"], "title": state["adventure"]},
        "run_label": run_label(state),
        "look": content.look(),
        "location_name": room.get("name", room["id"]),
        "location_generated": is_generated("rooms", room["id"]),
        "items": [{"id": i, "name": item(i).get("name", i) if ent_exists("items", i) else i, "equipped": i == state["equipped"],
                   "own": made_by("items", i) == "player"} for i in state["inventory"]],
        "weight": carried_weight(state),
        "carry_limit": carry_limit(state),
        "characters_here": [who(c) for c in here],
        "people": [dict(who(c), here=c in here, memory=state.get("npc_memory", {}).get(c, []))
                   for c in met if ent_exists("characters", c)],
        "foes": [dict(who(c), hp=state["npcs"][c]["hp"], max_hp=state["npcs"][c]["max_hp"])
                 for c in here if c in state["npcs"] and state["npcs"][c]["hp"] > 0],  # fought and still standing
        "quests": [quest_view(q, flags) for q in ent_ids("quests")],  # ids come from files that exist
        "art": art.read_text(encoding="utf-8").rstrip("\n") if art.is_file() else None,
        "time": time_of_day(state),
        "weather": run.get("weather"),
        "clock": {"name": clock["name"], "left": clock["left"], "total": clock["total"]} if clock else None,
        "meter": dict(meter(), state=meter_state()),
        "curses": [{"id": c["id"], "name": c.get("name", c["id"]), "effect": c["effect"]} for c in active_curses(state)],
        "settings": settings_view(),
        "chronicle": run["chronicle"][-BALANCE["world"]["chronicle_lines"]:],
        "rumors": run["rumors"][-BALANCE["world"]["rumors_kept"]:],
    }


def settings_view():
    """The owner's switches and what each action costs, as /budget shows them."""
    agents, turns, gen = SETTINGS["npc_agents"], SETTINGS["world_turns"], SETTINGS["generation"]
    return {
        "preset": SETTINGS["preset"],
        "capacity": SETTINGS["meter"]["capacity"],
        "prices": dict(BALANCE["meter"]["prices"]),
        "npc_agents": {"on": agents["on"], "lines_per_exchange": agents["lines_per_exchange"],
                       "off_for": sorted(c for c, on in agents["characters"].items() if not on)},
        "world_turns": {"on": turns["on"], "every_moves": turns["every_moves"]},
        "generation": {"on": gen["on"], "max_per_run": gen["max_per_run"], "kinds": [k for k, on in policy().items() if on]},
        "crafting": {"on": SETTINGS["crafting"]["on"], "max_per_run": SETTINGS["crafting"]["max_per_run"]},
        "building": {"on": SETTINGS["building"]["on"], "max_per_run": SETTINGS["building"]["max_per_run"]},
    }


def run_label(state):
    """'2026-10-21 · seed ember-4821' or '2026-10-21 · daily world': what the title card says about this run."""
    run = state["run"]
    if not run.get("seed"):
        return None
    return "%s · %s" % (run.get("started", "?"), "daily world" if run.get("daily") else "seed %s" % run["seed"])


def save_state(state):
    if dice.position() is not None:
        state["run"]["dice_n"] = dice.position()
    note_friends(state)
    refresh_view(state)
    write_json(SAVE, state)


def require_playing(state):
    if state["status"] != "playing":
        raise Refused("the game is over (%s). Start again with /newgame." % state["status"])


# ---------------------------------------------------------------- helpers

def item(ident):
    return ent("items", ident)


def carried_weight(state):
    return sum(int(item(i).get("weight", 0)) for i in state["inventory"] if ent_exists("items", i))


def carry_limit(state):
    return BALANCE["carry_base"] + BALANCE["carry_per_might"] * state["stats"]["might"]


def check_carry(state, ident):
    w = carried_weight(state) + int(item(ident).get("weight", 0))
    if w > carry_limit(state):
        raise Refused("too heavy: carrying %s would make %d, limit is %d. Drop something first."
                      % (ident, w, carry_limit(state)))


def room_here(state):
    return ent("rooms", state["location"])


def characters_here(state):
    """Who is in the player's room. A generated character drops out once defeated (authored ones say so in
    their room's conditions), and anyone whose file has gone missing is skipped rather than breaking the save."""
    flags = condition_flags(state)
    return [c for c in content.visible(room_here(state).get("characters"), flags)
            if ent_exists("characters", c) and not (is_generated("characters", c) and "%s_defeated" % c in flags)]


def is_minor(ident):
    return str(ent("characters", ident).get("minor", "no")).lower() == "yes"


def stat_label(stat):
    """How this game names a stat: 'Might', or 'Grit (might)' when it renames one."""
    label = content.look()["stat_labels"].get(stat, stat.capitalize())
    return label if label.lower() == stat else "%s (%s)" % (label, stat)


def currency():
    return content.look().get("currency", "coins")


def player_defense(state):
    return BALANCE["player_defense_base"] + state["stats"]["agility"]


def set_flag(state, name):
    if name not in state["flags"]:
        state["flags"].append(name)


def hp_line(state):
    s = state["stats"]
    return "HP %d/%d" % (s["hp"], s["max_hp"])


def damage_player(state, amount):
    s = state["stats"]
    s["hp"] = max(0, s["hp"] - amount)
    if s["hp"] == 0:
        state["status"] = "defeated"
        return "PLAYER DEFEATED (HP 0). The game is over; /newgame to start again."
    return "Player " + hp_line(state)


def resolve_dc(text):
    if str(text).isdigit():
        return int(text)
    if text in BALANCE["dc"]:
        return BALANCE["dc"][text]
    raise Refused("DC must be a number or one of %s" % ", ".join(BALANCE["dc"]))


def d20_test(mod, target):
    """Roll the check die + mod against a target number. Natural 20 always passes, natural 1 always fails."""
    total, faces, _ = dice.roll(BALANCE["check_die"])
    nat = faces[0]
    total += mod
    ok = nat == 20 or (nat != 1 and total >= target)
    note = " (natural 20)" if nat == 20 else " (natural 1)" if nat == 1 else ""
    return ok, nat, total, note


def pick(options):
    """One of `options`, chosen by a die roll."""
    return options[dice.roll("1d%d" % len(options))[0] - 1]


def options_of(value):
    """A comma-separated string or a YAML list, as a list of non-empty strings."""
    parts = value if isinstance(value, list) else str(value or "").split(",")
    return [str(x).strip() for x in parts if str(x).strip()]


def moves_text(n):
    return "%d move%s" % (n, "" if n == 1 else "s")


def unused_expansions(room):
    """The directions the world may grow a new place in from this room, by the game's `growth()`:
    - marked: the authored room's `expand:` directions;
    - anywhere: the room's `expand:` directions if it lists any, else north, south, east and west; `expand: no`
      opts out. Generated rooms grow too, until `generation.max_depth` rooms deep.
    Never through an exit, a build spot, or onto a map square that's already taken."""
    mode, raw = growth(), room.get("expand")
    listed = [] if str(raw).strip().lower() in ("no", "none") else options_of(raw or "")
    if mode == "no":
        return []
    if room.get("generated"):
        if mode != "anywhere" or room_depth(room) >= int(BALANCE["generation"]["max_depth"]):
            return []
        dirs = list(CARDINAL)
    elif mode == "marked":
        dirs = listed
    else:
        dirs = listed if raw is not None else list(CARDINAL)
    pos = layout()
    keep = reserved_squares(pos)
    return [d for d in dirs if d not in (room.get("exits") or {}) and square_free(room["id"], d, pos, keep)]


def short_line(text, what):
    text = " ".join(text.split())
    limit = BALANCE["world"]["text_line_chars"]
    if not text:
        raise Refused("usage: %s <one short line>" % what)
    if len(text) > limit:
        raise Refused("%s lines must be at most %d characters (got %d)" % (what, limit, len(text)))
    return text


# ---------------------------------------------------------------- encounters and the clock

_EFFECT = re.compile(r"\(effect:\s*([^)]+)\)")


def apply_effect(state, effect):
    """Apply one encounter effect: coins ±N, gain <item>, hurt <dice>, heal <dice>, flag <name>, none."""
    words = effect.split()
    if not words or words[0] == "none":
        return None
    verb, arg = words[0], " ".join(words[1:])
    s = state["stats"]
    if verb == "coins":
        delta = max(int(arg), -s["coins"])
        if delta == 0:
            return "COINS: nothing to take, the purse is empty"
        s["coins"] += delta
        return "COINS %+d -> %d" % (delta, s["coins"])
    if verb == "gain":
        try:
            check_carry(state, arg)
        except Refused:
            return "GAIN %s refused: too heavy to carry" % arg
        state["inventory"].append(arg)
        return "GAINED: %s" % arg
    if verb == "hurt":
        # a random event can wound but never kill: it leaves at least 1 HP
        total, faces, mod = dice.roll(arg)
        dealt = max(0, min(total, s["hp"] - 1))
        held = "" if dealt == total else ", held to %d" % dealt
        return "HURT %s%s. %s" % (dice.describe(arg, total, faces, mod), held, damage_player(state, dealt))
    if verb == "heal":
        total, faces, mod = dice.roll(arg)
        before = s["hp"]
        s["hp"] = min(s["max_hp"], s["hp"] + max(0, total))
        return "HEAL %s; healed %d. %s" % (dice.describe(arg, total, faces, mod), s["hp"] - before, hp_line(state))
    if verb == "flag":
        set_flag(state, arg)
        return "FLAG set %s" % arg
    raise Refused("unknown encounter effect %r" % effect)


def roll_encounter(state, room):
    """On entering a room with an encounter table, maybe something happens. Code decides, content describes."""
    table_id = room.get("encounters")
    if not table_id:
        return []
    table = content.load("tables", table_id)
    hits, sides = [int(x) for x in re.findall(r"\d+", str(table.get("chance", "1 in 6")))[:2]]
    roll = dice.roll("1d%d" % sides)[0]
    if roll > hits:
        return []
    used = state["run"]["used_encounters"]
    entries = [(i, e) for i, e in enumerate(table.get("entries") or [])
               if not ("(once)" in e and "%s:%d" % (table_id, i) in used)]
    if not entries:
        return []
    i, entry = pick(entries)
    if "(once)" in entry:
        used.append("%s:%d" % (table_id, i))
    text = _EFFECT.sub("", entry).replace("(once)", "").strip()
    out = ["ENCOUNTER: %s" % text]
    m = _EFFECT.search(entry)
    if m:
        result = apply_effect(state, m.group(1).strip())
        if result:
            out.append("  effect: %s" % result)
    return out


def tick_move(state):
    """Each move passes time: the clock runs down and, every few moves, the world takes a turn."""
    run, out = state["run"], []
    run["moves"] += 1
    clock = run.get("clock")
    if clock and clock["left"] > 0:
        clock["left"] -= 1
        if clock["left"] == 0:
            set_flag(state, clock["flag"])
            out.append("CLOCK: %s. Flag set: %s" % (clock["name"], clock["flag"]))
            if clock.get("also_flag") and content.condition_holds(clock.get("also_if"), condition_flags(state)):
                set_flag(state, clock["also_flag"])
                out.append("CLOCK: and since %s, flag set: %s" % (clock["also_if"], clock["also_flag"]))
        elif clock["left"] <= 3:
            out.append("CLOCK: %s in %s" % (clock["name"], moves_text(clock["left"])))
    if run["moves"] % BALANCE["world"]["weather_every_moves"] == 0:
        weathers = world().get("weather") or []
        if weathers:
            run["weather"] = pick(weathers)
    for ident, com in run["commissions"].items():
        if com["kind"] == "room" and com["status"] == "building" and run["moves"] >= com["ready_at"]:
            out.append(finish_building(state, ident, com))
    turns = SETTINGS["world_turns"]
    if turns["on"] and run["moves"] % max(1, int(turns["every_moves"])) == 0 and can_pay("world_turn"):
        run["world_turn_due"] = True
        out.append("WORLD TURN DUE: run `rpg.py world-brief turn` and spawn the world agent (see gm-turn)")
    return out


def finish_building(state, ident, com):
    """A paid-for building is done: the place joins the world, with a way to it from where it was ordered.
    People hear of it, so they start using it."""
    run = state["run"]
    record = com.pop("record")
    run["rooms"][ident] = dict(record, made_at_move=run["moves"])
    run["exits"].setdefault(com["room"], {})[com["direction"]] = ident
    com["status"] = "done"
    name, where = record["meta"]["name"], ent("rooms", com["room"]).get("name", com["room"])
    run["rumors"].append("%s is finished, %s of %s, and folk are curious to see it." % (name, com["direction"], where))
    del run["rumors"][:-BALANCE["world"]["rumors_kept"]]
    data = lib()
    library.add(data, lib_limit(), ident, "rooms", "player", record, where=com["room"],
                attach={"room": com["room"], "direction": com["direction"]}, worth_keeping="built by the player")
    lib_save(data)
    return ("BUILT: %s (%s) is finished, %s of %s, built for the player by %s. It's open now; describe it when the "
            "player next sees it." % (name, ident, com["direction"], where, ent("characters", com["maker"]).get("name", com["maker"])))


# ---------------------------------------------------------------- commands

def cmd_newgame(args):
    """newgame [seed | daily]: a fresh run. The same seed rolls the same run in this game for anyone."""
    global _RUN
    today = datetime.date.today().isoformat()
    want = args[0].lower() if args else None
    if want == "daily":
        seed = today
    elif want:
        if not SEED.match(want):
            raise Refused("a seed is 1-40 letters, digits, dashes or underscores, or 'daily' for today's world")
        seed = want
    else:
        seed = "%s-%04d" % (dice.fresh_choice(SEED_WORDS), dice.fresh_choice(range(10000)))
    dice.use_stream("%s:%s" % (content.game_id(), seed), 0)
    w = world()
    run = empty_run()
    run.update(seed=seed, started=today, daily=want == "daily", dice_n=0)
    _RUN = run
    stats = dict(w.get("stats") or {})
    for k in STATS + ("max_hp",):
        stats.setdefault(k, 0)
    for k, spec in (w.get("rolls") or {}).items():
        total, _, _ = dice.roll(spec)
        stats[k] = total
        run["rolls"][k] = total
    stats["hp"] = stats["max_hp"]
    stats["coins"] = int(w.get("coins", 0))
    flags = list(w.get("flags") or [])
    for name, opts in (w.get("variants") or {}).items():
        choice = pick(options_of(opts))
        run["variants"][name] = choice
        flags.append(choice)
    if w.get("clock"):
        c = w["clock"]
        total = max(1, dice.roll(c["moves"])[0])
        run["clock"] = {"name": c["name"], "flag": c["flag"], "total": total, "left": total,
                        "also_if": c.get("also_if"), "also_flag": c.get("also_flag")}
    if w.get("weather"):
        run["weather"] = pick(w["weather"])
    state = {
        "version": STATE_VERSION,
        "game": content.game_id(),
        "adventure": w.get("title", "Untitled"),
        "status": "playing",
        "location": w["start_room"],
        "stats": stats,
        "inventory": list(w.get("inventory") or []),
        "equipped": w.get("equipped"),
        "flags": flags,
        "room_items": {r: content.visible(content.load("rooms", r).get("items"), flags) for r in content.ids("rooms")},
        "npcs": {},
        "npc_memory": {},
        "map": {},
        "met": [],
        "run": run,
    }
    back = carry_over(state)
    save_state(state)
    write_json(ACTIVE, {"game": state["game"]})
    for stale in (ROOT / "proposals").glob("*.json"):
        stale.unlink()
    print("NEW GAME: %s" % state["adventure"])
    print("SEED: %s%s (the same seed rolls the same run)" % (seed, ", today's daily world" if run["daily"] else ""))
    if run["rolls"]:
        print("ROLLED: %s" % ", ".join("%s %d" % kv for kv in run["rolls"].items()))
    if run["variants"]:
        print("THIS RUN (secret from the player): %s" % ", ".join("%s=%s" % kv for kv in run["variants"].items()))
    if run["clock"]:
        print("CLOCK: %s in %s" % (run["clock"]["name"], moves_text(run["clock"]["total"])))
    if back:
        print("FROM EARLIER RUNS (they're part of this world now): %s" % "; ".join(back))
    cmd_look([])


def cmd_look(args):
    state = load_state()
    run = state["run"]
    room = room_here(state)
    flags = condition_flags(state)
    print("STATUS: %s | %s | %s | %s %d" % (state["status"], hp_line(state), " ".join(
        "%s %+d" % (stat_label(k), state["stats"][k]) for k in STATS), currency().capitalize(), state["stats"]["coins"]))
    print("LOCATION: %s (%s)%s" % (room.get("name", room["id"]), room["id"],
                                   " [generated: read it with `rpg.py show rooms %s`]" % room["id"] if room.get("generated") else ""))
    texture = [x for x in (time_of_day(state), run.get("weather")) if x]
    if texture:
        print("TIME AND WEATHER: %s" % ", ".join(texture))
    if run.get("clock"):
        c = run["clock"]
        print("CLOCK STATUS: %s" % (("%s in %s" % (c["name"], moves_text(c["left"]))) if c["left"] else "%s: it has happened" % c["name"]))
    m, res = meter(), resource()
    print("METER: %s %d/%d" % (res["name"], m["left"], m["capacity"]))
    for c in active_curses(state):
        print("CURSE: %s (`rpg.py show curses %s`): the player's words come out %s. Resolve what they meant; in the "
              "story, and to every character, they said the words as they came out." % (c.get("name", c["id"]), c["id"], curse.describe(c["effect"])))
    if meter_state(m) == "low":
        print("METER LOW: %s (you may let it show once, lightly, in the story)" % res["low"])
    elif meter_state(m) == "spent":
        print("METER SPENT: %s Nothing new can be generated and the world won't stir off-screen until the next session."
              % res["spent"])
    for d, target in (room.get("exits") or {}).items():
        dest, cond = content.split_condition(target)
        name = ent("rooms", dest).get("name", dest) if ent_exists("rooms", dest) else dest
        if content.condition_holds(cond, flags):
            print("  exit %s -> %s" % (d, name))
        else:
            print("  exit %s -> %s [BLOCKED: needs %s]" % (d, name, cond))
    if policy()["rooms"] and can_pay("generate") and unused_expansions(room):
        print("  may grow: %s (a new place can be generated there if the player goes that way)" % ", ".join(unused_expansions(room)))
    here = state["room_items"].get(room["id"], [])
    print("ITEMS HERE: %s" % (", ".join(i + (" [generated]" if is_generated("items", i) else "") for i in here) or "none"))
    here = characters_here(state)
    voice = {c: "minor" if is_minor(c) else "minor, agent resting" if agents_resting(c) else "agent" for c in here}
    chars = ["%s [%s%s]" % (c, voice[c], ", generated" if is_generated("characters", c) else "") for c in here]
    print("CHARACTERS HERE: %s" % (", ".join(chars) or "none"))
    makers = [c for c in here if makes(c)]
    if makers and not why_no_order(state):
        print("MAKERS HERE: %s. If the player orders something made: `world-brief craft <maker>` (see gm-turn)."
              % "; ".join("%s makes %s" % (c, ", ".join(t.replace("_", " ") for t in makes(c))) for c in makers))
    spots, builders = build_spots(state, room), [c for c in here if builds(c)]
    if spots and builders and not why_no_order(state, "build"):
        print("BUILD SPOTS HERE: %s. Builders here: %s. If the player orders something built: `world-brief build <builder>` "
              "(see gm-turn)." % ("; ".join("%s: %s" % kv for kv in spots.items()), ", ".join(builders)))
    waiting = [(i, c) for i, c in run["commissions"].items() if c["status"] == "ordered"]
    if waiting:
        print("ORDERS WAITING: %s. When the player pays: `pay <id>` (an item may be paid for in trade: `pay <id> <material>`)."
              % " | ".join("%s (%s) from %s, unpaid: %s" % (i, order_name(i, c), c["maker"], price_text(c)) for i, c in waiting))
    going_up = [(i, c) for i, c in run["commissions"].items() if c["status"] == "building"]
    if going_up:
        print("BEING BUILT: %s" % " | ".join("%s (%s), %s of %s: ready in %s" % (
            i, order_name(i, c), c["direction"], c["room"], moves_text(max(0, c["ready_at"] - run["moves"]))) for i, c in going_up))
    if sum(1 for v in voice.values() if v == "agent") >= 2:
        print("AGENT LINES PER TURN: at most %d between them" % SETTINGS["npc_agents"]["lines_per_exchange"])
    notes = run["notes"].get(room["id"], [])
    if notes:
        print("ESTABLISHED HERE: %s" % " | ".join(notes))
    inv = ["%s%s" % (i, " (equipped)" if i == state["equipped"] else "") for i in state["inventory"]]
    print("INVENTORY: %s  [weight %d/%d]" % (", ".join(inv) or "nothing", carried_weight(state), carry_limit(state)))
    print("FLAGS: %s" % (", ".join(state["flags"]) or "none"))
    print("ALSO TRUE: %s" % (", ".join(f for f in flags if f not in state["flags"]) or "none"))
    gen_q = [q for q in ent_ids("quests") if is_generated("quests", q)]
    if gen_q:
        print("SIDE QUESTS: %s (read with `rpg.py show quests <id>`)" % ", ".join(gen_q))
    if run["world_turn_due"]:
        print("WORLD TURN DUE: run `rpg.py world-brief turn` and spawn the world agent (see gm-turn)")


def cmd_move(args):
    state = load_state()
    require_playing(state)
    want = args[0]
    exits = room_here(state).get("exits") or {}
    if want not in exits:
        # allow naming the destination room instead of the direction
        match = [d for d, t in exits.items() if content.split_condition(t)[0] == want]
        if not match:
            grow = unused_expansions(room_here(state)) if policy()["rooms"] else []
            hint = " This room may grow %s: generate a room there first." % "/".join(grow) if want in grow else ""
            raise Refused("no exit %r here. Exits: %s.%s" % (want, ", ".join(exits) or "none", hint))
        want = match[0]
    dest, cond = content.split_condition(exits[want])
    if not content.condition_holds(cond, condition_flags(state)):
        raise Refused("the way %s is blocked (needs %s)" % (want, cond))
    state["location"] = dest
    events = tick_move(state) + roll_encounter(state, ent("rooms", dest))
    save_state(state)
    print("MOVED %s." % want)
    for line in events:
        print(line)
    cmd_look([])


def cmd_take(args):
    state = load_state()
    require_playing(state)
    ident = args[0]
    here = state["room_items"].setdefault(state["location"], [])
    if ident not in here:
        raise Refused("%s is not here. Items here: %s" % (ident, ", ".join(here) or "none"))
    check_carry(state, ident)
    here.remove(ident)
    state["inventory"].append(ident)
    save_state(state)
    print("TAKEN: %s  [weight %d/%d]" % (ident, carried_weight(state), carry_limit(state)))


def remove_from_inventory(state, ident):
    if ident not in state["inventory"]:
        raise Refused("you are not carrying %s" % ident)
    state["inventory"].remove(ident)
    if state["equipped"] == ident and ident not in state["inventory"]:
        state["equipped"] = None


def cmd_drop(args):
    state = load_state()
    require_playing(state)
    ident = args[0]
    remove_from_inventory(state, ident)
    state["room_items"].setdefault(state["location"], []).append(ident)
    save_state(state)
    print("DROPPED: %s in %s" % (ident, state["location"]))


def cmd_gain(args):
    state = load_state()
    require_playing(state)
    ident = args[0]
    check_carry(state, ident)
    state["inventory"].append(ident)
    save_state(state)
    print("GAINED: %s  [weight %d/%d]" % (ident, carried_weight(state), carry_limit(state)))


def cmd_lose(args):
    state = load_state()
    require_playing(state)
    remove_from_inventory(state, args[0])
    save_state(state)
    print("LOST: %s" % args[0])


def cmd_equip(args):
    state = load_state()
    require_playing(state)
    ident = args[0]
    if ident not in state["inventory"]:
        raise Refused("you are not carrying %s" % ident)
    if not item(ident).get("damage"):
        raise Refused("%s is not a weapon (no damage)" % ident)
    state["equipped"] = ident
    save_state(state)
    print("EQUIPPED: %s (damage %s)" % (ident, item(ident)["damage"]))


def cmd_use(args):
    state = load_state()
    require_playing(state)
    ident = args[0]
    if ident not in state["inventory"]:
        raise Refused("you are not carrying %s" % ident)
    heal = item(ident).get("heal")
    if not heal:
        raise Refused("%s has no mechanical use; use it in the story per its item file" % ident)
    total, faces, mod = dice.roll(heal)
    s = state["stats"]
    before = s["hp"]
    s["hp"] = min(s["max_hp"], s["hp"] + total)
    remove_from_inventory(state, ident)
    save_state(state)
    print("USED %s: heal %s; healed %d. %s" % (ident, dice.describe(heal, total, faces, mod), s["hp"] - before, hp_line(state)))


def cmd_roll(args):
    try:
        state = load_state()
    except Refused:
        state = None  # no game: a loose roll
    spec = args[0]
    total, faces, mod = dice.roll(spec)
    if state:
        save_state(state)  # the run's dice stream has moved on
    print("ROLL %s" % dice.describe(spec, total, faces, mod))


def cmd_check(args):
    state = load_state()
    require_playing(state)
    stat, dc = args[0].lower(), resolve_dc(args[1])
    if stat not in STATS:
        raise Refused("stat must be one of %s" % ", ".join(STATS))
    mod = state["stats"][stat]
    ok, nat, total, note = d20_test(mod, dc)
    save_state(state)  # the run's dice stream has moved on
    print("CHECK %s vs DC %d: d20 %d %+d = %d%s -> %s"
          % (stat, dc, nat, mod, total, note, "SUCCESS" if ok else "FAILURE"))


def cmd_attack(args):
    state = load_state()
    require_playing(state)
    target = args[0]
    if target not in characters_here(state):
        raise Refused("%s is not here" % target)
    foe = ent("characters", target)
    if "hp" not in foe:
        raise Refused("%s has no combat stats and cannot be fought" % target)
    npc = state["npcs"].setdefault(target, {"hp": int(foe["hp"]), "max_hp": int(foe["hp"])})
    if npc["hp"] <= 0:
        raise Refused("%s is already defeated" % target)

    out = []
    # player swings
    weapon = state["equipped"]
    dmg_spec = item(weapon)["damage"] if weapon else BALANCE["unarmed_damage"]
    mod = state["stats"]["might"]
    ok, nat, total, note = d20_test(mod, int(foe["defense"]))
    out.append("PLAYER ATTACKS %s with %s: d20 %d %+d = %d vs defense %s%s -> %s"
               % (target, weapon or "bare hands", nat, mod, total, foe["defense"], note, "HIT" if ok else "MISS"))
    if ok:
        crit = nat == 20 and BALANCE["crit_extra_damage_dice"]
        dmg, faces, dmod = dice.roll(dmg_spec, extra_dice=crit)
        dmg = max(1, dmg)
        npc["hp"] = max(0, npc["hp"] - dmg)
        out.append("  damage %s%s -> %s HP %d/%s"
                   % (dice.describe(dmg_spec, dmg, faces, dmod), " (critical: double dice)" if crit else "",
                      target, npc["hp"], foe["hp"]))
    if npc["hp"] == 0:
        set_flag(state, "%s_defeated" % target)
        out.append("%s IS DEFEATED. Flag set: %s_defeated" % (target.upper(), target))
    else:
        # foe swings back
        amod = int(foe.get("attack", 0))
        ok, nat, total, note = d20_test(amod, player_defense(state))
        out.append("%s ATTACKS: d20 %d %+d = %d vs your defense %d%s -> %s"
                   % (target.upper(), nat, amod, total, player_defense(state), note, "HIT" if ok else "MISS"))
        if ok:
            crit = nat == 20 and BALANCE["crit_extra_damage_dice"]
            dmg, faces, dmod = dice.roll(foe["damage"], extra_dice=crit)
            dmg = max(1, dmg)
            out.append("  damage %s%s -> %s" % (dice.describe(foe["damage"], dmg, faces, dmod),
                                                 " (critical: double dice)" if crit else "", damage_player(state, dmg)))
    save_state(state)
    print("\n".join(out))


def cmd_hurt(args):
    state = load_state()
    require_playing(state)
    total, faces, mod = dice.roll(args[0])
    total = max(0, total)
    msg = damage_player(state, total)
    save_state(state)
    print("HURT %s. %s" % (dice.describe(args[0], total, faces, mod), msg))


def cmd_heal(args):
    state = load_state()
    require_playing(state)
    total, faces, mod = dice.roll(args[0])
    s = state["stats"]
    before = s["hp"]
    s["hp"] = min(s["max_hp"], s["hp"] + max(0, total))
    save_state(state)
    print("HEAL %s; healed %d. %s" % (dice.describe(args[0], total, faces, mod), s["hp"] - before, hp_line(state)))


def cmd_coins(args):
    state = load_state()
    require_playing(state)
    try:
        delta = int(args[0])
    except ValueError:
        raise Refused("coins takes a signed whole number, e.g. +3 or -2")
    if abs(delta) > 999:
        raise Refused("coins changes are at most 999 at a time")
    s = state["stats"]
    if s["coins"] + delta < 0:
        raise Refused("not enough coins: have %d, need %d" % (s["coins"], -delta))
    s["coins"] += delta
    save_state(state)
    print("COINS %+d -> %d" % (delta, s["coins"]))


def cmd_flag(args):
    state = load_state()
    require_playing(state)
    action, name = args[0], args[1]
    if not re.fullmatch(r"[a-z0-9_]+", name):
        raise Refused("flag names are lowercase letters, digits and underscores")
    if name.startswith(("has_", "met_")):
        raise Refused("has_ and met_ names are automatic (carrying an item, having met someone) and can't be set")
    if action == "set":
        set_flag(state, name)
    elif action == "unset":
        if name in state["flags"]:
            state["flags"].remove(name)
    else:
        raise Refused("use: flag set <name> | flag unset <name>")
    save_state(state)
    print("FLAG %s %s. Flags: %s" % (action, name, ", ".join(state["flags"]) or "none"))


def cmd_npc_brief(args):
    """Everything an NPC agent is allowed to know, built from its character file and state."""
    state = load_state()
    ident = args[0]
    if ident not in characters_here(state):
        raise Refused("%s is not in this scene" % ident)
    if is_minor(ident):
        raise Refused("%s is a minor character; the game master plays them directly" % ident)
    why = agents_resting(ident)
    if why:
        raise Refused("%s speaks through you right now (%s). Voice them yourself from `rpg.py show characters %s`, "
                      "as for a [minor] character." % (ident, why, ident))
    ch = ent("characters", ident)
    flags = condition_flags(state)
    lines = ["You are %s, %s." % (ch.get("name", ident), ch.get("role", "a character in this world")), ""]
    now = []
    for heading, text in content.sections(ch["body"]):
        cond = content.section_condition(heading)
        if heading.lower().startswith("gm"):
            continue
        if cond is not None:
            if content.condition_holds(cond, flags):
                now.append(text)
            continue
        lines += ["## " + heading if heading else "", text, ""]
    if now:
        lines += ["## Right now", "\n\n".join(now), ""]
    room = room_here(state)
    others = ["%s (%s)" % (ent("characters", c).get("name", c), ent("characters", c).get("role", ""))
              for c in characters_here(state) if c != ident]
    lines += ["## The scene", "You are at %s. Present: the player%s." % (
        room.get("name", room["id"]), "".join(", " + o for o in others)), ""]
    rumors = state["run"]["rumors"][-3:]
    if rumors:
        lines += ["## Talk going around (you may have heard it)"] + ["- " + r for r in rumors] + [""]
    memory = state["npc_memory"].get(ident, [])
    lines.append("## What you remember about the player")
    lines += ["- " + m for m in memory] if memory else ["You have never met this person before."]
    print("\n".join(l for l in lines).strip())


def cmd_remember(args):
    state = load_state()
    require_playing(state)
    ident, text = args[0], " ".join(args[1:]).strip()
    if not ent_exists("characters", ident):
        raise Refused("no character named %r" % ident)
    if not text:
        raise Refused("usage: remember <character> <one short line>")
    limit = BALANCE["npc"]["memory_line_chars"]
    if len(text) > limit:
        raise Refused("memory lines must be at most %d characters (got %d); shorten it" % (limit, len(text)))
    mem = state["npc_memory"].setdefault(ident, [])
    mem.append(text)
    del mem[:-BALANCE["npc"]["memory_lines"]]
    save_state(state)
    print("REMEMBERED by %s (%d/%d lines): %s" % (ident, len(mem), BALANCE["npc"]["memory_lines"], text))


# ---------------------------------------------------------------- run content: show, generate, notes, world turns

def applicable(body, flags):
    """A body with only the `## If` sections that hold now; every other section is kept."""
    out = []
    for heading, text in content.sections(body):
        cond = content.section_condition(heading)
        if cond is not None and not content.condition_holds(cond, flags):
            continue
        out.append(("## %s\n%s" % (heading, text)) if heading else text)
    return "\n\n".join(out)


def cmd_show(args):
    """show <kind> <id> [--all] | show world: a room, character, item, quest or table as it reads now.
    Authored or generated alike; `## If` sections that don't hold are left out unless --all."""
    try:
        state = load_state()
        flags = condition_flags(state)
    except Refused:
        state, flags = None, None  # no game yet: everything is shown
    if "--all" in args:
        flags = None
        args = [a for a in args if a != "--all"]
    if args[0] == "world":
        w = content.load_world()
        text = (content.game_dir() / "world.md").read_text(encoding="utf-8").strip()
        meta, body = text.split("\n---", 1)[0], w["body"]
        print(meta + "\n---\n" + (body if flags is None else applicable(body, flags)))
        return
    if len(args) < 2:
        raise Refused("usage: show <rooms|characters|items|quests|tables> <id>, or show world")
    kind, ident = args[0], args[1]
    if kind not in content.KINDS:
        raise Refused("kind must be one of %s, or world" % ", ".join(content.KINDS))
    memory = (state or {}).get("npc_memory", {}).get(ident, []) if kind == "characters" else []
    remembered = ("\n\n## What they remember about the player\n" + "\n".join("- " + m for m in memory)) if memory else ""
    if content.exists(kind, ident):
        text = content.path_of(kind, ident).read_text(encoding="utf-8").strip()
        if text.startswith("---") and "\n---" in text[3:]:
            head, body = text[3:].split("\n---", 1)
            text = "---" + head + "\n---\n" + (body.strip() if flags is None else applicable(body.strip(), flags))
        print(text + remembered)
        return
    e = ent(kind, ident)
    meta = {k: v for k, v in e.items() if k not in ("id", "body")}
    print("---")
    for k, v in meta.items():
        if isinstance(v, dict):
            print("%s:" % k)
            for kk, vv in v.items():
                print("  %s: %s" % (kk, vv))
        elif isinstance(v, list):
            print("%s:" % k)
            for x in v:
                print("  - %s" % x)
        else:
            print("%s: %s" % (k, v))
    print("---")
    print((e["body"] if flags is None else applicable(e["body"], flags)) + remembered)


def gen_context(state):
    room = room_here(state)
    here_items = state["room_items"].get(state["location"], [])
    names = [ent(k, i).get("name", i) for k in ("rooms", "characters", "items", "quests") for i in ent_ids(k)]
    ids = [i for k in content.KINDS for i in ent_ids(k)]
    run = state["run"]
    ordering = run.get("ordering") or {}
    maker = ordering.get("maker") if ent_exists("characters", ordering.get("maker") or "") else None
    kind = ordering.get("kind", "craft")
    for i, com in run["commissions"].items():
        if "record" in com:  # a building not finished yet still holds its id and name
            ids.append(i)
            names.append(com["record"]["meta"]["name"])
    return generate.Context(
        location=state["location"], taken_ids=ids, taken_names=names, expand=unused_expansions(room),
        policy=policy(), balance=dict(BALANCE["generation"], max_per_run=SETTINGS["generation"]["max_per_run"]),
        count=run["generated"],
        items_found_here=sum(1 for i in here_items if is_generated("items", i)),
        extras_here=sum(1 for c in run["placements"].get(state["location"], [])
                        if ent("characters", c).get("extra") == "yes"),
        characters_here=characters_here(state), room_ids=ent_ids("rooms"),
        generated_people=list(run["characters"]),
        terrains=list(content.look().get("terrain") or {}), terrain_here=room.get("terrain"),
        moves=run["moves"], maker=maker if kind == "craft" else None, makes=makes(maker) if maker and kind == "craft" else (),
        builder=maker if kind == "build" else None, build_spots=build_spots(state, room), depth_here=room_depth(room))


def apply_patch(state, patch):
    run = state["run"]
    stamp = run["moves"]
    for kind in ("rooms", "characters", "items", "quests"):
        for ident, rec in patch[kind].items():
            run[kind][ident] = dict(rec, made_at_move=stamp)
    for room, ex in patch["exits"].items():
        run["exits"].setdefault(room, {}).update(ex)
    for room, people in patch["placements"].items():
        run["placements"].setdefault(room, []).extend(people)
    for room, items in patch["room_items"].items():
        state["room_items"].setdefault(room, []).extend(items)
    for ident, com in patch["commissions"].items():
        run["commissions"][ident] = com
    # the world's own inventions count toward the run's limit; what the player ordered has its own limits
    run["generated"] = sum(1 for k in ("rooms", "characters", "items", "quests") for rec in run[k].values()
                           if rec["meta"].get("made_by", "world") == "world" and not rec["meta"].get("carried"))


def read_json_arg(args):
    """The proposal: a JSON file (normally proposals/<name>.json, written by the GM), or stdin."""
    if args and not Path(args[0]).is_file():
        raise Refused("no proposal file at %s" % args[0])
    raw = Path(args[0]).read_text(encoding="utf-8") if args else sys.stdin.read()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise Refused("the proposal is not valid JSON: %s" % e)
    if not isinstance(data, dict):
        raise Refused("the proposal must be one JSON object")
    return data


def done_with(args):
    """A proposal file in proposals/ is used up once read, applied or refused, so a stale one can't linger."""
    if args and Path(args[0]).is_file() and Path(args[0]).resolve().parent == (ROOT / "proposals").resolve():
        Path(args[0]).unlink()


MALFORMED = (ValueError, TypeError, AttributeError, KeyError)


def cmd_generate(args):
    """generate <extra|room|item|character|quest> [file]: check a world-agent proposal (JSON on stdin) and add it."""
    state = load_state()
    require_playing(state)
    kind = args[0]
    if kind not in generate.KINDS:
        raise Refused("kind must be one of %s" % ", ".join(generate.KINDS))
    ordering = state["run"].get("ordering") or {}
    maker = ordering.get("maker")
    if kind in ORDER_KINDS and maker and ordering.get("kind", "craft") != kind:
        raise Refused("the open order is a %s order; run `world-brief %s <%s>` first" % (ordering.get("kind", "craft"), kind,
                                                                                      "maker" if kind == "craft" else "builder"))
    try:
        if kind in ORDER_KINDS and maker and maker not in characters_here(state):
            raise Refused("the order was being placed with %s, who isn't here any more; nothing is made" % maker)
        proposal = read_json_arg(args[1:])
        reused = proposal.get("reuse") if kind in generate.REUSE_KINDS else None
        try:
            if reused is not None:
                if state["run"].get("brief") != kind and not can_pay("reuse"):
                    raise Refused("the %s is spent until the next session, so no one comes back: it doesn't happen"
                                  % resource()["name"].lower())
                entry = lib()["entries"].get(reused) if isinstance(reused, str) else None
                if not entry or entry.get("forgotten"):
                    raise ValueError("%r isn't in the library" % (reused,))
                patch = generate.reuse(reused, entry, gen_context(state), kind, proposal.get("direction"))
            else:
                patch = generate.KINDS[kind](proposal, gen_context(state))
        except generate.Declined as e:
            state["run"]["ordering"] = None
            save_state(state)
            raise Refused("%s turns the order down: %s. Narrate it in character; nothing is made"
                          % (ent("characters", maker).get("name", maker), e))
        except ValueError as e:
            raise Refused("proposal rejected: %s" % e)
        except MALFORMED[1:] as e:
            raise Refused("proposal rejected: it doesn't match the JSON shape in the brief (%s)" % e)
    finally:
        done_with(args[1:])
    if kind == "build":  # a newer order for the same spot replaces an unpaid one
        com = next(iter(patch["commissions"].values()))
        for i, old in list(state["run"]["commissions"].items()):
            if old["kind"] == "room" and old["status"] == "ordered" and (old["room"], old["direction"]) == (com["room"], com["direction"]):
                del state["run"]["commissions"][i]
    apply_patch(state, patch)
    if kind in ORDER_KINDS:
        state["run"]["ordering"] = None
        save_state(state)
        for i, com in patch["commissions"].items():
            who = ent("characters", com["maker"]).get("name", com["maker"])
            if kind == "craft":
                meta = patch["items"][i]["meta"]
                print("COMMISSIONED: %s (%s), %s, from %s" % (meta["name"], i, meta["tier"].replace("_", " "), who))
                print("PRICE: %s. The maker names it in character. When the player pays, run `pay %s` (or `pay %s <material>`); "
                      "until then it isn't theirs." % (price_text(com), i, i))
            else:
                print("COMMISSIONED: %s (%s), to be built %s of here by %s" % (com["record"]["meta"]["name"], i, com["direction"], who))
                print("PRICE: %s. The builder names it in character. When the player pays, run `pay %s`; it takes %s to build, "
                      "and until then it doesn't exist." % (price_text(com), i, moves_text(int(BALANCE["generation"]["build_moves"]))))
        return
    paid_for = state["run"].get("brief") == kind
    state["run"]["brief"] = None
    save_state(state)
    if reused is not None:
        data = lib()
        library.seen(data, reused)
        lib_save(data)
        if paid_for:  # bringing something back is cheaper than inventing it
            refund(price("generate") - price("reuse"))
        else:
            charge("reuse")
    else:
        record_patch(state, kind, patch)
    made = ["%s %s (%s)" % (k[:-1], patch[k][i]["meta"].get("name", i), i)
            for k in ("rooms", "characters", "items", "quests") for i in patch[k]]
    print("GENERATED: %s" % ", ".join(made))
    for room, ex in patch["exits"].items():
        for d, dest in ex.items():
            print("  new exit: %s %s -> %s" % (room, d, dest))
    for room, items in patch["room_items"].items():
        print("  placed in %s: %s" % (room, ", ".join(items)))
    for room, people in patch["placements"].items():
        print("  present in %s: %s" % (room, ", ".join(people)))
    if reused is not None:
        print("  (brought back from an earlier run; the player hasn't met them in this one)")
    print("Read them with `rpg.py show <kind> <id>`. Run total: %d/%d" % (state["run"]["generated"], SETTINGS["generation"]["max_per_run"]))


def cmd_pay(args):
    """pay <order> [<material>]: the player pays the maker or builder for an order, in money or (for a made item)
    with an item they take in trade. A made item is handed over at once and is the player's own; a building
    starts, and is finished `generation.build_moves` moves later."""
    state = load_state()
    require_playing(state)
    ident, run = args[0], state["run"]
    com = run["commissions"].get(ident)
    if not com or com["status"] != "ordered":
        waiting = [i for i, c in run["commissions"].items() if c["status"] == "ordered"]
        raise Refused("no unpaid order %r. Orders waiting: %s" % (ident, ", ".join(waiting) or "none"))
    maker = com["maker"]
    who = ent("characters", maker).get("name", maker)
    if maker not in characters_here(state):
        raise Refused("%s isn't here; the order waits with them" % who)
    s = state["stats"]
    material = args[1] if len(args) > 1 else None
    if material and com["kind"] == "room":
        raise Refused("%s builds for %s only" % (who, currency()))
    if com["kind"] == "room" and com["direction"] not in build_spots(state, ent("rooms", com["room"])):
        raise Refused("something is already being built %s of here" % com["direction"])
    if material:
        if material not in accepts(maker):
            raise Refused("%s takes no %s in trade (takes: %s)" % (who, material, ", ".join(accepts(maker)) or "only " + currency()))
        remove_from_inventory(state, material)
        paid = "PAID WITH: %s" % material
    else:
        if s["coins"] < com["price"]:
            raise Refused("not enough %s: the price is %d and the player has %d" % (currency(), com["price"], s["coins"]))
        s["coins"] -= com["price"]
        paid = "COINS -%d -> %d" % (com["price"], s["coins"])
    if com["kind"] == "room":
        wait = int(BALANCE["generation"]["build_moves"])
        com.update(status="building", paid_at=run["moves"], ready_at=run["moves"] + wait)
        save_state(state)
        print(paid)
        print("BUILDING: %s (%s), %s of here, by %s: ready in %s. It doesn't exist until then."
              % (order_name(ident, com), ident, com["direction"], who, moves_text(wait)))
        return
    com.update(status="done", paid_at=run["moves"])
    check_carry(state, ident)
    state["inventory"].append(ident)
    save_state(state)
    data = lib()
    library.add(data, lib_limit(), ident, "items", "player", run["items"][ident], where=None)
    lib_save(data)
    print(paid)
    print("MADE: %s (%s), made for the player by %s. It's theirs now.  [weight %d/%d]"
          % (item(ident).get("name", ident), ident, who, carried_weight(state), carry_limit(state)))


def cmd_library(args):
    """library suggest <id> <why>: tell the owner a generated or player-made thing deserves keeping for good.
    The owner decides (tools/library.py); this only marks the entry."""
    if args[0] != "suggest" or len(args) < 3:
        raise Refused("use: library suggest <id> <one short line why>")
    data = lib()
    e = data["entries"].get(args[1])
    if not e:
        raise Refused("%s isn't in the library (only generated and player-made things are)" % args[1])
    e["suggested"] = short_line(" ".join(args[2:]), "library suggest")
    lib_save(data)
    print("SUGGESTED for keeping: %s (%s). The owner decides." % (e["record"]["meta"].get("name", args[1]), e["suggested"]))


def cmd_note(args):
    """note <text>: record a small detail you established about this room, so it stays true."""
    state = load_state()
    text = short_line(" ".join(args), "note")
    notes = state["run"]["notes"].setdefault(state["location"], [])
    notes.append(text)
    del notes[:-BALANCE["world"]["notes_per_room"]]
    save_state(state)
    print("NOTED for %s: %s" % (state["location"], text))


def cmd_chronicle(args):
    """chronicle <text>: one line for the story so far."""
    state = load_state()
    text = short_line(" ".join(args), "chronicle")
    state["run"]["chronicle"].append(text)
    save_state(state)
    print("CHRONICLED: %s" % text)


def _section(body, title):
    for heading, text in content.sections(body):
        if heading.lower() == title.lower():
            return text
    return ""


def cmd_world_brief(args):
    """world-brief <extra|room|item|character|quest|turn>: the prompt for the world agent."""
    state = load_state()
    request = args[0]
    if request not in tuple(generate.KINDS) + ("turn",):
        raise Refused("request must be one of %s, turn" % ", ".join(generate.KINDS))
    pol = policy()
    maker = None
    if request in ORDER_KINDS:
        if len(args) < 2:
            raise Refused("usage: world-brief %s <%s>" % (request, "maker" if request == "craft" else "builder"))
        maker = args[1]
        if maker not in characters_here(state):
            raise Refused("%s isn't here to take an order" % maker)
        if request == "craft" and not makes(maker):
            raise Refused("%s makes nothing to order; they turn the request away in character" % maker)
        if request == "build" and not builds(maker):
            raise Refused("%s builds nothing to order; they turn the request away in character" % maker)
        if request == "build" and not build_spots(state, room_here(state)):
            raise Refused("there's nowhere here that anything could be built; %s says so in character" % maker)
        why = why_no_order(state, request)
        if why:
            raise Refused("%s; %s turns the order away in character" % (why, maker))
    elif request != "turn" and not pol[{"extra": "extras", "room": "rooms", "item": "items",
                                        "character": "characters", "quest": "side_quests"}[request]]:
        raise Refused("no new %ss can appear in this game (its content or the owner's settings rule them out): "
                      "it doesn't exist" % request)
    if request == "turn" and not SETTINGS["world_turns"]["on"]:
        raise Refused("world turns are off in this game's settings; nothing happens off-screen")
    cost = {"turn": "world_turn", "craft": "craft", "build": "build"}.get(request, "generate")
    if not can_pay(cost):
        raise Refused("the %s is spent until the next session, so nothing new turns up: it doesn't exist"
                      % resource()["name"].lower())
    w = world()
    room = room_here(state)
    if request == "room" and not unused_expansions(room):
        raise Refused("%s has no direction left where a new place could be; "
                      "the way the player wants doesn't exist" % room.get("name", room["id"]))
    flags = condition_flags(state)
    desc = [room["body"].split("\n## ")[0].strip()]
    for heading, text in content.sections(room["body"]):
        cond = content.section_condition(heading)
        if cond and content.condition_holds(cond, flags):
            desc.append(text)
    run = state["run"]
    out = ["# World brief: %s" % request, "",
           "## The adventure", "%s. %s" % (w.get("title", ""), _section(w["body"], "Tone")), "",
           "## What everyone around here knows", _section(w["body"], "Public knowledge") or "(nothing listed)", "",
           "## Where the player is", "%s. %s" % (room.get("name", room["id"]), " ".join(desc))]
    notes = run["notes"].get(room["id"], [])
    if notes:
        out += ["Established details: " + " | ".join(notes)]
    texture = [x for x in (time_of_day(state), run.get("weather")) if x]
    if texture:
        out += ["Time and weather: " + ", ".join(texture)]
    out += ["", "## Names and ids already in use (never reuse or imitate them)"]
    for kind in ("rooms", "characters", "items", "quests"):
        out.append("- %s: %s" % (kind, ", ".join("%s (%s)" % (i, ent(kind, i).get("name", i)) for i in ent_ids(kind))))
    if run["chronicle"]:
        out += ["", "## The story so far"] + ["- " + c for c in run["chronicle"][-6:]]
    fits, lib_data = [], None
    if request in REQUEST_KIND:
        kind = REQUEST_KIND[request]
        lib_data = lib()
        fits = library.fitting(lib_data, kind, request == "extra", room["id"], set(ent_ids(kind)),
                               int(BALANCE["library"]["brief_entries"]))
        if fits:
            out += ["", "## From earlier runs (bring one back if it fits here, rather than inventing)"]
            out += ["- %s: %s" % (i, library.summary(lib_data["entries"][i])) for i in fits]
        run["brief"] = request
    out += ["", "## Your task"]
    g = BALANCE["generation"]
    out += ["Limits: ids 3-30 characters; names up to 40; each line of 'knows' or 'rumors' up to 160 characters, at most 3 lines;",
            "roles up to 80; look and speech up to 200; personality and summary up to 300; room descriptions up to 900.", ""]
    if request == "turn":
        people = ["%s (%s), now at %s" % (c, ent("characters", c).get("name", c),
                                         next((r for r, ps in run["placements"].items() if c in ps), "?"))
                  for c in run["characters"]]
        built = ["%s (%s)" % (r, ent("rooms", r).get("name", r)) for r in run["rooms"] if made_by("rooms", r) == "player"]
        out += ["Time passes off-screen. Write what people around here start saying, based only on the story so far",
                "and public knowledge, and optionally move generated people to another room that exists.",
                "Generated people: %s" % (", ".join(people) or "none"),
                "Places the player had built (people may start using them, and talking about them): %s" % (", ".join(built) or "none"),
                "Rooms: %s" % ", ".join(ent_ids("rooms")),
                'JSON: {"rumors": ["<up to 3 short lines of gossip>"], "moves": [{"id": "<generated person>", "room": "<room id>"}]}']
    elif request == "extra":
        out += ["Make the unnamed person the player is addressing into someone specific, consistent with this place.",
                "They know ONLY public knowledge, what anyone here could see, and gossip; no secrets, no clues beyond that.",
                'JSON: {"id": "<new_id>", "name": "<name>", "role": "<what they are, a few words>", "look": "<one line>",',
                '       "speech": "<how they talk>", "knows": ["<up to 3 short lines>"]}']
    elif request == "room":
        out += ["Make the new place the player is heading into, %s from here." % " or ".join(unused_expansions(room)),
                "It is small and self-contained. It must not hold anything the main quest needs, and nothing that solves it.",
                "Items get a tier, never numbers: %s. Up to 2 items and 1 character (see the character schema; optional)." % ", ".join(g["item_tiers"]),
                "Its terrain is one of: %s (optional; it defaults to this room's)." % ", ".join(content.look().get("terrain") or {}),
                'JSON: {"id": "<new_id>", "name": "<name>", "direction": "<%s>", "terrain": "<terrain>", "description": "<what the player sees, 2-4 sentences>",' % "|".join(unused_expansions(room)),
                '       "items": [{"id": "...", "name": "...", "description": "...", "tier": "<tier>"}], "characters": []}']
    elif request == "item":
        out += ["Make one small thing the player finds here by searching. Modest: not a key to anything, not quest-related.",
                "Tiers (stats come from the tier): %s." % ", ".join(g["item_tiers"]),
                'JSON: {"id": "<new_id>", "name": "<name>", "description": "<one or two sentences>", "tier": "<tier>"}']
    elif request == "character":
        out += ["Make a minor character who would plausibly be here. They know only public knowledge and their own life.",
                "Optional: up to 2 trades of new items (price 1-6 coins), and a fighting tier (%s) only if they would fight." % ", ".join(g["foe_tiers"]),
                'JSON: {"id": "...", "name": "...", "role": "...", "personality": "...", "speech": "...", "knows": ["..."],',
                '       "wants": "...", "trades": [{"item": {"id": "...", "name": "...", "description": "...", "tier": "..."}, "price": 2}], "tier": null}']
    elif request == "craft":
        ch = ent("characters", maker)
        who = ch.get("name", maker)
        out += ["The player is ordering something from %s (%s). Shape what they ask for into one item %s would make."
                % (who, ch.get("role", ""), who),
                "%s makes only these kinds of thing (an item's stats come from its kind, never from you): %s."
                % (who, ", ".join(makes(maker)))]
        trade = next((t for h, t in content.sections(ch["body"]) if re.fullmatch(r"What \w+ makes?", h)), "")
        if trade:
            out.append("Their trade: " + " ".join(trade.split()))
        out += ["Keep the player's idea, and their name for it if they gave one. It is modest: nothing beyond its kind,",
                "and nothing the main quest needs. If the request is outside the trade, or would solve or shortcut the main",
                "quest, turn it down instead.",
                'JSON: {"id": "<new_id>", "name": "<name>", "description": "<one or two sentences>", "tier": "<%s>"}' % "|".join(makes(maker)),
                'or, to turn it down: {"refuse": "<why, in a few words>"}']
        run["ordering"] = {"maker": maker, "kind": "craft"}
    elif request == "build":
        ch = ent("characters", maker)
        who, spots = ch.get("name", maker), build_spots(state, room)
        out += ["The player is asking %s (%s) to build something here. Where it can go:" % (who, ch.get("role", ""))]
        out += ["- %s: %s" % kv for kv in spots.items()]
        trade = next((t for h, t in content.sections(ch["body"]) if re.fullmatch(r"What \w+ builds?", h)), "")
        if trade:
            out.append("What %s builds: %s" % (who, " ".join(trade.split())))
        out += ["Shape what they ask for into one small place that fits that spot, and keep the name they gave it if any.",
                "It starts empty (no items, no people), and it must not hold or replace anything the main quest needs.",
                "If the request doesn't fit the spot or the builder, turn it down instead.",
                "Its terrain is one of: %s (optional; it defaults to this room's)." % ", ".join(content.look().get("terrain") or {}),
                'JSON: {"id": "<new_id>", "name": "<name>", "direction": "<%s>", "terrain": "<terrain>",' % "|".join(spots),
                '       "description": "<what the player will see there, 2-4 sentences>"}',
                'or, to turn it down: {"refuse": "<why, in a few words>"}']
        run["ordering"] = {"maker": maker, "kind": "build"}
    elif request == "quest":
        here = characters_here(state)
        out += ["Make a small side quest offered by someone present (%s). It must not touch the main quest." % ", ".join(here or ["no one"]),
                "Its flags are its own: side_<quest id>_<word>. Conditions may also use has_<item> and met_<character>.",
                "Reward: 0-%d coins and optionally one new item (a tier)." % g["side_quest_max_coins"],
                'JSON: {"id": "...", "name": "...", "giver": "<id>", "summary": "...",',
                '       "objectives": [{"text": "...", "done_when": "side_<id>_<word>"}], "reward": {"coins": 2, "item": null}}']
    if fits:
        out.append('or, to bring one back from earlier runs: {"reuse": "<id from that list>"%s}'
                   % (', "direction": "<%s>"' % "|".join(unused_expansions(room)) if request == "room" else ""))
    out += ["", "Reply with the JSON object only."]
    charge(cost)
    save_state(state)
    print("\n".join(out))


def cmd_world_turn(args):
    """world-turn [file]: apply the world agent's off-screen turn (JSON on stdin)."""
    state = load_state()
    try:
        proposal = read_json_arg(args)
        try:
            patch = generate.world_turn(proposal, gen_context(state))
        except ValueError as e:
            raise Refused("world turn rejected: %s" % e)
        except MALFORMED[1:] as e:
            raise Refused("world turn rejected: it doesn't match the JSON shape in the brief (%s)" % e)
    finally:
        done_with(args)
    run = state["run"]
    run["rumors"].extend(patch["rumors"])
    del run["rumors"][:-BALANCE["world"]["rumors_kept"]]
    for mv in patch["moves"]:
        for people in run["placements"].values():
            if mv["id"] in people:
                people.remove(mv["id"])
        run["placements"].setdefault(mv["room"], []).append(mv["id"])
    run["world_turn_due"] = False
    save_state(state)
    print("WORLD TURN: %d rumors, %d moves" % (len(patch["rumors"]), len(patch["moves"])))
    for r in patch["rumors"]:
        print("  rumor: %s" % r)
    for mv in patch["moves"]:
        print("  %s is now at %s" % (mv["id"], mv["room"]))


OPEN_KEYS = ("terrain", "by_command")  # a game may add its own terrain kinds and command phrases


def unknown_keys(over, base, where, problems):
    """Keys in a game's JSON that the kit's defaults don't have: almost always a typo."""
    for k, v in over.items():
        if k not in base:
            problems.append("%s: unknown key %r (known: %s)" % (where, k, ", ".join(base)))
        elif isinstance(v, dict) and isinstance(base[k], dict) and base[k] and k not in OPEN_KEYS:
            unknown_keys(v, base[k], "%s %s" % (where, k), problems)


def validate_game():
    """Every problem in the active game's content: references, formats, and its JSON settings."""
    problems = []
    for name, base in (("look.json", content.kit_look()), ("balance.json", content.kit_balance())):
        try:
            data = content.game_json(name)
        except ValueError as e:
            problems.append("%s: not valid JSON (%s)" % (name, e))
            continue
        unknown_keys(data, base, name, problems)
    presets = content.kit_presets()
    try:
        own = content.game_json("settings.json")
    except ValueError as e:
        own = {}
        problems.append("settings.json: not valid JSON (%s)" % e)
    unknown_keys(own, {"preset": "", "overrides": {}}, "settings.json", problems)
    if own.get("preset", "normal") not in presets:
        problems.append("settings.json: unknown preset %r (presets: %s)" % (own.get("preset"), ", ".join(presets)))
    overrides = own.get("overrides") or {}
    unknown_keys(overrides, presets["normal"], "settings.json overrides", problems)
    for c in ((overrides.get("npc_agents") or {}).get("characters") or {}):
        if not content.exists("characters", c):
            problems.append("settings.json npc_agents characters: unknown character %r" % c)
        elif str(content.load("characters", c).get("minor", "no")).lower() == "yes":
            problems.append("settings.json npc_agents characters: %r is minor, so it never has an agent" % c)
    look = content.look()
    color = re.compile(r"^(#[0-9a-fA-F]{6}|[a-z]+)$")
    terrains = look.get("terrain") or {}
    for name, t in terrains.items():
        for k in ("bg", "fg"):
            if not color.match(str((t or {}).get(k, ""))):
                problems.append("look.json terrain %s: %s must be a color like #1f4060" % (name, k))
    sounds_dir = ROOT / "mod" / "sounds"  # the mod's sound bank; without the mod there's nothing to check against
    bank = {p.stem for p in sounds_dir.glob("*.wav")}
    for beat, sound in (look.get("sounds") or {}).items() if sounds_dir.is_dir() else ():
        if sound is not None and sound not in bank:
            problems.append("look.json sounds %s: no kit sound %r (the bank: %s)" % (beat, sound, ", ".join(sorted(bank))))
    times = world().get("times") or []
    for t in (look["palette"].get("accent_by_time") or {}):
        if t not in times:
            problems.append("look.json palette accent_by_time: %r is not one of world.md's times" % t)
    for r in content.ids("rooms"):
        room = content.load("rooms", r)
        if room.get("terrain") is not None and room["terrain"] not in terrains:
            problems.append("rooms/%s.md: terrain %r isn't in the look's terrain (%s)" % (r, room["terrain"], ", ".join(terrains)))
        if room.get("color") is not None and not color.match(str(room["color"])):
            problems.append("rooms/%s.md: color must look like #4a6b8a" % r)
    for c in content.ids("characters"):
        card = content.load("characters", c).get("card")
        if card is not None and not color.match(str(card)):
            problems.append("characters/%s.md: card must be a color like #8fae4a" % c)
    for t in look.get("tabs") or []:
        if t not in ("here", "map", "journal"):
            problems.append("look.json tabs: unknown tab %r (tabs: here, map, journal)" % t)
    for stat in STATS:
        if not str(look["stat_labels"].get(stat, "")).strip():
            problems.append("look.json stat_labels: %s needs a label" % stat)

    def need(kind, ident, where):
        if not content.exists(kind, ident):
            problems.append("%s: unknown %s %r" % (where, kind[:-1], ident))

    def need_dice(spec, where):
        try:
            dice.parse(spec)
        except ValueError as e:
            problems.append("%s: %s" % (where, e))

    w = content.load_world()
    need("rooms", w.get("start_room", ""), "world.md start_room")
    for i in (w.get("inventory") or []):
        need("items", i, "world.md inventory")
    for k, spec in (w.get("rolls") or {}).items():
        need_dice(spec, "world.md rolls %s" % k)
    variant_flags = set()
    for name, opts in (w.get("variants") or {}).items():
        if len(options_of(opts)) < 2:
            problems.append("world.md variants %s: needs at least two comma-separated flags" % name)
        variant_flags.update(options_of(opts))
    if w.get("clock"):
        for k in ("name", "moves", "flag"):
            if k not in w["clock"]:
                problems.append("world.md clock: missing %s" % k)
        need_dice(w["clock"].get("moves", "1"), "world.md clock moves")
        if bool(w["clock"].get("also_if")) != bool(w["clock"].get("also_flag")):
            problems.append("world.md clock: also_if and also_flag go together")
    for k, v in (w.get("generation") or {}).items():
        if k not in GEN_KINDS:
            problems.append("world.md generation: unknown kind %r (kinds: %s)" % (k, ", ".join(GEN_KINDS)))
        elif str(v).lower() not in (("yes", "no", "marked", "anywhere") if k == "rooms" else ("yes", "no")):
            problems.append("world.md generation %s: %r should be %s" % (k, v, "yes, no, marked or anywhere" if k == "rooms" else "yes or no"))
    pos = layout()
    claimed = {}
    for r in content.ids("rooms"):
        room = content.load("rooms", r)
        where = "rooms/%s.md" % r
        for d, t in (room.get("exits") or {}).items():
            need("rooms", content.split_condition(t)[0], where + " exit " + d)
        for i in (room.get("items") or []):
            need("items", content.split_condition(i)[0], where + " items")
        for c in (room.get("characters") or []):
            need("characters", content.split_condition(c)[0], where + " characters")
        if room.get("expand") is not None and not isinstance(room["expand"], (str, list)):
            problems.append("%s: expand must be directions, comma-separated or as a list, or no" % where)
        expand = [] if str(room.get("expand")).strip().lower() in ("no", "none") else options_of(room.get("expand") or "")
        for d in expand:
            if d not in generate.OPPOSITE:
                problems.append("%s: expand direction %r has no opposite" % (where, d))
            if d in (room.get("exits") or {}):
                problems.append("%s: expand direction %r is already an exit" % (where, d))
        spots = room.get("build")
        if spots is not None and not isinstance(spots, dict):
            problems.append("%s: build gives directions, each with what could be built there (direction: text)" % where)
            spots = {}
        for d in spots or {}:
            if d not in generate.OPPOSITE:
                problems.append("%s: build direction %r has no opposite" % (where, d))
            elif d in (room.get("exits") or {}) or d in expand:
                problems.append("%s: build direction %r is already an exit or an expand direction" % (where, d))
            elif not square_free(r, d, pos):
                problems.append("%s: build direction %r would land on another room's map square" % (where, d))
            sq = square_of(r, d, pos)
            if sq and sq in claimed:
                problems.append("%s: build direction %r takes the same map square as a build spot in %s" % (where, d, claimed[sq]))
            elif sq:
                claimed[sq] = r
        if spots and not any(str(content.load("characters", c).get("builds", "no")).lower() == "yes"
                             for c in (content.split_condition(x)[0] for x in room.get("characters") or [])
                             if content.exists("characters", c)):
            problems.append("%s: has build spots but no builder (`builds: yes`) among its characters" % where)
        if room.get("encounters"):
            need("tables", room["encounters"], where + " encounters")
    for t in content.ids("tables"):
        table = content.load("tables", t)
        if not re.match(r"^\s*\d+\s+in\s+\d+\s*$", str(table.get("chance", ""))):
            problems.append("tables/%s.md: chance must look like '2 in 6'" % t)
        for e in table.get("entries") or []:
            m = _EFFECT.search(e)
            if not m:
                continue
            words = m.group(1).split()
            if words[0] not in ("coins", "gain", "hurt", "heal", "flag", "none"):
                problems.append("tables/%s.md: unknown effect %r" % (t, m.group(1)))
            elif words[0] == "gain" and len(words) > 1:
                need("items", words[1], "tables/%s.md gain" % t)
            elif words[0] in ("hurt", "heal") and len(words) > 1:
                need_dice(words[1], "tables/%s.md %s" % (t, words[0]))
    for q in content.ids("quests"):
        for line in content.load("quests", q).get("objectives") or []:
            if not _DONE.match(str(line)):
                problems.append("quests/%s.md: objective needs '(done when <condition>)': %s" % (q, line))
    art_dir = content.game_dir() / "art"
    for a in (sorted(art_dir.glob("*.txt")) if art_dir.is_dir() else []):
        need("rooms", a.stem, "art/%s" % a.name)
    for c in content.ids("characters"):
        ch = content.load("characters", c)
        if str(ch.get("minor", "no")).lower() not in ("yes", "no"):
            problems.append("characters/%s.md: minor must be yes or no" % c)
        if "hp" in ch:
            for k in ("defense", "attack", "damage"):
                if k not in ch:
                    problems.append("characters/%s.md: has hp but no %s" % (c, k))
        for t in options_of(ch.get("makes") or ""):
            if t not in BALANCE["generation"]["item_tiers"]:
                problems.append("characters/%s.md: makes %r, which isn't an item tier (%s)"
                                % (c, t, ", ".join(BALANCE["generation"]["item_tiers"])))
        for i in options_of(ch.get("accepts") or ""):
            need("items", i, "characters/%s.md accepts" % c)
        if str(ch.get("builds", "no")).lower() not in ("yes", "no"):
            problems.append("characters/%s.md: builds must be yes or no" % c)
        if ch.get("accepts") and not ch.get("makes"):
            problems.append("characters/%s.md: accepts goes with makes (it's what a maker takes in trade)" % c)
    for t in BALANCE["generation"]["item_tiers"]:
        if t not in BALANCE["generation"]["craft_price"]:
            problems.append("balance.json generation craft_price: no price for the item tier %r" % t)
    for i in content.ids("items"):
        it = content.load("items", i)
        for k in ("damage", "heal"):
            if it.get(k):
                need_dice(it[k], "items/%s.md" % i)
    flag_text = "\n".join(path.read_text(encoding="utf-8") for path in content.game_dir().rglob("*.md"))
    for c in content.ids("curses"):
        meta, where = content.load("curses", c), "curses/%s.md" % c
        try:
            curse.parse(meta.get("effect"))
        except ValueError as e:
            problems.append("%s: %s" % (where, e))
        for key in ("caused_by", "cured_by"):
            if not meta.get(key):
                problems.append("%s: needs %s (a condition); every curse has a cause and a cure" % (where, key))
        own = content.path_of("curses", c).read_text(encoding="utf-8")
        for term in generate.TERM.findall(str(meta.get("cured_by") or "")):
            if term.startswith("has_"):
                need("items", term[4:], where + " cured_by")
            elif term.startswith("met_"):
                need("characters", term[4:], where + " cured_by")
            elif flag_text.replace(own, "").count(term) == 0:
                problems.append("%s: nothing in the game sets %r, so the curse can't be cured" % (where, term))
    return problems, "%d rooms, %d characters, %d items, %d quests, %d tables, %d curses" % tuple(len(content.ids(k)) for k in content.KINDS)


def cmd_validate(args):
    """validate [--game <id>]: check every installed game (or one) for broken references and formats."""
    games = content.list_games()
    if "--game" in args:
        want = args[args.index("--game") + 1:][:1]
        if not want or want[0] not in games:
            raise Refused("validate --game <id>, one of: %s" % ", ".join(games))
        games = want
    if not games:
        raise Refused("no games installed in games/")
    bad = False
    for g in games:
        choose_game(g)
        problems, summary = validate_game()
        if problems:
            bad = True
            print("\n".join("%s: %s" % (g, x) for x in problems))
        else:
            print("CONTENT OK: %s: %s" % (g, summary))
    if bad:
        sys.exit(1)


# ---------------------------------------------------------------- the meter and the owner's switches

def resave_view():
    """After the meter moves, refresh the save's view so the interface shows it (when there's a save)."""
    try:
        state = load_state()
    except Refused:
        return
    save_state(state)


def meter_line():
    m, res = meter(), resource()
    return "%s %d/%d" % (res["name"], m["left"], m["capacity"])


def cmd_curse_text(args):
    """curse-text <the player's words>: the words as they come out under any curse, as JSON for the prompt hook:
    {"curses": [names], "text": "<as they came out>"}. No curse (or no game): the words unchanged."""
    text = " ".join(args)
    try:
        state = load_state()
    except Refused:
        state = None
    active = active_curses(state) if state else []
    print(json.dumps({"curses": [c.get("name", c["id"]) for c in active], "text": cursed_words(state, text) if active else text},
                     ensure_ascii=False))


def cmd_meter(args):
    """meter [refill]: the meter, or fill it to capacity (the SessionStart hook does this)."""
    if args and args[0] == "refill":
        write_json(METER, {"left": meter()["capacity"]})
        resave_view()
        print("REFILLED: %s" % meter_line())
        return
    if args:
        raise Refused("use: meter | meter refill")
    print("METER: %s (%s)" % (meter_line(), meter_state()))


def cmd_settings(args):
    """settings: the owner's switches for this game and what each action costs. Change them with tools/settings.py."""
    v = settings_view()
    on = lambda b: "on" if b else "off"  # noqa: E731
    print("GAME: %s, preset %s" % (content.game_id(), v["preset"]))
    print("METER: %s; refills each time Claude Code is opened here" % meter_line())
    print("PRICES: %s" % ", ".join("%s %d" % kv for kv in v["prices"].items()))
    a = v["npc_agents"]
    print("NPC AGENTS: %s, up to %d lines between two per turn%s" % (
        on(a["on"]), a["lines_per_exchange"], "; game master voices %s" % ", ".join(a["off_for"]) if a["off_for"] else ""))
    print("WORLD TURNS: %s, every %s" % (on(v["world_turns"]["on"]), moves_text(v["world_turns"]["every_moves"])))
    g = v["generation"]
    print("GENERATION: %s, at most %d per run; kinds: %s" % (on(g["on"]), g["max_per_run"], ", ".join(g["kinds"]) or "none"))
    print("CRAFTING: %s, at most %d orders per run" % (on(v["crafting"]["on"]), v["crafting"]["max_per_run"]))
    print("BUILDING: %s, at most %d orders per run" % (on(v["building"]["on"]), v["building"]["max_per_run"]))


# ---------------------------------------------------------------- games: list, show, switch

def shelved(ident):
    return SHELF / ("%s.json" % ident)


def save_summary(data):
    if not isinstance(data, dict):
        return "no game yet"
    if data.get("version", 1) < OLDEST_VERSION:
        return "an old save that can't be continued"
    return "%s, %s in" % (data.get("status", "?"), moves_text((data.get("run") or {}).get("moves", 0)))


def title_of(ident):
    content.use_game(ident)
    title = content.load_world().get("title", ident)
    content.use_game(active_game())
    return title


def cmd_game(args):
    """game [list | show | switch <id>]: the installed games, and which one is being played."""
    current = active_game()
    action = args[0] if args else "show"
    if action == "list":
        for g in content.list_games():
            data = read_json(SAVE) if g == current else read_json(shelved(g))
            print("%s %s: %s (%s)" % ("*" if g == current else " ", g, title_of(g), save_summary(data)))
        return
    if action == "show":
        print("GAME: %s (%s), in games/%s/" % (title_of(current), current, current))
        return
    if action != "switch":
        raise Refused("use: game list | game show | game switch <id>")
    games = content.list_games()
    if len(args) < 2 or args[1] not in games:
        raise Refused("game switch <id>, one of: %s" % ", ".join(games))
    target = args[1]
    if target == current:
        print("ALREADY PLAYING: %s" % title_of(target))
        return
    if SAVE.is_file():
        SHELF.mkdir(parents=True, exist_ok=True)
        os.replace(SAVE, shelved(current))
    if shelved(target).is_file():
        os.replace(shelved(target), SAVE)
    write_json(ACTIVE, {"game": target})
    choose_game(target)
    if not SAVE.is_file():
        print("SWITCHED to %s. No game yet: start one with /newgame." % title_of(target))
        return
    print("SWITCHED to %s. The saved game continues." % title_of(target))
    cmd_look([])


COMMANDS = {
    "newgame": (cmd_newgame, 0, "newgame [seed|daily]   start the active game afresh (rolls stats, variants and the clock from the seed)"),
    "look": (cmd_look, 0, "show state + current room (exits/items/characters filtered by flags)"),
    "move": (cmd_move, 1, "move <direction|room_id>   (also runs the clock and any encounter)"),
    "take": (cmd_take, 1, "take <item>   pick up from the current room"),
    "drop": (cmd_drop, 1, "drop <item>   leave in the current room"),
    "gain": (cmd_gain, 1, "gain <item>   receive from a character (trade/gift)"),
    "lose": (cmd_lose, 1, "lose <item>   give away or spend in the story"),
    "equip": (cmd_equip, 1, "equip <item>  wield a weapon"),
    "use": (cmd_use, 1, "use <item>    consume an item with a heal value"),
    "roll": (cmd_roll, 1, "roll <dice>   e.g. 2d6+1"),
    "check": (cmd_check, 2, "check <might|agility|wits> <dc|easy|normal|hard>"),
    "attack": (cmd_attack, 1, "attack <character>   one exchange of blows"),
    "hurt": (cmd_hurt, 1, "hurt <dice>   damage the player"),
    "heal": (cmd_heal, 1, "heal <dice>   heal the player"),
    "coins": (cmd_coins, 1, "coins <+n|-n>"),
    "flag": (cmd_flag, 2, "flag set|unset <name>"),
    "npc-brief": (cmd_npc_brief, 1, "npc-brief <character>   what an NPC agent may know (prompt for its subagent)"),
    "remember": (cmd_remember, 2, "remember <character> <text>   add a line to that NPC's memory of the player"),
    "show": (cmd_show, 1, "show <rooms|characters|items|quests|tables> <id> [--all] | show world   content as it reads now"),
    "world-brief": (cmd_world_brief, 1, "world-brief <extra|room|item|character|quest|turn> | craft <maker> | build <builder>   prompt for the world agent"),
    "generate": (cmd_generate, 2, "generate <extra|room|item|character|quest|craft|build> <file>   add a world-agent proposal (a JSON file)"),
    "pay": (cmd_pay, 1, "pay <order> [material]   the player pays a maker or builder for an order"),
    "world-turn": (cmd_world_turn, 1, "world-turn <file>   apply the world agent's off-screen turn (a JSON file)"),
    "library": (cmd_library, 1, "library suggest <id> <why>   tell the owner a generated or player-made thing deserves keeping"),
    "note": (cmd_note, 1, "note <text>   keep a detail you established about this room"),
    "chronicle": (cmd_chronicle, 1, "chronicle <text>   add a line to the story so far"),
    "validate": (cmd_validate, 0, "validate [--game <id>]   check every game's content references and settings"),
    "game": (cmd_game, 0, "game [list | show | switch <id>]   the installed games; switching keeps each one's save"),
    "meter": (cmd_meter, 0, "meter [refill]   the meter, or fill it (the SessionStart hook refills it)"),
    "settings": (cmd_settings, 0, "settings   the owner's switches and prices for this game (change: tools/settings.py)"),
    "curse-text": (cmd_curse_text, 0, "curse-text <words>   the player's words as any curse makes them come out (JSON, for the prompt hook)"),
}


def main(argv):
    if not argv or argv[0] not in COMMANDS:
        print("commands:")
        for name, (_, _, help_text) in COMMANDS.items():
            print("  %-11s %s" % (name, help_text))
        return 2
    fn, nargs, help_text = COMMANDS[argv[0]]
    if len(argv) - 1 < nargs:
        print("usage: %s" % help_text)
        return 2
    try:
        choose_game(active_game())
        fn(argv[1:])
    except (Refused, ValueError) as e:
        print("REFUSED: %s" % e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
