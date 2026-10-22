// What changed between two saves, as one toast line, sounds and an HP flash.
// Pure: compares two copies of state/save.json.

import type { CoderpgSave } from '../types'
import { lookOf } from './look'

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

export function feedback(prev: CoderpgSave | null, next: CoderpgSave): Feedback {
  const fb: Feedback = { sounds: [] }
  if (!prev || isReset(prev, next)) return fb
  const parts: string[] = []

  const dhp = next.stats.hp - prev.stats.hp
  if (dhp < 0) { parts.push(`${dhp} HP`); fb.flash = 'hurt' }
  if (dhp > 0) { parts.push(`+${dhp} HP`); fb.flash = 'heal'; fb.sounds.push('heal') }

  const dc = next.stats.coins - prev.stats.coins
  if (dc !== 0) { parts.push(`${dc > 0 ? '+' : ''}${dc} coin${Math.abs(dc) === 1 ? '' : 's'}`); fb.sounds.push('coin') }

  const before = [...prev.inventory], after = [...next.inventory]
  const gained = after.filter(i => { const k = before.indexOf(i); if (k >= 0) { before.splice(k, 1); return false } return true })
  const nameOf = (id: string) => names(next).get(id) ?? names(prev).get(id) ?? id
  for (const id of gained) parts.push(`gained ${nameOf(id)}`)
  for (const id of before) parts.push(`lost ${nameOf(id)}`)

  if (next.location !== prev.location) fb.sounds.push('step')

  const doneBefore = new Set((prev.view?.quests ?? []).flatMap(q => q.objectives.filter(o => o.done).map(o => o.text)))
  for (const q of next.view?.quests ?? []) {
    const was = (prev.view?.quests ?? []).find(p => p.id === q.id)
    if (!was && q.side) parts.push(`new side quest: ${q.name}`)
    if (q.complete && !was?.complete) { parts.push(`★ ${q.side ? 'side quest' : 'quest'} complete: ${q.name}`); fb.sounds.push('fanfare'); continue }
    if (q.failed && !was?.failed) { parts.push(`✗ quest failed: ${q.name}`); fb.sounds.push('defeat'); continue }
    for (const o of q.objectives) if (o.done && !doneBefore.has(o.text)) parts.push(`✓ ${o.text}`)
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
  for (const c of prev.view?.curses ?? []) if (!cursesNow.has(c.id)) { parts.push(`✶ curse lifted: ${c.name}`); fb.sounds.push('curse_lifted') }

  if (next.status === 'defeated' && prev.status !== 'defeated') { parts.push('you have fallen'); fb.sounds = ['defeat'] }

  if (parts.length) fb.toast = parts.join('  ·  ')
  return fb
}
