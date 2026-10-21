# CodeRPG: I turned Claude Code into a text adventure

I wanted to see how far Claude Code could be bent away from "coding assistant" toward "game". It turns out you can bend it quite a long way.

CodeRPG is a text RPG that runs inside Claude Code. Claude is the game master, and you play by typing at the normal prompt: *"ask the innkeeper about the troll"*, *"take the steps down to the boats"*, *"attack!"*. With the mod loaded, it stops looking like a terminal coding tool:
- the narration arrives in story cards;
- dice rolls land in a little tray;
- a character pane with your HP, a map and a journal sits beside the story;
- the spinner says *"Steel meets steel…"* instead of *"Crunching…"*.

There are three pieces I think are neat:

1. **A Claude Code mod** that reskins the interface with function hooks.
2. **NPCs played by their own subagents**, each knowing only what its character would know.
3. **A world that grows while you play**, created by a dedicated "world" agent but checked by plain code before anything becomes real.

---

## The core idea: Claude tells the story, code keeps the books

The thing that makes an LLM game master trustworthy is not letting it be the source of truth. So the project is split three ways:

| | What it is | Format | Changes during play? |
|---|---|---|---|
| **Content** | The world: one file per room, character, item, quest and encounter table | Markdown with a small front-matter block | Never |
| **Rules** | How things work: dice, checks, combat, carrying, healing, plus a plain-language spec | `rules/*.py` (standard-library Python), `RULES.md`, `balance.json` | Never |
| **State** | What has happened | one JSON save file, versioned and upgraded automatically | Only through the rules script |

Claude never rolls dice in its head. Every uncertain outcome goes through `python3 rules/rpg.py check might 14`, or `attack grukk`, and Claude narrates whatever the script reports. Story branching lives in the content as flags: a room or character file says things like `## If grukk_friend` or `down: trolls_hollow (if grukk_friend or grukk_defeated)`. Claude's own instructions (`CLAUDE.md` and a `gm-turn` skill) describe only procedure and contain no world facts. Swap the `content/` folder and you have a different adventure.

Every turn is the same loop:

```
 player types ─▶ read state ─▶ read the content involved ─▶ rules script for anything uncertain
                                                                     │
          narration (a story card) ◀── state writes through rpg.py ◀─┘
```

---

## The mod: making Claude Code look like a game

Claude Code supports **mods**: plugins written as TypeScript *function hooks* that can intercept tool calls, rewrite what the interface draws, add panes and slash commands, play sounds, and more. CodeRPG's mod lives in `mod/` and loads with `claude --plugin-dir ./mod`. It only ever *reads* the save file and the rules script's output, never game files, so the game still works without it.

What it changes:

- **Story cards.** The game master's narration is redrawn inside an amber-bordered card, via a `ui.render` hook on `AssistantMessage`.
  - Arriving somewhere puts `── THE GULL ──` on top.
  - A new game opens with a title card; winning, losing or failing the quest adds an ending card.
  - Developer replies (any message that starts with `ooc:`) stay normal.
- **The plumbing disappears.** A game turn involves a lot of tool calls: the rules script, content reads, the turn skill, NPC and world agents. The mod hides all of them. The fiddly part was that a tool row draws *before* its input has streamed in, so the hook also hides rows whose input is still `{}` and judges them again once it arrives.
- **…except dice, which show as a tray.** The output of `check`, `attack`, `move` and similar commands is parsed into readable lines:
  ```
  🎲 Might check: d20 16 +1 = 17 vs DC 14  SUCCESS
  ⚔ Grukk attacks: d20 20 +1 = 21 vs 11 (natural 20)  HIT
  ⚑ A gull drops out of the wind and flaps off with a coin.
  ✧ The world grows: Tide Landing, Bailing Scoop, Gutting Knife
  ```
- **Claude's chrome, in-world.**
  - The spinner's words are replaced with phrases that match what's happening: *"Footsteps on the stones"*, *"Grukk considers your words"*, *"The world takes shape"*.
  - "Baked for 14s" becomes `~ ✦ ~`, and your own input is redrawn as `» take the steps down`.
