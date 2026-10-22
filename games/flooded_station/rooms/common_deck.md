---
name: Common Deck
exits:
  south: the_landing
  up: control_room
  west: lab_wing
  east: pump_room (if not station_lost)
items:
  - sardine_tin (if sardines_in_galley)
characters:
  - bucket
encounters: station_events
build:
  northeast: a gap in the deck railing where an old ladder once dropped to the stilts, room for a float or platform lashed among them
terrain: metal
---
The station's mess and galley share one long, low module. Plates have slid off the tables into ankle-deep water, and the radio set on the wall is dead. A ladder leads up to the Control Room. To the west, a corridor runs to the Lab Wing. To the east, a hatch opens on a ladder down to the Pump Room. The stair to the landing is to the south. In the northeast corner there's a gap in the railing where a ladder once dropped down to the stilts.

## If sardines_in_galley
A cupboard in the galley has burst open. Among the floating packets, a tin of sardines bobs against the hinge.

## If not pump_running and not station_lost
Water seeps in under the pump hatch, and the floor tilts very slightly toward it.

## If pump_running
Somewhere below, a heavy machine thuds steadily. The water on the floor is already draining away through the grates.

## If station_lost
The pump hatch is underwater, and the sea is coming up the corridor in slow, cold pulses.

## Details
- The railing gap: the old ladder is long gone, but the stilts below would take a lashed float or a bolted platform. Bucket could build something there.
- The radio: a cable has been chewed through behind it. It can't be fixed in time, and it doesn't matter to the story.
