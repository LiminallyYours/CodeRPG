// A surface module (a `Client`): the tile map, alive. Water ripples and the player's marker blinks, a few
// frames a second, only while the map is on screen (the instance runs only while it's drawn).

import type { ClientModule } from 'claude-code'

import type { TileCell } from './tiles'
import { runsOf, tilesAt } from './tiles'

export type TileMapProps = { grid: TileCell[][] }
type State = { frame: number }

export const TILE_FRAME_MS = 300

const TileMap: ClientModule<TileMapProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ frame: 0 })
    surface.every(TILE_FRAME_MS, () => surface.setState({ frame: (surface.state?.frame ?? 0) + 1 }))
  }
  return (
    <Box flexDirection="column">
      {tilesAt(props.grid, surface.state?.frame ?? 0).map(row => (
        <Box flexDirection="row">
          {runsOf(row).map(c => <Text color={c.fg} backgroundColor={c.bg} bold={c.b} dimColor={c.d}>{c.ch}</Text>)}
        </Box>
      ))}
    </Box>
  )
}

export default TileMap
