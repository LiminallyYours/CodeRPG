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
  if (command === 'npc-brief') return 'considering'
  if (command === 'world-brief') return /^\s*turn\b/.test(args) ? 'stirring' : 'shaping'
  if (command === 'world-turn') return 'stirring'
  if (command === 'generate') return 'shaping'
  return 'resolving'
}
