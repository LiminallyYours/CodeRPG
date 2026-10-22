# CodeRPG

A text RPG that runs inside Claude Code. Claude is the game master, and you type what you do at the normal prompt.

## How to play
1. Open Claude Code in this folder with the interface mod: `cd CodeRPG && claude --plugin-dir ./mod`. Plain `claude` works too, without the game look.
2. Type `/newgame`. Add a seed to replay a run exactly (`/newgame ember-4821`), or `daily` for today's world, the same for everyone; the title card shows the date and seed. Type `/game` to see the installed games, and `/game <id>` to switch; each game keeps its own save.
3. Type actions in plain English, for example "look around", "go to the tavern", "ask Pell about the troll", "attack the troll".
4. To talk to Claude as a developer instead of the GM, start your message with `ooc:`. Without it, a hook reminds the GM that the message is an in-game action.
5. Instant commands (no Claude turn, no cost): `/inventory`, `/map`, `/sheet` (reopens the character pane), `/sound` (turns sound effects on or off) and `/budget` (what's left of the meter, what the extras cost, and what's switched on).

Two games ship on the kit:
- **The Dark Lighthouse** (`dark_lighthouse`): a fishing village with a stolen lamp lens. Six rooms, three characters, six items and one quest with three branches.
- **The Flooded Station** (`flooded_station`): a half-flooded research station and a rising tide. Six rooms, three characters, five items and one quest with two branches. It's deliberately different: its own colors, stat names (Grit, Reflex, Know-how), currency (credits), tab names and a faster world clock, with no time of day.

## Layout
```
CLAUDE.md                     GM role + standing orders (procedure only, no world facts)
.claude/skills/gm-turn/       the turn-by-turn procedure
.claude/skills/newgame/       /newgame
.claude/skills/game/          /game: list the installed games or switch between them
.claude/agents/npc.md         the NPC subagent: no tools, sees only the brief it's given
.claude/agents/world.md       the world subagent: proposes new people/places/items/side quests as JSON
.claude/hooks/turn_reminder.py  reminds the GM of the turn procedure on every in-game message
.claude/hooks/session_start.py  refills the meter each time Claude Code is opened here
.claude/settings.json         lets the GM run rules/rpg.py without permission prompts;
                              makes the GM wait for NPC replies (CLAUDE_CODE_FORK_SUBAGENT=0)
games/<id>/                   ONE GAME: everything particular to it lives here
  world.md                    title, start room, starting stats/kit, opening
  rooms/ characters/ items/ quests/ tables/ art/   one file per room, character, item, quest...
  look.json                   its look: colors, stat and tab names, currency, spinner phrases
  balance.json                its rule numbers, laid over the kit's rules/balance.json (optional)
  settings.json               the owner's cost switches: a preset plus overrides
rules/                        THE KIT: knows nothing about any particular game
  RULES.md                    the mechanics in plain language
  balance.json                every tunable number (the defaults)
  look.default.json           the default look, which each game's look.json changes
  presets.json                the owner's presets: thrifty, normal, rich
  dice.py  content.py  rpg.py the code that rolls dice and does the arithmetic
  generate.py                 checks world-agent proposals and turns them into run content
proposals/                    world-agent JSON waiting to be applied (emptied automatically)
state/save.json               what has happened in the game being played (created by /newgame)
state/shelf/<id>.json         the other games' saves, waiting while you play another
state/active.json             which game is being played
state/meter.json              what's left to spend this session (shared by every game)
mod/                          the Claude Code interface mod (Phase 3), loaded with --plugin-dir
tools/                        check.sh (every automated check), test_rules.py (engine tests), play.py (drive a live session),
                              settings.py (the owner's switches; the GM can't run it)
DEVELOPING.md                 how to work on the game safely: checks, testing, invariants, gotchas
```

