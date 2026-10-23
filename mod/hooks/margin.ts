// The margin: the docked pane's six sections (where, you, at stake, act, carrying, more). Pure helpers for
// its rows; register.tsx draws them. Quiet until it changes: numbers and bars are grey, a value the last play
// turn changed takes a color until the next one ends, and red is for danger only.

import type { CoderpgLook, CoderpgMarks, CoderpgPicture, CoderpgSave } from '../types'

/** The body columns the pane asks the dock for. */
export const MARGIN_COLUMNS = 58
/** Columns kept clear on each side of the margin's body. */
export const MARGIN_PAD = 3
/** Kit colors: rules and empty bar cells, filled bar cells, and the clock's muted accent. */
export const FAINT = '#3a3d46'
export const BAR_GREY = '#767269'
export const MUTED_ACCENT = '#a47f3c'
/** Cells in a status bar. */
export const BAR_CELLS = 16
/** The room picture's box: 44 cells wide, two pixels to a cell. */
export const PICTURE_COLUMNS = 44
/** Its heights in rows, tallest (the whole picture) first; a short dock crops it to its middle before it goes. */
export const PICTURE_STEPS = [14, 10, 7]

/** A run of styled text in one row; lengths are counted in cells. */
export type Cell = { text: string; color?: string; dim?: boolean; bold?: boolean; italic?: boolean }

/** A section rule: the label dim and bold, then a faint line to the edge, with any note (a count) at its end. */
export function ruleCells(label: string, width: number, note?: string): Cell[] {
  const tail = note ? ` ${note}` : ''
  return [
    { text: label, dim: true, bold: true },
    { text: ' ' + '─'.repeat(Math.max(1, width - label.length - 1 - tail.length)), color: FAINT },
    ...(note ? [{ text: tail, dim: true }] : []),
  ]
}

/** "Dusk. Sea fog over the quay.": the time of day and the weather as one sentence, or whichever there is. */
export function conditions(time: string | null | undefined, weather: string | null | undefined): string | undefined {
  const parts = [time, weather].filter((x): x is string => !!x && !!x.trim())
  if (!parts.length) return undefined
  return parts.map(p => {
    const t = p.trim()
    return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?…]$/.test(t) ? '' : '.')
  }).join(' ')
}

/** A label cut to `width` cells, ending in '…' when it had to be. */
function cut(text: string, width: number): string {
  return text.length <= width ? text : text.slice(0, Math.max(0, width - 1)) + '…'
}

/** A status bar: filled cells and empty ones, `cells` in all (BAR_CELLS, fewer in a narrow pane). */
export function barCells(value: number, max: number, color = BAR_GREY, cells = BAR_CELLS): Cell[] {
  const on = max > 0 ? Math.max(0, Math.min(cells, Math.round((value / max) * cells))) : 0
  return [{ text: '▇'.repeat(on), color }, { text: '▇'.repeat(cells - on), color: FAINT }]
}

/** How many cells a status bar gets in a margin `width` wide: BAR_CELLS, or what's left after the number. */
export function barWidth(width: number): number {
  return Math.max(4, Math.min(BAR_CELLS, width - 19))
}

/**
 * One row of YOU: a 2-cell glyph, a 10-cell dim label, a 7-cell number, then the bar where the value has a
 * maximum. `color` takes the glyph, number and bar (danger, or the turn's change); `after` follows the number.
 */
export function statusRow(glyph: string, label: string, value: number, max: number | undefined, color?: string, after?: string, cells = BAR_CELLS): Cell[] {
  const number = (max === undefined ? `${value}` : `${value}/${max}`) + (after ? ` ${after}` : '')
  return [
    { text: `${glyph} `.slice(0, 2).padEnd(2), color },
    { text: cut(label, 9).padEnd(10), dim: true },
    { text: max === undefined ? number : number.length < 7 ? number.padEnd(7) : `${number} `, color },
    ...(max === undefined ? [] : barCells(value, max, color ?? BAR_GREY, cells)),
  ]
}

/** The upper-half block: its foreground is a cell's top pixel, its background the bottom one. */
const UPPER_HALF = 0x2580
const pictureCache = new Map<string, string>()

/** A Raster's cells, as its `cells` prop wants them: little-endian u32 triplets [glyph, foreground, background]. */
function packCells(words: Uint32Array): string {
  return (new Uint8Array(words.buffer) as Uint8Array & { toBase64(): string }).toBase64()
}

/**
 * A room picture as Raster cells, `columns` wide and `rows` tall (its middle, when the box is narrower or
 * shorter than the picture), worked out once per picture and size.
 */
