# Rules

How the game works. The numbers live in `balance.json`, and the arithmetic lives in `rpg.py`. This file explains both in plain language. The game master never rolls dice or does damage math in its head. It runs the matching `rpg.py` command and accepts the result.

## The player
- **HP**: health. Reaching 0 means **defeat**, and the game is over until `/newgame`.
- **Might**, **Agility**, **Wits**: small modifiers, usually −1 to +3, added to d20 rolls.
  - Might: strength, force, intimidation, melee attacks, how much you can carry.
  - Agility: speed, stealth, balance, dodging (it raises your defense).
  - Wits: noticing, persuading, recalling, tricking.
- **Coins**: money. Coins can't go below 0.
- Starting values come from the game's world file (`games/<id>/world.md`).

## Skill checks: `check <stat> <dc>`
Use a check when the player tries something whose outcome is uncertain and that matters.

Roll d20 + stat against a difficulty (DC). If the total is at least the DC, the check succeeds.

| DC | name |
|---|---|
| 8 | easy |
| 12 | normal |
| 16 | hard |

A content file may name an exact DC for a specific action, and that DC wins. A natural 20 always succeeds and a natural 1 always fails.

Don't roll for things that are certain, trivial, or impossible. Just narrate those.

## Combat: `attack <character>`
Only characters whose file gives `hp`, `defense`, `attack` and `damage` can be fought. Each `attack` is **one exchange**:
1. **You swing.** Roll d20 + Might against the foe's `defense`. On a hit, roll your equipped weapon's `damage` dice, or 1d2 if you're unarmed. Every hit deals at least 1.
2. **The foe swings back if it's still standing.** It rolls d20 + its `attack` against your defense, which is **10 + Agility**. On a hit, it rolls its `damage` dice.
3. **Critical:** a natural 20 on an attack rolls the damage dice twice.
4. **When a foe reaches 0 HP**, the flag `<id>_defeated` is set automatically. The character's own file says what that means for the story.
5. **Fleeing:** an Agility check (normal DC unless content says otherwise). On a success, `move` away. On a failure, you stay put and the foe gets a free hit on you: `hurt <foe's damage dice>`.

A foe's wounds are kept in state (`npcs`), so they persist if you leave and come back.

## Damage and healing
- `hurt <dice>`: damage from the environment (a fall, a trap) when the content calls for it.
- `heal <dice>`: healing from the story, such as rest or a kind character, when the content calls for it.
- `use <item>`: consumes an item that has a `heal` value. HP never rises above max HP.

## Carrying: `take`, `drop`, `gain`, `lose`, `equip`
- Each item has a `weight`. You can carry up to **8 + 2 × Might** in total.
- `take` and `gain` are refused when they would go over the limit.
- `take` and `drop` move an item between you and the current room. `gain` and `lose` move an item between you and a character (trades and gifts).
- Only items with `damage` can be equipped. Dropping or giving away your equipped weapon leaves you unarmed.

## Movement: `move <direction>`
You can only use exits listed in the room file. An exit with a condition, such as `(if bridge_clear)`, is blocked until that condition holds.

## NPC memory and talk: `remember <character> <line>`
- Each non-minor character keeps a short memory of the player in state: at most `npc.memory_lines` lines (6) of up to `npc.memory_line_chars` characters (160) each. When a new line is added past the limit, the oldest is dropped.
- When two NPC agents talk to each other, at most the owner's `npc_agents.lines_per_exchange` lines (4 in the normal preset) are spoken per turn.

## Flags: `flag set <name>` / `flag unset <name>`
Flags are named facts about what has happened. Content files say when a flag should be set and what changes because of it. The rules don't care what any flag means.

Two kinds of names are automatic and can't be set: `has_<item>` is true while you carry that item, and `met_<character>` is true once you've been in a room with that character. Content conditions can use them like flags.

## A run's variation
- **Seed:** every run has a seed: one the player names, `daily` (today's date, so everyone gets the same world that day), or a new one. Each die is drawn from the game, the seed and how many dice the run has rolled so far, so the same seed rolls the same dice in the same order. Choices made differently, or agents speaking differently, lead to different commands and so to different dice later on.
- **New game:** `newgame` rolls any stats `world.md` lists under `rolls:` and picks one flag from each `variants:` line. It also places starting items whose conditions hold and starts the clock.
- **Moves and the clock:** every `move` is one tick. The clock counts down. When it runs out, its flag is set, plus `also_flag` if `also_if` holds at that moment.
- **Weather** may change every `world.weather_every_moves` moves (5).
- **World turns:** every `world_turns.every_moves` moves in the owner's settings (5 in the normal preset), a world turn falls due, if world turns are on and the meter can pay for one.
- **Encounters:** arriving in a room with `encounters:` rolls the table's chance (e.g. 2 in 6). On a hit, one entry is picked and its effect applied. An entry marked `(once)` happens at most once per run. A `hurt` effect from an encounter can wound but never kill: it leaves you with at least 1 HP.

## Generated content
- The world agent proposes, and `generate.py` decides whether the proposal fits:
  - ids and names are new;
  - descriptions are short;
  - new rooms attach only through a room's `expand:` directions, and go no further;
  - each room yields at most 1 found item and 2 extras;
  - each run allows at most the owner's `generation.max_per_run` generated entities (16 in the normal preset).
- **Stats come from tiers, never from the proposal.**
  - Items: trinket (weight 1); light_weapon (1d4, weight 1); weapon (1d6, weight 3); tonic (heals 1d4+1, weight 1).
  - Foes: weak (5 HP, defense 9, +0, 1d4); average (8, 11, +1, 1d6); tough (12, 12, +2, 1d8).
  - Generated prices are 1–6 coins, and side-quest rewards at most 4 coins.
- **Side quests** may only use their own `side_<id>_<word>` flags, plus `has_` and `met_` names.

## The meter: what play costs
Every action that spends Claude's tokens has a fixed price, set by the game (`meter.prices` in balance.json): a game-master turn 1, a character answering through its own agent 3, generating something 4, a world turn 3. Everything else, including every rules-script command, `ooc:` messages and slash commands, is free. The game shows the meter as its own resource (lamp oil, power), with a capacity from the owner's settings (100 in the normal preset).
- **Paying:** the UserPromptSubmit hook pays for each in-game turn; `npc-brief` pays for a character's reply and `world-brief` for each generation or world turn, so a retry pays again.
- **Running low:** below `meter.low_at_percent` (25%) the game warns once.
- **Spent:** when the meter can't pay for something, that thing falls back to its cheap form, and play goes on: agents fall quiet and the game master voices everyone (`look` marks them `[minor, agent resting]`), nothing new is generated, no `may grow` ways are offered, and no world turns fall due.
- **Refill:** each time Claude Code is opened or resumed in the folder (a SessionStart hook); a `/clear` doesn't refill it. The meter lives in `state/meter.json`, outside every save, so it carries across new games and game switches.

## The owner's switches
Each game's `settings.json` picks a preset from `rules/presets.json` (`thrifty`, `normal` or `rich`) and may override any of its switches:
- `meter.capacity`;
- `npc_agents`: `on` (off: the game master voices everyone), `lines_per_exchange`, and `characters` to switch single characters off;
- `world_turns`: `on` and `every_moves`;
- `generation`: `on`, `max_per_run`, and `kinds` (extras, rooms, items, characters, side_quests). Something is generated only if the game's own `generation:` allows it **and** the switch is on.

`rpg.py settings` and the instant command `/budget` show them. Only the owner changes them, with `tools/settings.py`, which the game master can't run.