## Technical choices
- **Python 3 with the standard library only**, compatible with 3.9. There's nothing to install, and macOS already ships it.
- **Content is Markdown with a small front-matter block.** The front matter holds the data the scripts need, such as exits, items, weights, damage and combat stats. The body holds prose the GM reads, such as descriptions, personality, voice, knowledge, and trades. The front matter is a tiny YAML subset (`key: value`, `- list`, one level of `sub: value`), so it's parsed by about 40 lines of code with no PyYAML dependency.
- **The kit and the games are separate.** `rules/` and `mod/` never name a room, character or item. Each game is a folder in `games/` with its content, its look and its rule numbers. The rules script copies the game's look into the save (`view.look`), so the mod draws each game differently with no code change. The game master reads content only through `rpg.py show`, which applies the current flags, so the procedure doesn't depend on where files are.
- **State is one JSON file per game**, `state/save.json` for the one being played, now at `"version": 7`. Version 7 added `game` (which game the save belongs to) and `view.game` / `view.look`; older saves can't be continued and are replaced by `/newgame`. Earlier versions: version 2 added NPC memory. Version 3 added `map` (the rooms you've visited and their open exits) and `view` (display-ready values recomputed on every save) for the interface. Version 4 added `met` (characters you've seen), each foe's `max_hp`, and people, foes, quests and room art in `view`. Version 5 added `run`: everything about this particular playthrough (rolls, variants, the clock, generated content, notes, the chronicle and rumors). Version 6 gave each run an `id`, so the interface can tell a new game from a continuing one. Only `rpg.py` writes it, and it writes atomically. Switching games moves the current save to `state/shelf/` and brings the other game's back. If the format changes later, add an upgrade function to `MIGRATIONS` in `rpg.py` and saves from version 7 on will upgrade on load.
- **The rules engine is one CLI**, `python3 rules/rpg.py <command>`. Every roll and every change to state goes through it, so outcomes can't be fudged. It prints plain text for the GM to narrate. A `REFUSED:` result means the action didn't happen and state is unchanged.
- **The GM prompt is split.** `CLAUDE.md` holds the short standing orders. The `gm-turn` skill holds the longer procedure. Neither contains any world facts.

## NPC agents (Phase 2)
- **Who gets an agent:** every character whose file says `minor: no` speaks through its own `npc` subagent. Characters marked `minor: yes` (here, Pell) are played by the GM directly to save cost. Changing which is which is a one-line edit.
- **What an NPC knows:** `rpg.py npc-brief <id>` builds the NPC's whole world from its character file. That's every section except `## GM only`, plus the `## If` sections that apply now (without the flag names). Then it adds who else is in the scene and the character's **memory of the player**, which is kept in state (`npc_memory`, at most 6 short lines).
- **Each exchange is one fresh, blocking spawn.** The GM passes the brief, the last few lines of the scene, and what just happened. I tested continuing an agent with SendMessage, and it doesn't wait for the reply, so it can't keep turns in sync. A fresh spawn also means the NPC always sees current state.
- **NPCs propose, the GM decides.** The NPC replies with `SAY` / `INTENT` / `REMEMBER`. The GM checks each intent against the character file's `## GM only` rules and applies it with `rpg.py`, or doesn't. If an NPC contradicts state, state wins. NPCs have no tools at all (`tools: []`), and they don't load CLAUDE.md, so they can't touch files.
- **Two agents in one room** can trade lines, up to the owner's `npc_agents.lines_per_exchange` (4 in the normal preset) per turn. In the starter world this happens in the friendly-troll ending, when Grukk and Ysolde are both in Harbor Square.
- **Model:** NPCs run on `sonnet` (set in `.claude/agents/npc.md`). Switch to `haiku` for cheaper, faster, flatter characters.

## What the extras cost: the meter and the switches
Playing the game as written is free. The meter is a budget for the **extras** that go beyond it, shown as an in-world resource: **lamp oil** in the Lighthouse, **power** on the station (each game names and styles its own in `look.json`). It sits in the status band and the pane, warns when it runs low, and refills each time Claude Code is opened in the folder.

| | Price (the game's `balance.json`) | When the meter can't pay |
|---|---|---|
| generating something new (a person, place, item, side quest) | 2 | it doesn't exist; no `may grow` ways are offered |
| a world turn (life going on off-screen) | 2 | none falls due |
| every game-master turn, every rules command, the authored characters' agents | free | |

One point is roughly one extra round of game-master work (about 10–15k tokens, weighted as the API prices them). Measured on Sonnet, an ordinary turn costs about 30k and an agent's reply about 5k; the turn is the cost of playing at all, so it's never charged. Prices are charged by the rules script where the extra happens (`world-brief`), after every check that could refuse. The owner's switches live in each game's `settings.json`, a preset from `rules/presets.json` with overrides:

| Preset | Meter | NPC agents | World turns | Generation |
|---|---|---|---|---|
| `thrifty` | 10 | off: the GM voices everyone | off | extras, rooms and items only, 6 per run |
| `normal` | 30 | on, 4 lines between two per turn | every 5 moves | everything the game allows, 16 per run |
| `rich` | 60 | on, 6 lines | every 4 moves | everything the game allows, 24 per run |

Change them with `python3 tools/settings.py preset thrifty` or `set npc_agents.characters.grukk false`; `/budget` shows what's in effect. The station overrides one switch: its world turns come every 4 moves.

## A different game every run
The authored world is fixed, but each run varies within limits the content sets, and the world can grow during play. This replaced the original rule "never invent anything": nothing is invented freely, but the **world agent** may propose new things that the rules script checks and stores.

| Layer | Who decides | Where it's defined | Where it's kept |
|---|---|---|---|
| **Seed:** every run has one (named, `daily`, or chosen for you); the same seed in the same game rolls the same stats, variants, clock and dice in the same order. What agents say can still differ | `/newgame [seed\|daily]` | | `run.seed`, `run.dice_n` |
| **Rolled character:** stats rolled at `/newgame` | dice | `world.md` `rolls:` | `run.rolls` |
| **Variants:** e.g. what Grukk craves (honey cake or smoked fish), where the cutlass and the spare tonic are | dice pick one flag per line; content branches on the flags | `world.md` `variants:` plus `## If` sections | flags, `run.variants` |
| **Encounters:** a gull steals a coin, a fall, a found tonic | dice, on arriving in a room | `games/<id>/tables/*.md`, linked from rooms by `encounters:` | effects applied; `(once)` entries remembered |
| **The clock:** the fleet comes home after 2d6+12 moves. If the lamp is still dark, `fleet_lost` is set and the quest fails | dice, counting moves | `world.md` `clock:` | `run.clock` |
| **Time and weather:** time follows the clock; the weather changes every few moves | dice | `world.md` `times:` and `weather:` | `run.weather` |
| **Extras:** the unnamed dockhand you try to talk to becomes a real, minor person | world agent proposes, `generate.py` checks | `world.md` `generation:` and `## Public knowledge` | `run.characters` and `run.placements` |
| **New rooms:** off directions the content marks `expand:`, such as the quay steps, the tavern's upstairs or the sheep track | world agent / checks | room `expand:` | `run.rooms` and `run.exits` |
| **Items, minor characters and side quests:** stats come from the tier tables, never the agent; side quests use only their own `side_<id>_…` flags and can't touch the main quest | world agent / checks | `balance.json` `generation` | `run.items`, `run.characters`, `run.quests` |
| **World turns:** every few moves (the owner's `world_turns` setting) the world agent adds rumors and moves generated people around | world agent / checks | `settings.json` | `run.rumors` |
| **Notes and chronicle:** small details the GM established, and one line per significant event | GM, through `rpg.py note` and `chronicle` | | `run.notes`, `run.chronicle` |

**How generation works:**
1. **Brief:** `rpg.py world-brief <kind>` writes the agent's brief: tone, public knowledge, where you are, every name in use, and the JSON shape.
2. **Proposal:** the `world` agent (no tools) replies with JSON. The GM saves it to `proposals/`.
3. **Check:** `rpg.py generate <kind> <file>` validates the proposal and either refuses it with a reason or stores it.

Generated things are then as real as authored ones for the rest of the run: `look` marks them `[generated]`, and `rpg.py show` prints them like a content file. Each run allows `generation.max_per_run` generated entities in all (16 in the normal preset). An adventure that wants none sets `generation:` to `no`.

## The interface mod (Phase 3)
`mod/` is a Claude Code plugin made of function hooks, written in TypeScript and run by Claude Code itself, with nothing to install. It reads `state/save.json` and the rules script's printed output, and it never writes game files. A *play turn* is any turn that doesn't start with `ooc:` and touches the game. In `ooc:` turns, Claude Code looks normal.

| What you see | How |
|---|---|
| **Story cards.** Narration sits in an amber card. Arriving somewhere puts `── THE GULL ──` on top. A new game opens with a title card, and finishing the quest or falling adds an ending card. | Story text is remembered per session, so resumed sessions show older narration plain. |
| **Dice tray.** Checks, attacks, rolls, damage and healing show as one line each, e.g. `🎲 Might check: d20 16 +1 = 17 vs DC 14 SUCCESS`. Every other plumbing call (rules script, content reads, the turn skill, NPC agents) is hidden. | Parsed from the rules script's output. |
| **In-world chrome.** The spinner says things like "The fight is on" or "Grukk considers your words" instead of Claude's words. The turn timer becomes `~ ✦ ~`, and your actions show as `» go north`. | |
| **Status band** above the prompt: `◆ The Gull │ ♥ 12/12 │ 3 coins │ ▸ current objective`. | |
| **Character pane** with three tabs (`h` Here, `m` Map, `j` Journal), under HP, stats, any foe's HP bar and your objective. **Here:** room art, clickable exits (keys `1`–`9`), `look around` (`l`), `talk to …` buttons that start your line, and inventory. **Map:** boxed map with legend. **Journal:** quest objectives, plus the people you've met and what they remember about you. | Docks by itself on terminals 144 or more columns wide; `/sheet` opens it otherwise. Buttons take clicks in fullscreen mode, or keys once the pane has focus. |
| **Living world.** The status band and pane show the clock (`⧗ 14`, red when 3 moves or fewer are left), time and weather. The dice tray shows encounters and "✧ The world grows: …" when something is generated. The Journal adds side quests, failed quests, "The story so far" and "Heard around". Losing the main quest ends with a quieter "THE END" card. | |
| **Feedback.** One toast per change (`-3 HP · +5 coins · gained Brass Lens · ✓ objective`), the HP bar flashes red or cyan, and sound effects play for dice, hits, misses, coins, healing, footsteps, the quest fanfare and defeat. | `/sound` toggles sound, and the setting is remembered. Sounds play through macOS `afplay`. `mod/sounds/generate.py` rebuilds them. |
| **Instant commands:** `/inventory`, `/map`, `/sheet`, `/sound`. | No Claude turn, no cost. |
| **A clean start.** `/newgame`, and `/game <id>` when it switches to another game, first clear the screen and Claude's conversation, so the new game starts lean. The save keeps everything that matters. | The mod runs `/clear` first. Without the mod, nothing is cleared. |

Checks: `sh tools/check.sh` runs everything, including `claude plugin test mod` (37 tests) and `python3 tools/test_rules.py`.

## Content format
```markdown
---
name: Greywater Bridge
exits:
  west: coast_road
  down: trolls_hollow (if grukk_friend or grukk_cowed)
items:
  - brass_lens                  # starting placement only; state tracks it after that
characters:
  - grukk (if not grukk_defeated)
---
Prose description…

## If grukk_defeated
Extra prose shown only when that flag is set.
```
- **Conditions** use `(if flag)`, `not`, `and` and `or`, with `and` binding tighter than `or`. They work on exits, items and characters in front matter, and on `## If …` sections in the body.
- **Characters** with `hp`, `defense`, `attack` and `damage` can be fought. Defeating one sets `<id>_defeated` automatically. `minor: yes|no` decides who plays them. A `## GM only` section holds mechanics the character itself must never see.
- **Items** have a `weight`, plus `damage` (for weapons) or `heal` (for consumables).
- **Flags** are set by the GM only when a content file says so. All branching is written in the content files. Conditions can also use two automatic names: `has_<item>` (carrying it) and `met_<character>` (have seen them).
- **Quests** list their `objectives:` in front matter, each ending `(done when <condition>)`. The journal shows the finished objectives and the current one.
- **Room art** is optional: `games/<id>/art/<room id>.txt`, plain text up to about 30 columns, shown in the pane.
- **Starting items** in a room may have conditions; they're placed at `/newgame`, after the variants are rolled.
- **Rooms** may also list `expand:` (directions where a generated room may attach) and `encounters:` (a table id).
- **Tables** (`games/<id>/tables/<id>.md`) give a `chance:` like `2 in 6` and `entries:`. Each entry may end with `(effect: coins -1 | gain <item> | hurt <dice> | heal <dice> | flag <name> | none)` and `(once)`.
- **Quests** may give `failed_by:` as well as `completed_by:`.
- **`look.json`** may set `palette` (`accent`, `good`, `bad`, `warn`, `heal`), `stat_labels` and `stat_short` (names for might, agility and wits), `currency`, `tagline` (under the title card), `tabs` with `tab_labels` and `tab_keys`, and `phrases` (`idle` and `by_command`, what the spinner says). Anything left out comes from `rules/look.default.json`. `validate` flags unknown keys.
- **`balance.json`** in a game folder overrides any number in `rules/balance.json`, key by key; `validate` flags unknown keys.
- **`world.md`** may give `rolls:`, `variants:`, `clock:` (name, moves, flag, and optionally `also_if` / `also_flag`), `weather:`, `times:`, `generation:`, and body sections `## Tone` and `## Public knowledge` for the world agent.

## Changing things
- **Rewrite a world:** edit the files in `games/<id>/`, then run `python3 rules/rpg.py validate` to check every game's references and settings (`--game <id>` for one).
- **Rebalance:** edit a game's `balance.json` (or the kit defaults in `rules/balance.json`), or the stats in a character or item file. `RULES.md` describes the formulas.
- **New game:** add a folder to `games/` with at least a `world.md` and its rooms, run `validate`, then `/game <id>` and `/newgame`.
- **Inspect or debug:** `python3 rules/rpg.py look` shows the current state. Set `RPG_SEED=<n>` to make dice repeatable.
