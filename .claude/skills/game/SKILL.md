---
name: game
description: List the installed CodeRPG games, or switch to another one. Each game keeps its own save. Use as `/game` or `/game <id>`.
disable-model-invocation: true
---

# Games

The player typed `/game $ARGUMENTS`.

1. **No argument:** run `python3 rules/rpg.py game list` and show the games as a short list: the title, and whether there's a game in progress. Mark the one being played. Tell the player they can switch with `/game <id>`. Then stop.
2. **An argument:** run `python3 rules/rpg.py game switch <id>`, taking the id from the list if the player gave a title.
   - `REFUSED:` tell the player which games there are.
   - `No game yet`: welcome them to the new game's title in one line, and suggest `/newgame` to begin.
   - `The saved game continues`: in two or three sentences of story, remind the player where they are, from the `look` output it printed and the room (`rpg.py show rooms <id>`). From here on, every player message goes through `gm-turn`.
