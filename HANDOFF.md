# Handoff: building IMPLEMENTATION-PLAN.md

As of 2026-10-21. The state of the kit build for whoever picks it up next, human or Claude. Read `DEVELOPING.md` first (invariants, checks, testing, API gotchas). This file covers only where the build stands and what was decided along the way. Update it at the end of each stage.

## Where things are
- **Requirements:** `IMPLEMENTATION-PLAN.md` (JW's game-owner requirements, Stages 1–8).
- **Technical plan:** `~/.claude/plans/please-read-implementation-plan-md-in-sunny-cake.md` (approved). The decisions below override it where they differ.
- **Done:** Stage 1 (kit split, second game, seeds), the clean-start follow-up, Stage 2 (the meter and switches), Stage 3 (look and feel). Everything is committed on `main`, and `sh tools/check.sh` passes.
- **Next:** Stage 4, curses. Stop for the user's playtest of Stage 3 first, unless they've already said to go on.

| Commit | What |
|---|---|
| `cc057ed` | 1.1: `games/<id>/` folders, `look.json` and `balance.json` per game, `rpg.py game list/show/switch`, save v7, `show` with flag filtering, The Flooded Station, `tools/test_rules.py` |
| `67d9dfe` | 1.2: `newgame [seed\|daily]`, per-run dice stream (`run.seed`, `run.dice_n`), run label on the title card |
| `625aa8b` | `gm-turn` hidden from the slash menu (`user-invocable: false`) |
| `81b9853` | `/newgame` and `/game <other>` clear the screen and conversation first |
| `854bff8` | Stage 2: meter, presets, `settings.json`, `tools/settings.py`, `/budget` |
| `7c50996` | The meter charges only extras; baseline play is free |
| `2ac55a1` | This file |
| `c13e285` | Stage 3: block-letter banners, transitions, combat strip, tile map, sounds per beat, waiting phases, character cards, accent by time |

## Decisions made with the user (keep to these)
- **Old saves:** no migration. Saves before v7 are refused with "start a new game". `MIGRATIONS` applies from v7 on.
- **Clean start:** the mod drops `/newgame` (and `/game <different id>`), empties the prompt box, runs `/clear`, then reruns the command from `$.clock.after`. Claude Code flashes "Prompt dropped by a hook: The page turns…" for a moment; the user accepted that flash. Without the mod, nothing clears.
- **The meter is a budget for extras.** GM turns, rules commands and the authored characters' agents are free. Generating something costs 2 and a world turn 2; each later stage's extras get a price when built. One point is roughly one extra round of GM work. Capacity: thrifty 10, normal 30, rich 60. It lives in `state/meter.json` (outside saves) and refills on Claude Code startup or resume (SessionStart hook), not on `/clear`. Measured on Sonnet: a turn is about 30k weighted tokens, an agent reply about 5k.
- **Switches** exist only for built features: `npc_agents`, `world_turns`, `generation`, `meter.capacity`. Add `promotion` (5.4), `side_scenes` (7.2) and `new_worlds` (8.1) to all three presets when building them. The world-turn frequency, the generation cap and the agent line cap moved from `balance.json` to settings. Only the owner changes settings, through `tools/settings.py`, which isn't in the GM's allowlist.
- **Stage 6 puzzles:** Claude *assembles prebuilt kit code blocks* (a JSON pipeline that `rpg.py` validates and runs). No free-form or sandboxed Claude-written code; that's parked "to discuss later".
- **Stage 8:** the `worldsmith` agent may have file tools, confined to `state/forge/`.
- **Second game:** The Flooded Station. Every later stage adds its feature's content to **both** games.
- **Process:** one commit per agreed change, a live check with `tools/play.py` before each commit that touches what players see, and a stop for the user's playtest after every stage. The user is the only user, so local single-user risks are low priority. Visible machinery is always a bug.

## Design as built (so the next stage fits)
- **Game selection:** the save's `game`, else `state/active.json`, else the first game. `rpg.py` calls `choose_game()` on every run, which sets `BALANCE` (kit + game) and `SETTINGS` (preset + overrides). Other games' saves wait in `state/shelf/<id>.json`.
- **The mod reads only the save.** Per-game look, meter, settings and run label all arrive in `view` (`view.look`, `view.meter`, `view.settings`, `view.run_label`). `lookOf()` in `mod/hooks/look.ts` fills gaps from `DEFAULT_LOOK`.
- **Charging an extra:** price in `rules/balance.json` `meter.prices`; `can_pay(kind)` before; `charge(kind)` after every check that could refuse; in-fiction refusal when it can't pay; a switch in `rules/presets.json`.
- **The GM reads content only through `rpg.py show`**, never by path. `look` labels a non-minor character whose agent the owner switched off `[minor, agent resting]`.
- **Animations** are surface modules (`mod/hooks/reveal.tsx`, `trayfx.tsx`, `tilemap.tsx`) drawn as a literal `<Client module="./x.tsx">` (an alias loads nothing). Their frame logic is pure and exported. They play once while fresh (`FRESH_MS`); otherwise they're drawn still. `ui.fault` marks a failed one so it's drawn still from then on. Props go through `plain()` (JSON only).
- **Look keys added in Stage 3:** `palette.accent_by_time`, `terrain` (a game may add kinds), `sounds` (beat → kit sound or null), `phrases.phases`. Content gained `terrain:`/`color:` on rooms and `card:` on characters.
- **Tests:** `tools/test_rules.py` (27 engine tests, CLI-driven in a temp copy, both games) and `mod/tests/` (54). Both run from `tools/check.sh`.

## Learned the hard way (also in DEVELOPING.md)
- Skill commands raise no `command.run`; `$.command.run` is refused inside `prompt.submit`. A dropped prompt stays in the prompt box unless the mod empties it.
- A subagent's reply arrives as an `<agent-message …>` prompt and raises UserPromptSubmit; the prompt hook skips it.
- `tools/play.py` sessions keep no transcript unless run with `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1`. Usage per turn can be read from transcripts (`message.usage`, and `toolUseResult.usage` for agents).
- Live tests go in a scratch copy (rsync excluding `.git`, `state/save.json`, `state/shelf`, `state/active.json`, `state/meter.json`), never the real folder.

## Open observations (not bugs, or not yet fixed)
- Under the thrifty preset, Sonnet still calls `npc-brief` once for a resting agent before voicing them. It's refused at no cost and hidden from the player.
- The player's real save (`state/save.json`) is still v6; the first `/newgame` replaces it.
- The fixed prices for extras are estimates; recalibrate if `/cost` suggests they're off.

## Next: Stage 4, curses (from the plan)
Content: `games/<id>/curses/<id>.md` with an `effect:` (reverse_words, word_limit N, suffix "<phrase>", plus mirror), `caused_by:` and `cured_by:` conditions, and prose. The curse is active while caused_by holds and cured_by doesn't, so it can't outlive a new game. `rpg.py curse-text` prints the cursed form. The UserPromptSubmit hook adds context: the words as they came out, and what the player meant. The mod shows the cursed text in the player's row (a TS port of the transforms, with shared test vectors in `rules/curse_vectors.json`) and the curse in the status band. Procedure in `gm-turn/curses.md`. Add a curse and its cure to both games. Curses cost nothing (no meter price).

## Stage 3 notes
- The title card's typing and the ending's lines can't be grepped whole in a `play.py` capture (the terminal redraws changed cells only); search for parts, e.g. `S T A T I O N`.
- The 3x5 font's M and N are cramped but readable in context.
- `/map` (the text command) still draws the box map; the pane's Map tab is the tile map.
