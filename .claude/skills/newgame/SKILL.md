---
name: newgame
description: Start a fresh game of the active CodeRPG game, resetting its save. Switch games with /game.
disable-model-invocation: true
---

# New game

1. Run `python3 rules/rpg.py newgame`. This overwrites the active game's save with a fresh one built from its world file.
2. Read the world file with `python3 rules/rpg.py show world` and the start room with `python3 rules/rpg.py show rooms <start room>`.
3. Narrate the opening from the world file's **Opening** section, then describe the start room as the `gm-turn` skill directs. Follow the room file's `## If` sections and the exits that `look` reported.
4. End by inviting the player to act. From here on, every player message goes through `gm-turn`.
