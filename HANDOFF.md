# Handoff: building the kit

As of 2026-10-23 (end of the session that built `NEXT-PLAN.md` 3.1 and 3.2). The state of the kit build for whoever picks it up next, human or Claude. Read `DEVELOPING.md` first (invariants, checks, testing, API gotchas). This file covers only where the build stands and what was decided along the way. Update it at the end of each stage.

## Where things are
- **Current work: `NEXT-PLAN.md`** (approved 2026-10-23): (1) the real-spend meter (R3), (2) one-step moves and looks, (3) the interface redesign (`UI-REDESIGN-SPEC.md`), in that order. It replaces the old "Stage 8 playtest, then Stage 6" sequence below.
- **Requirements:** `IMPLEMENTATION-PLAN.md` (JW's game-owner requirements, Stages 1–8).
- **Technical plan:** `~/.claude/plans/please-read-implementation-plan-md-in-sunny-cake.md` (approved). The decisions below override it where they differ.
- **Done:** Stages 1–5: kit split, second game and seeds; the meter and switches; look and feel; curses; the player leaves a mark (crafting, building, the library, promotion). Stage 7: people with plans, side scenes (playtested, no notes). Stage 8: new worlds, built (8.1, 8.2, 8.3) and live-tested. `NEXT-PLAN.md` parts 1, 2 (playtested, no notes), 3.1 and 3.2. Everything is committed on `main`; `sh tools/check.sh` passes (64 engine tests, 82 mod tests, both games validate).
- **Now:** `NEXT-PLAN.md` 3.1 (the page) and 3.2 (band, hint, footer) are built and live-checked (see *NEXT-PLAN 3.1–3.2 notes*). **The user is playtesting them** (*NEXT-PLAN 3.1–3.2 playtest checklist*); restart Claude Code in the game folder to load the mod. Next is 3.3, the margin. The Stage 8 playtest had no further notes; new worlds don't use the meter (see *Stage 8 cost, measured*).
- **Stage 6 (puzzles) is no longer next (2026-10-23, JW):** it will be rethought from scratch later, and its earlier decisions (*Stage 6 decisions so far*, the code-blocks note under *Decisions made with the user*, *Later stages*) don't carry over. They're kept below only as a record.
- **Stage order (changed 2026-10-22, superseded 2026-10-23):** Stage 7, then Stage 8, then Stage 6; now `NEXT-PLAN.md`, with puzzles to be redesigned later. Forged worlds have no puzzles, and `validate --kit-complete` asks for none.

## Starting the next session
1. The user starts dev sessions with `ooc:` (or says the whole session is development). Read `DEVELOPING.md`, then this file, then run `sh tools/check.sh` and report the state.
2. **If the user brings new playtest feedback:** diagnose from the session transcript (`DEVELOPING.md`, *Debugging a real session*), reproduce in a scratch copy, propose the fix and wait for an OK, then fix with a test. One commit per agreed fix, with a live check if players see it. The playtest checklists below say what each stage was meant to do.
3. **Follow `NEXT-PLAN.md`** part by part: its decisions are agreed; anything it leaves open is proposed first, with context, options and downstream implications, assuming little knowledge of the project. It says where to stop for the user's playtests.
   - **Next is 3.3, the margin** (`UI-REDESIGN-SPEC.md` section 6, the mock, and the 3.3 list in `NEXT-PLAN.md`, with its *Decided while building 3.1 and 3.2*). It replaces the pane's body in `register.tsx` (`component: 'Pane'`): VITALS frame, tab strip and Here tab go. The pane is requested at 58 columns there (`$.ui.open` `columns: 58`); the page's measure needs no change (a render's viewport is already the transcript's column). `?` in MORE shows `guideText` (the `/guide` text). The one-turn flash in YOU can use the `latest` atom's `hp` (set at each play turn's end).
   - Then 3.4, pictures, and the second playtest.
   - **Measure** with the part 1 script (*NEXT-PLAN part 1 notes*) if a change could affect speed; `/budget`'s history table compares sessions.
4. **Puzzles** are not planned: when the user brings them back, start from scratch (the old Stage 6 notes are a record, not decisions).
5. **Everything stays kit-generic** (invariant 7): commands, agents and procedure name no game. Forged worlds must each include plans and a side scene, and `validate --kit-complete` must be able to check all of it.

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
| `ea79ba6` | 7.1 People with plans: `## Plan:` sections, world-turn `plans`, `SIGNAL`/`NOW HERE`, `view.signals` toast and chime, `world_turns.plans`; Ysolde, Grukk, Halloran, Bucket (now `minor: no`) |
| `3002c5d` | 7.2 Side scenes: `scenes/`, `rpg.py scene start\|end`, scene part and reply count in `npc-brief`, `side_scenes`, price 2; The Shiniest Thing, The Mopping Dispute; `onlyRecords` and a note-filter case in the mod |
| `26ce9d8` | Validate: a plan step may not leave a character nowhere; the gm-turn signal example names no game |
| `66a582b` | Playtest bug: the pane's exit and look buttons fill the prompt box instead of submitting (a plugin-submitted prompt is labelled "Prompt from the coderpg plugin" and can't be restyled); footer "1–9 then ⏎ go" |
| `e4f9701` | 8.1 New worlds, engine: soundness checks for every game, `validate --dir`/`--kit-complete`, `state/worlds/`, `forge quote\|start\|resume\|status\|install\|discard`, `new_world` 15 / `new_world_resume` 5, switch `new_worlds`, `NEW WORLD READY` in `look`, `/budget` line |
| `c86b720` | 8.2 New worlds: the worldsmith (Opus) and its guard hook, `rules/WORLD-GUIDE.md`, `/newworld`, gm-turn *New worlds*, the install toast, the mod hiding its rows |
| `b840d0d` | 8.3 `tools/worlds.py list\|keep\|forget` |
| `be3574e` | `NEXT-PLAN.md`; Stage 6 no longer next |
| `6fb8d50` | NEXT-PLAN part 1: the real-spend meter in `/budget` (`mod/hooks/spend.ts`) |
| `074e5d3` | NEXT-PLAN part 2: one-step moves and looks (`ROOM TEXT:` in `look`/`move`; gm-turn moves first) |
| `90ccbba` | Playtest bug: real use was lost after `/newgame` (`$.state` resets on `/clear`); `ensureSpend` restores it from the store |
| `5715017` | NEXT-PLAN 3.1 and 3.2: the page (measure, arrival rule, keylines, change line, paragraph reveal), the band's two modes, the play hint, `/guide`, signal kinds, `speaker_colors`; skill reads are plumbing |

