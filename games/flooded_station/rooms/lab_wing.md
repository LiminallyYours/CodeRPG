---
name: Lab Wing
exits:
  east: common_deck
  down: drowned_lab
items:
  - pry_bar
characters:
  - halloran (if halloran_at_tanks and not halloran_agrees and not evacuated)
expand: north
encounters: station_events
terrain: flooded
---
A long corridor of tanks and benches, knee-deep in water that smells of salt and fish food. Most of the tanks are empty and cracked. A pry bar lies across a bench where someone was working on a stuck hatch. A flooded stairwell leads down to the lower lab. The corridor runs east back to the Common Deck, and to the north a door marked SPECIMEN STORE hangs open.

## If halloran_at_tanks and not halloran_agrees
Dr. Halloran is wading between the tanks with a torch in her teeth, tapping the glass and counting under her breath.

## If shellback_defeated
Wet scratch marks run along the floor from the stairwell to a drainage grate.

## Details
- The specimen store: nothing is written about what's inside, so this is a place the world can grow.
- The stairwell down: the water at the bottom is waist-deep and dark. Something heavy shifts in it now and then.
