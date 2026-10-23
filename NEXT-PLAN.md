# Next plan: spend meter, one-step moves, interface redesign

Approved by JW 2026-10-23. This plan comes from `NEWSTAGEIDEAS.md`, with JW's answers from the planning session. The invariants in `DEVELOPING.md` hold throughout. The process is the one in `HANDOFF.md`: one commit per agreed change, checks before and after, a live check with `tools/play.py` in a scratch copy before any commit players can see, and nothing tested in the real save.

## Context
- **The puzzle stage (Stage 6) is no longer next.** It will be rethought from scratch later, and its earlier decisions (D1 and D2, and the "prebuilt code blocks" note) don't carry over. This plan replaces the sequence in `HANDOFF.md` ("Stage 8 playtest, then Stage 6") and in `IMPLEMENTATION-PLAN.md`.
- **Done on approval (2026-10-23):** this file written; `HANDOFF.md` (*Where things are*, *Starting the next session*, *Later stages*, *Stage 6 decisions so far*) and `IMPLEMENTATION-PLAN.md` (Stage 6 and the R1–R3 intro) updated to say that this file is the current work, that Stage 6 will be redone from scratch later, and that R3 is part 1 below.
- **State at planning:** `sh tools/check.sh` passes (both games validate; 63 engine and 63 mod tests; types OK). The spec's "37 mod tests" is out of date: there are 63.

