// Draws the explored rooms from the save's `map` as boxes on a character canvas,
// plus the list of exits from the player's room.
// Pure functions: no engine calls, so they're easy to test.

import type { CoderpgSave } from '../types'

type RoomMap = NonNullable<CoderpgSave['map']>
export type Kind = 'here' | 'room' | 'unknown' | 'link' | 'blank'
export type Seg = { text: string; kind: Kind }
export type Exit = { dir: string; name: string; isExplored: boolean }

export const STEP: Record<string, [number, number]> = {
  north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0],
  up: [0, -1], down: [0, 1],
  northeast: [1, -1], northwest: [-1, -1], southeast: [1, 1], southwest: [-1, 1],
}
const DIR_ORDER = ['north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down']

// Box borders: corners and edges [tl, tr, bl, br, horizontal, vertical]
const BORDER: Record<'here' | 'room' | 'unknown', string[]> = {
  here: ['╔', '╗', '╚', '╝', '═', '║'],
  room: ['╭', '╮', '╰', '╯', '─', '│'],
  unknown: ['╭', '╮', '╰', '╯', '┄', '┆'],
}

/** Place every room reachable from `start` through recorded exits. Rooms that would collide are left off. */
export function layout(map: RoomMap, start: string): Map<string, [number, number]> {
  const pos = new Map<string, [number, number]>([[start, [0, 0]]])
  const taken = new Set(['0,0'])
  const queue = [start]
  while (queue.length) {
    const id = queue.shift()!
    const at = pos.get(id)!
    for (const [dir, dest] of Object.entries(map[id]?.exits ?? {})) {
      const step = STEP[dir]
      if (!step || pos.has(dest)) continue
      const p: [number, number] = [at[0] + step[0], at[1] + step[1]]
      if (taken.has(`${p[0]},${p[1]}`)) continue
      pos.set(dest, p)
      taken.add(`${p[0]},${p[1]}`)
      if (map[dest]) queue.push(dest)
    }
  }
  return pos
}

/** A room's name if it has been visited, or if a visited room's exit has named it; else undefined. */
export function knownName(map: RoomMap, id: string): string | undefined {
  if (map[id]) return map[id]!.name
  for (const r of Object.values(map)) if (r.neighbors?.[id]) return r.neighbors[id]
  return undefined
}

/** The exits from the player's room, with where they lead when known. */
export function exitsOf(map: RoomMap, here: string): Exit[] {
  const exits = Object.entries(map[here]?.exits ?? {})
  exits.sort((a, b) => DIR_ORDER.indexOf(a[0]) - DIR_ORDER.indexOf(b[0]))
  return exits.map(([dir, dest]) => ({ dir, name: knownName(map, dest) ?? 'unexplored', isExplored: map[dest] !== undefined }))
}

function trimName(name: string): string {
  return name.replace(/^The /, '')
}

export function fit(text: string, width: number): string {
  const cut = text.length > width ? text.slice(0, Math.max(1, width - 1)) + '…' : text
  const left = Math.floor((width - cut.length) / 2)
  return ' '.repeat(left) + cut + ' '.repeat(width - cut.length - left)
}

/** A room's label at one level of shortening: full name, first word, or cut to `max`. */
export function labelOf(map: RoomMap, id: string, short: boolean, max = Infinity): string {
  const known = knownName(map, id)
  if (known === undefined) return '?'
  const name = trimName(known)
  const text = short ? (name.split(' ')[0] ?? name) : name
  return text.length > max ? text.slice(0, Math.max(1, max - 1)) + '…' : text
}

/**
 * Draw the map as rows of colour-tagged segments, at most `columns` wide.
 * Each grid column is as wide as its longest label. To fit, it first tightens padding
 * and gaps, then uses first words ("Harbor"), and only then cuts names.
 */
