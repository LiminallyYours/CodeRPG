# New stage ideas

Written 2026-10-23 by JW with Claude, for Claude Code. These are suggested ideas, not requirements: Claude Code is to develop an implementation plan from them, following the process in `HANDOFF.md` (propose each open decision with options, a recommendation and downstream consequences, assuming little project knowledge, and wait for JW's answer before building). Read `README.md`, `DEVELOPING.md` and `HANDOFF.md` first. The invariants in `DEVELOPING.md` hold throughout.

Three ideas, in the order they should probably be built. The interface redesign is the priority; the other two are small, touch different files, and can go before it or alongside it.

## Starting point

- Stages 1–5, 7 and 8 of `IMPLEMENTATION-PLAN.md` are built and committed. `HANDOFF.md` says the next job is JW's playtest of new worlds, then Stage 6 (puzzles). **Stage 6 is no longer next:** the puzzle stage is to be rethought from scratch later, and its earlier decisions don't carry over. The plan written from this file replaces that sequence, and `HANDOFF.md` and `IMPLEMENTATION-PLAN.md` must be updated to say so, or a future session will follow the old text.
- Decided elsewhere and not reopened here: the game master and all three helper agents keep their current models and effort levels; the interface does not answer moves itself; there is no travel command. (Details in `NEWSTAGEIDEAS-previous.md`, kept only as a record.)

## 1. One-step moves and looks

**What.** A move is three separate commands today: `look`, then `move`, then `show rooms <new room>`, and the game master waits for each. `look` and `move` should print the room's description themselves, as `show rooms` prints it now (the prose with the `## If` sections that hold, generated rooms included), so a move is one command. This affects nearly every turn, so it is the biggest single speed gain available.

**Why.** Each command is a full round trip to the model; cutting two of them from a move turn makes the turn faster and cheaper, with no change to what the player reads.

**What it touches.**
- `rules/rpg.py`: `cmd_look` and `cmd_move` print the room prose after the status lines. `look`'s current hint for generated rooms ("read it with `rpg.py show rooms …`") goes away, since the prose is now included.
- `.claude/skills/gm-turn/SKILL.md`, steps 1–2: the game master no longer runs `show rooms` for the room it is in. When the player's words clearly match one open exit from the previous turn's output, it runs `move` directly, without a `look` first: `move` refuses if the way isn't open and prints the full `look` on success, so nothing is lost. `look` stays the first command for every other kind of turn.
- `tools/test_rules.py`: tests for the new output. The mod's dice-tray parser reads `rpg.py` output line by line by pattern; a test should show that room prose can't be mistaken for a tray line.
- `README.md` and `rules/RULES.md` where they say the game master reads rooms through `show`.

**Option for Claude Code to weigh:** print the prose only when it has changed since it was last printed (first arrival, or a change in which `## If` sections hold), with a one-line `ROOM: unchanged` otherwise. This keeps the conversation from growing by a room description every turn, which matters in long sittings. It needs the rules script to remember what it last printed, in the save (allowed: only `rpg.py` writes the save). Rejected if it complicates the game master's procedure; the speed gain comes from fewer commands, not shorter output.

**Sequencing.** This edits the game master's instructions, and so does the redesign (section 3, one line). Do this one first, then the redesign's edit, so the file isn't rewritten twice at once.

## 2. The real-spend meter (owner's reminder R3 in `IMPLEMENTATION-PLAN.md`)

**What.** Show what a session has actually used, in tokens or a dollar equivalent at list price, next to the in-game meter's estimated points.

**Why.** The meter's prices are estimates and known to be off (a new world was priced at 15 points and measured at about 70, before new worlds left the meter). A real figure shows when prices are wrong and lets them be corrected in `balance.json`. It also measures whether speed and cost changes, such as idea 1, do what they claim. On the Max plan the dollar figure is an API-equivalent estimate, not a bill.

**First step, before any design: find out whether the interface can read the session's real usage.** Claude Code shows usage in `/usage` and gives status-line scripts cost and cache figures, but whether a mod can read the same numbers is unknown. Check the mod API (`mod/.claude-plugin/types/`). If it can't, say so and stop; the alternatives (reading session transcripts from `~/.claude/projects/`, or a status-line script that writes a file the mod reads) are fragile and should be proposed, not assumed.

**Decisions to propose to JW** (only if the first step succeeds):
- Tokens, dollars or both; which prices (the main session's model and the helpers' differ).
- Whether helper agents are counted. Claude Code's own cache figures cover the main conversation only; the world-builder runs in the background for minutes.
- Where it shows. `/budget` first: it's the existing place for the meter and costs nothing to extend. The side pane is a second step and must fit the redesign (section 3), whose YOU section fixes its rows and whose WHERE section shows no numbers; a dollar figure in the story area counts as visible machinery.
- How often it updates; reading it is free, so every turn is possible.
- Whether players see it or only the owner. Admin mode (R1) doesn't exist yet, so "owner only" means `/budget` for now.
- Whether spend is kept per run or per session, and where. The mod never writes game files; anything recorded goes through `rpg.py` or the mod's own storage.

**What it enables later:** recalibrating `balance.json` prices from measured figures, and a measured before/after for every speed change.

## 3. The interface redesign

**What.** A new look for the game screen, specified in full in `UI-REDESIGN-SPEC.md`, from the mock-up `UI-REDESIGN-MOCK.png` (both in this folder). In short: the story becomes plain text at book width with no boxes; arriving somewhere gets a thin rule with the place name instead of block letters; each character's speech gets a colored keyline and their name; one dim line after each turn lists what changed (health, coins, items, objectives), replacing most toasts; the side pane becomes six labelled sections in reading order (WHERE, YOU, AT STAKE, ACT, CARRYING, MORE), with a picture of each room.

**What it changes outside the mod** (spec section 10): one line of the game master's procedure (a character's speech paragraph starts with the character's name and a colon; the current name-outside-quotes heuristic stays as a fallback); two new keys in `rules/look.default.json` (`speaker_colors`, `sections`) that `validate` must accept; the mod's tests. The rules engine, the save format and the agents are otherwise unchanged; the spec allows a save-format change only as a fallback if the change line can't be built from tool calls. The spec's section 1 says what is out of scope (the Map and Journal screens, sound, the desktop app).

**Ancillary work the spec doesn't list, found by checking it against the code:**
- **Room pictures and the content checker.** The spec puts a `.png` per room in `games/<id>/art/`, but `validate` only knows `.txt` files there, and the "complete world" check (`--kit-complete`, which both shipped games must pass) refuses unknown files. The checker must accept `.png` in `art/`, and should check that each one names a real room, as it does for `.txt`. The spec's "rpg.py: no change" is wrong on this point.
- **Forged worlds have no pictures.** The world-builder writes text only; forged worlds get the spec's default picture per terrain. `rules/WORLD-GUIDE.md` should say pictures are optional and not expected from it.
- **Story styling is per session** (`DEVELOPING.md`, known limits): a resumed session shows earlier narration plain. The redesign rewrites how story is drawn and should state whether this limit stays.
- **Pane buttons still need Enter.** Claude Code labels any prompt a mod submits, so the pane fills the prompt box instead of sending (spec section 6.4 keeps this). Not fixable in the mod.

**Decisions still open** (spec section 11), to propose to JW:
1. Which terminal to target for pictures. Ghostty and kitty show real pictures; iTerm2 3.5+ in fullscreen; Terminal.app only the half-block mosaic. Until decided, the mosaic is the primary rendering.
2. Whether the band above the prompt stays when the pane is docked (it repeats the health number). Build as specified, remove if redundant in play.
3. Where the PNGs come from: made once per authored room and shipped with the game (free at play time; the spec assumes this), as against made during play (costs usage, ruled out by the project).

**Done when:** spec section 12, plus the checker accepting pictures and both shipped games passing `sh tools/check.sh`.
