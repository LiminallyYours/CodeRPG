# I used Claude Code's new mod support to turn it into a text adventure

Claude Code now supports **mods**: plugins that can redraw its interface, hide or reshape tool calls, add side panes and slash commands, and play sounds. I used them to reskin Claude Code as an RPG text-adventure framework, then built a game on top where Claude is the game master and the world reacts to what you do.

You play at the normal Claude Code prompt by typing things like *"ask the innkeeper about the troll"* or *"attack!"*.

---

## What the mod does to Claude Code

- **Narration becomes story text:** Claude's replies are redrawn as bordered story cards, with a banner when you enter a new place, a title card at the start and an ending card at the finish.
- **The machinery disappears:** every tool call, file read and agent call the game makes behind the scenes is hidden.
- **Dice rolls show instead:** a small tray, e.g. `🎲 Might check: d20 16 +1 = 17 vs DC 14  SUCCESS`.
- **Claude's own UI goes in-world:**
  - the spinner says *"Steel meets steel…"* instead of *"Crunching…"*;
  - the turn timer becomes a divider;
  - your input is restyled as the player's line.
- **A status bar above the prompt:** location, HP, coins, a countdown clock and your current objective.
- **A character pane beside the story,** with three tabs:
  - **Here:** clickable exits and actions
  - **Map:** a map that fills in as you explore
  - **Journal:** quests, rumors, and the people you've met
- **Feedback:** pop-up notices for HP, coins and items, a flashing HP bar, and sound effects.
- **Instant slash commands:** `/inventory` and `/map` answer straight from the save, without a Claude turn.

---

## How the game responds dynamically

- **Characters are their own AI agents.** Each important NPC is played by a separate subagent. It knows only what that character would know, remembers how you've treated it, and can talk to other NPCs in the same room.
- **The world fills in gaps.** Talk to a dockhand the story only mentioned, and a "world" agent turns them into a real person with a name and a personality. Head down an unexplored path, and it creates the place. It can also add small items and side quests.
- **Code keeps it honest.** Claude never rolls dice or invents stats. A rules script decides every uncertain outcome, checks everything the world agent proposes, and keeps a single save file as the source of truth. If an NPC claims something the save disagrees with, the save wins.
- **No two runs are the same.**
  - Your stats are rolled each game.
  - Key details change: what the troll can be bribed with, where useful items are hidden.
  - Random encounters happen on the road.
  - A clock ticks down to a deadline that can fail the quest.
- **Off-screen life:** every few moves, time passes in the background. Rumors spread, the weather changes, and people move around.
- **Your choices stick:** branching story flags change what rooms say, how characters treat you, and how the story ends.

---

## Other cool bits

- **Swappable adventures:** the game's world, its rules and your save are kept separate. Drop in a different world folder and you have a different game.
- **Cost control:** minor characters can be marked to be voiced by the game master instead of their own agent.
- **No dependencies:** just Claude Code and Python 3.
- **Tested:** the mod has its own test suite (34 tests).

---

## The game itself

*The Dark Lighthouse*: a fishing village's lighthouse lens has been stolen, and the fishing fleet is due home through the rocks in the dark. It has six locations, a gruff lighthouse keeper, a gossiping innkeeper, and a troll under the bridge who loves shiny things. You can get past the troll by bribing him, scaring him or fighting him, and each choice changes the ending. It's deliberately small, because the framework is the point.

---

## Try it

```
cd CodeRPG
claude --plugin-dir ./mod
/newgame
```

Type what you do in plain English. Start a message with `ooc:` to talk to Claude as a developer instead of the game master.