- **A status band** above the prompt: `◆ The Gull │ ♥ 12/12 │ 3 coins │ ⧗ 14 │ nightfall │ ▸ Find whoever took the lens.`
- **A character pane** with three tabs:
  - **Here:** room art, clickable exits (keys 1–9), `look around`, and `talk to …` buttons.
  - **Map:** a boxed map with fog of war.
  - **Journal:** quests and objectives, the story so far, rumors, and the people you've met with what each remembers about you.

  Above the tabs sit the HP bar (it flashes when you're hurt or healed), the enemy's HP bar during a fight, and the clock.
- **Feedback:** one toast per change (`-3 HP · +5 coins · gained Brass Lens · ✓ objective`), and sound effects for dice, hits, coins, healing and footsteps, plus a fanfare and a defeat sound. The sounds are synthesized by a small Python script, and `/sound` mutes them.
- **Instant commands:** `/inventory`, `/map`, `/sheet` and `/sound` are answered by the mod straight from the save, with no Claude turn and no cost.

Under the hood:
- `tool.call` and `session.append` hooks work out which turns are play turns and which text blocks are narration.
- `$.state` atoms hold what the drawings read.
- A one-second poll of the save keeps the pane live.

The mod has 34 tests run with `claude plugin test`.

---

## NPCs as their own agents

Important characters don't get voiced by the game master. Each gets a **fresh subagent** for every exchange, defined in `.claude/agents/npc.md`:

- **It has no tools at all** (`tools: []`) and doesn't load `CLAUDE.md`, so it can't read files or peek at other characters.
- **Its whole world is a brief** that the rules script builds from the character's file:
  - personality, voice, knowledge, wants and trades;
  - only the `## If <flag>` sections that hold right now;
  - who else is in the scene;
  - a short "what I remember about the player" record from the save.

  Mechanics in a `## GM only` section are stripped out, so the troll never learns the DC to intimidate him.
- **It proposes and never acts.** It replies with `SAY / INTENT / REMEMBER`. The game master checks each intent ("accept the honey cake, let the player pass") against the character file's rules and applies it through the rules script, or doesn't. If an NPC claims something the save disagrees with, the save wins.
- **NPCs talk to each other.** When two agent NPCs share a room, they can trade a few lines with each other, capped per turn.
- **Cost is opt-in.** A `minor: yes` flag in a character file keeps cheap characters with the game master.

Two Claude Code details mattered here:
- Subagents start in the background by default, so the project sets `CLAUDE_CODE_FORK_SUBAGENT=0` to make the game master wait for the reply.
- Continuing an agent with SendMessage doesn't wait for the reply either, so every NPC line is a fresh spawn with the recent scene passed in.

---

## A world that grows while you play

The original rule was "Claude must never invent anything that isn't in the content". That keeps things honest, but it makes the world brittle. Ask the dockhand about the lighthouse and the answer was always "there's no one to talk to". So I relaxed it in a controlled way: **nothing is invented freely, but a dedicated agent may *propose* new things, and code decides whether they become real.**

**Dice-driven variety** (no AI):
- **Rolled stats** at the start of each game.
- **Content variants:** each new game rolls which flag holds. The troll craves *either* honey cake *or* smoked fish, the innkeeper sells both, and you can only afford one.
- **Encounter tables** for the road and the quay.
- **A ticking clock:** the fishing fleet comes home after a rolled number of moves, and if the lighthouse is still dark, boats are lost and the quest fails. Time of day follows the clock, and the weather shifts as you go.

**The world agent** (`.claude/agents/world.md`) fills gaps:
- **Extras:** the unnamed dockhand becomes Tamsin Reeve, who mends crab pots and knows only what the whole village knows.
- **New rooms:** off directions the content marks as able to grow, such as the quay steps, the tavern's upstairs or a sheep track.
- **Small items, minor characters and side quests.**
- **World turns:** every few moves, off-screen time passes. Rumors start, and generated people wander to other rooms.

Every proposal is JSON that goes through `rules/generate.py` first:
- new ids and names only;
- stats come from tier tables (a "weapon" is 1d6 whatever the agent wishes);
- prices and rewards are capped;
- side quests may only use their own flags, so they can never touch the main quest;
- there's a budget per run.

Accepted content is stored in the save's `run` section. From then on it's as real as authored content: on the map, in the journal, remembered.

One more Claude Code detail: its shell safety check rejects commands that mix braces and quotes, so JSON can't be passed through a heredoc. The game master writes each proposal to a `proposals/` folder it has permission to edit, and the script reads and deletes it.

---

## The world (briefly)

The starter adventure is **The Dark Lighthouse**: a small fishing village whose lighthouse lens has been stolen, three nights before the fleet is due home through the rocks. It has six rooms, three characters (a proud lighthouse keeper, a gossiping innkeeper, a lonely troll who loves shiny things) and one quest, with three ways past the troll: bribe him, frighten him or fight him. Each branch changes the epilogue and where the troll ends up. It's deliberately small, because the point is the machinery.

---

## Try it

```
cd CodeRPG
claude --plugin-dir ./mod
/newgame
```

- **To play:** type what you do in plain English.
- **To talk to Claude as a developer:** start the message with `ooc:`.
- **The pane:** it docks by itself on terminals 144 or more columns wide; otherwise type `/sheet`.

**Requirements:** Claude Code and Python 3; nothing else to install. Sound effects use macOS `afplay`.

**Where to look**

```
CLAUDE.md                         the game master's standing orders (procedure only)
.claude/skills/gm-turn/           the turn-by-turn procedure
.claude/agents/npc.md, world.md   the NPC and world subagents
games/<id>/                       each game: rooms, characters, items, quests, tables, art, look
rules/                            RULES.md, balance.json, rpg.py (the rules engine), generate.py
state/save.json                   the single source of truth
mod/                              the Claude Code mod: hooks, tests, sounds
```

`README.md` has the formats and technical details. This whole thing was built in conversation with Claude Code, one phase and one playtest at a time.
