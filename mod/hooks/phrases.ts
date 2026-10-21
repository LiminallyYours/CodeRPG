// What the spinner says while the game master works: in-world phrases, chosen by what it's doing.
// The phrases themselves belong to each game (its look's `phrases`).

import type { CoderpgLook } from '../types'

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
