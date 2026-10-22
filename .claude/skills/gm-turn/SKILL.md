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
| pay a maker or builder for an order | `pay <id>`, or `pay <id> <item>` to pay a maker in trade |
| wield a weapon | `equip <item>` |
| drink or eat something with a `heal` value | `use <item>` |
| uncertain attempt (sneak, climb, persuade, frighten, notice) | `check <stat> <dc>`, using a DC from content if one is given, otherwise easy, normal or hard |
| fight | `attack <character>` (one exchange per call) |
| hazard / restorative from content | `hurt <dice>` / `heal <dice>` |
| something else that needs chance | `roll <dice>` |

- Run each command once and accept the result. Never re-roll because you didn't like it.
- **Moving:** use `move` only when the player's words clearly match one open exit, by direction or by the place it leads to. If they're vague ("head into town", "go somewhere warm") or could mean more than one exit, don't move them. Describe the open exits and ask where they want to go.
- **Don't roll for certain things.** Talking, looking around and walking through an open door need no command, except `move` for walking.
- **Talking:** `look` marks each character `[minor]` or `[agent]`. `[minor, agent resting]` means the character normally has an agent, but the owner's settings have it quiet: treat it as `[minor]`. Their memory of the player is at the end of `rpg.py show characters <id>`.
  - **[minor]:** you speak as the character yourself, in the voice their file describes. Share only what their file allows under the current flags (the `## If` sections that hold), and hold trades to the prices in their file.
  - **[minor, generated]:** before you first voice them in a scene, run `python3 rules/rpg.py talk <id>`, and voice them from what it prints. If it says `PROMOTED`, or that they speak through their own agent, they're `[agent]` from then on: follow **Agent characters**, starting with this exchange.
  - **[agent]:** the character speaks through their own subagent. Follow **Agent characters** below.
- When the player tries several things in one message, resolve them in order and stop at the first one that fails, or that a character would interrupt.

## 4. Narrate
- The narration is the only text you write in a turn, and it comes **last**, after every tool call, including the state writes in step 5. Write no commentary before or between tool calls: the interface draws the final text as story and hides anything else. If you're asked for a progress update mid-turn, give one short in-world line ending with "…", such as "Bringing the fisherman into being…", as its own paragraph, and carry on. Never report what you did or what's pending (an update finished, a price, a payment), and never put such a line at the start of the narration.
- Begin with the story itself. No preface such as "Recording her reply, then narrating."
- The narration stays inside the fiction. Never mention rules, commands, flags, dice numbers (unless asked), world turns, generation or agents.
- Write in the second person and present tense. Keep it to two to four short paragraphs, vivid but brief.
- When someone speaks, give them their own paragraph and name them outside the quotation marks ("Pell looks up. 'Well now…'"), not only inside it. The interface draws that paragraph under the speaker's name.
- Narrate the rolls truthfully, as fiction: "your blade glances off his hide" for a miss. Mention the numbers only if the player asks.
- For a `REFUSED:` result, explain in the fiction why the action didn't happen.
- After moving, describe the new room from its file, including the open exits. Mention blocked exits only as the content describes them. A `may grow` direction is a way that hasn't been explored. Mention it only as the room's prose does; when the prose says nothing about it, don't point it out, but if the player heads that way and going there is plausible, a new place can be found there.
- `move` can report more than the move itself. Weave each of these into the narration:
  - **`ENCOUNTER:`** something happened on arrival, and its effect has already been applied. Narrate exactly that.
  - **`CLOCK:`** time is running out, or the clocked event has just happened. Say so, from the content's `## If` sections for the clock's flag.
  - **`BUILT:`** something the player paid for is finished. Mention it when the player next sees that place, or as news if someone would tell them.
  - **`WORLD TURN DUE`:** run the world turn (see **Filling gaps**) before you write the narration. Don't mention it.
- Let `TIME AND WEATHER` colour descriptions.
- `CURSE:` in `look` means the player's words come out changed. The prompt's context says how they came out and what was meant: resolve what was meant, and narrate (and pass to agents) the words as they came out. Only the curse's own file says how it's cured.
- `METER:` in `look` is what play costs, in the game's own terms. Never mention it, except once when `look` reports `METER LOW` or `METER SPENT`: then let that line's text show lightly, in the story.
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

If `npc-brief` refuses because the character speaks through you right now, voice them yourself as for `[minor]` and spawn nothing.

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
- Each NPC reply counts as one line. Allow at most the number `look` gives as `AGENT LINES PER TURN`, counting the first response to the player. Then stop and hand the scene back to the player.
- Check every INTENT and REMEMBER from these lines the same way as above.

---

