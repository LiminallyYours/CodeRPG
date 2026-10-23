# CodeRPG Implementation Plan

As of 2026-10-21 · JW. Companion to the Claude doc "CodeRPG Extension Ideas". Written for Claude Code: game-owner requirements, not technical decisions.

The approved ideas from CodeRPG Extension Ideas, in eight build stages, in the order Claude Code should build them. Each item says what must be true for the game owner, why, what it depends on, and what it costs in tokens; technical choices are left to Claude Code. Items marked No or Not yet are at the end, with the reasons.

## At a glance

Build order: Stage 1 (the game kit) and Stage 2 (cost visible and switchable) come first, and everything else is built on them. Stages 3–7 (look and feel, curses, the player's mark, puzzles, a living world) can go in any order after that; the numbering is the suggested order. Stage 8 (new worlds on demand) comes last.

Stages 1 and 2 are the foundation: every later feature is built generic on the kit and reports its cost into the resource. New worlds come last because a generated world must include what Stages 3–7 define.

## Implementation order

### Rules for every stage

1. **Game-agnostic.** Every feature works for any game built on the kit. Names, places and items belong only in a game's own content. The Lighthouse examples in the ideas doc are examples, not requirements. Each stage adds its feature's content to both shipped games (Stage 1), so the second game stays a real test that nothing is Lighthouse-specific.
2. **Subscription only.** Nothing may require the API or the Agent SDK. Everything runs inside a Claude Code session on the Max plan.
3. **The rules stay in charge.** Anything the player or an agent creates passes the same checks generated content passes today. Stats and prices come from the game's tables, never from the player or an agent.
4. **Cost is visible and switchable.** Every feature that spends tokens drains the in-game resource (Stage 2) and has a switch (see On/off switches).
5. **The Dark Lighthouse stays playable** after every stage.

### Stage 1 — The game kit

**1.1 Split the kit from the game** (M1)

- **Must:** The interface and the rules know nothing about any particular game. Each game is a self-contained folder holding its world, its rule numbers and its look: colors, spinner phrases, which stats and pane tabs show, which sounds play. The player can list installed games and switch with one command. Each game keeps its own save, so switching loses nothing. The Dark Lighthouse becomes the first game folder. A second, small, deliberately different game (for example a flooded research station) ships beside it, written once by Claude Code during this stage.
- **Why:** Every later feature must be built generic. Building features before the split means building them twice. Two games on one kit is also the clearest proof of the demo's claim.
- **Depends on:** nothing.
- **Cost:** none during play. Writing the second game is a one-time spend about the size of generating a new world (Stage 8).
- **Done when:** both games play start to finish, and the interface looks different in each with no code change between them.

**1.2 Seeds and daily worlds** (M9)

- **Must:** A new game can start from a named seed or from today's daily seed. The same seed gives anyone the same rolled stats, variants, clock and dice rolls, in any game. The title card shows the game, the date and the seed. What agents say may still differ; only the dice are fixed.
- **Why:** It shows the dynamic parts are controlled. It's cheap to add while new-game is being reworked for 1.1.
- **Depends on:** 1.1.
- **Cost:** none.

### Stage 2 — Cost made visible and switchable

**2.1 Cost as a game resource** (M8, and JW's note in A1 of the ideas doc)

- **Must:** Every action that spends Claude tokens or grows the conversation shows as an in-world resource the player can see: lamp oil, daylight, stamina, power. Each game names and styles its own. The resource drains by a fixed price per kind of action, set by the game: an ordinary game-master turn (a small amount, since every turn costs something), an NPC reply, generating something, a world turn, crafting or building, a puzzle solved with code. A fixed price per kind is enough; exact token counts are not required. Actions that cost nothing don't drain it, and that free category is a first-class part of the design from the start: M2 (the interface answering simple commands itself) is deferred but coming, and when it arrives its actions land in the free category with no rework of the resource. It shows in the status band and warns when low. When it runs out, the game doesn't stop: expensive features drop to their cheap fallback in the fiction (agents fall quiet and the game master voices everyone; nothing new is generated) until the next session. The resource refills each time Claude Code is opened in the game folder; it is not tied to a run or a real day.
- **Why:** JW wants token and context cost visible as game resources. It also has to exist before the expensive features, so each one is built to report into it.
- **Depends on:** 1.1.
- **Cost:** none.

**2.2 Cost switches**

- **Must:** The game owner can turn each expensive feature on or off, and set its limits, in one settings place per game, without editing code. An in-game command shows the current settings. The list is in On/off switches below.
- **Depends on:** 1.1.

### Stage 3 — Look and feel

All of these are built into the kit, styled per game from 1.1's look settings, and use no Claude turns. They are built for the terminal, where the mod can draw colored cells and animate them; the Claude desktop app is not a target.

- **3.1 Typography with intent.** Each game has its own palette. Each speaking character can have its own card style. Place names show as large block-letter banners. An accent color shifts with the game's time of day.
- **3.2 Transitions.** A short wipe on moving, the title card typing itself out, the ending card drawn line by line. The move wipe is short enough never to slow play (under a quarter of a second).
- **3.3 Combat strip.** During a fight, both sides' health bars sit on one line, drain on hits, flash, and show a damage number that rises and fades. Dice tumble briefly before the result shows. Works for any foe in any game.
- **3.4 Animated map.** The map is drawn as colored tiles. Each room's color and terrain (water, grass, stone, indoors) come from the game's content. The player's marker blinks, rooms heard of but not visited show dim, water tiles move gently. Generated rooms appear on it too.
- **3.5 Sound matches the picture.** Every visual beat above has its sound, from the game's sound set. The existing sound on/off covers them.
- **3.6 Waiting shown as phases** (M7). While Claude works, the pane shows which stage the turn is in, in the game's voice ("reading the room", "<name> considers your words", "something new takes shape", "elsewhere, the world stirs"), with a sound per stage. Each game supplies its own phrases. Why: waiting becomes part of the game.

**Depends on:** 1.1. **Cost:** none.

### Stage 4 — Curses

**4.1 Curses** (item 4)

- **Must:** A game's content can define curses: what causes one, what it does to the player's typed words, and what cures it. The kit supports at least three effects: words reversed, a limit of N words, a fixed phrase added to the end. The change is applied to what the player types before the game master and NPCs see it, so they react in character. The game master is still told what the player actually meant, so a curse changes the story and not the rules: a cursed "go north" still moves the player north, narrated through the curse. Slash commands and `ooc:` messages are never cursed. The status band shows an active curse. Every curse has a cure in the same game, and no curse survives a new game.
- **Why:** A consequence the player feels in their hands, at no token cost.
- **Depends on:** 1.1.
- **Cost:** none.

### Stage 5 — The player leaves a mark

**5.1 The crafter's bench** (item 1)

- **Must:** Any game can mark characters as makers and say what kinds of things each will make. The player describes an item in plain words. The maker talks it through in character and names a price in coins or materials; once paid, the item exists. What the item can do comes from the game's item tiers, never from the player or an agent. Requests outside the maker's trade or the tiers are refused in character. Made items are marked as the player's own.
- **Depends on:** 1.1, 2.1.
- **Cost:** medium, each time it's used.

**5.2 Building** (item 11)

- **Must:** Any game can mark places where something can be built and characters who will build for coin. The player describes what they want and names it, then pays. A few moves later the new place exists where the game allows, appears on the map under the player's name, and characters start using it. It passes the same checks as generated rooms.
- **Depends on:** 5.1 (both are player-made content, checked the same way).
- **Cost:** medium, each time it's used.

**5.3 The world's memory** (item 2, plus JW's question under M6)

- **Must:** Everything generated or player-made in a run goes into the game's library, which lasts across new games. Each entry is marked player-made or world-made.
- **On a new game:** places the player built, and generated people the player befriended, carry over. Befriended people keep one remembered line about the player. Authored characters, quest flags, inventory and quest progress reset, so the main quest is whole again every run. The quest resets; the village doesn't.
- **Reuse:** when the world needs something new, it first checks the library and reuses a fitting entry (the same dockhand turns up again). It invents only when nothing fits.
- **Owner controls:** list the library, keep an entry (it becomes permanent authored content), or forget it (never reused). The library has a size limit per game, and the world is only shown a short list of fitting entries, not the whole library.
- **Why (answer to JW's question):** Yes, this is worth doing. Reuse makes the world consistent across runs, gives it a history, and saves tokens, since reusing an entry is cheaper than inventing one. The risks are a library that drifts from the game's tone, and briefs that grow with it; the keep/forget controls and the size limit handle both.
- **Depends on:** 5.1, 5.2.
- **Cost:** low; reuse lowers generation spend.

**5.4 Generated characters become real agents** (M6)

- **Must:** A generated character the player keeps coming back to (the number of conversations is set per game, for example 3) is promoted from game-master-voiced to its own NPC agent, with its own memory of the player. The owner can then keep the character permanently through the library (5.3).
- **Depends on:** 5.3.
- **Cost:** high; each promoted character adds agent replies for the rest of the run. Limited per run and switchable.

### Stage 6 — Easy puzzles solved with code

Both puzzles have Claude write and run a small piece of code during play. That code must run without a permission prompt, since a prompt breaks the fiction; it goes through the same trusted route the rules script uses today.

**6.1 Locks with rules** (item 14)

- **Must:** Any game can define a lock whose answer follows a simple stated rule from things in the world (for example, a code from a sign plus a number the player can see). Easy for now: one step of reasoning, every clue within one or two rooms, and a character who hints if asked twice. When the player asks for help, Claude works the answer out by writing and running a small piece of code, and the result shows as a key line in the dice tray. A wrong answer costs only a try.
- **Depends on:** 1.1, 2.1.
- **Cost:** medium per puzzle; the code and its output appear in the conversation.

**6.2 The broken thing** (item 17)

- **Must:** Any game can include a broken mechanism the player fixes with a character's help. Easy for now: one obvious fault, described plainly in the room's text. Claude fixes it by correcting a small piece of code and running it. When it runs correctly, the game records it as fixed and something in the world changes: a door opens, an item starts working, a character offers new help.
- **Note:** the original idea made the fixed mechanism a real-time clock. That waits for item 7, which is Not yet.
- **Depends on:** 1.1, 2.1.
- **Cost:** medium, once per mechanism.

### Stage 7 — A world with its own life

**7.1 People with plans** (item 8)

- **Must:** Each game says where each major character may go and what they may do off-screen. On each world turn, a major character may do one of those things, and the change sticks: someone moves, or a door is locked because its keeper is asleep. The rules check each change against what the character is allowed. The player learns of nearby changes through small in-world signals (a sound, a toast, a rumour), never through narration of the off-screen turn.
- **Depends on:** 1.1, 2.1.
- **Cost:** medium and steady, every world turn. Switchable, with an adjustable frequency.

**7.2 Silly two-character side scenes** (item 18)

- **Must:** A game can define optional side scenes that need two agent characters together, played for fun: an argument, a contest, a duet. They never affect the main quest; at most a small reward or a line in the chronicle. Today's limit on lines per exchange applies.
- **Depends on:** 1.1, 2.1.
- **Cost:** medium to high per scene (several NPC replies). Switchable.

### Stage 8 — New worlds on demand

**8.1 Tell me a place** (item 13)

- **Must:** The player describes a setting in a sentence and gets a new small game on the kit: about six places, three characters, one quest, its own look settings, and the content every kit feature needs (a maker, a buildable place, a curse, an easy lock), so all features work in it. It is checked with the kit's validator and fixed until it passes before it's offered. The work happens outside the main conversation; the player sees one line when it's ready. The new world joins the game list from 1.1. The game shows the cost before starting and asks the player to confirm.
- **Why last:** a generated world has to include the content conventions every earlier stage defines.
- **Depends on:** 1.1 and the content conventions from Stages 3–7.
- **Cost:** very high, once per world. Switchable.

## On/off switches

Six features drive most of the token and context cost; each one needs a switch, a limit, and a cheap fallback. Three already exist in the game in some form and only need moving into the one settings place from 2.2.

| Feature | Why it's expensive | Switch and limit | When off, or the resource runs out |
| --- | --- | --- | --- |
| NPC agents (exists today) | Every reply is a separate model call, and the reply lands in the conversation | Per character, plus one "game master voices everyone" switch | The game master voices each character from their file |
| World turns and people with plans (exists; 7.1 adds to it) | Steady spend every few moves, all session | On/off, and how many moves between world turns | Rumours only; nobody moves off-screen |
| Generated content (exists; 5.1, 5.2 add to it) | One agent call per new thing | On/off per kind (exists today), plus a cap per run (16 today) | Makers and builders are "too busy"; unexplored ways stay closed |
| Promoted agents (5.4) | Each promoted character adds replies for the rest of the run | On/off, and a cap per run | The character stays game-master-voiced |
| Two-character side scenes (7.2) | Several NPC replies per scene | On/off, and lines per exchange (4 today) | Side scenes aren't offered |
| New worlds (8.1) | Very large, once per world | On/off; always confirms before starting | The command says new worlds are off |

Two more suggestions:

- **Presets.** Three named presets (Thrifty, Normal, Rich) set every switch and limit at once. The game owner picks one, then adjusts single settings if wanted.
- **The resource is the automatic switch.** When the Stage 2 resource runs out, every feature above drops to its "when off" column until the next session. The player never needs to think about settings to keep a session cheap.

## Owner's reminders (to plan later with Claude)

Added 2026-10-23 · JW. Not part of Stages 1–8 and not yet designed: each needs its decisions proposed (with options and implications) before anything is built. Pick them up after Stage 6.

**R1 Admin mode.** Run the game as its owner, from inside it: do in play what is otherwise done before launching, such as switching preset (how expensive the game is), changing single switches, refilling the meter, or turning the meter off.
- **Notes:** this replaces the parked "owner-run mode" idea in `HANDOFF.md`. Today only `tools/settings.py` changes settings, and it's kept out of the GM's allowlist on purpose, so a player (or the GM) can't make the game cheaper or richer mid-play. Admin mode needs an owner-only way in that keeps that protection.
- **To decide:** how admin mode is entered (a `newgame` flag, a slash command, a launch option); which settings it offers; whether changes last for this run only or are saved; how it fits with "visible machinery is always a bug" and with *M4 · Show the machinery* under Not doing (admin mode is an owner's view, not the player's).

**R2 Turning off the lamp-oil countdown.** "Lamp oil" is the Dark Lighthouse's name for the meter (the Flooded Station calls it Power). Turning it off means extras are no longer limited by the meter in that session or game.
- **Notes:** today the meter has a capacity but no off switch. Off would also stop the meter being the automatic cheap fallback (see On/off switches), so a session could spend without limit.
- **To decide:** whether off means "unlimited" or "not shown"; whether it lives in admin mode (R1) or is a preset setting; per game or for all. (If "countdown" meant the story clock instead, The fleet comes home, that is a different switch: it changes the story, since one ending depends on the clock running out.)

**R3 A real-spend meter.** Show what the session has actually spent in tokens (or its dollar equivalent), updated regularly, for example once per world turn, alongside the meter's estimated points.
- **Notes:** the meter's prices are estimates (Stage 8's forge was priced at 15 points and measured at about 70). A real figure would show when prices are off and could be used to recalibrate them. On the Max plan a dollar figure is an API-equivalent estimate, not a bill.
- **To decide:** whether the mod can read the session's real usage (and whether that includes background agents such as the worldsmith); tokens, dollars or both; where it shows (`/budget`, the pane, a status line); how often it updates (reading it costs nothing, so every turn is possible); whether players see it or only the owner in admin mode (R1).

## Not now, and not doing

### Not yet

Kept for later. None of these are needed by anything in the plan above, except where noted.

| Item | What it is | Note |
| --- | --- | --- |
| M2 · Claude only when needed | The interface answers simple commands (go north, take, look) itself, with no Claude turn | Deferred until the architecture is settled. It changes where decisions are made (the interface instead of the game master), so it should follow Stages 1 and 2, which fix the kit and the cost model. Revisit after Stage 2; it would slot in before Stage 3 and cut the cost of everything after it. |
| 7 · Clocks that run while you think | Game time passes in real minutes in some places, and a watch can ring when something happens | The broken thing (6.2) was meant to become one of these clocks; that part waits for this item |
| 10 · The look follows the weather | Colors and ambient sounds change with time, weather and events | 3.1 already shifts one accent color with time of day |
| 16 · The real sky | Game weather follows real weather on a real coast | Drives item 10, so waits with it |
| 15 · Voices | NPC lines spoken aloud, one voice per character | |
| Real pictures for rooms and faces | Illustrations and portraits instead of text art, where the terminal can show them | |
| Weather and light as a layer | Rain, fog and lamplight drawn over the map | Builds on the map from 3.4 |
| 9 · New places have faces | Generated rooms get text art like authored rooms | |
| 5 · Brewing | Combining ingredients into new items with mixed effects | Would use the player-made checks from 5.1 |
| 3 · Spells and forged tools | Rewards that add a real new command or pane tab to the interface | |
| 12 · The saga | An illustrated web page of the run, made at the end | |
| 6 · Companions | A befriended character travels with the player and scouts ahead | The most expensive idea per turn |
| M5 · A world that runs when nobody is typing | World turns on a real-time timer while the session is idle | |

### Not doing

- **The second screen** (in Look and feel) and **M3 · The terminal is one client, not the game.** No separate web page or second display.
- **M4 · Show the machinery, on demand.** No behind-the-curtain view of the game's internals.
- **M10 · A real game engine.** Removed from the ideas doc.