## Order (decided: the spend meter first, so the speed change can be measured)
1. Real-spend meter (owner's reminder R3)
2. One-step moves and looks
3. Interface redesign, in four parts with two playtests

---

## 1. The real-spend meter (R3): built 2026-10-23 (see `HANDOFF.md`, *NEXT-PLAN part 1 notes*)

**Feasibility (checked, read-only):** the mod can read real usage.
- `$.session.usage()` and the `session.measure` event (fired after each main turn) give the context window, the Max plan's rate-limit windows (`five_hour`, `seven_day`, `percentUsed`) and the `/cost` total.
- The `turn.step` result gives each model request's `usage` (input, output, cache read and cache write tokens, and the model). Its input carries `agentId` for subagents, so the GM, the NPCs, the world agent and the worldsmith can be told apart.
- `$.store` persists across sessions, and `$.state` survives hot reloads.
- `/clear`, which `/newgame` runs, restarts Claude Code's own counters, so the mod keeps its own running totals.

**Decided:**
- Tokens only, no dollars: it's a Max plan, so a dollar figure is always an approximation. *Revisit this if the plan or the billing changes.*
- Shown only in `/budget`: not in the pane or the story.
- Kept per Claude Code session (the meter refills on the same boundary) and carried across `/newgame`'s clear. A short history lives in the mod's own storage. No game files are written.

**Why it exists, and so what it must show** (JW asked that it be built for its purpose). It has two jobs:
- **(a) Check the meter's prices.** One point is meant to be about one extra round of GM work.
- **(b) Measure speed and cost changes before and after,** starting with part 2.

Session totals alone serve neither job, because they depend on how long you played. So `/budget` shows:
- **Per play turn, averaged over the session:** wall-clock seconds, model round trips (requests), and tokens. These are part 2's before/after figures.
- **Tokens:**
  - The four raw counts, plus one *weighted* figure: input + 1.25× cache write + 0.1× cache read + 5× output. Those are the API's price ratios. Raw counts are dominated by cheap cache reads, and the weighted figure corrects for that. The weighting is an assumption, noted as such.
- **By who:**
  - The GM.
  - Characters (npc).
  - The world agent.
  - The worldsmith (background, counted when its requests arrive).
  - Other.
- **Calibration:** meter points spent this session, the world agent's runs and their weighted tokens, and **what a point really cost**: the turns that spent points less as many plain turns, per point (added in the build: the world agent's own tokens turned out to be a small part of an extra, about 2.8k per point; most of it is the game master's extra work in that turn).
- **Max-plan usage:** how far this session moved the 5-hour and weekly windows (start → now, in %). On Max this is the real limit, and it's absent off a subscription.
- **Development turns (`ooc:`)** are counted separately, so dev sessions don't distort the play averages.
- **History:** the last 10 sessions in `$.store` (date, play turns, the per-turn averages, helper totals, points, window %), shown as a compact table under the current session.

**Build:**
- **Engine:** no `rpg.py` change.
- **`turn.step` hook:** observe, call `next(e)`, then add `result.usage` to the bucket for `e.agentId`. That id maps to an agent type through the Agent `tool.call` (`subagent_type`), which the mod already watches. With no id, it's the GM.
- **Per-turn timing:** `turn.start` → `turn.complete` (main thread only; play vs `ooc:` from the existing turn classification).
- **`session.end` with `reason: clear`:** keep the running totals (same process). On a real session end or restart, push the session into the history in `$.store`.
- **Code:** a new `mod/hooks/spend.ts` (pure accumulation and formatting, testable), wired in `register.tsx`. `budgetText` gains a "Real use" block.
- **Tests:** accumulation by role, weighting, play vs dev turns, carry-over across clear, history capped at 10, `/budget` text with and without rate-limit data.
- **Live check:** a short scratch play (Sonnet) with one NPC exchange and one generation. Confirm that subagent steps arrive with `agentId` and that the totals roughly match `/cost`'s token figures. **This run is the "before" baseline for part 2.** Record its figures in `HANDOFF.md`.

## 2. One-step moves and looks: built 2026-10-23 (see `HANDOFF.md`, *NEXT-PLAN part 2 notes*)

**Decided:** always print the room's text, with no "ROOM: unchanged" shortcut. That shortcut would break after a compaction, a `/clear` or a resume, when the GM is told "unchanged" about a room it no longer remembers.

**Build:**
- **`rules/rpg.py`:**
  - A `room_text(state, room)` helper: the authored file's body, or a generated room's `body`, through `applicable(…, condition_flags(state))`, which is the same filter `cmd_show` uses.
  - `cmd_look` prints it last, under a marker line `ROOM TEXT:`. No front matter: `look` already summarises exits, items and characters.
  - `cmd_move` already ends with `cmd_look`, so it gets the text for free.
  - Drop the `[generated: read it with rpg.py show rooms …]` hint from `LOCATION:`.
- **Dice tray safety** (`mod/hooks/tray.ts` `trayLines`): stop parsing at the `ROOM TEXT:` line. `move`'s event lines (`ENCOUNTER:`, `CLOCK:`, `BUILT:`) all print before it, so nothing is lost. Add a mod test: room prose that looks like tray lines (`ROLL …`, `damage … = 3 -> …`, `Effect: …`) after the marker gives no tray lines.
- **`.claude/skills/gm-turn/SKILL.md`:**
  - Step 1: `look` comes first, except when the player's words clearly match one open exit from the previous output; then run `move` directly. It refuses if the way isn't open, and prints the full look on success.
  - Step 2: the room's text is in the `look`/`move` output, so `show` is only for characters, items, quests and other rooms.
  - Step 4: "describe the new room from the ROOM TEXT `move` printed".
- **`.claude/hooks/turn_reminder.py`:** its reminder says "start with `rpg.py look`", which conflicts with the new rule. Reword it to "start with `look`, or `move` when the player plainly takes an open exit".
- **Docs:** `README.md` and `rules/RULES.md` where they describe reading rooms (grep at build time; no "show rooms" text was found in them during planning). `DEVELOPING.md` if needed.
- **Engine tests** (`tools/test_rules.py`):
  - `look` prints only the `## If` sections that hold, and their text changes when a flag changes.
  - `move` prints the destination's text.
  - A generated room's body is printed.
  - The old hint is gone.
  - Both games.
- **Measure:** the same scripted scratch play as part 1's baseline, compared on seconds, requests and tokens per play turn. The result goes in `HANDOFF.md`.
- **Live check:** no plumbing visible, and room descriptions are still right after a move.

## 3. The interface redesign (`UI-REDESIGN-SPEC.md`, `UI-REDESIGN-MOCK.png`)

**Decided:**
- **Mosaic only:** JW plays in Terminal.app, which shows no real images. Real images can come later if the terminal changes; the PNGs work unchanged.
- **Who draws:** I draw the pictures by script.
- **Generated rooms:** they never wait for a picture. A suite of generic pictures per terrain is shipped and picked instantly. Authored rooms get their own detailed pictures.
- **Band:** built as specified, and removed later if it feels redundant in play (spec 11.2).
- **Resumed-session styling:** the limit stays, and it's recorded as *uncertain* (JW wasn't sure what was asked). In plain terms: after quitting and `claude --resume`, earlier story shows as plain text, unstyled. Revisit with a real example.
- **Toasts:** the plans signal toast goes (the chime stays); the new-world toast stays; the meter and curse toasts stay. Every other routine change moves to the change line.
- **Split:** 4 parts, 2 playtests.

**My technical choices (say if you disagree):**
- **The change line** is composed from the difference between the save's `view` at `turn.start` and at `turn.complete`. That's the record `rpg.py` wrote, so it's authoritative and needs no save change. It is not parsed from each tool call's text.
- **Pictures:** `rpg.py` picks the picture and names its path in `view.picture`; the mod reads that one PNG, decodes it once into the mosaic and caches it. That extends invariant 4 by one read-only file, and `DEVELOPING.md` says so. `rpg.py` decoding it into the save instead is the fallback if the mod's runtime has no built-in deflate (checked first, in 3.4).

