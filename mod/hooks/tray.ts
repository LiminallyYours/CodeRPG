// Turns the rules script's output into dice-tray lines and picks a sound for them.
// Pure functions: the script's printed format is the only thing they know, plus the game's look for names.

import type { CoderpgLook, CoderpgSave } from '../types'
import { DEFAULT_LOOK, money } from './look'

export type TrayTone = 'good' | 'bad' | 'neutral'
export type TrayLine = { icon: string; text: string; result?: string; tone: TrayTone }

/** The rpg.py subcommands whose results are shown as a dice tray rather than hidden. */
export const TRAY_COMMANDS = ['check', 'attack', 'roll', 'hurt', 'heal', 'use', 'move', 'generate', 'pay']

/** Which rpg.py subcommand a shell command runs, if any. */
export function rpgCommand(command: string): string | undefined {
  return /rules\/rpg\.py\s+([a-z-]+)/.exec(command)?.[1]
}

/** Every rpg.py subcommand a shell command runs, in order (the game master sometimes chains several). */
export function rpgCommands(command: string): string[] {
  return [...command.matchAll(/rules\/rpg\.py\s+([a-z-]+)/g)].map(m => m[1]!)
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
    } else if ((m = /^MADE: (.+?) \([a-z0-9_]+\), made for the player by (.+?)\./.exec(line))) {
      out.push({ icon: '✧', text: `${m[1]}, made for you by ${m[2]}`, tone: 'good' })
    } else if ((m = /^BUILDING: (.+?) \([a-z0-9_]+\), .*?: ready in (\d+ moves?)\./.exec(line))) {
      out.push({ icon: '⌂', text: `${m[1]}: ready in ${m[2]}`, tone: 'neutral' })
    } else if ((m = /^BUILT: (.+?) \([a-z0-9_]+\) is finished/.exec(line))) {
      out.push({ icon: '⌂', text: `${m[1]} is finished`, tone: 'good' })
    } else if ((m = /^PAID WITH: (\w+)$/.exec(line))) {
      out.push({ icon: ' ', text: `paid with ${title(m[1]!)}`, tone: 'neutral' })
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

/** One side of a fight as the combat strip draws it. */
export type CombatSide = { name: string; was: number; hp: number; max: number; dmg: number }

/**
 * Both sides of one `attack` exchange, from the rules script's output and the save written right after
 * it: each side's health before and after, and the damage each took. Undefined for anything but an attack.
 */
export function combatOf(stdout: string, s: CoderpgSave | null): { you?: CombatSide; foe?: CombatSide } | undefined {
  const foeId = /^PLAYER ATTACKS (\w+)/m.exec(stdout)?.[1]
  if (!foeId || !s) return undefined
  let foeDmg = 0, youDmg = 0, foeHp: number | undefined, foeMax: number | undefined
  for (const raw of stdout.split('\n')) {
    const m = /^\s*damage .*?= (\d+)(?: \(critical: double dice\))? -> (.*)$/.exec(raw)
    if (!m) continue
    const target = /^(\w+) HP (\d+)\/(\d+)$/.exec(m[2]!)
    if (target && target[1] === foeId) { foeDmg = Number(m[1]); foeHp = Number(target[2]); foeMax = Number(target[3]) }
    else youDmg = Number(m[1])
  }
  const npc = s.npcs?.[foeId]
  const hp = foeHp ?? npc?.hp ?? 0
  const max = foeMax ?? npc?.max_hp ?? Math.max(hp, 1)
  const name = [...(s.view?.characters_here ?? []), ...(s.view?.people ?? [])].find(p => p.id === foeId)?.name ?? title(foeId)
  const youHp = s.stats.hp
  return {
    you: { name: 'You', was: Math.min(s.stats.max_hp, youHp + youDmg), hp: youHp, max: s.stats.max_hp, dmg: youDmg },
    foe: { name, was: Math.min(max, hp + foeDmg), hp, max, dmg: foeDmg },
  }
}
