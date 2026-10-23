// What changed between two saves: the change line under a turn's narration, and the sounds, the HP flash
// and the few toasts. Pure: compares two copies of state/save.json.

import type { CoderpgSave } from '../types'
import { lookOf, money } from './look'

export type Feedback = { toast?: string; sounds: string[]; flash?: 'hurt' | 'heal' }

function names(s: CoderpgSave): Map<string, string> {
  return new Map((s.view?.items ?? []).map(i => [i.id, i.name]))
}

/**
 * True when `next` is a fresh game rather than a continuation of `prev`. Each run has an id (save
 * version 6+); older saves fall back to the move count going backwards or a finished game restarting.
 */
export function isReset(prev: CoderpgSave, next: CoderpgSave): boolean {
  if (prev.run?.id && next.run?.id) return prev.run.id !== next.run.id
  return (next.run?.moves ?? 0) < (prev.run?.moves ?? 0) || (prev.status !== 'playing' && next.status === 'playing')
}

/** The items in `next`'s inventory and not in `prev`'s, and the other way round, counting repeats. */
function itemsDiff(prev: CoderpgSave, next: CoderpgSave): { gained: string[]; lost: string[] } {
  const before = [...prev.inventory]
  const gained = next.inventory.filter(i => { const k = before.indexOf(i); if (k >= 0) { before.splice(k, 1); return false } return true })
  return { gained, lost: before }
}

/** Things this run generated (rooms, characters, items), by kind and id: made by the world, not ordered by the player. */
function generated(s: CoderpgSave): Map<string, string> {
  const out = new Map<string, string>()
  for (const kind of ['rooms', 'characters', 'items'] as const) {
    for (const [id, rec] of Object.entries(s.run?.[kind] ?? {})) {
      if ((rec.meta?.made_by ?? 'world') === 'world') out.set(`${kind}/${id}`, rec.meta?.name ?? id)
    }
  }
  return out
}

/**
 * The change line: what a turn changed, one entry each, from the save as the turn found it and as it left it.
 * The rules script wrote both, so this is the record the player can trust (the prose may soften it).
 */
export function changesOf(prev: CoderpgSave | null, next: CoderpgSave | null): string[] {
  if (!prev || !next || isReset(prev, next)) return []
  const look = lookOf(next)
  const out: string[] = []
  const dhp = next.stats.hp - prev.stats.hp
  if (dhp) out.push(`${dhp > 0 ? '+' : '−'}${Math.abs(dhp)} ♥`)
  const dc = next.stats.coins - prev.stats.coins
  if (dc) out.push(`${dc > 0 ? '+' : '−'}${money(Math.abs(dc), look)}`)
  const nameOf = (id: string) => names(next).get(id) ?? names(prev).get(id) ?? id
  const { gained, lost } = itemsDiff(prev, next)
  for (const id of gained) out.push(`gained ${nameOf(id)}`)
  for (const id of lost) out.push(`lost ${nameOf(id)}`)
  const doneBefore = new Set((prev.view?.quests ?? []).flatMap(q => q.objectives.filter(o => o.done).map(o => o.text)))
  for (const q of next.view?.quests ?? []) {
    const was = (prev.view?.quests ?? []).find(p => p.id === q.id)
    if (!was && q.side) out.push(`new side quest: ${q.name}`)
    for (const o of q.objectives) if (o.done && !doneBefore.has(o.text)) out.push(`✓ ${o.text}`)
    if (q.complete && !was?.complete) out.push(`★ ${q.side ? 'side quest' : 'quest'} complete: ${q.name}`)
    else if (q.failed && !was?.failed) out.push(`✗ quest failed: ${q.name}`)
  }
  const had = generated(prev)
  const grown = [...generated(next)].filter(([k]) => !had.has(k)).map(([, name]) => name)
  if (grown.length) out.push(['the world grows', ...grown].join(' · '))
  const cursesBefore = new Set((prev.view?.curses ?? []).map(c => c.id))
  const cursesNow = new Set((next.view?.curses ?? []).map(c => c.id))
  for (const c of next.view?.curses ?? []) if (!cursesBefore.has(c.id)) out.push(`✶ cursed: ${c.name}`)
  for (const c of prev.view?.curses ?? []) if (!cursesNow.has(c.id)) out.push(`✶ curse lifted: ${c.name}`)
  return out
}

/**
 * Sounds, the HP flash, and a toast only for what needs attention now and isn't in the story: the meter
 * running low, out or refilled, a curse taking hold, a new world ready. Routine changes go in the change line.
 */
export function feedback(prev: CoderpgSave | null, next: CoderpgSave): Feedback {
  const fb: Feedback = { sounds: [] }
  if (!prev || isReset(prev, next)) return fb
  const parts: string[] = []

  const dhp = next.stats.hp - prev.stats.hp
  if (dhp < 0) fb.flash = 'hurt'
  if (dhp > 0) { fb.flash = 'heal'; fb.sounds.push('heal') }
  if (next.stats.coins !== prev.stats.coins) fb.sounds.push('coin')
  if (next.location !== prev.location) fb.sounds.push('step')

  for (const q of next.view?.quests ?? []) {
    const was = (prev.view?.quests ?? []).find(p => p.id === q.id)
    if (q.complete && !was?.complete) fb.sounds.push('fanfare')
    else if (q.failed && !was?.failed) fb.sounds.push('defeat')
  }

  const was = prev.view?.meter, now = next.view?.meter
  if (was && now && was.state !== now.state) {
    const r = lookOf(next).resource
    if (now.state === 'spent') { parts.push(`${r.icon} ${r.name} spent`); fb.sounds.push('meter_low') }
    else if (now.state === 'low') { parts.push(`${r.icon} ${r.name} running low`); fb.sounds.push('meter_low') }
    else if (now.left > was.left) parts.push(`${r.icon} ${r.name} refilled`)
  }

  const cursesBefore = new Set((prev.view?.curses ?? []).map(c => c.id))
  const cursesNow = new Set((next.view?.curses ?? []).map(c => c.id))
  for (const c of next.view?.curses ?? []) if (!cursesBefore.has(c.id)) { parts.push(`✶ cursed: ${c.name}`); fb.sounds.push('curse') }
  for (const c of prev.view?.curses ?? []) if (!cursesNow.has(c.id)) fb.sounds.push('curse_lifted')

  // someone acting on their plan close by is told in the story, so only its chime; a new world ready is told nowhere else
  const heardUpTo = Math.max(0, ...(prev.view?.signals ?? []).map(x => x.n))
  for (const x of next.view?.signals ?? []) {
    if (x.n <= heardUpTo) continue
    if (x.kind === 'world') parts.push(x.text)
    fb.sounds.push('signal')
  }

  if (next.status === 'defeated' && prev.status !== 'defeated') fb.sounds = ['defeat']

  if (parts.length) fb.toast = parts.join('  ·  ')
  return fb
}
