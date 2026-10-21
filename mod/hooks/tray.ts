// Turns the rules script's output into dice-tray lines and picks a sound for them.
// Pure functions: the script's printed format is the only thing they know, plus the game's look for names.

import type { CoderpgLook } from '../types'
import { DEFAULT_LOOK, money } from './look'

export type TrayTone = 'good' | 'bad' | 'neutral'
export type TrayLine = { icon: string; text: string; result?: string; tone: TrayTone }

/** The rpg.py subcommands whose results are shown as a dice tray rather than hidden. */
export const TRAY_COMMANDS = ['check', 'attack', 'roll', 'hurt', 'heal', 'use', 'move', 'generate']

/** Which rpg.py subcommand a shell command runs, if any. */
export function rpgCommand(command: string): string | undefined {
  return /rules\/rpg\.py\s+([a-z-]+)/.exec(command)?.[1]
}

function title(id: string): string {
  return id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Parse rpg.py output into tray lines; empty when there's nothing to show (a refusal, an unknown line). */
export function trayLines(stdout: string, look: CoderpgLook = DEFAULT_LOOK): TrayLine[] {
  const out: TrayLine[] = []
  for (const raw of stdout.split('\n')) {
    const line = raw.trim().replace(/^effect: /, '')
    let m: RegExpExecArray | null
    if ((m = /^ENCOUNTER: (.+)$/.exec(line))) {
      out.push({ icon: '⚑', text: m[1]!, tone: 'neutral' })
    } else if ((m = /^COINS ([+-]\d+) -> (\d+)$/.exec(line))) {
      const n = Number(m[1])
      out.push({ icon: ' ', text: `${n > 0 ? '+' : '-'}${money(Math.abs(n), look)} · ${m[2]} left`, tone: n > 0 ? 'good' : 'bad' })
    } else if ((m = /^GAINED: (\w+)/.exec(line))) {
      out.push({ icon: ' ', text: `found ${title(m[1]!)}`, tone: 'good' })
    } else if ((m = /^CLOCK: (.+?) in (\d+ moves?)$/.exec(line))) {
      out.push({ icon: '⧗', text: `${m[1]}: ${m[2]} left`, tone: 'bad' })
    } else if ((m = /^CLOCK: (.+?)\. Flag set:/.exec(line))) {
      out.push({ icon: '⧗', text: `${m[1]}.`, tone: 'bad' })
    } else if ((m = /^GENERATED: (.+)$/.exec(line))) {
      const names = [...m[1]!.matchAll(/\w+ (.+?) \([a-z0-9_]+\)/g)].map(x => x[1])
      out.push({ icon: '✧', text: `The world grows: ${names.join(', ')}`, tone: 'neutral' })
    } else if ((m = /^CHECK (\w+) vs DC (\d+): d20 (\d+) ([+-]\d+) = (-?\d+)(.*?) -> (SUCCESS|FAILURE)$/.exec(line))) {
      const [, stat, dc, nat, mod, total, note, res] = m
      const label = look.stat_labels[stat as keyof CoderpgLook['stat_labels']] ?? title(stat!)
      out.push({ icon: '🎲', text: `${label} check: d20 ${nat} ${mod} = ${total} vs DC ${dc}${note}`, result: res, tone: res === 'SUCCESS' ? 'good' : 'bad' })
    } else if ((m = /^PLAYER ATTACKS (\w+) with (.+?): d20 (\d+) ([+-]\d+) = (-?\d+) vs defense (\d+)(.*?) -> (HIT|MISS)$/.exec(line))) {
      const [, foe, , nat, mod, total, def, note, res] = m
      out.push({ icon: '⚔', text: `You attack ${title(foe!)}: d20 ${nat} ${mod} = ${total} vs ${def}${note}`, result: res, tone: res === 'HIT' ? 'good' : 'bad' })
    } else if ((m = /^(\w+) ATTACKS: d20 (\d+) ([+-]\d+) = (-?\d+) vs your defense (\d+)(.*?) -> (HIT|MISS)$/.exec(line))) {
      const [, foe, nat, mod, total, def, note, res] = m
      out.push({ icon: '⚔', text: `${title(foe!.toLowerCase())} attacks: d20 ${nat} ${mod} = ${total} vs ${def}${note}`, result: res, tone: res === 'HIT' ? 'bad' : 'good' })
    } else if ((m = /^damage .*?= (\d+)( \(critical: double dice\))? -> (.*)$/.exec(line))) {
      const [, dmg, crit, rest] = m
      const target = /^(\w+) HP (\d+)\/(\d+)$/.exec(rest!)
      const after = rest!.startsWith('PLAYER DEFEATED') ? 'you fall'
        : rest!.startsWith('Player HP') ? `you ${rest!.slice('Player HP '.length)}`
        : target ? `${title(target[1]!)} ${target[2]}/${target[3]}` : rest!
      out.push({ icon: ' ', text: `${dmg} damage${crit ? ' (critical!)' : ''} · ${after}`, tone: 'neutral' })
    } else if ((m = /^(\w+) IS DEFEATED/.exec(line))) {
      out.push({ icon: '★', text: `${title(m[1]!.toLowerCase())} is defeated`, tone: 'good' })
    } else if ((m = /^ROLL (.+)$/.exec(line))) {
      out.push({ icon: '🎲', text: m[1]!, tone: 'neutral' })
    } else if ((m = /^HURT .*?= (\d+)(?:, held to (\d+))?\. (.*)$/.exec(line))) {
      const taken = m[2] ?? m[1]
      out.push({ icon: '✖', text: `Hurt for ${taken} · ${m[3]!.startsWith('PLAYER DEFEATED') ? 'you fall' : m[3]}`, tone: 'bad' })
    } else if ((m = /^HEAL .*?; healed (\d+)\. (.*)$/.exec(line))) {
      out.push({ icon: '✚', text: `Healed ${m[1]} · ${m[2]}`, tone: 'good' })
    } else if ((m = /^USED (\w+): .*?; healed (\d+)\. (.*)$/.exec(line))) {
      out.push({ icon: '✚', text: `${title(m[1]!)}: healed ${m[2]} · ${m[3]}`, tone: 'good' })
    }
  }
  return out
}

/** The sound for a tray, if any. Healing, coins and the rest come from the save instead. */
export function traySound(lines: TrayLine[]): string | undefined {
  if (lines.some(l => l.text.startsWith('Hurt'))) return 'hit'
  if (lines.some(l => l.result === 'HIT')) return 'hit'
  if (lines.some(l => l.result === 'MISS')) return 'miss'
  if (lines.some(l => l.icon === '🎲')) return 'dice'
  return undefined
}
