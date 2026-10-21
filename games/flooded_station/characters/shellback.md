---
name: the Shellback
role: a giant mangrove crab loose from the lab tanks
minor: yes
hp: 9
defense: 12
attack: 1
damage: 1d6
---
## Personality
The Shellback is old, enormous, territorial and hungry. It isn't cruel; it's a crab. It guards the corner of the lab it has decided is its own, and it calms down completely when it has something to eat.

## How it speaks
It doesn't speak. It clicks its claws, hisses bubbles, and raises itself out of the water to look bigger.

## If shellback_fed and not shellback_defeated
It is eating, and nothing else in the world matters to it.

## GM only
- **Feeding it:** if the player offers the sardines (`lose sardine_tin`), `flag set shellback_fed`. After that it ignores the player for the rest of the game.
- **Other food or trinkets:** it snaps them out of the air and keeps guarding. Nothing changes.
- **Fight:** `attack shellback`. When it reaches 0 HP, `shellback_defeated` is set automatically, and it scuttles off through a drainage grate.
- **It never leaves the Drowned Lab** and never follows the player.
