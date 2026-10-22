# Handoff: building IMPLEMENTATION-PLAN.md

As of 2026-10-22. The state of the kit build for whoever picks it up next, human or Claude. Read `DEVELOPING.md` first (invariants, checks, testing, API gotchas). This file covers only where the build stands and what was decided along the way. Update it at the end of each stage.

## Where things are
- **Requirements:** `IMPLEMENTATION-PLAN.md` (JW's game-owner requirements, Stages 1–8).
- **Technical plan:** `~/.claude/plans/please-read-implementation-plan-md-in-sunny-cake.md` (approved). The decisions below override it where they differ.
- **Done:** Stages 1–5: kit split, second game and seeds; the meter and switches; look and feel; curses; the player leaves a mark (crafting, building, the library, promotion). Everything is committed on `main`; `sh tools/check.sh` passes (46 engine tests, 61 mod tests, both games validate).
- **Now:** waiting for the user's playtest of Stage 5. See **Starting the next session**.

## Starting the next session
1. The user starts dev sessions with `ooc:` (or says the whole session is development). Read `DEVELOPING.md`, then this file, then run `sh tools/check.sh` and report the state.
2. **If the user brings Stage 5 playtest feedback:** diagnose from the session transcript (`DEVELOPING.md`, *Debugging a real session*), reproduce in a scratch copy, and fix with a test. One commit per agreed fix, with a live check if players see it. Use the **Stage 5 playtest checklist** below to know what was meant to happen.
3. **Before building Stage 6:** propose its design and the open decisions to the user, briefly, and wait for answers, as was done for Stage 5. Candidate decisions: the block set (which kit blocks, and what each may read and change), how a puzzle is written in content (a `puzzles/` kind, or a section of a room or item), what a solve costs (baseline play is free, so probably nothing unless an agent is spawned), the switch (if any), and the content for each game (one lock and one broken mechanism in each).

## Commits
| Commit | What |
|---|---|
| `cc057ed` | 1.1: `games/<id>/` folders, `look.json` and `balance.json` per game, `rpg.py game list/show/switch`, save v7, `show` with flag filtering, The Flooded Station, `tools/test_rules.py` |
| `67d9dfe` | 1.2: `newgame [seed\|daily]`, per-run dice stream (`run.seed`, `run.dice_n`), run label on the title card |
| `625aa8b` | `gm-turn` hidden from the slash menu (`user-invocable: false`) |
| `81b9853` | `/newgame` and `/game <other>` clear the screen and conversation first |
| `854bff8` | Stage 2: meter, presets, `settings.json`, `tools/settings.py`, `/budget` |
| `7c50996` | The meter charges only extras; baseline play is free |
| `c13e285` | Stage 3: block-letter banners, transitions, combat strip, tile map, sounds per beat, waiting phases, character cards, accent by time |
| `b8334c8` | Stage 4: curses (content kind, transforms with shared vectors, the prompt hook tells the GM both versions, the mod draws the cursed row) |
| `770f5e8` | Speaker cards: the speaker is named outside the quotes (playtest bug: Dunstan's line labelled Pell) |
| `2e21092` | 5.1 Crafting: makers (`makes:`/`accepts:`), `world-brief craft`, `generate craft`, `pay`, `made_by` on every run entity, save v8; Morwen the net-mender, Bucket makes from scrap |
| `e971501` | 5.2 Building and growth: `generation: rooms: anywhere`, map squares in the engine, build spots (`build:`) and builders (`builds: yes`), `world-brief build`, `generate build`, `pay` starts the work, a move finishes it; ⌂ on the tile map. Also the first progress-line filter fix |
| `e99289b` | 5.3 The library: `rules/library.py`, `state/library/<game>.json`; befriending, carry-over on `newgame`, `{"reuse": id}`, `rpg.py library suggest`, owner tool `tools/library.py` |
| `42a9e8a` | 5.4 Promotion: `rpg.py talk <id>`, promotion to an agent after N conversations, the journal's ★. Also the second progress-line filter fix |
| `f500269` | This file: Stage 5 done |

Handoff-only commits (`2ac55a1`, `b6b523d`, `a2280fe`, `ab4dea9`, `7057684`) are left out.

## Decisions made with the user (keep to these)
- **Old saves:** no migration before v7; those are refused with "start a new game". `MIGRATIONS` applies from v7 on (v7→v8 adds `run.commissions` and `run.ordering`). Later optional run fields (`brief`, `talks`, `befriended`) are read with `.get`/`setdefault`, so they needed no version bump.
- **Clean start:** the mod drops `/newgame` (and `/game <different id>`), empties the prompt box, runs `/clear`, then reruns the command from `$.clock.after`. Claude Code flashes "Prompt dropped by a hook: The page turns…"; the user accepted that. Without the mod, nothing clears.
- **The meter is a budget for extras.** GM turns, rules commands and agents' replies are free (authored characters' and promoted people's alike). Prices: generating something 2, a world turn 2, having something made 2, having something built 3, bringing something back from the library 1 net, promoting a person 2 once. One point is roughly one extra round of GM work. Capacity: thrifty 10, normal 30, rich 60. It lives in `state/meter.json` (outside saves) and refills on Claude Code startup or resume, not on `/clear`. Measured on Sonnet: a turn is about 30k weighted tokens, an agent reply about 5k.
- **Switches** exist only for built features: `meter.capacity`, `npc_agents`, `world_turns`, `generation`, `crafting` {on, max_per_run 2/5/10}, `building` {on, max_per_run 1/3/5}, `promotion` {on off/on/on, max_per_run 0/2/4, after_conversations 3/3/2}. Add `side_scenes` (7.2) and `new_worlds` (8.1) to all three presets when building them. Only the owner changes settings, through `tools/settings.py`, which isn't in the GM's allowlist.
- **Player-made is generated with a tag.** Crafting and building go through the same checks as generation, marked `made_by: player` (everything generated is `made_by: world`), behind an order paid with `pay`.
- **Growth vs. building:** the world may grow anywhere sensible (`generation: rooms: anywhere`; `yes` keeps the old `expand:`-only rule; rooms may opt out with `expand: no` or limit themselves with an `expand:` list). Building is narrow and visible: content marks where it makes sense in the story (`build:`), the room's prose says so, and the world never grows onto a build spot's square. Builders work only where they stand, but the order records its target room and direction, so a later remote effect (a spell) can name somewhere else.
- **The library:** the library alone decides what *may* come back; `keep` (owner only, `tools/library.py`) makes something permanent content. Befriended = finished their side quest, or promoted. `rpg.py` marks entries worth keeping by rule; the GM may add a reason (`rpg.py library suggest`), free. Side quests aren't kept.
- **Stage 6 puzzles:** Claude *assembles prebuilt kit code blocks* (a JSON pipeline that `rpg.py` validates and runs). No free-form or sandboxed Claude-written code; that's parked "to discuss later".
- **Stage 8:** the `worldsmith` agent may have file tools, confined to `state/forge/`.
- **Both games:** every stage adds its feature's content to The Dark Lighthouse **and** The Flooded Station.
- **Parked, not to build yet:** an owner-run mode (maybe a `newgame` flag) that shows the owner's switches as in-game options.
- **Process:** propose a stage's open decisions and wait for answers before building; one commit per agreed change; run the checks before and after; a live check with `tools/play.py` in a scratch copy before each commit that touches what players see; keep this file current; stop for the user's playtest after every stage. The user is the only user, so local single-user risks are low priority. **Visible machinery is always a bug.**

## Design as built (so the next stage fits)
- **Game selection:** the save's `game`, else `state/active.json`, else the first game. `rpg.py` calls `choose_game()` on every run, which sets `BALANCE` (kit + game) and `SETTINGS` (preset + overrides). Other games' saves wait in `state/shelf/<id>.json`.
- **The mod reads only the save.** Per-game look, meter, settings and run label arrive in `view` (`view.look`, `view.meter`, `view.settings`, `view.run_label`); also `view.items[].own`, `view.people[].promoted`, and `map[*].made_by` (`world` or `player`). `lookOf()` in `mod/hooks/look.ts` fills gaps from `DEFAULT_LOOK`.
- **Charging an extra:** price in `rules/balance.json` `meter.prices`; `can_pay(kind)` before; `charge(kind)` after every check that could refuse; an in-fiction refusal when it can't pay; a switch in `rules/presets.json`; a name in the mod's `PRICE_NAMES` for `/budget`.
- **Procedure lives where it's active:** `look` prints `MAKERS HERE`, `BUILD SPOTS HERE`, `ORDERS WAITING`, `BEING BUILT`, `CURSE:` only when they apply; `rpg.py` output tells the GM the next command (`PRICE: … run pay <id>`, `PROMOTED: … run npc-brief`). Prefer this to new skill side files, which would need Read permissions.
- **The GM reads content only through `rpg.py show`**, never by path. `look` labels a non-minor character whose agent the owner switched off `[minor, agent resting]`.
- **Map squares:** `rpg.layout()` mirrors the mod's `layout()`/`STEP` (up and down are drawn as north and south). Change one, change the other.
- **Story filter:** the mod holds back a turn's text and shows only the narration; `isGmNote` (`mod/hooks/register.tsx`: `GM_ALWAYS`, `GM_ANYWHERE`, `GM_PROGRESS`, `GM_MAYBE`+`GM_WORDS`) strips a GM note from the narration's first paragraph. Add each newly seen leak to the tests in `mod/tests/coderpg.test.tsx`, together with story lines that must survive.
- **Animations** are surface modules (`mod/hooks/reveal.tsx`, `trayfx.tsx`, `tilemap.tsx`) drawn as a literal `<Client module="./x.tsx">`. Their frame logic is pure and exported; they play once while fresh (`FRESH_MS`), otherwise drawn still.
- **Tests:** `tools/test_rules.py` (46 engine tests, CLI-driven in a temp copy, both games) and `mod/tests/` (61). Both run from `tools/check.sh`.

## Stage 5 playtest checklist (what should happen)
- **Crafting** (lighthouse: Morwen on Harbor Square; station: Bucket on the Common Deck). Describe an item; the maker shapes it or turns it down in character and names the price (trinket 2, light weapon 3, tonic 3, weapon 5; Morwen also takes a smoked fish, Bucket a sardine tin). On paying, the item is handed over; the pane shows "(made for you)" and the tray "✧ <item>, made for you by <maker>".
- **Building:** at Morwen's net-loft footing (southwest of the square) or Bucket's railing gap (northeast of the deck). Price 5 in money only; ready 3 moves after paying, with a rumor about it; the map shows ⌂ and the key "built for you". The player starts with 3 coins (4 credits), so they must earn some first.
- **Growth:** `may grow` ways now appear on most rooms; the GM shouldn't point out ones the prose doesn't mention, but should generate a place if the player heads that way plausibly.
- **The library:** finish a generated person's side quest (lighthouse only: the station generates no people), then `/newgame`: they're back where they were, remembering one line. Places the player built stand again. In a new game, talking to an unnamed person may bring back someone from before. `python3 tools/library.py list`, then `keep` / `forget`.
- **Promotion** (lighthouse only): talk to one generated person in three separate scenes (leave and come back); from then on they speak through their own agent, and the journal shows "<name> ★ / knows you well".
- **Watch for:** GM progress notes shown as story (see Open observations); prices that feel wrong (building at 5 coins especially); the world growing somewhere that makes no sense (fix with `expand:` in that room).

## Learned the hard way (also in DEVELOPING.md)
- Skill commands raise no `command.run`; `$.command.run` is refused inside `prompt.submit`. A dropped prompt stays in the prompt box unless the mod empties it.
- A subagent's reply arrives as an `<agent-message …>` prompt and raises UserPromptSubmit; the prompt hook skips it.
- `tools/play.py` sessions keep no transcript unless run with `CLAUDE_CODE_FORCE_SESSION_PERSISTENCE=1`; then the transcript is in `~/.claude/projects/<scratch path with dashes>/`. Reading the GM's calls and text from it is much easier than reading the raw capture.
- Live tests go in a scratch copy (rsync excluding `.git`, `state/save.json`, `state/shelf`, `state/active.json`, `state/meter.json`, `state/library`), never the real folder. A setup can be played forward with `rpg.py` commands (generate from a hand-written proposal, `talk`, `move`) so the live session only plays the part being tested.
- A live session with several GM turns takes longer than Bash's 10-minute limit: run `play.py` in the background.
- Pane tab hotkeys work only with the pane focused: send `/sheet\r` first, then the tab key (the lighthouse's tabs are `h m j`, the station's `d p n`).
- During long turns Claude Code nudges the model to say what it's doing; the GM answers in its text, sometimes as the narration's first paragraph. That's where every Stage 5 leak came from.
- `json.dumps` escapes non-ASCII by default: write the kit's JSON with `ensure_ascii=False`, or icons like ✦ turn into `✦`.

## Open observations (not bugs, or not yet fixed)
- **Progress-line leaks:** three shapes seen and caught ("…, I've finished the off-screen world update, and now I'm narrating."; "Bucket's drawing up the Lookout Float; it's priced at 5 credits…"; "Settling in beside Old Hob now."). gm-turn now asks for progress lines ending in "…" as their own paragraph. The filter is a heuristic: watch for new shapes.
- Under the thrifty preset, Sonnet still calls `npc-brief` once for a resting agent before voicing them. It's refused at no cost and hidden from the player.
- The player's real save is v7; it upgrades to v8 on load.
- The fixed prices for extras are estimates; recalibrate if `/cost` suggests they're off.
- The station's content generates no people (`extras: no`, `characters: no`), so befriending, carry-over of friends and promotion never come up there. That's the station's choice; changing it is a content decision for the user.
- `validate` checks a curse's cure is reachable by searching the game's other `.md` files for the flag name (a heuristic).

## Stage 5 notes (as built)
- **Orders:** `run.commissions[<id>] = {kind: item|room, maker, price, status: ordered|building|done, ordered_at, paid_at, [ready_at, room, direction, record]}`. `run.ordering = {maker, kind}` holds the order between `world-brief craft|build` (which charges) and `generate craft|build`, so nothing is ordered without a paid brief, and a rejected proposal can be retried without a new one. A maker's `{"refuse": …}` raises `generate.Declined` and clears the order. `pay` hands a made item over at once; a building gets `status: building` and `ready_at`, and `tick_move` → `finish_building` adds the room and its exit and a rumor. An unbuilt room's id and name are taken but it isn't in `run.rooms`. A newer order for a spot replaces an unpaid one. Orders don't count toward the generation cap, and the game's `generation:` policy doesn't apply to them.
- **Growth:** `unused_expansions` implements the rule: `expand:` list, or the four cardinal ways under `anywhere`; never through an exit, onto a taken map square, or onto a build spot's square (`reserved_squares`). Generated rooms carry `depth` and grow until `generation.max_depth` (2). `validate` checks build spots: a builder among the room's characters, a free square, not an exit or `expand:` direction, no two spots on one square.
- **Library:** one entry per place, person or thing, with a `bundle` (a room's items and person, a person's wares; `placed` marks items that lay in the room), `where`, `attach` (rooms), `friend`, `worth_keeping`, `suggested`, `forgotten`, `promoted`, `runs`. Recorded by `cmd_generate` (`record_patch`), `pay` (made items) and `finish_building`. `note_friends` runs in every `save_state`. `carry_over` (in `newgame`) brings back the player's places (only at a build spot the content still has) and friends (at `where`, memory set to the one line, promoted ones as agents), marked `carried: yes` and outside the generation count. Reuse: the brief lists `library.fitting` (world-made, not forgotten, not in play; same room first) and sets `run.brief`; `{"reuse": id}` goes through `generate.reuse` (same placement and budget checks, stats from `generate.retier`) and costs 1 net. Characters record `fights: <tier>` so they can be re-tiered. `tools/library.py keep` writes the files, links them into their room (and drops a used `build:` or `expand:` direction), validates, and undoes everything on failure. `state/library/` is git-ignored.
- **Promotion:** `run.talks[id] = {count, scene}`; the scene is `run.moves`. `talk` refuses authored characters, prints the voice brief while minor, and promotes when `why_not_promoted` is None (switch on, count reached, under this run's `max_per_run`, agents not resting, meter can pay). The station has no generated people, so promotion only happens in the lighthouse.
- **Content:** Morwen (`characters/morwen.md`, makes trinket and light weapon, accepts smoked fish, builds) and her footing (`harbor_square` `build: southwest`); Bucket makes trinket and light weapon (not tonics: that would bypass its once-only med-patch sale), accepts a sardine tin, builds at the Common Deck's railing gap (`build: northeast`; north is the Control Room's square). Troll's Hollow and the Drowned Lab have `expand: no`.

## Stage 4 notes
- Curses live in `games/<id>/curses/`; `rules/curse.py` holds the transforms and `rules/curse_vectors.json` the shared examples. Change one side, change both: `mod/hooks/curse.ts` and `mod/tests/curse_vectors.ts` (a copy; `test_rules.py` checks it matches).
- No `gm-turn/curses.md` side file: `look`'s `CURSE:` line and the prompt hook carry the procedure instead.

## Stage 3 notes
- The title card's typing and the ending's lines can't be grepped whole in a `play.py` capture (the terminal redraws changed cells only); search for parts, e.g. `S T A T I O N`.
- **Speaker labels** (`speakerOf` in `mod/hooks/story.ts`): only names outside quotation marks count, and an unattributed line stays plain.
- `/map` (the text command) still draws the box map; the pane's Map tab is the tile map.

## Later stages (unchanged from the plan)
- **Stage 6, puzzles:** the GM assembles prebuilt kit code blocks (`rules/blocks.py`, a JSON pipeline; `rpg.py solve` and `unlock` for locks, `inspect` and `repair` for a broken mechanism). No free-form code.
- **Stage 7, a living world:** major characters' `plans:` (`may_go`, `may_do` with in-world signals) applied on world turns; two-character side scenes (`scenes/`, `rpg.py scene start|end`).
- **Stage 8, new worlds:** `/newworld`; a background `worldsmith` agent with file tools confined to `state/forge/`; `validate --kit-complete`; `rpg.py forge quote|start|install`.
