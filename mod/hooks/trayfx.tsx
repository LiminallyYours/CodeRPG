// A surface module (a `Client`): the dice tray, animated once. The dice tumble briefly before each result
// shows; in a fight, both sides' health bars sit on one line, drain to their new values with a flash, and
// each blow's damage number rises above its bar and fades. Then it holds still. Frame logic is pure.

import type { ClientModule } from 'claude-code'

import type { Seg } from './reveal'

/** One side of a fight: its name, health before and after this exchange, and the damage it took. */
export type Side = { name: string; was: number; hp: number; max: number; dmg: number }
/** One tray line: its icon, text, the result word if any, and the colors to draw them in. */
export type FxLine = { icon: string; text: string; result?: string; tone: 'good' | 'bad' | 'neutral' }
export type FxColors = { accent: string; good: string; bad: string; heal: string }
export type TrayFxProps = { lines: FxLine[]; you?: Side; foe?: Side; colors: FxColors; barWidth?: number }
type State = { t: number }

export const TUMBLE_MS = 320 // the dice tumble
export const DRAIN_MS = 300 // then the bars drain
export const NUMBER_MS = 700 // the damage numbers rise and fade over this long
export const FX_MS = TUMBLE_MS + DRAIN_MS + NUMBER_MS
const FRAME_MS = 40

/** The face a tumbling die shows at time `t`: it changes every frame or two, deterministically. */
export function tumbleFace(t: number, salt: number): number {
  return ((Math.floor(t / 45) * 7 + salt * 13) % 20) + 1
}

/** A tray line as it reads at `t`: while tumbling, the die's face cycles and the result is hidden. */
export function lineAt(line: FxLine, t: number, salt: number): FxLine {
  if (t >= TUMBLE_MS || !/d20 \d+/.test(line.text)) return line
  const face = tumbleFace(t, salt)
  return { ...line, text: line.text.replace(/d20 \d+.*$/, `d20 ${face}`), result: undefined }
}

/** A side's health as its bar shows it at `t`: the old value until the tumble ends, then draining. */
export function hpAt(side: Side, t: number): number {
  const f = Math.max(0, Math.min(1, (t - TUMBLE_MS) / DRAIN_MS))
  return Math.round(side.was + (side.hp - side.was) * f)
}

/** How a damage number shows at `t`: 'low' (beside the bar), 'high' (risen above it), 'faded' or hidden. */
export function numberAt(t: number): 'low' | 'high' | 'faded' | undefined {
  const s = t - TUMBLE_MS
  if (s < 0 || s >= NUMBER_MS) return undefined
  return s < NUMBER_MS * 0.25 ? 'low' : s < NUMBER_MS * 0.65 ? 'high' : 'faded'
}

function bar(value: number, max: number, width: number): [string, string] {
  const on = max > 0 ? Math.round(Math.max(0, Math.min(1, value / max)) * width) : 0
  return ['█'.repeat(on), '░'.repeat(width - on)]
}

/** The strip's two rows at `t`: damage numbers above, then both bars on one line. */
export function stripAt(p: TrayFxProps, t: number): Seg[][] {
  const w = p.barWidth ?? 12
  const sides = [p.you && { side: p.you, icon: '♥' }, p.foe && { side: p.foe, icon: '⚔' }].filter(Boolean) as { side: Side; icon: string }[]
  const flashing = t >= TUMBLE_MS && t < TUMBLE_MS + DRAIN_MS && Math.floor(t / 80) % 2 === 0
  const num = numberAt(t)
  const above: Seg[] = [], line: Seg[] = []
  sides.forEach(({ side, icon }, i) => {
    const hp = hpAt(side, t)
    const hurt = side.dmg > 0
    const color = hurt && flashing ? p.colors.bad : side.hp * 3 <= side.max ? p.colors.bad : p.colors.accent
    const [full, empty] = bar(hp, side.max, w)
    const label = `${icon} ${side.name} `
    const tail = ` ${hp}/${side.max}`
    const gap = i ? '    ' : ''
    line.push({ t: gap + label, c: color, b: true }, { t: full, c: color, b: hurt && flashing }, { t: empty, d: true }, { t: tail, b: true })
    const dmg = hurt ? `-${side.dmg}` : ''
    const span = (gap + label + full + empty + tail).length
    if (dmg && num === 'low') line.push({ t: ` ${dmg}`, c: p.colors.bad, b: true })
    const showAbove = dmg && (num === 'high' || num === 'faded')
    const pad = Math.max(0, span - (gap.length + label.length) - Math.ceil(w / 2) - dmg.length)
    above.push({ t: ' '.repeat(gap.length + label.length + Math.ceil(w / 2)) })
    above.push(showAbove ? { t: dmg, c: p.colors.bad, b: num === 'high', d: num === 'faded' } : { t: ' '.repeat(dmg.length) })
    above.push({ t: ' '.repeat(pad) })
  })
  return [above, line]
}

const TrayFx: ClientModule<TrayFxProps, State> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.setState({ t: 0 })
    const stop = surface.every(FRAME_MS, () => {
      const t = (surface.state?.t ?? 0) + FRAME_MS
      surface.setState({ t })
      if (t >= FX_MS) stop()
    })
  }
  const t = surface.state?.t ?? 0
  const fight = props.you || props.foe
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {props.lines.map((l, i) => {
        const shown = lineAt(l, t, i + 1)
        return (
          <Box flexDirection="row">
            <Text color={props.colors.accent}>{shown.icon} </Text>
            <Text dimColor={shown.tone === 'neutral'}>{shown.text}</Text>
            {shown.result && <Text color={shown.tone === 'good' ? props.colors.good : props.colors.bad} bold>{` ${shown.result}`}</Text>}
          </Box>
        )
      })}
      {fight && stripAt(props, t).map(row => (
        <Box flexDirection="row">
          {row.map(s => <Text color={s.c} bold={s.b} dimColor={s.d}>{s.t || ' '}</Text>)}
        </Box>
      ))}
    </Box>
  )
}

export default TrayFx
