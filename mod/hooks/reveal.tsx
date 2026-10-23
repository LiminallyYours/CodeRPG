// A surface module (a `Client`): draws rows of styled text revealing themselves once, on the terminal's
// own frame clock, then holds still. Two ways in: typing (the title card) and line by line (an ending
// card). The frame logic is pure and exported for tests.

import type { ClientModule } from 'claude-code'

/** A run of styled text: text, color, background, bold, dim. Short keys keep the props small. */
export type Seg = { t: string; c?: string; bg?: string; b?: boolean; d?: boolean }
export type RevealMode = 'type' | 'lines'
export type RevealProps = { rows: Seg[][]; mode: RevealMode; ms: number; align?: 'center' | 'left' }
type State = { t: number }

export const FRAME_MS = 16

function rowLength(row: Seg[]): number {
  return row.reduce((n, s) => n + s.t.length, 0)
}

/** The first `n` cells of a row (the rest left off). */
function take(row: Seg[], n: number): Seg[] {
  const out: Seg[] = []
  let left = n
  for (const s of row) {
    if (left <= 0) break
    out.push(s.t.length <= left ? s : { ...s, t: s.t.slice(0, left) })
    left -= s.t.length
  }
  return out
}

/** The rows as they stand `t` ms into a reveal lasting `ms`. Past the end, the rows whole. */
export function revealFrame(rows: Seg[][], mode: RevealMode, t: number, ms: number): Seg[][] {
  const f = ms <= 0 ? 1 : Math.max(0, Math.min(1, t / ms))
  if (f >= 1) return rows
  if (mode === 'lines') return rows.slice(0, Math.ceil(f * rows.length))
  // typing: characters appear in reading order, row by row
  let left = Math.floor(f * rows.reduce((n, r) => n + rowLength(r), 0))
  return rows.map(r => {
    const n = Math.min(left, rowLength(r))
    left -= n
    return take(r, n)
  })
}

const Reveal: ClientModule<RevealProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ t: 0 })
    const stop = surface.every(FRAME_MS, () => {
      const t = (surface.state?.t ?? 0) + FRAME_MS
      surface.setState({ t })
      if (t >= props.ms) stop()
    })
  }
  const rows = revealFrame(props.rows, props.mode, surface.state?.t ?? 0, props.ms)
  return (
    <Box flexDirection="column" alignItems={props.align === 'left' ? 'flex-start' : 'center'}>
      {props.rows.map((_, i) => (
        <Box flexDirection="row">
          {(rows[i] ?? [{ t: ' ' }]).map(s => (
            <Text color={s.c} backgroundColor={s.bg} bold={s.b} dimColor={s.d}>{s.t || ' '}</Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default Reveal