Commits that change only this file (`HANDOFF.md: …`) are left out.

## NEXT-PLAN 3.1–3.2 playtest checklist (what should happen)
- **Restart Claude Code** in the game folder, wide (184×46 is the mock's size), so the pane docks.
- **The page:** narration as plain text, about 72 columns wide, indented, no box; paragraphs appear one after another, each dim for a moment (any key shows the whole turn). No `~ ✦ ~` after a turn.
- **Your line:** `› go west`, dim and italic; under a curse your words as they came out, with a dim red ✶.
- **Arriving:** a thin rule with the place in the accent color and the time of day: `──── The Lighthouse · dusk ────`. No block letters, no wipe.
- **Speech:** a character's paragraph beside a colored bar, under their name, the `Name:` tag gone. Generated people get their own colors from a set of six.
- **Change line:** under a turn that changed something, one dim line: `✧ −2 ♥ · +3 coins · gained … · ✓ … · the world grows · …`. No toast for those. Toasts still come for the resource running low or out, a curse taking hold, and a new world ready; someone's plan close by is only a chime now.
- **Band:** beside the pane, `♥ 10 │ ✧ <the latest change>`, health red or cyan for the turn it changed, and `◌ <what's happening>` while Claude works. In a narrow window (no pane): `◆ Place · ♥ · ◎ · resource · ⧗ · time · ▸ objective`.
- **Hint:** under the prompt, `⏎ act · ooc: speak to the builder · ctrl+x tab to the margin · /guide help`; no "auto mode on" in play. While a turn runs, Claude Code's own (Esc interrupts). `/guide` shows how to play.
- **Title and ending cards:** between thin rules, centered in the text column.
- **Watch for:** a paragraph wrongly taken for speech, or speech drawn plain; a missing or wrong change-line entry; the keyline a row short or long; text wider than the column; any machinery on screen.

## NEXT-PLAN 3.1–3.2 notes (as built, 2026-10-23)
- **Engine:** `add_signal(state, text, kind)`, `kind` `plan` or `world` (install), in `view.signals` (old saves read as `plan`); `speaker_colors` in `rules/look.default.json`, checked by `validate`. No save version change.
- **Mod, the page** (`story.ts`, `page.tsx`, `feedback.ts`, `register.tsx`): `measureOf` (72, or the column less 6); `arrivalRow`; `ruleRow` around title and ending cards; `speakerCards` (card, else `speaker_colors` in met order, skipping colors cards use); `speechTag`/`blocksOf` (tag, else `speakerOf`); `rowsOf` counts wrapped rows for the keyline; `page.tsx` reveals paragraphs (`STEP_MS` 150, dim then full), each block `delay`ed after the ones before it and after a title card; `prompt.edit` sets `revealSkip`; `changesOf` makes the change line, written on the last narration block at `turn.complete`; `feedback` keeps toasts only for the meter, a curse taking hold and `world` signals. Removed: `font.ts` (block letters), the wipe mode, `bannerRows`, `~ ✦ ~`, `»`. `isGmNote` never takes a tagged speech paragraph for a note (`looksTagged`).
- **Mod, 3.2:** the band's two modes (`bandParts`, `bandHpColor`, the `latest` atom set at each play turn's end); `PLAY_HINT` and `WORKING_HINT` replace Claude Code's hint line in play (its line names the permission mode while working); `SessionMode` labels hidden in play; `/guide` (`guideText`).
- **Learned:**
  - **A render's `viewport.columns` is the transcript's column, not the terminal's** (beside a docked pane it's narrower). The old `columns >= 144` test never saw a wide terminal. Whether the pane is docked comes from `$.ui.panes()` (placed and shown). Claude Code docks it from 144 columns unasked, or from 110 once the player has opened it.
  - **Render hooks may not write state** ("drawing is pure"); a value one draw needs from another must come from an event or an engine read.
  - **The game master sometimes `Read`s `.claude/skills/gm-turn/SKILL.md`** instead of loading the skill. That Read wasn't plumbing, so Claude Code drew the whole call group ("Read 1 file, ran 2 shell commands", and the running `rpg.py` command). Earlier captures missed it because the grep wanted `Ran \d` with a capital. Reads of `.claude/skills|agents/` are plumbing now; grep `shell command` in live checks.
  - The capture collapses runs of spaces, so grep single-spaced pieces.
- **Live checks** (Sonnet, scratch copies, `newgame 7`): 184×46: look, take the hilt, south with generation, `/newgame 7`, west; 120×40: west, `/guide`; then both widths again after the fixes above. Seen: the arrival rule with the time, keylines with names (Ysolde), the change line (`✧ gained Boarding Cutlass`), the title card between rules, the hint line, `◌` while working, `/guide`; no `ROOM TEXT`, no `rpg.py` after the fix.

