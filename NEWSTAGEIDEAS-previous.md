# New stage ideas

Raw material for a new implementation plan; not the plan itself. Collected 2026-10-23 from JW's ideas and the project's own documents (`IMPLEMENTATION-PLAN.md`, `HANDOFF.md`, `DEVELOPING.md`, `UI-REDESIGN-SPEC.md`). Items marked **decided** are settled; everything else is open. Before a plan is written from this file, it is to be reviewed for sequencing, feasibility, contradictions and risk.

## BEFORE ANYTHING NEW

- **Finish the new-worlds playtest.** `HANDOFF.md` says the project is waiting on JW's feedback from playing worlds made with `/newworld` before starting anything else. The second test world finished with no notes.

## EFFICIENCY - SPEED

Updated recommendations, biggest effect first.

1. **Make moving and looking take one step instead of three.** Right now a move is three separate commands: look, then move, then show the new room, and the game master waits after each one. If move and look printed the room’s description themselves, a move would take one step. This affects nearly every turn.

2. **Vary how much the game master writes.** The first visit to a room gets the full 2–4 paragraphs; a return visit gets one or two sentences. Less writing means a faster turn. This is a change to the game master’s turn procedure (the gm-turn skill), not code.

3. **No travel command (decided 2026-10-23).** Walking through several visited rooms in one turn ("go back to the harbor") was considered and dropped. Every step is still a real move, and a move can set things off: a random event, the story clock's warning, an off-screen world update, a way barred since the last visit, people in the rooms passed through. Each needed its own rule for whether the trip stops or carries on, and the people rule in particular had no good answer without new content for every character. Not worth it for now.

4. **Give each character their own “waiting” line.** Instead of a generic phrase, a line from the character’s file, shown dimly in the story while their agent thinks: “Ysolde keeps polishing the brass, not looking at you.” This is the Mass Effect elevator idea applied to your NPCs.

5. **Leave the game master's effort level alone (decided).** Setting play to medium in this folder's settings was considered and rejected. Sonnet already runs at medium unless someone changes it, so the setting would mostly change nothing. It could also lower the world-builder's thinking, which is meant to stay as it is.

6. **Keep the world agent on Sonnet (decided).** Moving it to Haiku for small things was considered and rejected. The code would catch broken proposals, but the descriptions the world agent writes are what the player reads on entering a new place, and they're saved for later games, so plainer writing would stick around.

7. **Show the story as it's written, without letting the game master's notes through.** Today the interface holds back all text until the turn ends, because only then can it tell the story (always the last text of a turn) from notes the game master wrote along the way. To show the story sooner, the game master marks where the story starts: its last command before narrating is a do-nothing rules command (`rpg.py narrate`), chained onto its final recording command so it adds no extra step; a turn with nothing to record runs it alone. After the mark, the interface shows each paragraph once it is complete and has passed the existing note filter. Nothing before the mark is shown until the turn ends, as today. If the mark is missing, the interface falls back to today's behaviour. Risk: if the game master runs another command after the mark, paragraphs already shown can't be taken back; the end-of-turn check still runs, and the case belongs in the interface's tests. Rejected: showing text as it arrives with no mark, because notes would appear before the filter can judge them; a text marker inside the story, because it would show as a stray symbol when the game is played without the interface, which must keep working. Saving: a few seconds per turn, the time spent writing the story; the commands before it take as long as they do now.

8. **Possibly later: run world turns while the player is reading.** A world turn happens off-screen, but right now the story waits for it. Running it in the background would remove that wait. The catch is that it breaks your rule that the interface only displays and never changes the game, so it’s a design decision for you.

## INTERFACE - REDESIGN

A new look for the game screen. The full spec is `UI-REDESIGN-SPEC.md`; the mock-up it was written from is `UI-REDESIGN-MOCK.png` (both in this folder). It changes how the game looks, not how it plays: the rules, the save and the agents stay as they are.

