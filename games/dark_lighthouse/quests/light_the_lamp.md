---
name: Light the Lamp
giver: ysolde
started_by: lamp_quest_started
completed_by: lamp_lit and not fleet_lost
failed_by: fleet_lost
objectives:
  - Find out why the lighthouse is dark. (done when lamp_quest_started or met_grukk or lamp_lit)
  - Find whoever took the lens. (done when met_grukk or lamp_lit)
  - Get past the troll on Greywater Bridge. (done when grukk_friend or grukk_cowed or grukk_defeated)
  - Recover the brass lens. (done when has_brass_lens or lamp_lit)
  - Bring the lens back to Ysolde. (done when lamp_lit)
---
## Summary
Someone has stolen the brass lens from the Saltmere lighthouse, and the fishing fleet is due home through the rocks. The keeper, Ysolde, needs it back.

## Stages
1. **Hear the problem.** Talk to Ysolde in the lighthouse. Sets `lamp_quest_started`. The player can do the rest before this flag is set, and the quest still completes.
2. **Find the thief.** Clues point east: Ysolde's glimpse of a hunched shape, footprints on the coast road, and Pell's gossip about the troll. The lens is in Grukk's hollow beneath Greywater Bridge.
3. **Get past Grukk.** There are three branches, each with its own flag (see Grukk's character file):
   - `grukk_friend`: bribed with his favourite treat (a honey cake or a smoked fish; it differs each game)
   - `grukk_cowed`: frightened off with a Might check
   - `grukk_defeated`: beaten in combat
4. **Recover the lens.** Take `brass_lens` from the Troll's Hollow.
5. **Return it.** Give the lens to Ysolde. Sets `lamp_lit` and she pays 5 coins. The quest is complete.

## The clock
The fleet comes home after a number of moves rolled at the start of each game. If the lamp isn't lit by then, `fleet_lost` is set and the quest has failed. The player can still return the lens, but nothing brings back the lost boats.

## Endings
Narrate whichever single ending matches the flags when `lamp_lit` or `fleet_lost` is set.

### If fleet_lost
The fleet came home through the rocks in the dark. Some boats made it; some didn't. Saltmere will remember this night, and so will you. Whatever happens with the lens now, it's too late for them.

### If lamp_lit and grukk_friend and not fleet_lost
The beam sweeps out across the water. Late that night the first boats come in safely, and so does a very large guest. Grukk has followed the player to the village, and the children are feeding him treats in the square. Saltmere has a new, strange friend.

### If lamp_lit and grukk_cowed and not fleet_lost
The beam sweeps out across the water, and the boats come home safely. Under Greywater Bridge, a troll sulks over his smaller hoard. For a long while he grumbles at every traveller, but he does nothing worse.

### If lamp_lit and grukk_defeated and not fleet_lost
The beam sweeps out across the water, and the boats come home safely. Saltmere cheers. Upriver, a wounded troll licks his wounds and remembers your face.

## After the ending
The adventure is over. Tell the player that they finished *The Dark Lighthouse* and that they can explore freely or type `/newgame` to play again and try another branch.