## NEXT-PLAN parts 1–2 playtest checklist (what should happen)
- **Restart Claude Code** in the game folder first, so the fixed mod loads. Counting starts with that session.
- **`/budget`:** after the switches, a section "Real use this session":
  - per play turn: seconds, requests, weighted tokens;
  - by who: storyteller, characters, world agent, worldsmith, other agents;
  - raw counts;
  - extras: points, and the world agent's tokens;
  - what a point really cost: known once the session has turns both with and without extras;
  - plan usage: the 5-hour and weekly windows;
  - development turns, if any;
  - from the second session on, a table of earlier sessions.
  It should survive `/newgame` and `/game` (the bug fixed in `90ccbba`).
- **Moves:** the same story as before, a little quicker. A plain "go west" is one command. Room descriptions are still right, including what changes with flags (the lighthouse lit, Ysolde asleep and so on).
- **Watch for:**
  - a room described wrongly or from an earlier state;
  - the GM moving the player when their words were vague;
  - any `ROOM TEXT` or rules text on screen;
  - a dice-tray line that's really room prose.

## NEXT-PLAN part 2 notes (as built, 2026-10-23)
- **Engine:** `look` (so `move` and `newgame` too) ends with `ROOM TEXT:` and the room's body through `applicable` (`room_text`), authored or generated; no front matter. `LOCATION:` keeps `[generated]` but no longer says to `show` the room.
- **GM procedure** (`gm-turn` steps 1, 2 and 4):
  - a plain move runs `move` first when the player's words match an open exit in the last output the GM has;
  - otherwise `look` first;
  - the room isn't `show`n again.
