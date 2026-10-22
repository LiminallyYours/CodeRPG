// The map as colored tiles: each room a block filled with its terrain's colors (from the game's look),
// its name on the middle row, links between neighbours, the player's room marked, rooms heard of but not
// visited drawn dim. Pure: the save's map in, a grid of cells out. tilemap.tsx animates it.

import type { CoderpgLook, CoderpgSave } from '../types'
import { fit, labelOf, layout, STEP } from './map'

type RoomMap = NonNullable<CoderpgSave['map']>
/** What a cell is: the player's marker, a moving tile (water), a still tile, a link, or nothing. */
export type TileKind = 'mark' | 'move' | 'tile' | 'link' | 'blank'
export type TileCell = { ch: string; fg?: string; bg?: string; k: TileKind; b?: boolean; d?: boolean }

const UNKNOWN = { bg: '#2b2b30', fg: '#8a8a92' }
const GAP_X = 2

/** The terrain's colors for a visited room: its own `color`, else its terrain's, else the first terrain's. */
function colorsOf(map: RoomMap, id: string, look: CoderpgLook): { bg: string; fg: string; moves: boolean } {
  const room = map[id]
  const kinds = look.terrain ?? {}
  const t = (room?.terrain && kinds[room.terrain]) || Object.values(kinds)[0] || { bg: '#4a4a52', fg: '#e2e2e6', moves: false }
  return { bg: room?.color ?? t.bg, fg: t.fg, moves: t.moves === true }
}

/** The tiles, at most `columns` wide. Empty before the player has been anywhere. */
export function tileGrid(map: RoomMap, here: string, columns: number, look: CoderpgLook): TileCell[][] {
  if (!map[here]) return []
  const pos = layout(map, here)
  const xs = [...pos.values()].map(p => p[0]), ys = [...pos.values()].map(p => p[1])
  const minX = Math.min(...xs), minY = Math.min(...ys)
  const cols = Math.max(...xs) - minX + 1, rows = Math.max(...ys) - minY + 1
  // tiles share one width: as wide as the longest label allows, shortened to first words, then cut
  const longest = (short: boolean) => Math.max(3, ...[...pos.keys()].map(id => labelOf(map, id, short).length))
  const fits = (inner: number) => cols * (inner + 2) + GAP_X * (cols - 1) <= columns
  const short = !fits(longest(false))
  let inner = longest(short)
  while (inner > 3 && !fits(inner)) inner--
  const tileW = inner + 2
  const width = cols * tileW + GAP_X * (cols - 1)
  const height = rows * 3 + (rows - 1)
  const grid: TileCell[][] = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ', k: 'blank' as TileKind })))
  const put = (x: number, y: number, cell: TileCell) => {
    if (y >= 0 && y < height && x >= 0 && x < width) grid[y]![x] = cell
  }

  for (const [id, [gx, gy]] of pos) {
    const x0 = (gx - minX) * (tileW + GAP_X), y0 = (gy - minY) * 4
    const known = map[id] !== undefined
    const { bg, fg, moves } = known ? colorsOf(map, id, look) : { ...UNKNOWN, moves: false }
    const label = fit(labelOf(map, id, short, inner), inner)
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < tileW; dx++) {
        const ch = dy === 1 && dx >= 1 && dx <= inner ? label[dx - 1]! : ' '
        const isLabel = dy === 1 && ch !== ' '
        put(x0 + dx, y0 + dy, { ch, fg, bg, k: moves && !isLabel ? 'move' : 'tile', b: isLabel && id === here, d: !known })
      }
    }
    if (id === here) put(x0, y0, { ch: '◆', fg: look.palette.accent, bg, k: 'mark', b: true })
  }

  for (const [id, r] of Object.entries(map)) {
    const a = pos.get(id)
    if (!a) continue
    for (const [dir, dest] of Object.entries(r.exits)) {
      const b = pos.get(dest), step = STEP[dir]
      if (!b || !step || b[0] !== a[0] + step[0] || b[1] !== a[1] + step[1]) continue
      if (a[1] === b[1]) {
        const x = (Math.min(a[0], b[0]) - minX) * (tileW + GAP_X) + tileW
        for (let g = 0; g < GAP_X; g++) put(x + g, (a[1] - minY) * 4 + 1, { ch: '─', k: 'link', d: true })
      } else if (a[0] === b[0]) {
        const x = (a[0] - minX) * (tileW + GAP_X) + Math.floor(tileW / 2)
        put(x, (Math.min(a[1], b[1]) - minY) * 4 + 3, { ch: dir === 'up' || dir === 'down' ? '┊' : '│', k: 'link', d: true })
      }
    }
  }
  return grid
}

const WAVES = ['~', ' ', '≈', ' ', ' ']

/**
 * The grid as it shows on animation frame `frame`: moving tiles ripple (a wave glyph drifting across)
 * and the player's marker blinks.
 */
export function tilesAt(grid: TileCell[][], frame: number): TileCell[][] {
  return grid.map((row, y) => row.map((cell, x) => {
    if (cell.k === 'move') return { ...cell, ch: WAVES[(x + y * 2 + frame) % WAVES.length]! }
    if (cell.k === 'mark') return frame % 2 === 0 ? cell : { ...cell, ch: '◇' }
    return cell
  }))
}

/** Runs of cells with the same look, ready to draw as Text. */
export function runsOf(row: TileCell[]): TileCell[] {
  const out: TileCell[] = []
  for (const c of row) {
    const last = out[out.length - 1]
    if (last && last.fg === c.fg && last.bg === c.bg && last.b === c.b && last.d === c.d) last.ch += c.ch
    else out.push({ ...c })
  }
  return out
}
