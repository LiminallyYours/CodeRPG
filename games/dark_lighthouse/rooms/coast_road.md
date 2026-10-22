---
name: Coast Road
exits:
  west: harbor_square
  east: greywater_bridge
items:
  - healing_tonic (if tonic_on_road)
characters:
  - grukk (if grukk_foraging and not grukk_friend and not grukk_cowed and not grukk_defeated and not lamp_lit)
expand: north
encounters: road_events
terrain: grass
---
A rutted road runs along the clifftop with gorse on one side and a long drop to the surf on the other. The wind tugs at your clothes. Ahead to the east, the road dips toward the river gorge and the old stone bridge. A sheep track wanders north, up into the gorse.

## If grukk_foraging and not grukk_friend and not grukk_cowed and not grukk_defeated and not lamp_lit
A troll as big as a hay cart is rooting through the gorse at the roadside, nose down, sniffing loudly. It's the troll from Greywater Bridge, a long way from its bridge.

## If tonic_on_road
A small corked bottle lies in the ruts of the road, dropped by some traveller.

## Details
- Tracks: a Wits check (DC 10) spots huge, bare footprints in the mud heading east toward the bridge, and a few flakes of polished brass. On a failure the player sees only mud.
