---
name: Pump Room
exits:
  west: common_deck
terrain: metal
---
A cramped room at the bottom of a ladder, full of pipes and the smell of hot oil. The main bilge pump fills most of it, a squat iron machine bolted to the floor. Water laps around its base.

## If not pump_running
The pump is silent. A fuse socket on its control box is black and scorched, and the old fuse has melted into a lump.

## If pump_running
The pump thuds like a heartbeat. Water swirls down its intake, and the level on the wall gauge is falling.

## Details
- Fitting the spare fuse: if the player carries `spare_fuse`, they can fit it with no roll: `lose spare_fuse`, then `flag set pump_running`.
- Without a fuse, the pump can't be made to run. Hitting it or rewiring it achieves nothing.
