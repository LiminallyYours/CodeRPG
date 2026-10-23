# CodeRPG interface redesign: the page and its margin

Spec for the terminal interface of CodeRPG, as mocked up on 2026-10-23 ("CodeRPG Page Redesign" design canvas). It replaces the look of the current mod (`mod/`) without changing the game, the rules, the save format or the agents. Read `README.md` and `DEVELOPING.md` first; the mod's invariants there still hold (presentation only, reads the save and `rpg.py` output, never writes game files).

## 1. Scope

**In:** the transcript column (the page), the band above the prompt, the prompt and hint lines, the docked pane (the margin), colors and type, what changes on screen when state changes.

**Out:** the Map screen and the Journal screen (they are opened from the margin but their design is a separate spec), the title and ending cards beyond what section 4 says, sound, the game master's procedure except one change in section 10, the Claude desktop app (the terminal is the only target, as the Implementation Plan says).

## 2. Rules that govern every decision

1. **The prose is the game.** Everything else recedes until it changes. Reason: in text games the interface works when it is barely noticed (inkle, Disco Elysium, Roadwarden); the current UI gives chrome the same weight as story.
2. **Lines of narration are 72 characters wide at most.** Reason: readable measure is 45–75 characters (Bringhurst, Butterick). The current cards run to the terminal's full width, 140+ characters.
3. **No boxes.** Separation is done with blank rows and thin labelled rules. Reason: borders compete with text and flatten hierarchy; the current screen has five boxed regions of equal weight.
4. **One accent color.** It marks the place name, hotkeys, the current objective and the live prompt, and nothing else. Red marks danger only. Reason: an accent used everywhere marks nothing (Hodent; Cogmind's color discipline).
5. **Quiet until it changes.** Bars and numbers are grey. A value that changed takes a color for one turn, then goes grey again. Reason: the eye learns a fixed position and notices motion there; permanent color is noise.
6. **Every number the player decides by is exact and in a fixed place.** Health, the resource meter, coins, the clock. Reason: a number in the gaze path beat every HUD bar variant in the Carleton HUD study and was rated more immersive.
7. **The authoritative record of a state change is a line the mod writes from `rpg.py` output, not the narrator's prose.** Reason: the prose may omit or soften a change; the player must be able to trust one line.

## 3. The screen

Two columns on a fullscreen terminal of 144 columns or more (the existing docking rule). Left: the page, taking what is left. Right: the margin, a pane requested at 58 columns (`$.ui.open` with `columns: 58`; the engine caps at 45% of the terminal and the player may drag it). Below 144 columns there is no pane; `/sheet` opens the margin inline as today, and the band carries the essentials (section 5).

The page's content sits 4 columns in from the left edge and wraps at 72 columns. On a terminal where 72 does not fit beside the pane, the measure is the available width minus 6. Space to the right of the prose stays empty. Rejected: centering the column or stretching it to fill; a left-aligned fixed measure is what every reading app does and keeps the player's line and the rule aligned with the text.

## 4. The page

Each item below is drawn by the existing `ui.render` hooks (`AssistantMessage`, `UserMessage`, `ToolUse`/`ToolGroup`, `TurnDuration`, `Spinner`). Row heights are terminal rows.

**Narration.** Plain text at the normal color, paragraphs separated by one blank row, no border, no card. Markdown emphasis as today. The `~ ✦ ~` turn marker is removed; a blank row replaces it. The first narration of a turn is separated from the player's line above it by one blank row.

**The player's line.** `› ` then the text as typed, dim and italic, one blank row above and below. Under a curse the words as they came out are shown, with a dim red `✶` after them, as today. Rejected: the current `»` in bold accent; the player's own words are not the thing to look at, the answer is.

**Scene change.** When the narration opens with the player arriving somewhere (the case that draws a banner today), the first row of that narration is a rule: a thin dim line, the place name in bold accent, a dim `·`, the time of day dim, then the line continuing to the measure's edge. Example: `──────────  Gorse Thicket · dusk  ──────────`. One blank row below. Rejected: the 5-row block-letter banner; it reads as decoration from another era and dwarfs the prose it introduces. Block letters stay on the title card at `/newgame` and on the ending card, once per run, where they mark an event.

**Speech.** A paragraph that is a character's speech is drawn beside a keyline: `▌` in the character's color on every row of the paragraph, the character's name in bold in the same color on the first row, the paragraph indented one column after the keyline. One blank row above and below. Every character with `minor: no` is assigned a color for the run from `look.speaker_colors` (section 7), in order of first appearance; a character file's `card:` overrides it. Characters with `minor: yes` get the dim color. The narrator's own asides (if the narration quotes nobody) stay plain. Section 10 says how the mod knows which paragraph is speech.

**Dice and encounters.** The tray lines stay as they are (one line per roll, the icon in accent, the result word colored good/bad), drawn before the narration, indented to align with the prose. They are dim except the result word.

**The change line.** After the last narration paragraph of a turn in which anything changed, one dim row: `✧` (accent at reduced brightness) then the changes separated by ` · `. The mod composes it from the game tool calls it already classifies (`tool.call`): health lost or gained (`−2 ♥`, `+4 ♥`), coins (`+5 coins`, using `look.currency`), items gained or lost (`gained Driftwood Whistle`), objectives completed (`✓ Find the stray lamb`), quests completed or failed, generated content (`the world grows · Gorse Thicket · Driftwood Whistle`), curses applied or lifted. Toasts are no longer raised for these. Toasts stay for things that need attention right now and are not in the prose: the meter running low or spent, and a curse taking hold. Rejected: toasts for routine changes; a notification off to the side is ignored by an eye on the text (Roadwarden's devlog), and it vanishes, so there is no record.

**Title and ending cards.** Keep the block letters and the typed-out reveal. Replace the double border with a thin rule above and below, the width of the measure. Centered within the measure.

**Reveal.** Narration appears a paragraph at a time, each fading in over about 150 ms, never character by character. Any keypress shows the whole turn at once. The move wipe and the banner wipe are removed with the banner. Reason: readers differ three-fold in speed; typed text punishes the fast ones, and the interactive-fiction community has converged on paragraph reveals or none.

**Asides and notes.** Unchanged: GM progress notes are hidden, longer asides dimmed, `ooc:` turns drawn plainly.

## 5. The band, the prompt, the hint

**Band (`AbovePrompt`).** Two modes.
- Pane docked: `♥ 10` at normal brightness, a faint `│`, then the latest change line's text in dim (`✧ new: Gorse Thicket, Driftwood Whistle`). While the game master is working, the change text is replaced by the current phase phrase from `look.phrases.phases`, dim italic, preceded by `◌`. The health number flashes red for one turn when hurt and the heal color when healed. Reason: this row is where the eye lands after typing; it gets the one number that matters and the one thing that just happened.
- No pane: `◆ Gorse Thicket · ♥ 10 · ◎ 3 · ☼ 28 · ⧗ 14 · dusk · ▸ Find out why the lighthouse is dark.` as today, in this order, dim except the place and the objective.

Rejected: the current band when docked, which repeats six values the pane already shows.

**Prompt.** The engine's prompt glyph is replaced by `❯` in the accent color. Typed text normal.

**Hint line (`PromptHint`).** In play: `⏎ act · ooc: speak to the builder · esc to the margin · ? help`, faint. In `ooc:` turns and with no game loaded, the engine's own hint.

**Mode footer (`SessionMode`).** Hidden during play (it reads "auto mode on (shift+tab to cycle)", which is Claude Code's voice, not the game's). Shown in `ooc:` turns.

## 6. The margin

The margin is six sections in a fixed order. Each begins with a **section rule**: the label in dim bold capitals, one space, then a faint line to the right edge of the pane body. One blank row before every rule except the first. Within a section there are no blank rows. The pane body is the pane's width minus 3 columns of padding on each side.

The order is the order of reading during a turn: where am I, how am I, what is at stake, what can I do, what do I have, where else can I look. Labels are per game, from `look.sections` (defaults below), so the station can call YOU something else.

### 6.1 WHERE (orientation and mood)

- The room picture, 44 columns by 14 rows, directly under the rule (section 8 says what the picture is).
- The place name, bold accent, one row.
- One sentence of conditions, normal color: the time of day capitalized, a full stop, the weather, a full stop. `Dusk. Sea fog over the quay.` Built from `view.time` and `view.weather`; a game without time or weather shows whichever it has, or nothing.
- No numbers in this section.

### 6.2 YOU (exact status)

A small aligned table, every row: a 2-column glyph cell, a 10-column dim label, a 7-column exact number, then a 16-cell bar where the value has a maximum.
- `♥  health   10/10  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇` from `stats.hp` / `max_hp`.
- `☼  lamp oil 28/30  ▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇` from `view.meter`, glyph and name from `look.resource`.
- `◎  coins    3` from `stats.coins`, label from `look.currency`. No bar.
- `   might +2 · agility +2 · wits +2`, dim, names from `look.stat_labels` in lower case.
- During a fight, one row per foe directly under health: `⚔  Grukk    7/9    ▇▇▇▇▇▇▇▇▇▇▇▇░░░░`, glyph, name and bar in the bad color, from `view.foes`.

Bars: filled cells `▇` in bar grey, empty cells `▇` in faint. Colors by state: health at or under 25% turns the number and bar red and keeps them red; meter `low` turns its row amber, `spent` red with the word `spent` after the number. On a change, the number and bar take red (hurt) or the heal color (healed) for one turn, then revert. This is the whole color scale for status: grey, amber, red, plus the one-turn flash. Rejected: a different color per bar (green health, amber oil), which makes color mean "which bar" instead of "how bad".

### 6.3 AT STAKE (urgency and direction)

- Clock, two rows: `⧗ The fleet comes home · 14 moves` (glyph in muted accent, name normal, moves dim) then the segments: one `◉` per move left in muted accent and one `○` per move spent in faint, from `view.clock`. With three moves or fewer the glyph, the count and the lit segments turn red. When the clock has run out: `⧗ The fleet has come home` in red, no segments (wording from the clock's own text, as the pane does today).
- Objectives, one row each: the current objective of every quest still in play. Main quest `▸` and text in accent; side quests `▹` and text dim. Completed and failed quests are not shown here; they are the Journal's.
- Curses, one row each: `✶ Backwards Tongue` in red, from `view.curses`.

### 6.4 ACT (what can be pressed now)

Every row is a button, as today, filling the prompt box for the player to send with Enter (the engine labels a mod-submitted prompt, so one-press moves are still not possible). Layout: a 2-column hotkey cell in bold accent, then the label at full brightness. This is the brightest text in the margin because it is the only text that does something.
- Exits: `1  south → Shepherd's Hollow`, numbered 1–9 in the order the map gives; an unexplored exit shows `?` for its name. Before the first move, the dim note `exits appear after your next move` as today.
- `l  look around`.
- One row per character present: `   talk to Tamsin`, no hotkey, the name in that character's speech color. When nobody is present, one dim italic row: `no one here to talk to`.

### 6.5 CARRYING (reference)

- The rule carries the count at its right end: `CARRYING ──────── 4/12`, from `view.weight` / `carry_limit`.
- One row per distinct item, indented 2 columns: the name at normal brightness, then dim annotations after one space: `equipped`, `×2` for a stack of identical items, `made for you`. Empty: `nothing`, dim.

### 6.6 MORE (doors to the deeper screens)

Pinned to the bottom of the pane with a rule above it. One row: `m  map    j  journal    ?  help`, hotkeys in bold accent, labels normal, four columns between entries. Keys and labels come from `look.tabs`, `tab_keys` and `tab_labels`; `?` opens the help text. Rejected: the current tab strip at the top of the pane, and the Here tab; what is here is read every turn and must not cost a keypress, while the map and the journal are reference material that should (Cogmind, Caves of Qud 1.0).

### 6.7 Empty and special states

- No game loaded: the margin shows the game's title and `Type /newgame to start.`, nothing else.
- Game over (`status` not `playing`): a red row `THE END · type /newgame` replaces AT STAKE's objectives; the rest stays.
- The pane never shows the phase phrase while the game master works; the band does (section 5).

## 7. Color and type

Kit constants (not per game), chosen against the terminal background the mock used, `#171a21`; the builder checks them against a plain black background too:
- text `#d9d4c7`, dim `#7b786f`, faint `#3a3d46`, bar grey `#767269`, muted accent for the clock `#a47f3c`.
- Contrast targets (APCA): text at least Lc 75; dim at least Lc 60; faint is for rules and empty bars only, never for words the player must read.

Per game, in `look.json`:
- `palette.accent` and `accent_by_time` as today; `bad`, `heal`, `good` as today (`warn` is the amber used for `low`).
- New: `speaker_colors`, a list of six hex colors with enough lightness difference to tell apart; defaults in `look.default.json`: sage `#8fae4a`, slate blue `#7fa7c9`, rose `#c98a8a`, ochre `#c9a35a`, teal `#6fb3a8`, lilac `#a08fc9`.
- New: `sections`, the six labels, defaults `WHERE`, `YOU`, `AT STAKE`, `ACT`, `CARRYING`, `MORE`.

Type: bold only for names, section labels and hotkeys. Italic only for the player's line, rumors and memories, and the one dim note in ACT. Capitals only for section labels and the title and ending cards. No block letters anywhere else.

## 8. The room picture

- Each authored room may ship a PNG at `games/<id>/art/<room>.png`, 4:3 or wider, which the mod draws in the WHERE box (44 columns × 14 rows).
- Where the terminal can show pictures (the `Image` element: kitty graphics on Ghostty and kitty, iTerm2 inline images on iTerm2 3.5+ in fullscreen), the PNG is drawn as a picture.
- Elsewhere, the same PNG is drawn as a half-block mosaic in a `Raster` (one cell = two vertical pixels, 44 × 28 pixels), colors sampled from the PNG. How the mosaic is produced is the builder's choice; it must not cost a Claude turn, and it must be computed once per picture, not per redraw.
- A room without a PNG (generated rooms, and authored rooms until someone draws them) uses a default picture per terrain kind (`water`, `grass`, `stone`, `indoors`, plus any the game adds), shipped with the kit. If no default fits, the room's text art is drawn dim in the same box, as a last resort.
- Time-of-day tinting of the mosaic and a weather layer over it are wanted later and are not part of this spec.

## 9. What is removed from the current mod, and why

| Removed | Why |
|---|---|
| Story card borders | Rules 2 and 3; borders set the measure to the terminal width |
| Block-letter room banners and the move wipe | A scene change is a rule, not a poster; the lettering stays for the title and ending |
| `~ ✦ ~` turn marker | Blank rows separate turns; the marker was a fifth horizontal element between two paragraphs |
| `»` accent action marker | The player's words are context, not the thing to look at |
| VITALS frame and the tab frame | Rule 3; the sections and their rules replace them |
| The Here tab | Read every turn, so always visible |
| Band duplicating the pane | Rule 6: one number in the gaze path, not six |
| Toasts for routine changes | Replaced by the change line, which stays in the transcript |
| Per-bar colors | Replaced by one state scale (grey, amber, red) |
| Text art as the default room picture | Replaced by the picture; kept as the last fallback |
| "auto mode on" footer during play | Claude Code's voice, not the game's |

## 10. Changes outside the mod

- **`gm-turn` skill:** a paragraph that is a character's speech starts with the character's name and a colon (`Tamsin: "Black-faced, she is," she calls…`). The mod strips the name and colon and draws the keyline. The present heuristic (matching the names of characters with a `card:` color) stays as a fallback for untagged paragraphs. This is the only change to the game master's procedure.
- **`rules/look.default.json`:** the two new keys in section 7, with `validate` accepting them (it rejects unknown keys).
- **`rpg.py`:** no change. Everything the margin shows is already in `view`. If composing the change line from tool calls proves unreliable, add `view.last_changes` (a list of strings written by `refresh_view` from the diff of the last save) and bump the save version; prefer the mod-side composition first.
- **Tests:** the 37 mod tests are updated for the new drawings, and new tests cover: the 72-column measure at several widths; each section present with its rule in order; the change line for hurt, heal, coins, item, objective and generation; the band in both modes; the hint rewrite; the speech tag stripped; the picture fallback chain.
- **Both shipped games** must look right with no code change between them (the station renames the resource, stats, currency and tab keys; the sections must pick those up).

## 11. Decisions still open

1. **Which terminal is the target for pictures.** Ghostty or kitty: real pictures work now. iTerm2 3.5+: pictures in fullscreen. Terminal.app: mosaics only, so design the PNGs to read well at 44 × 28 pixels. Until decided, the builder treats the mosaic as the primary rendering and the picture as the upgrade.
2. **Whether the band stays when the pane is docked.** It costs one row and repeats one number. Build it as specified; remove it if it feels redundant in play.
3. **Where the PNGs come from.** Hand-made or generated once per authored room and shipped with the game (free at play time, consistent, nothing for generated rooms), as against generated during play (costs credits, which the project rules out). This spec assumes shipped PNGs.

## 12. Done when

- A play turn at 184 × 46 looks like the mock: prose at 72 columns with no border, a rule on arrival, a keyline on speech, the player's line dim, a change line after the narration, six labelled sections in the margin in the stated order, the band showing health and the latest change, the prompt glyph and hint line in the game's words.
- At 120 columns (no pane) the band carries place, health, coins, resource, clock, time and objective.
- Hurting, healing, spending, gaining an item, finishing an objective and generating content each produce exactly one change-line entry and the one-turn color flash in YOU, and no toast.
- The meter going low or spent, and a curse taking hold, each still raise a toast and a sound.
- Both games pass `sh tools/check.sh`; the mod tests above pass; `rpg.py validate` accepts the two new look keys.
- Nothing in `rules/`, `games/` content, `state/` or the agents changed except the two look keys and the one line in `gm-turn`.
