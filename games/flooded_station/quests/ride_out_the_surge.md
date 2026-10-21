---
name: Ride Out the Surge
giver: halloran
started_by: halloran_briefed
completed_by: pump_running and not station_lost or evacuated
failed_by: station_lost and not evacuated
objectives:
  - Find out why the station went silent. (done when halloran_briefed or has_spare_fuse or pump_running or evacuated)
  - Get the spare fuse, or talk Dr. Halloran into leaving. (done when has_spare_fuse or halloran_agrees or pump_running or evacuated)
  - Restart the pump, or get Dr. Halloran onto the skiff. (done when pump_running or evacuated)
---
## Summary
The storm surge has flooded Tidewell Station and blown the fuse on its main pump. The next high tide will drown it. The player can save the station by restarting the pump, or save Dr. Halloran by getting her to leave on the skiff.

## Stages
1. **Find out what's wrong.** The control room's panel, Bucket and Dr. Halloran all say the pump fuse has blown and the spares are in the Drowned Lab. Talking it through with Halloran sets `halloran_briefed`, but the quest can be finished without it.
2. **Choose a branch.** There are two, each with its own flag:
   - `pump_running`: get the spare fuse past the Shellback (feed it the sardines, fight it, or snatch the fuse with a hard Agility check) and fit it in the Pump Room;
   - `evacuated`: persuade Halloran to leave (see her character file), then board the skiff with her at the landing.
3. **Beat the tide.** The tide peaks after a number of moves rolled at the start of each game. If neither flag is set by then, `station_lost` is set and the quest has failed.

## Endings
Narrate whichever single ending matches the flags.

### If pump_running and not station_lost
The tide peaks and turns, and the water never reaches the Common Deck. Halloran watches the gauge fall with tears she pretends are rain. Tidewell Station will be answering the radio again by morning.

### If evacuated
The skiff pulls away across the grey water with Halloran hunched over her cooler of specimens. Behind you, the tide climbs the station's stilts. Whatever happens to it now, its last researcher is alive.

### If station_lost and not evacuated
The tide peaks with the pump still silent. The sea fills the lower decks, then the Common Deck, then the stair. You and Halloran spend a long, cold night in the Control Room, and are lifted off by the mainland boat at dawn. The station is gone.

## After the ending
The adventure is over. Tell the player that they finished *The Flooded Station* and that they can explore freely or type `/newgame` to play again and try the other branch.
