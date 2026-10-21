---
name: Control Room
exits:
  down: common_deck
characters:
  - halloran (if not halloran_agrees and not evacuated)
---
The highest module on the station is a cramped room of screens and switches, its windows streaked with rain. Most of the screens are dark. One panel blinks a single red word over and over: PUMP FAULT. A ladder leads back down to the Common Deck.

## If not pump_running
The pump panel shows a diagram of the bilge system, with a fuse symbol flashing beside the main pump.

## If pump_running
The pump panel glows green. A line on the tide chart is finally bending downward.

## Details
- The panel: anyone who reads it learns the main pump's fuse has blown, and that the pump is in the Pump Room off the Common Deck. Reading it needs no roll.
- The tide chart: high tide is coming soon. The player can see that but not the exact time.
