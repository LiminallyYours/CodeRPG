---
name: newgame
description: Start a fresh game of the active CodeRPG game, resetting its save. Takes an optional seed, or "daily" for today's world. Switch games with /game.
disable-model-invocation: true
---

# New game

1. Run `python3 rules/rpg.py newgame $ARGUMENTS`. The player may have given a seed (`/newgame ember-4821`) or `daily` for today's world; with nothing, a new seed is chosen. This overwrites the active game's save with a fresh one built from its world file. The same seed always rolls the same stats, variants, clock and dice.
2. Read the world file with `python3 rules/rpg.py show world` and the start room with `python3 rules/rpg.py show rooms <start room>`.
3. Narrate the opening from the world file's **Opening** section, then describe the start room as the `gm-turn` skill directs. Follow the room file's `## If` sections and the exits that `look` reported. `FROM EARLIER RUNS` lists places the player built and people they befriended in earlier games: they're simply part of this world now. Read them with `rpg.py show` when they come up, and let a returning friend's one remembered line colour how they greet the player.
4. End by inviting the player to act. From here on, every player message goes through `gm-turn`.
