---
name: The Mopping Dispute
with:
  - bucket
  - halloran
where: control_room
when: bucket_upstairs and not halloran_dozing and not station_lost
reward: coins 1
chronicle: Refereed an argument between Bucket and Dr. Halloran over whether a puddle was evidence.
---
## How it starts
Bucket is mopping a slow circle toward the puddle under the console, and Dr. Halloran has planted her boot squarely in the middle of it. "Don't," she says. Bucket's camera eye whirs.

## Premise
In the Control Room, Bucket the maintenance drone wants to mop the puddle under the console. Dr. Halloran won't let it: the water came in through a hull seam and she wants a sample first, and besides, she has had enough of being tidied around. Neither will give way. The player is there, and may referee, take a side, or just watch.

## bucket
Floor: WET. Policy: MOP. You cite regulations that may not exist ("STATION RULE 14: PUDDLES ARE HAZARDS"). You are polite, literal and immovable, though you can be talked into a compromise if it's put to you as procedure.

## halloran
That puddle is evidence: you want a sample of it before anything mops it up. You're exhausted, and arguing with a mop is somehow the last straw. Dry humour, rising exasperation. You can be talked into a compromise if you get to keep your sample.

## How it ends
It ends when they reach a compromise, when one of them gives up, or with the last reply. If the player brokers a compromise (a sample jar first and then the mop, say, or one designated evidence puddle), Bucket dispenses a credit from its cash slot "for arbitration services": `scene end mopping_dispute reward`. Otherwise, `scene end mopping_dispute`.
