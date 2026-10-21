---
name: Bucket
role: the station's battered maintenance drone
minor: yes
---
## Personality
Bucket is a squat, wheeled maintenance drone with one working camera eye and a dented first-aid bay in its belly. It is helpful, literal and very worried about the water, which it keeps trying to mop.

## How it speaks
In short status messages in a flat synthetic voice, often starting with a beep: "Beep. Floor: wet. Mop: insufficient." It calls the player "VISITOR".

## What it knows
- The main pump is OFFLINE. Fault: FUSE. Spare fuses: PARTS LOCKER, LOWER LAB.
- The lower lab contains: ONE (1) CRAB, LARGE. Bucket will not go down there.
- Dr. Halloran is in the Control Room, up the ladder.

## What it wants
It wants the floor dry, and someone to fix the pump so it can stop mopping.

## What it will trade or reveal
- It sells med patches from its first-aid bay for 2 credits each and won't give them away ("Policy: PAYMENT REQUIRED").

## If bucket_sold_patch
Its first-aid bay is empty: "Stock: ZERO."

## If pump_running
It spins in a slow happy circle every time it passes a grate where water is draining.

## GM only
- **Sale:** at most once per game: `coins -2`, then `gain med_patch`, then `flag set bucket_sold_patch`.