# Filling gaps
The game's `generation:` policy (in `rpg.py show world`) says what may be created during a run. When the player reaches for something the content doesn't have, use the matching case below. If that kind isn't allowed, it doesn't exist. `world-brief` also refuses when the owner has switched that kind off or the meter can't pay for it; then, too, the thing doesn't exist.

| The player… | Do this |
|---|---|
| talks to an unnamed person the prose mentions (a dockhand, a fisherman) | generate an **extra** |
| heads a `may grow` direction from `look` | generate a **room**, then `move` there |
| searches somewhere plausible for something small | generate an **item** only if finding something fits; most searches find nothing |
| looks for someone who would plausibly be here (a fishmonger at the quay) | generate a **character** |
| asks a generated or minor character for work or help, and it fits them | generate a **side quest** given by them |
| orders something made from a maker (`look` lists `MAKERS HERE`) | follow **Orders** below |
| asks a builder to build something here (`look` lists `BUILD SPOTS HERE`) | follow **Orders** below, with `build` |

Never generate anything that would solve, shortcut or replace part of the main quest, and never answer a gap that the authored content deliberately leaves closed.

## How to generate
1. Run `python3 rules/rpg.py world-brief <extra|room|item|character|quest>`.
2. Spawn the `world` subagent (`subagent_type: "world"`, `run_in_background: false`). Its prompt is that brief, verbatim, plus one line: "The player: <what they said or did>".
3. Save its JSON reply, exactly as given, with the Write tool to `proposals/<kind>-<id>.json`. Then run `python3 rules/rpg.py generate <kind> proposals/<kind>-<id>.json`.
   - Don't put JSON on a shell command line, because Claude Code refuses commands that mix braces and quotes.
   - The script deletes the file once it's applied.
4. Then use the result:
   - **`REFUSED: proposal rejected`:** spawn the agent once more, adding the reason. If it fails again, the thing doesn't exist; narrate accordingly.
   - **Success:** read the new entity with `rpg.py show`, then play it like authored content. Generated people are `[minor]`: you voice them, from their file only. Their sales and rewards follow their `## GM only` lines. Something `brought back from an earlier run` is new to the player in this one: they haven't met.

The brief may list things from earlier runs; the world agent may bring one back instead of inventing (`{"reuse": "<id>"}`). Save and apply that reply the same way. When one listed is plainly who or what the player means, you may write that reuse reply yourself instead of spawning the agent.

When a generated or player-made person, place or thing has come to matter (the player keeps coming back to it, or it was part of a big moment), you may tell the owner it deserves keeping for good: `python3 rules/rpg.py library suggest <id> "<one short line why>"`. It costs nothing and changes nothing in play; the owner decides.

## Orders
A maker makes things to order within their trade; a builder builds a small place at one of the room's build spots.
1. Run `python3 rules/rpg.py world-brief craft <maker>` (or `world-brief build <builder>`), spawn the `world` agent with it, and run `generate craft` (or `generate build`) on its reply, as in **How to generate**. If `world-brief` refuses, they turn the order away in character.
2. If `generate` says they turn the order down, narrate that in their voice. Otherwise it reports what will be made and its `PRICE`: they describe it and name that price, never another. When the maker is an `[agent]`, put what will be made and its price in that spawn's "What just happened", so they name it themselves.
3. Only when the player pays, run `pay <id>` (or `pay <id> <item>` for an item `PRICE` lists in trade). Until then it isn't theirs. A made item is handed over at once; a building takes a few moves (`BEING BUILT` in `look`) and doesn't exist until `BUILT:` says so. An unpaid order waits (`ORDERS WAITING` in `look`).

## World turns
When `move` or `look` says `WORLD TURN DUE`, do this before writing the narration, so the narration stays the last thing in the turn:
1. Run `python3 rules/rpg.py world-brief turn`.
2. Spawn the `world` agent with that brief.
3. Write its JSON to `proposals/world-turn.json`, then run `python3 rules/rpg.py world-turn proposals/world-turn.json`.

Don't narrate the world turn. Its rumors surface later, when the player talks to people: minor and generated characters may repeat them, and agent NPCs already see them in their briefs.

Some characters follow plans of their own on world turns: someone goes for a walk, falls asleep, bars a door. `world-turn` reports what the player can notice:
- **`SIGNAL:`** happened close by. Work that line into the narration as one sentence of what the player sees or hears, without explaining it ("Up at the lighthouse a heavy bar thuds across the door.").
- **`NOW HERE:`** that character has just arrived where the player is. Narrate them arriving, then play them as usual.
- **`OFF-SCREEN:`** nothing the player could notice. Say nothing; the rooms and what people say will show it when the player gets there.

Never tell the player what someone did off-screen, and never explain a signal. When they go and look, `look` and `show` already describe how things are now.
