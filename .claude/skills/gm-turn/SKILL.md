---
name: gm-turn
description: The game master's turn procedure for CodeRPG. Use on every player action (any in-character message) to read state and content, resolve outcomes with rules/rpg.py, narrate, and record changes.
user-invocable: false
---

# One game turn

Follow these steps in order, every turn. If the player's message is out-of-character (it starts with `ooc:` or is about building the game), don't use this procedure.

## 1. Read state
Run `python3 rules/rpg.py look`. It reports your status, location, open and blocked exits, the items and characters here, your inventory, and flags. It has already applied flag conditions. If the status is `defeated`, tell the player the game is over and suggest `/newgame`. Then stop.

## 2. Read the content involved
Read the current room every turn, and each character, item or quest the action touches, with `python3 rules/rpg.py show <rooms|characters|items|quests> <id>`. Never open content files by path.
- `show` reads authored content and content generated earlier this run (marked `[generated]` by `look`) alike. Once generated, things are as real as authored content for the rest of the run.
- `show` already leaves out the `## If <condition>` sections that don't hold now. Deeper `### If` headings, such as a quest's endings, are still yours to match against the flags. Conditions can use the automatic names `look` lists under ALSO TRUE: `has_<item>` while carrying an item, and `met_<character>` once the player has seen that character. You never set these with `flag set`.
- The game names its own stats and money: `look` prints them as e.g. `Grit (might)` and `Credits`. Use the game's names in narration, and the mechanical name (`might`) in commands.
- Authored and generated content together are everything you know about the world. You never make up anything that matters to the game yourself, such as an item, exit, character, clue or price. When the player reaches a gap, follow **Filling gaps** below: either the world agent creates it through `rpg.py`, or it doesn't exist.
- `ESTABLISHED HERE` lines in `look` are small details already narrated in this room. Keep them true.

## 3. Resolve the action with rpg.py
Work out what the player is trying to do, then use the matching command:

| Player intent | Command |
|---|---|
| go somewhere | `move <direction>` |
| pick up / put down | `take <item>` / `drop <item>` |
| buy, trade or receive / give away | `gain <item>` / `lose <item>` (and `coins -N` / `coins +N`) |
| wield a weapon | `equip <item>` |
| drink or eat something with a `heal` value | `use <item>` |
| uncertain attempt (sneak, climb, persuade, frighten, notice) | `check <stat> <dc>`, using a DC from content if one is given, otherwise easy, normal or hard |
| fight | `attack <character>` (one exchange per call) |
| hazard / restorative from content | `hurt <dice>` / `heal <dice>` |
| something else that needs chance | `roll <dice>` |

- Run each command once and accept the result. Never re-roll because you didn't like it.
- **Moving:** use `move` only when the player's words clearly match one open exit, by direction or by the place it leads to. If they're vague ("head into town", "go somewhere warm") or could mean more than one exit, don't move them. Describe the open exits and ask where they want to go.
- **Don't roll for certain things.** Talking, looking around and walking through an open door need no command, except `move` for walking.
- **Talking:** `look` marks each character `[minor]` or `[agent]`.
  - **[minor]:** you speak as the character yourself, in the voice their file describes. Share only what their file allows under the current flags (the `## If` sections that hold), and hold trades to the prices in their file.
  - **[agent]:** the character speaks through their own subagent. Follow **Agent characters** below.
- When the player tries several things in one message, resolve them in order and stop at the first one that fails, or that a character would interrupt.

## 4. Narrate
- The narration is the only text you write in a turn, and it comes **last**, after every tool call, including the state writes in step 5. Write no commentary before or between tool calls: the interface draws the final text as story and hides anything else. If you're asked for a progress update mid-turn, give one short line, such as "Bringing the fisherman into being…", and carry on.
- Begin with the story itself. No preface such as "Recording her reply, then narrating."
- The narration stays inside the fiction. Never mention rules, commands, flags, dice numbers (unless asked), world turns, generation or agents.
- Write in the second person and present tense. Keep it to two to four short paragraphs, vivid but brief.
- Narrate the rolls truthfully, as fiction: "your blade glances off his hide" for a miss. Mention the numbers only if the player asks.
- For a `REFUSED:` result, explain in the fiction why the action didn't happen.
- After moving, describe the new room from its file, including the open exits. Mention blocked exits only as the content describes them. A `may grow` direction is a way that looks possible but hasn't been explored, such as stairs or a track. Mention it as the room's prose does.
- `move` can report more than the move itself. Weave each of these into the narration:
  - **`ENCOUNTER:`** something happened on arrival, and its effect has already been applied. Narrate exactly that.
  - **`CLOCK:`** time is running out, or the clocked event has just happened. Say so, from the content's `## If` sections for the clock's flag.
  - **`WORLD TURN DUE`:** run the world turn (see **Filling gaps**) before you write the narration. Don't mention it.
- Let `TIME AND WEATHER` colour descriptions.
- End with a light prompt, such as what's in front of them or who is waiting for an answer. Don't list menu options.

## 5. Write state
Record anything the content says should change, in the same turn. Make these calls before you write the narration, so the narration stays the turn's final text:
- `python3 rules/rpg.py flag set <name>` when a content file says to set a flag. Content files are the only source of flag names.
- Trades and gifts: `coins ±N`, `gain <item>`, `lose <item>`.

