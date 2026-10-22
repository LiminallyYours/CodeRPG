---
name: Control Room
exits:
  down: common_deck
characters:
  - halloran (if not halloran_agrees and not evacuated and not halloran_at_tanks)
  - bucket (if bucket_upstairs)
terrain: metal
---
The highest module on the station is a cramped room of screens and switches, its windows streaked with rain. Most of the screens are dark. One panel blinks a single red word over and over: PUMP FAULT. A ladder leads back down to the Common Deck, and beside it the cage of a small cargo hoist.

## If halloran_dozing and not halloran_agrees and not evacuated
Dr. Halloran is asleep in the chair at the console, chin on her chest, a cold mug of tea tilting in her hand.

## If halloran_at_tanks and not halloran_agrees
The chair at the console is empty, still turned toward the door, and a half-drunk mug of tea sits cooling beside the tide chart.

## If bucket_upstairs
Bucket, the station's maintenance drone, is mopping in slow, squeaking circles round the console, its one camera eye fixed on the floor.

## If not pump_running
The pump panel shows a diagram of the bilge system, with a fuse symbol flashing beside the main pump.

## If pump_running
The pump panel glows green. A line on the tide chart is finally bending downward.

## Details
- Halloran asleep: speaking to her or touching her wakes her with a start, and she insists she wasn't asleep: `flag unset halloran_dozing`.
- The panel: anyone who reads it learns the main pump's fuse has blown, and that the pump is in the Pump Room off the Common Deck. Reading it needs no roll.
- The tide chart: high tide is coming soon. The player can see that but not the exact time.
- The comms headset: a headset with a cracked earpiece hangs by the dead radio. If the player puts it on and tries to call out, they get nothing but squealing feedback, and for a while afterwards they end everything they say with "…over.": `flag set radio_habit`.
