# Handoff: building IMPLEMENTATION-PLAN.md

As of 2026-10-22. The state of the kit build for whoever picks it up next, human or Claude. Read `DEVELOPING.md` first (invariants, checks, testing, API gotchas). This file covers only where the build stands and what was decided along the way. Update it at the end of each stage.

## Where things are
- **Requirements:** `IMPLEMENTATION-PLAN.md` (JW's game-owner requirements, Stages 1–8).
- **Technical plan:** `~/.claude/plans/please-read-implementation-plan-md-in-sunny-cake.md` (approved). The decisions below override it where they differ.
- **Done:** Stage 1 (kit split, second game, seeds), the clean-start follow-up, Stage 2 (the meter and switches), Stage 3 (look and feel), Stage 4 (curses). Everything is committed on `main`, and `sh tools/check.sh` passes.
- **In progress:** Stage 5, the player leaves a mark. 5.1 (crafting) is done; 5.2 (building), 5.3 (the library) and 5.4 (promotion) are next. Stop for the user's playtest when all four are in.

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
| `a2280fe` | Handoff update |
| `b8334c8` | Curses: content kind, transforms with shared vectors, the prompt hook tells the GM both versions, mod draws the cursed row |
| (5.1) | Crafting: makers (`makes:`/`accepts:`), `world-brief craft`, `generate craft`, `pay`, `made_by` on every run entity, save v8, Morwen the net-mender, Bucket makes from scrap |
| `770f5e8` | Speaker cards: the speaker is named outside the quotes; a person without a card keeps the paragraph plain (playtest bug: Dunstan's line labelled Pell) |

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
- The player's real save is v7; it upgrades to v8 on load (Stage 5 adds `run.commissions`).
- The fixed prices for extras are estimates; recalibrate if `/cost` suggests they're off.

## Stage 4 notes
- Curses live in `games/<id>/curses/`; `rules/curse.py` holds the transforms and `rules/curse_vectors.json` the shared examples. Change one side, change both: `mod/hooks/curse.ts` and `mod/tests/curse_vectors.ts` (a copy; `test_rules.py` checks it matches).
- No `gm-turn/curses.md` side file: reading it mid-game would need a Read permission and could prompt. `look`'s `CURSE:` line and the prompt hook carry the procedure instead. Use the same pattern for later stages' procedure where possible: put it in `rpg.py` output or the hook, only when the feature is active.
- `validate` checks a curse's cure is reachable by searching the game's other `.md` files for the flag name (a heuristic).

## Next: Stage 5, the player leaves a mark
Build it in four commits (5.1–5.4), live-check each player-visible part, then stop for the user's playtest. Add content for both games.

- **5.1 Crafting:** characters may give `makes:` (item tiers) and optionally `accepts:` (material items). Flow: the player describes an item, then `world-brief craft <maker>` (charges the meter), then the world agent proposes `{id, name, description, tier}`, then `generate craft` checks the tier is in `makes`. The price comes from `balance.generation.craft_price[tier]`, never the proposal. It's stored as a commission (`run.commissions`) marked `made_by: player`, and `rpg.py collect <id>` pays and gives the item. Off-trade requests are refused in character.
- **5.2 Building:** rooms may give `build:` (directions), characters `builds: yes`. `world-brief build` / `generate build` reuse the room checks in `generate.room`. The price is from `balance.generation.build_price`; the commission completes after N moves in `tick_move`; the room is `made_by: player` and the map marks it as the player's.
- **5.3 The library:** `state/library/<game>.json` holds every generated or player-made entry (`origin: player|world`, kept, forgotten, friend_line), with a size cap per game. `newgame` carries over player-built places and befriended generated people (one remembered line each). Authored characters, flags, inventory and quests reset. `world-brief` lists at most 5 fitting entries; a proposal `{"reuse": "<id>"}` re-creates one with stats re-tiered from the current tables. Owner tool `tools/library.py list | keep <id> | forget <id>`; `keep` writes it into `games/<id>/` and validates. The GM can't run it.
- **5.4 Promotion:** `rpg.py talk <id>` (the GM runs it before voicing any generated person) prints their voice brief and counts at most one conversation per scene. After the game's number of conversations, the person becomes `minor: no` for the run and speaks through `npc-brief` with their own memory. The journal marks promoted people.

**Confirmed with the user on 2026-10-22 (these override the bullets above where they differ):**
- **Prices:** crafting 2, building 3, reusing a library entry 1, promotion 2 once; a promoted person's replies are free (an agent reply is ~5k tokens, a point ~30k).
- **Switches** (all three presets): `crafting` {on, max_per_run: 2/5/10}, `building` {on, max_per_run: 1/3/5}, `promotion` {on: off/on/on, max_per_run: -/2/4, after_conversations: -/3/2}. Separate from the generation cap; the meter applies on top.
- **One path:** building and crafting are generation with a `made_by: player` tag and a gate (an order, paid with `pay`). Everything generated carries `made_by: world`.
- **Growth vs. building:** the world may grow anywhere sensible (`growth:` in world.md: `anywhere` | `marked` | `no`; both shipped games `anywhere`; the code finds free map squares, rooms may opt out, generated rooms may grow further up to a depth limit). Building is narrow and visible: content marks where building makes sense in the story (`build:` on rooms), the room's prose tells the player, and the world never grows into a reserved build spot. Built rooms offer no build spots of their own for now.
- **Builders** work only where they stand, but the order records its target (room + direction) so a later remote effect (a spell) can name somewhere else.
- **Befriended** = finished their side quest, or promoted. They carry over with one remembered line.
- **The library:** `keep` writes the entry into `games/<id>/` (permanent, survives a wiped library); the library alone only decides what may come back. `rpg.py` marks entries "worth keeping" by rule (promoted, side quest finished, player-built), the GM may add a one-line reason (`rpg.py library suggest <id> "<why>"`, free), and `tools/library.py list` shows suggestions first. Only the owner keeps or forgets.
- **Content:** Lighthouse: Morwen the net-mender (Pell's cousin) on Harbor Square, plus a build spot there. Station: Bucket makes (trinket, light weapon; not tonics, which would bypass its once-only med-patch sale) and builds; build spot: a float lashed to the pontoon south of The Landing (east stays for generation).
- **Parked, not to build yet:** an owner-run mode (maybe a `newgame` flag) that shows the switches as in-game options.

## Stage 5 notes
- **5.1 as built:** an order is `run.commissions[<item id>] = {kind, maker, price, status: ordered|done, ordered_at, paid_at}`; `run.ordering` holds the maker between `world-brief craft` (which charges) and `generate craft`, so an order can't be generated without a paid brief, and a rejected proposal can be retried without a new brief. A maker's `{"refuse": …}` raises `generate.Declined`, which clears the order. `pay` hands the item over at once (no waiting); payment is the tier's `craft_price` or one `accepts:` item. `look` prints `MAKERS HERE` (only while an order is possible) and `ORDERS WAITING`. The craft brief includes the maker's `## What <pronoun> make(s)` section. The tray shows `MADE:`/`PAID WITH:`; the pane and `/inventory` mark the item "(made for you)".

## Later stages (unchanged from the plan)
- **Stage 6, puzzles:** the GM assembles prebuilt kit code blocks (`rules/blocks.py`, a JSON pipeline; `rpg.py solve` and `unlock` for locks, `inspect` and `repair` for a broken mechanism). No free-form code.
- **Stage 7, a living world:** major characters' `plans:` (`may_go`, `may_do` with in-world signals) applied on world turns; two-character side scenes (`scenes/`, `rpg.py scene start|end`).
- **Stage 8, new worlds:** `/newworld`; a background `worldsmith` agent with file tools confined to `state/forge/`; `validate --kit-complete`; `rpg.py forge quote|start|install`.

## Stage 3 notes
- The title card's typing and the ending's lines can't be grepped whole in a `play.py` capture (the terminal redraws changed cells only); search for parts, e.g. `S T A T I O N`.
- The 3x5 font's M and N are cramped but readable in context.
- **Speaker labels** (`speakerOf` in `mod/hooks/story.ts`): only names outside quotation marks count, and an unattributed line stays plain. gm-turn asks the GM to name each speaker outside the quote, in their own paragraph.
- `/map` (the text command) still draws the box map; the pane's Map tab is the tile map.