**3.1 The page:**
- Narration as plain text, 72 columns or the available width − 6, indented 4.
- The `~ ✦ ~` marker is removed.
- The arrival rule (`── Place · time ──`) replaces block-letter banners and the move wipe.
- The player's line: `› ` dim italic, with a dim red `✶` under a curse.
- Tray lines dimmed and indented.
- Title and ending cards: thin rules, centred within the measure.
- A paragraph fade-in, with any key showing the whole turn.
- **Speech:**
  - Keyline and name, colours from `look.speaker_colors`, in order of first appearance; `card:` overrides.
  - `Name:` tag stripped, with the old heuristic as a fallback.
  - `gm-turn` step 4 now says a speech paragraph starts with `Name:`, replacing the "name outside the quotes" line.
  - `speaker_colors` goes in `rules/look.default.json`, `validate`, and `CoderpgLook`/`DEFAULT_LOOK` in `mod/hooks/look.ts`.
- **The change line:** hurt and heal, coins, items, objectives, quests, generation, curses.
- `isGmNote` and `stripPreamble` keep working on the new layout.

**3.2 Band, prompt, hint and footer:**
- **Band:** two modes (docked: `♥ n │ latest change` or the phase phrase; undocked: the full line).
- **Prompt:** `❯` in the accent colour.
- **Hint:** the play-mode hint line.
- **Footer:** "auto mode on" hidden in play.
- **Verify first** that the mod API can restyle the prompt glyph and the mode footer. If it can't, say so and skip that piece.
- **→ JW playtest 1.**

**3.3 The margin:**
- The six sections in order, with labels from `look.sections` (a new look key: defaults, `validate`, `look.ts`):
  - WHERE: picture box, name, conditions sentence.
  - YOU: aligned table, grey/amber/red scale, one-turn flash, foes.
  - AT STAKE: clock segments, objectives, curses.
  - ACT: exits 1–9, `l`, talk rows in speaker colours.
  - CARRYING: with a count.
  - MORE: pinned, `m j ?`.
- Plus the empty and game-over states.
- Removed: the VITALS frame, the tab strip and the Here tab. The Map and Journal screens keep their current design (out of scope).
- Until 3.4 lands, WHERE draws the room's text art dim.

**3.4 Pictures:**
- **`tools/pictures.py`** (stdlib only, writes PNGs): simple pixel art at 44×28, redrawable.
  - **Kit generics:** 3 variants each for water, grass, stone and indoors, in `rules/art/terrain/`.
  - **Game generics:** for terrains a game adds (the station's `metal`, `flooded`), in `games/<id>/art/terrain/`.
  - **Room pictures:** one per authored room in both games (12), in `games/<id>/art/<room>.png`. Any can be swapped for JW's own PNG with no code change.
- **`rpg.py` `refresh_view` → `view.picture`.** The chain, in order:
  1. The room's PNG.
  2. The game's terrain generic.
  3. The kit's terrain generic (the variant picked by a stable hash of the room id, so a room always looks the same).
  4. None: the mod draws a field tinted from `look.terrain` colours, else the dim text art.
  - Generated and forged rooms go through the same chain at no extra time or cost. Optional view field, no save version bump.
- **`validate` / `--kit-complete`:**
  - Accept `art/*.png` (must name a real room) and `art/terrain/*.png` (must name a known terrain).
  - Check it's a real PNG of 4:3 or wider.
  - A byte cap for binaries alongside the 20,000-character text cap.
- **`rules/WORLD-GUIDE.md`:** pictures are optional and not expected from the worldsmith. The guard needs no change.
- **Mod:** a Raster mosaic with colours sampled from the PNG, computed once per path.
- **→ JW playtest 2.**

**Done when:**
- Spec section 12 is met at 184×46 and at 120 columns.
- The checker accepts the pictures, and both games pass `sh tools/check.sh`.
- The new mod tests pass: measure widths, section order, each change-line entry, both band modes, the hint, the speech tag, and the picture fallback chain.

## Verification (every part)
- `sh tools/check.sh` before and after every commit.
- Engine behaviour in a scratch copy with `RPG_SEED`.
- A live `tools/play.py` run in a trusted scratch copy (Sonnet) before any commit players see, grepping every frame for plumbing (`rpg\.py|Skill ?\(|Ran \d`, progress lines) and for the wanted drawings.
- Parts 1 and 2 also compare the per-turn figures from `/budget`.
- `HANDOFF.md` updated at the end of each part. Stop for JW's playtest after part 2, after 3.2 and after 3.4.

## Recorded as uncertain / to revisit
- Dollars left out because of the Max plan: revisit if the billing changes.
- The token weighting (API price ratios) is an assumption.
- The resumed-session styling limit was kept without JW being sure what it meant: revisit with an example.
- Whether `/cost`'s total includes background agents is moot without dollars, but check that the worldsmith's `turn.step`s arrive.
