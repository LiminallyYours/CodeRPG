// What the spinner says while the game master works: in-world phrases, chosen by what it's doing.

const IDLE = [
  'The tale unfolds', 'Turning the page', 'Ink scratches on parchment', 'The candle gutters',
  'The sea wind whispers', 'Gulls cry overhead', 'Fate shuffles its cards', 'The story weighs your words',
  'Waves hush against the quay', 'A lantern sways',
]

const BY_COMMAND: Record<string, string[]> = {
  look: ['Taking in the scene', 'Looking about'],
  move: ['Footsteps on the stones', 'On the move', 'The road unwinds'],
  take: ['Reaching out', 'Picking it up'],
  drop: ['Setting it down'],
  gain: ['Hands exchange', 'A deal is struck'],
  lose: ['Hands exchange', 'Letting it go'],
  equip: ['Testing the grip'],
  use: ['Uncorking the bottle', 'Bracing yourself'],
  check: ['Fate weighs your chances', 'The dice are cast'],
  roll: ['The dice are cast'],
  attack: ['Steel meets steel', 'Blows are traded', 'The fight is on'],
  hurt: ['Pain flares'],
  heal: ['Warmth returns'],
  coins: ['Counting coins'],
  flag: ['The story turns'],
  remember: ['A memory settles'],
  newgame: ['Setting the stage', 'The curtain rises'],
  'npc-brief': ['Someone gathers their thoughts'],
  'world-brief': ['The world takes shape', 'Something stirs at the edge of the map'],
  generate: ['Something takes shape'],
  'world-turn': ['Time passes off-screen', 'The village talks'],
  show: ['Recalling the place'],
  note: ['Committing it to memory'],
  chronicle: ['The tale is written down'],
}

export function pick(list: string[], seed: number): string {
  return list[Math.abs(seed) % list.length] ?? list[0] ?? ''
}

export function idlePhrase(seed: number): string {
  return pick(IDLE, seed)
}

export function commandPhrase(command: string, seed: number): string | undefined {
  const list = BY_COMMAND[command]
  return list ? pick(list, seed) : undefined
}

/** "<Name> considers your words", from an NPC brief's opening "You are <Name>, ...". */
export function npcPhrase(prompt: string): string {
  const name = /You are ([^,.\n]+)[,.]/.exec(prompt)?.[1]
  return name ? `${name} considers your words` : 'Someone considers your words'
}
