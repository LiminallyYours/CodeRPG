// A surface module (a `Client`): a turn's narration appearing a paragraph at a time, each one dim for a
// moment and then at full brightness (a terminal has no opacity, and markdown draws only plain or dim), then
// holding still. A key pressed meanwhile shows the whole turn: the hooks module hands it `skip`. The frame
// logic is pure, and `drawBlocks` is also how register.tsx draws a page that is no longer fresh.

import type { ClientElements, ClientModule } from 'claude-code'

import type { Block } from './story'
import { rowsOf } from './story'

export type PageProps = { blocks: Block[]; width: number; delay: number; skip?: boolean }
export type BlockState = 'hidden' | 'fading' | 'shown'
type State = { t: number }

export const STEP_MS = 150 // each paragraph fades in over this long, and the next starts when it's done
const FRAME_MS = 50

/** How each paragraph stands `t` ms after the turn showed, its first starting `delay` ms in. */
export function pageFrame(count: number, t: number, delay: number): BlockState[] {
  return Array.from({ length: count }, (_, i) => {
    const start = delay + i * STEP_MS
    return t < start ? 'hidden' : t < start + STEP_MS ? 'fading' : 'shown'
  })
}

/** How long a page takes to show whole. */
export function pageMs(count: number, delay: number): number {
  return delay + count * STEP_MS
}

type Draw = Pick<ClientElements, 'Box' | 'Text' | 'Markdown'>

/**
 * The paragraphs, one blank row apart, at `width` columns. Speech has a keyline in the speaker's color on
 * every row and their name in bold on the first; one with no color of its own gets a dim keyline.
 */
export function drawBlocks({ Box, Text, Markdown }: Draw, blocks: Block[], width: number, states?: BlockState[]) {
  return (
    <Box flexDirection="column" width={width}>
      {blocks.map((b, i) => {
        const state = states?.[i] ?? 'shown'
        if (state === 'hidden') return null
        const dim = state === 'fading'
        const top = i ? 1 : 0
        if (!b.who) return <Box marginTop={top} width={width}><Markdown text={b.text} dimColor={dim} /></Box>
        const rows = rowsOf(b.text, width - 2) + 1
        return (
          <Box flexDirection="row" marginTop={top} width={width}>
            <Text color={b.who.color} dimColor={dim || !b.who.color}>{Array.from({ length: rows }, () => '▌').join('\n')}</Text>
            <Box flexDirection="column" paddingLeft={1} width={width - 1}>
              <Text color={b.who.color} bold dimColor={dim || !b.who.color}>{b.who.name}</Text>
              <Markdown text={b.text} dimColor={dim} />
            </Box>
          </Box>
        )
      })}
    </Box>
  )
}

const Page: ClientModule<PageProps, State> = (props, surface) => {
  const end = pageMs(props.blocks.length, props.delay)
  if (surface.state === undefined) {
    surface.setState({ t: 0 })
    const stop = surface.every(FRAME_MS, () => {
      const t = (surface.state?.t ?? 0) + FRAME_MS
      surface.setState({ t })
      if (t >= end) stop()
    })
  }
  const t = props.skip ? end : surface.state?.t ?? 0
  return drawBlocks(surface.elements, props.blocks, props.width, pageFrame(props.blocks.length, t, props.delay))
}

export default Page
