---
name: Harbor Square
exits:
  north: gull_tavern
  west: lighthouse
  east: coast_road
items:
  - boarding_cutlass (if cutlass_in_nets)
characters:
  - morwen
  - ysolde (if lamp_lit)
  - grukk (if lamp_lit and grukk_friend)
expand: south
build:
  southwest: the bare stone footing of a burned-out net-loft at the end of the harbor wall
encounters: harbor_events
terrain: water
---
A cobbled square opens onto a stone quay. Fishing boats knock together at their moorings and gulls squabble over fish heads. Old nets lie heaped against the harbor wall, half-rotted, and a lean woman sits among them on an upturned crate, mending.

To the north, warm light spills from the Gull tavern. To the west, a path climbs to the lighthouse. To the east, the coast road leaves the village along the cliffs. To the south, worn stone steps lead down from the quay to the moored boats. To the southwest, where the harbor wall ends, a burned-out net-loft has left nothing but a bare stone footing.

## If fleet_lost
The fleet came home in the dark. Half the boats limped in with stove-in hulls; two never came in at all. Women stand along the quay wall staring at the black water, and nobody is talking.

## If fleet_arrived and not fleet_lost
The fleet is home. Boats crowd the moorings, nets are being hauled up the steps, and every face on the quay keeps turning toward the light.

## If not lamp_lit and not fleet_arrived
The lighthouse is a black finger against the sky. People cross the square quickly with their heads down, glancing at the dark tower and then out to sea.

## If lamp_lit
The lighthouse beam sweeps over the water again. Lanterns hang in doorways and someone is singing down by the boats. Ysolde stands at the end of the quay, watching for sails.

## If lamp_lit and grukk_friend
A crowd of wide-eyed children has gathered around a very large, very pleased troll, feeding him treats.

## If cutlass_in_nets
An old cutlass is tangled in the nets; anyone who looks closely will notice its hilt. It takes no roll to free it.

## Details
- Nets: a heap of old, half-rotted fishing nets. Morwen, Pell's cousin, is working through them and takes small jobs to order.
- The footing: a square of blackened stone where a net-loft burned down years ago. Morwen says something could go up there again, for a price.
- Quay steps: they lead south down to the boats. Nothing is written about what's down there, so this is a place the world can grow.
- Quay: if the player looks out to sea, they see dark water and rocks white with foam. There are no boats close in.
