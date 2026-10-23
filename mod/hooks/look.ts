// A game's look: colors, labels, tabs and phrases. The rules script copies it into the save
// (view.look, the kit's rules/look.default.json with the game's look.json laid over it), so the mod
// never reads game folders. DEFAULT_LOOK is only for the moments before any save exists.

import type { CoderpgLook, CoderpgPhase, CoderpgSave, CoderpgTab } from '../types'

export const DEFAULT_LOOK: CoderpgLook = {
  palette: { accent: '#d7a640', good: 'green', bad: 'red', warn: 'yellow', heal: 'cyan' },
  speaker_colors: ['#8fae4a', '#7fa7c9', '#c98a8a', '#c9a35a', '#6fb3a8', '#a08fc9'],
  stat_labels: { might: 'Might', agility: 'Agility', wits: 'Wits' },
  stat_short: { might: 'MIG', agility: 'AGI', wits: 'WIT' },
  currency: 'coins',
  tagline: 'a CodeRPG adventure',
  tabs: ['here', 'map', 'journal'],
  tab_labels: { here: 'Here', map: 'Map', journal: 'Journal' },
  tab_keys: { here: 'h', map: 'm', journal: 'j' },
  phrases: { idle: ['The tale unfolds', 'Turning the page', 'Fate shuffles its cards'], by_command: {} },
  resource: { name: 'Energy', icon: '✦', low: 'You feel your energy flagging.', spent: "You're spent." },
  terrain: {
    water: { bg: '#1f4060', fg: '#9cc9ef', moves: true }, grass: { bg: '#2f5232', fg: '#cdeccd' },
    stone: { bg: '#4a4a52', fg: '#e2e2e6' }, indoors: { bg: '#5e4128', fg: '#f3dfc1' },
  },
  sounds: {},
}

/** The save's look, with any part it lacks (an older or hand-made save) filled from the default. */
export function lookOf(s: CoderpgSave | null | undefined): CoderpgLook {
  const l = s?.view?.look
  if (!l) return DEFAULT_LOOK
  const d = DEFAULT_LOOK
  return {
    ...d, ...l,
    palette: { ...d.palette, ...l.palette },
    speaker_colors: l.speaker_colors?.length ? l.speaker_colors : d.speaker_colors,
    stat_labels: { ...d.stat_labels, ...l.stat_labels },
    stat_short: { ...d.stat_short, ...l.stat_short },
    tab_labels: { ...d.tab_labels, ...l.tab_labels },
    tab_keys: { ...d.tab_keys, ...l.tab_keys },
    resource: { ...d.resource, ...l.resource },
    terrain: l.terrain && Object.keys(l.terrain).length ? l.terrain : d.terrain,
    sounds: { ...l.sounds },
    phrases: {
      idle: l.phrases?.idle?.length ? l.phrases.idle : d.phrases.idle,
      by_command: { ...l.phrases?.by_command },
      phases: { ...l.phrases?.phases },
    },
  }
}

/** The accent color now: the look's color for this time of day, if it gives one, else its accent. */
export function accentOf(s: CoderpgSave | null | undefined): string {
  const look = lookOf(s)
  const time = s?.view?.time
  return (time && look.palette.accent_by_time?.[time]) || look.palette.accent
}

/** Which sound file a beat plays: the look's choice (null: none), else the beat's own name. */
export function soundFor(look: CoderpgLook, beat: string): string | null {
  const sounds = look.sounds ?? {}
  return beat in sounds ? sounds[beat] ?? null : beat
}

/** What the waiting line says in a phase, in the game's voice; `{name}` is who's thinking. */
export function phasePhrase(look: CoderpgLook, phase: CoderpgPhase, seed: number, name?: string): string | undefined {
  const list = look.phrases.phases?.[phase]
  if (!list?.length) return undefined
  const text = list[Math.abs(seed) % list.length]!
  return text.replace(/\{name\}/g, name ?? 'Someone')
}

/** The pane's tabs in this game's order, with its labels and hotkeys. */
export function tabsOf(look: CoderpgLook): { id: CoderpgTab; label: string; hotkey: string }[] {
  const tabs = look.tabs.length ? look.tabs : DEFAULT_LOOK.tabs
  return tabs.map(id => ({ id, label: look.tab_labels[id] ?? id, hotkey: look.tab_keys[id] ?? id.charAt(0) }))
}

/** "3 coins", "1 credit": an amount in the game's currency. */
export function money(n: number, look: CoderpgLook): string {
  const name = look.currency
  return `${n} ${n === 1 && name.endsWith('s') ? name.slice(0, -1) : name}`
}
