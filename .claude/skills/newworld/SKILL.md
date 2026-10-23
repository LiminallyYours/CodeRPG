---
name: newworld
description: Forge a whole new CodeRPG world from one sentence, made in the background while the current game goes on. Use as `/newworld <a sentence>`, or `/newworld` alone for a surprise.
disable-model-invocation: true
---

# A new world

The player typed `/newworld $ARGUMENTS`. They're asking the storyteller for a new world, outside the story. Keep it light and short, and never mention agents, drafts, files, checks or commands other than `/game`.

1. Run `python3 rules/rpg.py forge quote`.
   - `FORGE OFF`: tell the player in one line that new worlds can't be made here; the owner has them switched off. Stop.
   - `FORGING`: tell them a new world is already taking shape, and they'll hear when it's ready. Stop.
   - `NEW WORLD READY`: run `python3 rules/rpg.py forge install <draft>` and tell them in one line, as **gm-turn** says under *New worlds*. Stop.
2. Ask with the AskUserQuestion tool: one question, header "New world".
   - Usually: "Forge <what they asked for, in a few words, or "a surprise world">? It takes a while. You can keep playing meanwhile." Options: "Forge it", "Not now". A new world costs nothing from the game's resource; don't mention a price.
   - When `forge quote` lists an `UNFINISHED` world: say one was interrupted, and offer "Finish the interrupted world", "Start this new one", "Throw the interrupted one away", "Not now".
3. "Not now": one friendly line. Stop. "Throw … away": `python3 rules/rpg.py forge discard <draft>`, one line, and stop.
4. Run `python3 rules/rpg.py forge start "<their sentence>"` (with any double quotes in it removed; nothing after `start` for a surprise), or `python3 rules/rpg.py forge resume <draft>`. If it says `REFUSED:`, tell them why in one line and stop.
5. Spawn the `worldsmith` agent with the Agent tool: `subagent_type: "worldsmith"`, `run_in_background: true`, `description: "A new world takes shape"`, and as its prompt everything the command printed after its first line (`FORGE STARTED` or `FORGE RESUMED`), verbatim.
6. Write one line and nothing else, such as: "Somewhere past the edge of the map, a new world begins to take shape…" The game goes on as before; the player will hear when it's ready.
