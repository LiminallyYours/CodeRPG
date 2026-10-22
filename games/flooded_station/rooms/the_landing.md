---
name: The Landing
exits:
  north: common_deck
items:
  - sardine_tin (if sardines_on_landing)
characters:
  - halloran (if halloran_agrees and not evacuated)
expand: east
terrain: water
---
A floating pontoon chained to the station's stilts rises and falls with the swell. Your skiff is tied up at its edge, its outboard motor ticking as it cools. A steel stair climbs north to the Common Deck. To the east, a rope walkway sags across to a cluster of storage floats, half awash.

## If sardines_on_landing
A crate of galley supplies has washed against the railing. A dented tin of sardines is wedged in its corner.

## If halloran_agrees and not evacuated
Dr. Halloran waits by the skiff with a dripping cooler of specimens on her knees, looking up at the station.

## If evacuated
The landing is empty. The station's lights shrink behind you across the grey water.

## If station_lost and not evacuated
The sea has risen to the pontoon's chains. Water pours from every lower window of the station above.

## Details
- The skiff: it's the only way off the station. Leaving alone isn't part of this story; the player came to bring someone home. If they try, they find they can't cast off without Dr. Halloran.
- Leaving with Dr. Halloran: when the player boards the skiff while she's here, `flag set evacuated`.
- The storage floats: nothing is written about what's out there, so this is a place the world can grow.