export function drawMap(map: RoomMap, here: string, columns: number): Seg[][] {
  if (!map[here]) return []
  const pos = layout(map, here)
  const xs = [...pos.values()].map(p => p[0])
  const ys = [...pos.values()].map(p => p[1])
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  const cols = maxX - minX + 1, rows = maxY - minY + 1
  const idsIn = (c: number) => [...pos].filter(([, p]) => p[0] - minX === c).map(([id]) => id)

  const tiers = [
    { short: false, pad: 1, gap: 2 }, { short: false, pad: 0, gap: 1 },
    { short: true, pad: 1, gap: 2 }, { short: true, pad: 0, gap: 1 },
  ]
  let pick = { short: true, pad: 0, gap: 1, inner: [] as number[] }
  for (const t of tiers) {
    const inner = Array.from({ length: cols }, (_, c) => Math.max(1, ...idsIn(c).map(id => labelOf(map, id, t.short).length)))
    const total = inner.reduce((a, w) => a + w + 2 + 2 * t.pad, 0) + t.gap * (cols - 1)
    pick = { ...t, inner }
    if (total <= columns) break
  }
  // still too wide: shave the widest columns, never below 3
  const total = () => pick.inner.reduce((a, w) => a + w + 2 + 2 * pick.pad, 0) + pick.gap * (cols - 1)
  while (total() > columns) {
    const widest = Math.max(...pick.inner)
    if (widest <= 3) break
    pick.inner[pick.inner.indexOf(widest)] = widest - 1
  }

  const boxW = pick.inner.map(w => w + 2 + 2 * pick.pad)
  const colX: number[] = []
  boxW.forEach((w, c) => colX.push(c === 0 ? 0 : colX[c - 1]! + boxW[c - 1]! + pick.gap))
  const width = total()
  const height = rows * 3 + (rows - 1)

  const canvas: { ch: string; kind: Kind }[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({ ch: ' ', kind: 'blank' as Kind })))
  const put = (x: number, y: number, ch: string, kind: Kind) => {
    const row = canvas[y]
    if (row && x >= 0 && x < width) row[x] = { ch, kind }
  }

  for (const [id, [gx, gy]] of pos) {
    const c = gx - minX
    const kind = id === here ? 'here' : map[id] ? 'room' : 'unknown'
    const [tl, tr, bl, br, hz, vt] = BORDER[kind]
    const x0 = colX[c]!, y0 = (gy - minY) * 4, w = boxW[c]!
    put(x0, y0, tl!, kind); put(x0 + w - 1, y0, tr!, kind)
    put(x0, y0 + 2, bl!, kind); put(x0 + w - 1, y0 + 2, br!, kind)
    for (let x = 1; x < w - 1; x++) { put(x0 + x, y0, hz!, kind); put(x0 + x, y0 + 2, hz!, kind) }
    put(x0, y0 + 1, vt!, kind); put(x0 + w - 1, y0 + 1, vt!, kind)
    const text = fit(labelOf(map, id, pick.short, pick.inner[c]), w - 2)
    for (let i = 0; i < text.length; i++) put(x0 + 1 + i, y0 + 1, text[i]!, kind)
  }

  // connections between neighbouring boxes
  for (const [id, r] of Object.entries(map)) {
    const a = pos.get(id)
    if (!a) continue
    for (const [dir, dest] of Object.entries(r.exits)) {
      const b = pos.get(dest), step = STEP[dir]
      if (!b || !step || b[0] !== a[0] + step[0] || b[1] !== a[1] + step[1]) continue
      if (a[1] === b[1]) {
        const c = Math.min(a[0], b[0]) - minX
        for (let g = 0; g < pick.gap; g++) put(colX[c]! + boxW[c]! + g, (a[1] - minY) * 4 + 1, '─', 'link')
      } else if (a[0] === b[0]) {
        const c = a[0] - minX
        put(colX[c]! + Math.floor(boxW[c]! / 2), (Math.min(a[1], b[1]) - minY) * 4 + 3, dir === 'up' || dir === 'down' ? '┊' : '│', 'link')
      }
    }
  }

  return canvas.map(row => {
    const segs: Seg[] = []
    for (const cell of row) {
      const last = segs[segs.length - 1]
      if (last && last.kind === cell.kind) last.text += cell.ch
      else segs.push({ text: cell.ch, kind: cell.kind })
    }
    return segs
  })
}

/** The map as plain text lines (for /map). */
export function mapText(map: RoomMap, here: string, columns: number): string[] {
  return drawMap(map, here, columns).map(row => row.map(s => s.text).join('').trimEnd())
}

/** Whether any recorded exit goes up or down, so the key needs to explain the dotted line. */
export function usesUpDown(map: RoomMap): boolean {
  return Object.values(map).some(r => 'up' in r.exits || 'down' in r.exits)
}

/**
 * The map key, drawn as small complete boxes in the map's own styles, side by side when they fit
 * in `columns`, otherwise stacked.
 */
export function drawKey(columns: number, upDown: boolean): Seg[][] {
  const sample = (label: string, kind: 'here' | 'room' | 'unknown') => {
    const [tl, tr, bl, br, hz, vt] = BORDER[kind]
    const w = label.length + 2
    return [`${tl}${hz!.repeat(w)}${tr}`, `${vt} ${label} ${vt}`, `${bl}${hz!.repeat(w)}${br}`].map(text => ({ text, kind }) as Seg)
  }
  const boxes = [sample('you', 'here'), sample('visited', 'room'), sample('not visited yet', 'unknown')]
  const across = boxes.reduce((n, b) => n + b[0]!.text.length, 0) + 2 * (boxes.length - 1)
  const rows: Seg[][] = []
  if (across <= columns) {
    for (let i = 0; i < 3; i++) {
      const row: Seg[] = []
      boxes.forEach((b, j) => { if (j) row.push({ text: '  ', kind: 'blank' }); row.push(b[i]!) })
      rows.push(row)
    }
  } else {
    for (const b of boxes) rows.push(...b.map(seg => [seg]))
  }
  if (upDown) rows.push([{ text: '┊', kind: 'link' }, { text: ' stairs or a path up or down', kind: 'blank' }])
  return rows
}

/** The map key as plain text lines (for /map). */
export function keyText(columns: number, upDown: boolean): string[] {
  return drawKey(columns, upDown).map(row => row.map(s => s.text).join('').trimEnd())
}