- **Also updated:** the reminder hook, `/newgame` and `/game`, and the README.
- **Tray:** `statusPart` cuts the output at `ROOM TEXT:`, for both `trayLines` and `combatOf`.
- **Tests:** a test that watched `move`'s output for a flag name now reads the save, because room text names flags in its `## If` headings. Watch for that in new tests.
- **Measured** (same script and seed as part 1's baseline; Sonnet):

  | | s/turn | requests/turn | weighted/turn |
  |---|---|---|---|
  | before | 19.9 | 4.0 | 38.7k |
  | after | 16.4 | 3.6 | 35.1k |

  That's about 18% faster, 10% fewer requests and 9% fewer tokens. By turn:
  - look: 53k/3 requests → 42k/2;
  - move west: 29k/4 → 22k/3 (the `look` and the `show rooms` are gone; it still `show`s Ysolde, as it should);
  - move east: 16k/2 → 16k/2 (it had already chained `look && move`);
  - Ysolde: 34k/4, the same;
  - south with generation: 51k/5 → 50k/5.

  A point really cost about 13k, inside 10–15k.
- **Live check:** narration followed the room text; no plumbing and no `ROOM TEXT` in any frame.
- **Seen:** for "head south" (a `may grow` way, not an open exit) the GM went straight to `world-brief room` without a `look`, using the previous turn's output. Harmless here, since `generate` and `move` print everything after, but strictly it's not what step 1 says. Watch in the playtest; if it causes a wrong turn, either tighten step 1 or allow it explicitly.

## NEXT-PLAN part 1 notes (as built, 2026-10-23)
- **The mod counts** (`mod/hooks/spend.ts`, pure; wired in `register.tsx`):
  - every request's `usage` from `turn.step`;
  - helpers by type, from `agent.spawn`;
  - play turns from `turn.start`/`turn.complete` (time, every request in the turn except the worldsmith's, and the meter points it spent);
  - development turns separately;
  - the plan windows from `session.measure`.
- **Kept** in `$.store` under `spend:<project root>` (`{ current, history }`, last 10). `session.start` moves the last session into the history; each turn's end writes `current`. No game files, no `rpg.py` change.
- **`/budget`'s "Real use this session":**
  - per play turn (s, requests, weighted tokens);
  - by who;
  - raw counts;
  - extras;
  - **what a point really cost** (turns with extras less as many plain turns, per point; needs both kinds);
  - plan usage;
  - development turns;
  - the history table.
- **Weighting** = input + 1.25 × cache writes + 0.1 × cache reads + 5 × output (an assumption).
- **Baseline for part 2** (2026-10-23, Sonnet GM, scratch copy, `rpg.py newgame 7`, lighthouse). Script: `[[15, "I look around the square.\r"], [70, "I go west up the path to the lighthouse.\r"], [80, "I ask the keeper why the lamp is dark.\r"], [120, "I go back east to the square.\r"], [80, "I head south down the quay steps to the boats.\r"], [200, "/budget\r"], [15, null]]`.
  - **Result:** 5 play turns, **19.9 s, 4 requests, 39k weighted tokens per turn**; storyteller 183k, characters 4.8k (1 run), world agent 5.6k (1 run); 2 points.
  - **From the transcript, per turn** (GM only): look 53k/3 requests (the first turn also loads the skill), move west 29k/4 (`look`; `move`; `show rooms`), Ysolde 34k/4, move east 16k/2 (the GM chained `look && move`), south with generation 51k/5.
  - **A point therefore cost about 11.5k**, inside the 10–15k the prices assume. One sample: measure again over longer play.
  - The plan windows didn't move a whole point in this run.
- **Playtest bug (fixed, `90ccbba`):** `/budget` showed no real-use section after `/newgame`. `$.state` belongs to a Claude Code session, and the `/clear` that `/newgame` and `/game` run starts a new one in the same process, so the atom came back empty (the save atom recovers by re-reading the file; this one didn't). `ensureSpend` now restores it from the store's `current` whenever it's empty. Tested by a mod test that empties the state between two turns, and live (`/newgame 7`, a turn, `/budget`: 2 turns and the earlier sessions shown). **Any new `$.state` value that must outlive a turn needs the same care.**
- **Checked live:** subagent steps arrive with `agentId`, and their spawns name the type; the store is written each turn; `/budget` draws; no plumbing in any frame (the capture's one `rpg.py` is Claude Code's trust prompt for the scratch folder).

## Stage 7 decisions (agreed 2026-10-22)
- **D1 plans as flags:** a plan step sets or clears one of the character's own flags (`<id>_<word>`); rooms place characters and bar ways with conditions on those flags, as they already did for story flags. Written as `## Plan: <step> (if <cond>)` sections in the character file (`does:`, `sets:`/`clears:`, `near:`, `rumor:`). Never a main-story flag; every set flag can be cleared; no combination puts a character in two rooms (validate).
- **D2 the world agent picks:** the world-turn brief lists the steps open now; the agent picks at most one per character, or none; `generate.world_turn` checks.
- **D3 signals:** in or next to the player's room, the `near:` line is printed as `SIGNAL:` (one sentence in the narration) and shown as a toast with the `signal` sound (`view.signals`); further off it becomes a rumor. `NOW HERE:` when someone arrives in the player's room.
- **D4 cost:** plans ride on the world turn (price 2, unchanged); switch `world_turns.plans` (thrifty off, normal and rich on); frequency is `world_turns.every_moves`.
- **D5 scenes:** `scenes/<id>.md` (`with:` two agent characters, `where:`, `when:`, `reward:` at most 2 coins or none). `look` says when one is possible; the GM shows the two starting up; it starts only if the player engages (`scene start`), alternating one reply from each per player message, up to the scene's reply cap; `scene end` gives any reward and a chronicle line. No story flags; once per run.
- **D6 scene cost:** price 2 per scene; `side_scenes {on, max_per_run, replies}`: thrifty off/0, normal on/2/6, rich on/4/10. Only when both agents are on.
- **D7 lighthouse:** Ysolde walks to the quay and back, sleeps with the door barred (knocking wakes her); Grukk forages on the coast road and back (a boulder he rolls over the path keeps the hollow shut). Scene: Ysolde and Grukk after the friendship ending, in Harbor Square. Pell stays minor.
- **D8 station:** Bucket is now `minor: no` (still the maker and builder); it rides the cargo hoist up to mop the Control Room and back. Halloran checks her tanks in the Lab Wing and back, and dozes at her console (talking wakes her). Scene: the mopping dispute in the Control Room, possible only when Bucket's plan has brought it up.
- **As built, beyond the decisions:** someone the player is with doesn't act at all (not only "doesn't walk out"), so nobody dozes off mid-conversation; a step that would still take someone out of the player's room is undone.

## Stage 8 decisions (agreed 2026-10-22)
- **S1 home:** forged worlds install into `state/worlds/<id>/` (git-ignored), listed by `/game` marked as forged. `check.sh` validates only `games/`, so a broken forged world never fails it. Owner tool `tools/worlds.py keep <id>` moves one into `games/`; `forget` deletes it.
- **S2 asking:** a `/newworld <sentence>` skill (player-only, like `/newgame`); no sentence makes a surprise world. `forge quote` gives price, meter and switch; the skill confirms with a yes/no dialog (the question tool), not a typed yes. Off or unaffordable: one line, nothing starts.
- **S3 the worldsmith:** model **Opus** (the user's choice). Tools Read, Glob, Write, Edit, Bash; a guard hook in its own definition denies (never asks) any write outside its draft folder and any shell command other than `python3 rules/rpg.py validate --dir state/forge/<draft>/world --kit-complete`; an allow rule `Edit(state/forge/**)` so its permitted writes don't prompt; a `maxTurns` cap. (Docs, checked 2026-10-22: agent `tools:` takes names only; the project's `rpg.py` allow rule reaches every agent; agent-scoped `hooks:` exist and hook input carries `agent_type`; a background agent's permission prompt surfaces in the main session. Verify the guard live.)
- **S4 `validate --kit-complete`:** world.md (title, start room, stats, rolls, coins, inventory, ≥1 variants line, clock, weather, times, generation; Opening, Tone, Public knowledge); a `look.json` of its own with a palette and a resource name and icon, and a terrain style for every room's terrain (kit defaults count); 5–8 rooms, all reachable from the start, each with terrain, ≥1 encounter table; 3–4 characters, ≥2 with agents, ≥1 with plans, a maker, a builder with a build spot; exactly one quest with ≥2 objectives, start/completion/failure, ≥2 ways to finish, ≥2 endings and *After the ending*; ≥1 curse; ≥1 scene. **Soundness checks for every game:** every flag a condition uses can be set by something; every command written in content is a real command naming real things; each part of the quest's completion can become true. Both shipped games must pass `--kit-complete`.
- **S5 cost (changed 2026-10-23, see *Stage 8 cost, measured*: new worlds are off the meter):** price `new_world` 15 (estimated for Sonnet; the worldsmith is Opus, so calibrate against `/cost` after the first real forge); switch `new_worlds {on}`: thrifty off, normal and rich on; no per-run cap; a `/budget` line.
- **S6 failure:** the draft survives a failed or interrupted forge; `/newworld` offers to finish it (price 5, `new_world_resume`) or start over; no refund; `forge discard` deletes a draft. (Agreed: `look` reports unfinished drafts to the GM. As built: only `forge quote` does; see *Stage 8.1 notes*.)
- **S7 ready:** the worldsmith's last act marks the draft finished; the GM runs `forge install` on the completion notice, and `look` prints `NEW WORLD READY` as a fallback. The player gets one line in the story and a toast with a chime; no automatic switch; the running-agents label is in-world and the forge's rows are hidden.
- **S8 format:** one authoring guide, `rules/WORLD-GUIDE.md` (every format plus the kit-complete list), plus read-only access to both shipped games as examples (learn, don't copy). The README links it.
- **Also agreed:** a forged world's `settings.json` starts on the normal preset; no room art in forged worlds; seeds, the daily world and the library work in them unchanged.
- **Sub-stages:** 8.1 engine (soundness and kit-complete checks, `validate --dir`, `state/worlds/`, `forge quote|start|resume|status|install|discard`, price/switch/presets/`/budget`, tests); 8.2 the worldsmith (agent and guard, guide, `/newworld`, permission rule, `NEW WORLD READY`, gm-turn, mod toast and labels, live guard test, one real forge, a few turns of play in it); 8.3 `tools/worlds.py`; then stop for the playtest.

## Stage 8.2 and 8.3 notes (as built)
- **The worldsmith** (`.claude/agents/worldsmith.md`): Opus, tools Read/Glob/Grep/Write/Edit/Bash, `maxTurns: 150`, `omitClaudeMd: true`, and a `hooks: PreToolUse` block running `.claude/hooks/forge_guard.py` on Write/Edit/MultiEdit/NotebookEdit/Bash. Its prompt is the brief `forge start`/`resume` prints; its procedure (read the guide, glance at examples, plan, write, check until OK, READY last) is in the definition.
- **The guard** answers `allow` for writes inside the forging draft's `world/` (and its READY), the exact check command, and `rm state/forge/<draft>/world/<file>` (one file, no flags); `deny` for every other write or command, with a reason that restates the rule; nothing for reads, or for other agents (`agent_type` set and not `worldsmith`), so it could also be registered project-wide. "Forging" means: no READY, `status: forging`, and the meter's current session mark. **Live (Sonnet GM, trusted scratch folder):** all six probes behaved; the worldsmith's first write even went to the real project path and was denied. **In an untrusted folder the agent's hooks don't run at all** ("this workspace has not been trusted"); the player's folder is trusted, and live tests must use a trusted scratch folder (one `play.py --trust` run trusts it). A headless test must start the forge inside the session (the SessionStart hook's refill changes the session mark).
- **Known gap:** if the player quits Claude Code choosing "move to background" while a forge runs, the next session's refill makes the draft unfinished and the guard stops the still-running worldsmith; the player finishes it with `/newworld` (price 5).
- **`rules/WORLD-GUIDE.md`:** every format, writing for the game master, the soundness rules and the kit-complete list. README links it.
- **`/newworld`** (`.claude/skills/newworld/`, player-only): `forge quote`; one-line answers for off, can't pay, forging, ready; otherwise AskUserQuestion (Forge it / Not now; with an unfinished draft: finish it / start this one / throw it away / not now); `forge start "<sentence>"` or `forge resume`; spawns the worldsmith in the background with the brief verbatim and the description "A new world takes shape"; one line of story.
- **gm-turn *New worlds*:** on the completion notice or `NEW WORLD READY`, `forge install`; `INSTALLED` → one line at the end of the narration (or the whole reply); `REFUSED` → nothing.
- **Install toast:** `add_signal` (now shared with plans) puts "A new world has taken shape: <title>. /game <id> goes there." into the active save's `view.signals`, so the mod's existing toast and chime show it.
- **Mod:** `newworld` (Skill) and `worldsmith` (Agent) are plumbing; the worldsmith's running-agents label is "A new world takes shape"; AskUserQuestion doesn't make a turn count as development (so the `/newworld` reply is still drawn as story). Its hand-back row ("Message from @worldsmith": the old pattern `world\b` missed it) and the task-notification row "Agent … finished · 8m 24s" (a `UserMessage` whose `task.toolUseId` is a hidden call) are hidden in play. The running-agents bar still shows "◯ worldsmith" (mods can't redraw it; same as "◯ npc"). These two row fixes came after the live forge; the user's forge on 2026-10-23 confirmed both stay hidden.
- **Permissions:** `Edit(state/forge/**)` added to the allow list.
- **8.3 `tools/worlds.py`:** `list` (title, date, the request, save state), `keep <id>` (moves to games/, validates as a kit game, moves back on failure; the save and library carry on under the same id), `forget <id> --yes` (deletes the world, its shelved save and its library; refuses the world being played; without `--yes` says what would go).
- **Tests:** the guard (allow/deny cases, no say for other agents, hands off once READY); the install toast; keep and forget.

## Stage 8 live results (2026-10-22, Sonnet GM, trusted scratch copy)
- **Forge:** `/newworld a smugglers cove under white chalk cliffs, where the customs men are closing in` → the dialog (Forge it / Not now) → `forge start` → worldsmith in the background → one line of story; play went on (a look turn); after 8 m 24 s the completion notice started a turn by itself and the GM ran `forge install` and wrote one line, with the toast. The `look` fallback wasn't needed. No GM plumbing in any frame; Claude Code's own rows showed the worldsmith (now hidden, see above).
- **The world:** *The Run at Hollin Cove* (7 rooms, 4 characters, quest with two ways and four endings, a variant-craving sentry, curse, scene, its own look: Candle-ends ✧, shillings, chalk and shingle tiles), kit-complete first time it was installed. It wrote `see rooms/chalk_head.md` in GM notes; the guide now says to name things, not paths.
- **Played:** `/game run_at_hollin_cove`, `/newgame`, two actions: title card, banners and look right; Wenna voiced through her agent with her GM-only lines applied; no plumbing.

## Stage 8 cost, measured (decided 2026-10-23)
- **The worldsmith used** 62 messages, 47 tool calls, 189k output tokens, 2.77M cache reads, 258k cache writes: about **$5.60** (Opus 5.5: $4 / $20 / $0.20 cache read; writes assumed at 1.25× input). A Sonnet GM turn is about $0.08, so a forge is about **70 meter points** against the price of 15 (normal capacity 30, rich 60).
- **Why:** two-thirds is output, mostly thinking; the definition sets no `effort`, so it ran at Claude Code's default for subagents.
- **Options proposed:** (1) `effort: medium` and measure again; (2) price at ~70 and raise capacities; (3) Sonnet 5.5 for the worldsmith; (4) take new worlds off the meter and keep only the confirmation.
- **Decided (the user):** (4). New worlds don't use the meter: `new_world` and `new_world_resume` are gone from `balance.json`, `forge quote` no longer prints `FORGE CAN'T PAY`, `start`/`resume` charge nothing, `/newworld` names no price, and `/budget` says they don't use the resource. The `new_worlds` switch and the confirmation stay. Later, only admin mode offers new worlds (`IMPLEMENTATION-PLAN.md`, R1). The worldsmith is unchanged (Opus, no `effort` set).

## Stage 8 playtest checklist (what should happen)
- **Ask:** `/newworld <a sentence>` (or alone, for a surprise). A dialog asks to confirm, naming no price (new worlds don't use the meter). Yes: one line ("a new world begins to take shape…"), and the game goes on; the running-agents bar shows "A new world takes shape".
- **Ready:** some minutes later, unprompted, one line names the new world and `/game <id>`, with a toast and chime. `/game` lists it as forged.
- **Play it:** `/game <id>`, `/newgame`. It should feel like its own small game: its own look, people with their own voices, two ways through.
- **Owner:** `python3 tools/worlds.py list`, `keep <id>` (into games/), `forget <id> --yes`.
- **Watch for:** any visible machinery (agent names, "finished" rows, draft names); a forged world that can't be finished; one too close to the shipped games.

## Stage 8.1 notes (as built)
- **Where games live:** `content.authored_games()` (games/) and `list_games()` (games/ plus `state/worlds/`); `is_forged`, `game_path`. `use_game(ident, folder)` keeps the id apart from the folder (a draft's folder is `world/`); `choose_game(ident, folder)` likewise. `validate` with no options covers only games/.
- **Soundness** (`validate_soundness`, every game): `settable_flags` (a `flag set` anywhere, an `(effect: flag x)`, world.md `flags:`, variants, the clock, plan `sets:`, `<id>_defeated` for anyone with hp) against every condition `conditions_in` finds (`(if …)` on any front-matter value, started/completed/failed_by, caused/cured_by, a scene's when, objectives, plan steps, `If …` headings at any depth); `has_`/`met_` need the item or character. Backticked rules commands (`` `lose honey_cake` ``, also `rpg.py show …`) are checked by `command_problem`. Both shipped games passed with no changes.
- **Kit-complete** (`validate_kit_complete`): as in S4, except **`times:` is optional** (the station has none; it only tints the accent). Also: only known files (world.md, look.json, balance.json, settings.json, forged.json, `<kind>/*.md`, `art/*.txt`), at most 80 files, each at most 20,000 characters. "Two ways through" is a heuristic: an `or` in completed_by or in some objective's done-when.
- **Robustness:** `validate` never refuses on a broken draft: `layout()` from a missing start room is skipped, a parse error names its file, and anything else that stops the check is reported as "checking stopped early: …" (the worldsmith's loop depends on this).
- **The forge:** `state/forge/draft_<6 hex>/` holds `forge.json` (`sentence`, `started`, `session`, `status`, `resumes`) and `world/`. Status: `READY` file → ready; `status: stopped` or a different meter session → unfinished; else forging. `meter refill` (Claude Code start or resume) writes a new `session` mark; `charge` keeps it. One forge at a time. `forge install` on a draft without READY marks it stopped (so the GM can install on the worldsmith's completion notice whatever happened); a READY draft that fails the checks loses READY and is stopped. Install picks the id from the title (`The Salt Mines` → `salt_mines`, `_2` on a clash), moves `world/` to `state/worlds/<id>/`, writes `settings.json` (normal) and `forged.json` (title, sentence, date), and deletes the draft. `forge start`/`resume` print the worldsmith's brief (it points at `rules/WORLD-GUIDE.md`, written in 8.2).
- **Not as proposed:** `look` shows only `NEW WORLD READY`, not unfinished drafts: an unfinished draft needs the player to ask (`/newworld`), so a line in every turn's `look` would be noise the GM can't act on. `forge quote` lists them for the skill.
- **Tests:** 7 new (61 in all): the shipped games are kit-complete; soundness catches an unset flag, a missing item, bad commands; kit-complete names what's missing and survives a broken file; the full quote/start/install cycle with a forged world played and a title clash; switch and meter; a stopped and a failed forge resumed and discarded; a restart making a forge unfinished.

## Stage 6 decisions so far (2026-10-22; void since 2026-10-23: puzzles will be rethought from scratch; kept as a record)
- **D1 puzzles are optional, for now:** a lock's or mechanism's flag may never appear in a quest's objectives or completion (validate), so no puzzle can make a game unwinnable.
- **D2 files:** `games/<id>/puzzles/locks/<id>.md` and `games/<id>/puzzles/mechanisms/<id>.md` (the user's hybrid of separate kinds and one `puzzles/` folder); `show locks <id>` / `show mechanisms <id>`. The rest of the proposal (block set, key line, tries and hints, free with no switch, the four puzzles, requiring a mechanism in forged worlds) is in the conversation of 2026-10-22 and should be proposed again, briefly, when Stage 6 is next.

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
- **Stage 8 (decided 2026-10-22):** every seeded world must include people with plans (at least one major character with `## Plan:` steps and the room conditions they need) and at least one side scene; `validate --kit-complete` requires both.
- **Both games:** every stage adds its feature's content to The Dark Lighthouse **and** The Flooded Station.
- **The owner's reminders (2026-10-23):** admin mode, turning the meter off, and a real-spend meter are listed in `IMPLEMENTATION-PLAN.md`, *Owner's reminders* (R1–R3). R3 is now `NEXT-PLAN.md` part 1; R1 and R2 aren't designed yet and come after that plan. R1 replaces the parked owner-run mode, and is where new worlds will be offered once it exists.
- **Process:** propose a stage's open decisions (with context, options, a recommendation and downstream implications, assuming little project knowledge) and wait for answers before building; one commit per agreed change; run the checks before and after; a live check with `tools/play.py` in a scratch copy before each commit that touches what players see; keep this file current; stop for the user's playtest after every stage. The user is the only user, so local single-user risks are low priority. **Visible machinery is always a bug.**

## Design as built (so the next stage fits)
- **Game selection:** the save's `game`, else `state/active.json`, else the first game. `rpg.py` calls `choose_game()` on every run, which sets `BALANCE` (kit + game) and `SETTINGS` (preset + overrides). Other games' saves wait in `state/shelf/<id>.json`.
- **The mod reads only the save.** Per-game look, meter, settings and run label arrive in `view` (`view.look`, `view.meter`, `view.settings`, `view.run_label`); also `view.items[].own`, `view.people[].promoted`, and `map[*].made_by` (`world` or `player`). `lookOf()` in `mod/hooks/look.ts` fills gaps from `DEFAULT_LOOK`.
- **Charging an extra:** price in `rules/balance.json` `meter.prices`; `can_pay(kind)` before; `charge(kind)` after every check that could refuse; an in-fiction refusal when it can't pay; a switch in `rules/presets.json`; a name in the mod's `PRICE_NAMES` for `/budget`.
- **Procedure lives where it's active:** `look` prints `MAKERS HERE`, `BUILD SPOTS HERE`, `ORDERS WAITING`, `BEING BUILT`, `CURSE:` only when they apply; `rpg.py` output tells the GM the next command (`PRICE: … run pay <id>`, `PROMOTED: … run npc-brief`). Prefer this to new skill side files, which would need Read permissions.
- **The GM reads content only through `rpg.py show`**, never by path. `look` labels a non-minor character whose agent the owner switched off `[minor, agent resting]`.
- **Map squares:** `rpg.layout()` mirrors the mod's `layout()`/`STEP` (up and down are drawn as north and south). Change one, change the other.
- **Story filter:** the mod holds back a turn's text and shows only the narration; `isGmNote` (`mod/hooks/register.tsx`: `GM_ALWAYS`, `GM_ANYWHERE`, `GM_PROGRESS`, `GM_MAYBE`+`GM_WORDS`) strips a GM note from the narration's first paragraph. Add each newly seen leak to the tests in `mod/tests/coderpg.test.tsx`, together with story lines that must survive.
- **Animations** are surface modules (`mod/hooks/reveal.tsx`, `trayfx.tsx`, `tilemap.tsx`) drawn as a literal `<Client module="./x.tsx">`. Their frame logic is pure and exported; they play once while fresh (`FRESH_MS`), otherwise drawn still.
- **Tests:** `tools/test_rules.py` (64 engine tests, CLI-driven in a temp copy, both games) and `mod/tests/` (72). Both run from `tools/check.sh`.

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
- **Pane moves take Enter now** (playtest bug, 2026-10-22): a prompt the mod submits carries Claude Code's plugin label and never reaches the mod's render hook, so exits and look fill the prompt box instead. If a later Claude Code lets a plugin submit unlabelled, one-press moves could come back.
- **Progress-line leaks:** a fourth shape, from the 7.2 live check: "Compromise reached; ending the scene with the reward." It showed because the GM chained `scene end` after `remember` in one shell call, and the mod judged the call by its first (recording-only) command. Fixed both ways: `onlyRecords` looks at every command in the call, and `GM_ANYWHERE` catches "starting/ending the scene". Earlier: three shapes seen and caught ("…, I've finished the off-screen world update, and now I'm narrating."; "Bucket's drawing up the Lookout Float; it's priced at 5 credits…"; "Settling in beside Old Hob now."). gm-turn now asks for progress lines ending in "…" as their own paragraph. The filter is a heuristic: watch for new shapes.
- Under the thrifty preset, Sonnet still calls `npc-brief` once for a resting agent before voicing them. It's refused at no cost and hidden from the player.
- The player's real save is v7; it upgrades to v8 on load.
- The fixed prices for extras are estimates; recalibrate if `/cost` suggests they're off.
- The station's content generates no people (`extras: no`, `characters: no`), so befriending, carry-over of friends and promotion never come up there. That's the station's choice; changing it is a content decision for the user.
- `validate` checks a curse's cure is reachable by searching the game's other `.md` files for the flag name (a heuristic).

## Stage 7 playtest checklist (what should happen)
- **Plans** (normal preset; world turns every 5 moves in the lighthouse, 4 on the station). Wander about. Now and then, when you're next to where someone is, you notice something: a lantern coming down the lighthouse path (Ysolde to the quay), a bar thudding across the lighthouse door and snoring (she sleeps: the way west from the square is barred until you hammer on it), heavy feet and sniffing on the coast road (Grukk foraging; the bridge is empty, a boulder over the path). On the station: boots on the ladder (Halloran to her tanks in the Lab Wing), snoring from the Control Room (she dozes; talking wakes her), the cargo hoist clanking (Bucket off to mop the Control Room; it's gone from the Common Deck). A toast with a soft chime shows the same line. Further away, you only hear about it from people.
- **Nobody acts while you're with them**, and the GM never says "meanwhile…".
- **Bucket now speaks through its own agent** (slower; its orders work as before).
- **Side scenes:** station: wait in the Control Room with Halloran until Bucket comes up (or come back later), and Bucket and Halloran start arguing over a puddle. Join in or egg them on, and it plays: one reply from each per message, 6 in all, then it ends; broker a compromise and Bucket pays you a credit. Lighthouse: after the friendly ending (Grukk befriended, lamp lit), stay in Harbor Square: Grukk begs Ysolde to hold the lens. Walking away ends a scene. `/budget` lists both features.
- **Watch for:** machinery in the story (world turns, signals, "plan", "scene"); signals that are explained instead of shown; a character in a place their room text doesn't expect.

## Stage 7.2 notes (as built)
- **Engine:** `content.KINDS` gains `scenes` (so `show scenes <id>` works and validate counts them). `why_no_scene` (switch; neither agent resting; not played this run; under `max_per_run`; no other scene playing; the player in `where` with both; `when` holds; meter can pay), `cmd_scene` (`start` charges `scene` and records `run.scenes[id] = {status: playing, replies, started_at}`; `end [reward]` gives `scene_reward` coins, appends `chronicle:`, marks done). `npc-brief` for a cast member of the playing scene adds "A little scene you're in" (the premise and their part) and counts the reply, saying when it's the last; past the cap the brief is plain. `move` ends a playing scene with no reward (`SCENE OVER`). `look` prints `SCENE PLAYING` or `SCENE HERE`.
- **Replies:** a brief for the same cast member twice in a row is the same reply (`run.scenes[id].last`): the two take turns, and the GM sometimes runs a brief once to look and once to spawn.
- **Save:** `run.scenes` is optional (`setdefault`), no version bump.
- **Live checks (station, Sonnet):** three messages (climb up; step in; broker a sample-first deal). The GM showed it starting from How it starts, started it on the second message, alternated Bucket and Halloran through fresh briefs, and ended it with the reward. First run: a GM note leaked (see Open observations) and a brief was reused; both fixed. Second run: nothing leaked; the narration said "A scene is already underway", so gm-turn now says never to call it a scene.
- **Validate:** two characters, both `minor: no`, both listed in `where`'s characters (under any condition), reward `none` or `coins 1..scenes.max_reward_coins`, a chronicle line, the four kinds of section, no `flag set`/`flag unset` in the body.

## Stage 7.1 notes (as built)
- **Engine:** `content.plans(body)` parses `## Plan:` sections; `rpg.plan_steps`, `where_is` (first room whose conditions place the character), `neighbours` (exits either way, open or not), `open_steps` (switch on, the character not in the player's room, condition holds), `apply_plan` (sets/clears the flag, undoes it if anyone the player is with would vanish, then `SIGNAL:` + `run.signals` when the player's room is the before/after room or next to one, else the step's rumor; `NOW HERE:` on arrival; `OFF-SCREEN:` otherwise). `gen_context` passes `plan_steps`; `generate.world_turn` checks `plans` (open steps only, one per person). `applicable` (so `show`) and `npc-brief` leave plan sections out; `show --all` keeps them.
- **Save:** `run.signals` (last 3, `{n, text, move}`) and `run.signal_n` are optional fields (read with `.get`/`setdefault`), so no version bump. `view.signals` is `[{n, text}]`; the mod toasts entries with a higher `n` than before and plays the `signal` beat (`chime_low`).
- **Validate:** `quest_flags` (quests' conditions and objectives, the clock's flags, the variants) are off limits; flags must be `<id>_<word>`; every set flag needs a clearing step and vice versa; something outside the character file must use the flag; each subset of the character's plan flags, over world.md's starting flags, places them in at most one room; and someone placed at the start stays placed in every plan state reachable from the start (following the steps' conditions over the starting flags), so a forgotten room condition can't make them vanish.
- **Live check (lighthouse, Sonnet):** world turn due on arriving in Harbor Square; the agent picked Ysolde's `to_quay`; the toast showed the `near:` line, the GM wove it into the narration as she arrived, and no machinery showed in any frame. The GM wrote "Applying the world turn…" as a progress line; the mod hid it.

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

## Later stages
- **Next: `NEXT-PLAN.md`.**
- **Stage 6, puzzles (superseded 2026-10-23; to be rethought from scratch, so what follows is only a record of the old idea):** the GM assembles prebuilt kit code blocks (`rules/blocks.py`, a JSON pipeline; `rpg.py solve` and `unlock` for locks, `inspect` and `repair` for a broken mechanism). No free-form code. Decisions to propose when it's next: the block set (which blocks, and what each may read and change), how a puzzle is written in content (a `puzzles/` kind, or a section of a room or item), what a solve costs (baseline play is free, so probably nothing unless an agent is spawned), the switch (if any), and one lock and one broken mechanism for each game.
- **What the old Stage 6 would have added to Stage 8 (record only):** puzzle formats in `rules/WORLD-GUIDE.md`, an easy lock and a mechanism in `validate --kit-complete`, and a way to add puzzles to worlds forged before Stage 6.
