---
name: newgame
description: Start a fresh game of CodeRPG, resetting the save file from the adventure in content/.
disable-model-invocation: true
---

# New game

1. Run `python3 rules/rpg.py newgame`. This overwrites `state/save.json` with a fresh save built from `content/world.md`.
2. Read `content/world.md` and the start room's file in `content/rooms/`.
3. Narrate the opening from the world file's **Opening** section, then describe the start room as the `gm-turn` skill directs. Follow the room file's `## If` sections and the exits that `look` reported.
4. End by inviting the player to act. From here on, every player message goes through `gm-turn`.