export function pictureCells(p: CoderpgPicture, columns: number, rows = Math.floor(p.height / 2)): string {
  const key = `${p.source}|${p.stamp}|${columns}|${rows}`
  const known = pictureCache.get(key)
  if (known) return known
  const rgb = (Uint8Array as unknown as { fromBase64(s: string): Uint8Array }).fromBase64(p.rgb)
  const cut = Math.max(0, Math.floor((p.width - columns) / 2))
  const top = Math.max(0, Math.floor((Math.floor(p.height / 2) - rows) / 2))
  const words = new Uint32Array(columns * rows * 3)
  const at = (x: number, y: number) => {
    const i = (y * p.width + x) * 3
    return ((rgb[i] ?? 0) << 16) | ((rgb[i + 1] ?? 0) << 8) | (rgb[i + 2] ?? 0)
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = Math.min(p.width - 1, c + cut), k = (r * columns + c) * 3
      words[k] = UPPER_HALF
      words[k + 1] = at(x, (r + top) * 2)
      words[k + 2] = at(x, (r + top) * 2 + 1)
    }
  }
  const cells = packCells(words)
  if (pictureCache.size > 32) pictureCache.clear()
  pictureCache.set(key, cells)
  return cells
}

/**
 * A room with no picture, drawn as a field in its terrain's map colors: the background, with a sparse pattern in
 * the foreground (ripples where the terrain moves, specks elsewhere) placed by the room's id, so it stays put.
 */
export function fieldCells(colors: { bg: string; fg: string; moves?: boolean }, id: string, columns: number, rows: number): string {
  const hex = (c: string) => parseInt(c.replace('#', ''), 16) || 0
  const bg = hex(colors.bg), fg = hex(colors.fg)
  let seed = [...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7)
  const words = new Uint32Array(columns * rows * 3)
  for (let i = 0; i < columns * rows; i++) {
    seed = (seed * 1103515245 + 12345) >>> 0
    const mark = (seed >>> 16) % 11 === 0
    words[i * 3] = mark ? (colors.moves ? 0x7e : 0xb7) : 0x20   // '~' or '·', else a space
    words[i * 3 + 1] = fg
    words[i * 3 + 2] = bg
  }
  return packCells(words)
}

/** The color a value's row takes: up in the heal color, down in amber, for the turn it changed. */
export function changeColor(way: 'up' | 'down' | undefined, look: CoderpgLook): string | undefined {
  return way === 'up' ? look.palette.heal : way === 'down' ? look.palette.warn : undefined
}

/** Health's color: red or the heal color for the turn it changed, red while it's at a quarter or less. */
export function healthColor(s: CoderpgSave, marks: CoderpgMarks | null | undefined, look: CoderpgLook): string | undefined {
  if (marks?.hp === 'hurt') return look.palette.bad
  if (marks?.hp === 'heal') return look.palette.heal
  return s.stats.hp * 4 <= s.stats.max_hp ? look.palette.bad : undefined
}

/** The meter's color: red when spent, else the turn's change, else amber while low. */
export function meterTint(state: string | undefined, marks: CoderpgMarks | null | undefined, look: CoderpgLook): string | undefined {
  if (state === 'spent') return look.palette.bad
  return changeColor(marks?.meter, look) ?? (state === 'low' ? look.palette.warn : undefined)
}

/** The clock's segments: [lit, spent], scaled down when there are more moves than fit in `width`. */
export function clockSegments(left: number, total: number, width: number): [number, number] {
  const all = Math.max(0, Math.min(total, width))
  const lit = total > 0 ? Math.max(0, Math.min(all, Math.round((Math.max(0, left) / total) * all))) : 0
  return [lit, all - lit]
}

/** The objectives still in play: each open quest's current objective, the main quest's first. */
export function openObjectives(s: CoderpgSave): { text: string; side: boolean }[] {
  const quests = [...(s.view?.quests ?? [])].sort((a, b) => Number(a.side ?? false) - Number(b.side ?? false))
  const out: { text: string; side: boolean }[] = []
  for (const q of quests) {
    if (q.complete || q.failed) continue
    const o = q.objectives.find(x => !x.done)
    if (o) out.push({ text: o.text, side: !!q.side })
  }
  return out
}

/** What the player carries, one row per kind of thing: identical items stacked, with their notes. */
export function carried(s: CoderpgSave): { id: string; name: string; count: number; equipped: boolean; own: boolean }[] {
  const items = s.view?.items ?? s.inventory.map(id => ({ id, name: id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '), equipped: id === s.equipped }))
  const out: { id: string; name: string; count: number; equipped: boolean; own: boolean }[] = []
  for (const it of items) {
    const same = out.find(o => o.id === it.id)
    if (same) { same.count++; same.equipped ||= it.equipped; continue }
    out.push({ id: it.id, name: it.name, count: 1, equipped: it.equipped, own: !!(it as { own?: boolean }).own })
  }
  return out
}

/**
 * What fits in a docked pane `rows` tall. At each of the picture's heights in turn (`art`, tallest first, then
 * none): every carried item, else as many as leave a row for "+N more" (one at least). So the list gives way
 * first, then the picture shrinks to its middle, then it goes. `fixed` is every other row of the margin.
 */
export function fitMargin(rows: number, fixed: number, art: number[], items: number): { items: number; more: number; art: number } {
  const fits = (a: number, n: number, more: boolean) => fixed + a + Math.max(1, n) + (more ? 1 : 0) <= rows
  for (const a of [...art.filter(x => x > 0), 0]) {
    if (fits(a, items, false)) return { items, more: 0, art: a }
    for (let n = items - 1; n >= 1; n--) if (fits(a, n, true)) return { items: n, more: items - n, art: a }
  }
  return { items: Math.min(items, 1), more: Math.max(0, items - 1), art: 0 }
}