- **Chronicle:** when something significant happens (a quest step, a big choice, a fight won or lost), add one line to the story so far: `python3 rules/rpg.py chronicle "<one line, past tense>"`.
- **Details:** when you invent a small, harmless detail the player may come back to, such as a boat's name or the colour of a door, keep it true: `python3 rules/rpg.py note "<the detail>"`.

`take`, `move`, `attack`, `use` and `check` have already written their results. Don't repeat them.

Never edit `state/save.json` or anything in `games/` directly.

---

# Agent characters
Use this whenever the player speaks to, gives something to, or otherwise deals with an `[agent]` character.

## Spawning an NPC
Each time the character needs to respond, spawn a **fresh** `npc` subagent with the Agent tool: `subagent_type: "npc"` and `run_in_background: false`. Wait for its reply. Don't use SendMessage to continue an NPC, because a fresh spawn each time is how it stays in step with state.

Its prompt has exactly these three parts:
1. **Brief:** the verbatim output of `python3 rules/rpg.py npc-brief <id>`. Run it again for every spawn, since flags may have changed. Never add facts of your own to it.
2. **The scene so far:** the last few lines of this scene, at most about 8, written as `Player: …` / `<Name>: …` / `(action)`. Write "(the scene just began)" if there are none. A scene ends when the player leaves the room.
3. **What just happened:** the player's words, quoted as close to verbatim as you can, and anything they visibly did, such as "holds out a wrapped parcel". If a roll has just been made, give its outcome in plain fiction, never as numbers.

## Using the reply (SAY / INTENT / REMEMBER)
- **SAY:** narrate it in your own prose around the character's words. You may trim it. Drop anything that contradicts state or content, or that names a thing that doesn't exist. **State wins.** If the NPC claims something false, such as having an item it doesn't have, leave it out or have the character correct themselves.
- **INTENT:** these are proposals, not facts. Check each one against the character file's `## GM only` section and the rules:
  - If content allows it, make it happen with `rpg.py`: `flag set`, `lose`/`gain`, `coins`, or `check` when the content requires a roll.
  - If content doesn't allow it, it doesn't happen. Narrate the character hesitating, or simply not doing it.
  - An attack intent means combat begins, through `rpg.py attack` on the player's action or as the content directs.
- **REMEMBER:** if it is true to what actually happened, record it with `python3 rules/rpg.py remember <id> "<line>"`. Keep it to one short line in the third person about the player, e.g. "Brought me a gift. A friend, then!" Skip it if it says none.

## Two agent characters in one scene
When two `[agent]` characters are present and the moment naturally involves both, they may exchange lines. That happens when the player addresses both, or when one reacts to the other.
- Relay each line to the other character by spawning their `npc` with "What just happened: `<Name>` says: …".
- Each NPC reply counts as one line. Allow at most `npc.exchange_max_lines` lines per turn (see `rules/balance.json`), counting the first response to the player. Then stop and hand the scene back to the player.
- Check every INTENT and REMEMBER from these lines the same way as above.

---

# Filling gaps
The game's `generation:` policy (in `rpg.py show world`) says what may be created during a run. When the player reaches for something the content doesn't have, use the matching case below. If that kind isn't allowed, it doesn't exist.

| The player… | Do this |
|---|---|
| talks to an unnamed person the prose mentions (a dockhand, a fisherman) | generate an **extra** |
| heads a `may grow` direction from `look` | generate a **room**, then `move` there |
| searches somewhere plausible for something small | generate an **item** only if finding something fits; most searches find nothing |
| looks for someone who would plausibly be here (a fishmonger at the quay) | generate a **character** |
| asks a generated or minor character for work or help, and it fits them | generate a **side quest** given by them |

Never generate anything that would solve, shortcut or replace part of the main quest, and never answer a gap that the authored content deliberately leaves closed.

## How to generate
1. Run `python3 rules/rpg.py world-brief <extra|room|item|character|quest>`.
2. Spawn the `world` subagent (`subagent_type: "world"`, `run_in_background: false`). Its prompt is that brief, verbatim, plus one line: "The player: <what they said or did>".
3. Save its JSON reply, exactly as given, with the Write tool to `proposals/<kind>-<id>.json`. Then run `python3 rules/rpg.py generate <kind> proposals/<kind>-<id>.json`.
   - Don't put JSON on a shell command line, because Claude Code refuses commands that mix braces and quotes.
   - The script deletes the file once it's applied.
4. Then use the result:
   - **`REFUSED: proposal rejected`:** spawn the agent once more, adding the reason. If it fails again, the thing doesn't exist; narrate accordingly.
   - **Success:** read the new entity with `rpg.py show`, then play it like authored content. Generated people are `[minor]`: you voice them, from their file only. Their sales and rewards follow their `## GM only` lines.

## World turns
When `move` or `look` says `WORLD TURN DUE`, do this before writing the narration, so the narration stays the last thing in the turn:
1. Run `python3 rules/rpg.py world-brief turn`.
2. Spawn the `world` agent with that brief.
3. Write its JSON to `proposals/world-turn.json`, then run `python3 rules/rpg.py world-turn proposals/world-turn.json`.

Don't narrate the world turn. Its rumors surface later, when the player talks to people: minor and generated characters may repeat them, and agent NPCs already see them in their briefs.