In short: the story becomes plain text at book width with no boxes; arriving somewhere gets a thin line with the place name instead of big block letters; each character's speech gets a colored bar and their name; one dim line after each turn lists what changed (health, coins, items, objectives), replacing most pop-up notices; and the side pane becomes six labelled sections in reading order (WHERE, YOU, AT STAKE, ACT, CARRYING, MORE), with a picture of each room.

**Still to decide (from the spec):**
1. Which terminal app to aim at for room pictures. Ghostty or kitty show real pictures; iTerm2 shows them in fullscreen; Terminal.app only shows a blocky version.
2. Whether the line above the prompt stays when the side pane is open. It repeats the health number.
3. Where the room pictures come from. The spec assumes they're made once per room and shipped with each game, so play costs nothing extra.

**Where it meets the speed ideas above:**
- **Item 7 (show the story as it's written)** fits the spec's reveal (paragraphs fading in one at a time): with the mark, each paragraph fades in as it is finished instead of after the whole turn. The spec's "any keypress shows the whole turn" then applies only to paragraphs already written.
- **Item 4 (each character's waiting line)**: the spec puts "the game master is working" text in the line above the prompt, not in the story. A character's waiting line would need a place in that design.
- **Item 2 (shorter return visits)** and the spec's one change to the game master's procedure (start a character's speech with their name and a colon) both edit the gm-turn skill, so they're best done together.

## PUZZLES

**To be rethought from top to bottom.** The old plan's Stage 6 (locks whose answer follows a rule from clues, and a broken mechanism fixed with a character's help) is not to be built as designed. It stays in this document only as a reminder, to be developed later from scratch; its earlier decisions (in `HANDOFF.md` and `IMPLEMENTATION-PLAN.md`) don't carry over.

## OWNER TOOLS

Things only the game's owner does, outside of play.

- **Helper models, one setting for all games (decided 2026-10-23).** A command in the owner's settings tool (`tools/settings.py`) sets the model and thinking level of the three helper agents: the character voices (`npc`), the world agent (`world`) and the world-builder (`worldsmith`). It does this by rewriting those lines in `.claude/agents/*.md`, so Claude Code itself enforces the choice. Why: change models without editing agent files by hand. Rejected: a setting per game or per character, passed by the game master on every call, because it depends on the game master copying it each time. Current values stay as they are: character voices and world agent on Sonnet at low effort, world-builder on Opus with no effort set. A change may need Claude Code reopened to take effect.
- **R1 Admin mode.** Run the game as its owner from inside it: switch preset (how expensive the game is), change single switches, refill the meter, turn the meter off. New worlds (`/newworld`) would then be offered only in admin mode. It must keep today's protection that neither the player nor the game master can change settings mid-play (`tools/settings.py` is kept out of the game master's allowed commands on purpose). To decide: how admin mode is entered (a flag on `/newgame`, a slash command, a launch option); which settings it offers; whether changes last for one run or are saved; how it fits "visible machinery is always a bug".
- **R2 Turning the meter off.** The meter is the in-game resource that limits extras (lamp oil in the Lighthouse, power on the station). It has a size but no off switch. Off would also stop it acting as the automatic cheap fallback, so a session could spend without limit. To decide: whether off means unlimited or just not shown; whether it lives in admin mode or in the presets; per game or for all games. (If "countdown" meant the story clock, "The fleet comes home", that is a different switch, and it changes the story, since one ending depends on the clock running out.)
- **R3 A real-spend meter.** Show what a session has actually used, in tokens or a dollar equivalent, next to the meter's estimated points. The meter's prices are estimates (a new world was priced at 15 points and measured at about 70), and a real figure would show when they're off. To decide: whether the interface can read the session's real usage, including background agents such as the world-builder; tokens, dollars or both; where it shows (`/budget`, the pane, a status line); whether players see it or only the owner in admin mode.

**Where these meet other ideas:**
- Admin mode (R1) is a natural home for the helper-model setting, but a model change may only take effect after Claude Code is reopened.
- A real-spend meter (R3) would also give the numbers needed to judge the speed ideas.

## LATER IDEAS

From the old plan's "Not yet" list, with what has changed since.

**Look and sound**
- **The look follows the weather** (old item 10). Colors and ambient sounds change with time, weather and events. Today one accent color shifts with time of day. The redesign spec (section 8) also wants room pictures tinted by time of day and a weather layer over them, later.
- **The real sky** (old item 16). Game weather follows real weather on a real coast. It waits on the look following the weather.
- **Weather and light over the map.** Rain, fog and lamplight drawn over the map. Builds on the tile map. The map screen is outside the redesign spec, which leaves it to a separate spec.
- **Real pictures for rooms and faces.** Rooms are now covered by the redesign spec (section 8); faces are not.
- **New places have faces** (old item 9). Pictures for rooms made up during play. The redesign spec gives these a default picture per terrain (water, grass, stone, indoors); a picture of the room itself is still not covered, and making one during play would cost usage.
- **Voices** (old item 15). Characters' lines spoken aloud, one voice per character.

**Time**
- **Clocks that run while you think** (old item 7). Game time passes in real minutes in some places, and a watch can ring when something happens. The broken-thing puzzle was originally meant to be one of these clocks.
- **A world that runs when nobody is typing** (M5). World turns on a real-time timer while the session is idle. Related to speed item 8: both have the game change without a player's turn.

**Play**
- **Brewing** (old item 5). Combining ingredients into new items with mixed effects. Would use crafting's checks.
- **Spells and forged tools** (old item 3). Rewards that add a real new command or a new section to the side pane. The redesign fixes the pane at six sections, so such a reward needs a place in that design.
- **Companions** (old item 6). A befriended character travels with the player and scouts ahead. The most expensive idea per turn, since the companion reacts every turn.
- **The saga** (old item 12). An illustrated web page of the run, made at the end.

**Dropped**
- **The interface answering simple commands itself** (M2). Rejected 2026-10-23 after checking the "rooms already visited" version against the code and content. Room text is written for the game master and can contain rules notes (Harbor Square: "It takes no roll to free it"). It also goes out of date: after the player takes the cutlass, the room still says it is tangled in the nets, and a place the player had built is still described as a bare footing. Typed commands can't be taken over without Claude Code briefly showing "Prompt dropped by a hook". Fixing the content would mean rewriting the rooms of every world.
- **Not doing** (from the old plan): a second screen or web client (M3); a view of the game's internals for the player (M4); a separate game engine (M10).

## KNOWN PROBLEMS AND LIMITS

From `HANDOFF.md` and `DEVELOPING.md`.

- **Pane moves need Enter.** Claude Code labels any prompt the interface submits, so the pane's buttons fill the prompt box instead of sending it. The redesign keeps this limit (spec section 6.4).
- **The game master's progress notes can leak into the story.** During long turns Claude Code nudges the game master to say what it's doing. A filter catches the known kinds of note; new kinds need watching. Speed item 7 keeps the filter in place: it shows only text after the game master's mark, a finished paragraph at a time.
- **The story appears all at once** at the end of a turn, because text is held back so notes can't leak. Speed item 7, together with the redesign's paragraph reveal, addresses this.
- **Story styling lasts only for the session.** A resumed session shows earlier story plain.
- **The meter's prices are estimates** and should be corrected once real usage is measured (see R3).
- **The station makes up no new people during play** (`extras: no`, `characters: no`), so befriending, carrying friends into later games and promotion never happen there. That's a content choice for the owner.
- **On the cheapest preset**, Sonnet still asks once for a quiet character's details before voicing them. The request is refused at no cost and hidden from the player.
- **Room pictures and a pixel-art map** are designed for but not built. The redesign spec covers room pictures; the map is left to a separate spec.
