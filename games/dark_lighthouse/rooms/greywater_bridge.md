---
name: Greywater Bridge
exits:
  west: coast_road
  down: trolls_hollow (if grukk_friend or grukk_cowed or grukk_defeated)
characters:
  - grukk (if not grukk_defeated and not grukk_cowed and not lamp_lit and not grukk_foraging or grukk_friend and not lamp_lit)
terrain: stone
---
An old humpbacked bridge of grey stone spans the gorge, and the Greywater river roars below. Moss covers the parapets. At the near end, a muddy path winds down beneath the arch into the dark.

## If grukk_foraging and not grukk_friend and not grukk_cowed and not grukk_defeated and not lamp_lit
The bridge is empty. A boulder the size of a sheep has been rolled across the top of the path down, wedged tight, and huge bare footprints lead off west along the road. Whoever moved that stone could move it again; nobody else could.

## If not grukk_defeated and not grukk_cowed and not lamp_lit and not grukk_foraging or grukk_friend and not lamp_lit
A troll squats across the top of the path down, as big as a hay cart, with a club across its knees and its eyes glinting. It is clearly guarding the way below.

## If grukk_defeated
The path down is clear. A splintered club lies in the mud, and a trail of heavy footprints limps away upriver.

## If grukk_cowed and not lamp_lit
The path down is clear. You can hear sulky muttering from somewhere beneath the arch.

## Details
- Crossing: the far side of the bridge leads inland, beyond this adventure. If the player tries to cross, the GM says the road beyond is not part of this story and they turn back. No new place is invented.
