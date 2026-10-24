// What the spinner says while the game master works: in-world phrases, chosen by what it's doing.
// The phrases themselves belong to each game (its look's `phrases`).

import type { CoderpgLook, CoderpgPhase } from '../types'

export function pick(list: string[], seed: number): string {
  return list[Math.abs(seed) % list.length] ?? list[0] ?? ''
}

export function idlePhrase(seed: number, look: CoderpgLook): string {
  return pick(look.phrases.idle, seed)
}

export function commandPhrase(command: string, seed: number, look: CoderpgLook): string | undefined {
  const list = look.phrases.by_command[command]
  return list?.length ? pick(list, seed) : undefined
}

/** "<Name> considers your words", from an NPC brief's opening "You are <Name>, ...". */
export function npcPhrase(prompt: string): string {
  const name = /You are ([^,.\n]+)[,.]/.exec(prompt)?.[1]
  return name ? `${name} considers your words` : 'Someone considers your words'
}

// When one shell call chains several rules-script calls, the one that says most about the turn: a roll over a
// look, a character's brief over a flag.
const TELLING: (CoderpgPhase | undefined)[] = ['resolving', 'shaping', 'stirring', 'considering', 'reading', undefined]

/** The most telling rules-script call in a shell command ("look | grep … && check might 14" is a roll), with its
 *  arguments: the first call when none says more, nothing when there's no call at all. */
export function mainCall(command: string): { sub: string | undefined; args: string } {
  const calls = [...command.matchAll(/rules\/rpg\.py\s+([a-z-]+)[ \t]*([^;&|\n]*)/g)].map(m => ({ sub: m[1]!, args: m[2]!.trim() }))
  const rank = (c: { sub: string; args: string }) => TELLING.indexOf(phaseOf('Bash', c.sub, c.args, ''))
  let best: { sub: string; args: string } | undefined
  for (const c of calls) if (!best || rank(c) < rank(best)) best = c
  return best ?? { sub: undefined, args: '' }
}

/** Rules-script commands that only record what happened: they don't change the waiting phase. */
const QUIET = ['chronicle', 'remember', 'note', 'flag', 'coins', 'gain', 'lose', 'equip', 'meter', 'settings', 'library']

/**
 * Which stage a play turn is in, from the game tool being called: reading the room, a character
 * considering a reply, something new taking shape, the world stirring off-screen, or resolving what the
 * player did. Undefined for calls that don't change it.
 */
export function phaseOf(tool: string, command: string | undefined, args: string, agentType: string, lastBrief?: string): CoderpgPhase | undefined {
  if (tool === 'Read' || tool === 'Skill') return 'reading'
  if (tool === 'Agent') return agentType === 'npc' ? 'considering' : lastBrief === 'turn' ? 'stirring' : 'shaping'
  if (tool !== 'Bash' || !command || QUIET.includes(command)) return undefined
  if (command === 'look' || command === 'show') return 'reading'
  if (command === 'npc-brief' || command === 'talk') return 'considering'
  if (command === 'world-brief') return /^\s*turn\b/.test(args) ? 'stirring' : 'shaping'
  if (command === 'world-turn') return 'stirring'
  if (command === 'generate') return 'shaping'
  return 'resolving'
}
