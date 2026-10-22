---
name: The Drowned Lab
exits:
  up: lab_wing
items:
  - spare_fuse
characters:
  - shellback (if not shellback_defeated)
expand: no
terrain: flooded
---
The lower lab is flooded to the waist. Emergency strip-lights glow green under the water. Along the far wall stands a steel parts locker, its door ajar, with a box of fuses on its top shelf. The stairwell climbs back up to the Lab Wing.

## If not shellback_fed and not shellback_defeated
Between you and the locker, a mangrove crab the size of a dinner table rises out of the water. Its claws are thicker than your arm. It clicks them, slowly, and doesn't move.

## If shellback_fed and not shellback_defeated
The Shellback has backed into a corner and is busily working at a tin with its claws. It ignores you completely.

## If shellback_defeated
The lab is quiet. The water slops gently around the locker.

## Details
- The locker: the spare pump fuse is in the box on the top shelf.
- Taking the fuse while the Shellback is neither fed nor defeated: `check agility 14`. On a failure the crab lunges: `hurt 1d4`, and the player doesn't get the fuse this time.
