---
name: The Lighthouse
exits:
  east: harbor_square
characters:
  - ysolde (if not lamp_lit and not ysolde_on_quay)
terrain: stone
---
The base of the lighthouse is a round stone room crowded with coils of rope, barrels of lamp oil and a narrow cot. An iron stair spirals up into darkness. At the top, the lamp sits cold in its empty brass cradle.

The door east leads back down the path to Harbor Square.

## If fleet_lost and not lamp_lit
Ysolde sits on the bottom step with her head in her hands. Through the open door you can hear the keening from the quay.

## If ysolde_on_quay and not lamp_lit
The cot is empty and the keeper's oilskin coat is gone from its hook. Her lantern is missing too.

## If not lamp_lit
The empty cradle can be seen from the foot of the stair. Something was wrenched out of it, and the brass brackets are bent.

## If lamp_lit
The stair glows with the light falling from above, and the room is warm. The lens sits in its cradle again, throwing the beam far out to sea. Ysolde's cot is empty, because she has gone down to the quay.

## Details
- Stair: the player may climb to look at the cradle, but there is nothing up there except the cold lamp until the lens is returned.
- Brackets: anyone who looks closely sees that they were bent by enormous hands. The bending shows great strength and no skill.
