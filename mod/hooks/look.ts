// A game's look: colors, labels, tabs and phrases. The rules script copies it into the save
// (view.look, the kit's rules/look.default.json with the game's look.json laid over it), so the mod
// never reads game folders. DEFAULT_LOOK is only for the moments before any save exists.

import type { CoderpgLook, CoderpgSave, CoderpgTab } from '../types'

export const DEFAULT_LOOK: CoderpgLook = {
  palette: { accent: '#d7a640', good: 'green', bad: 'red', warn: 'yellow', heal: 'cyan' },
  stat_labels: { might: 'Might', agility: 'Agility', wits: 'Wits' },
  stat_short: { might: 'MIG', agility: 'AGI', wits: 'WIT' },
  currency: 'coins',
  tagline: 'a CodeRPG adventure',
  tabs: ['here', 'map', 'journal'],
  tab_labels: { here: 'Here', map: 'Map', journal: 'Journal' },
  tab_keys: { here: 'h', map: 'm', journal: 'j' },
  phrases: { idle: ['The tale unfolds', 'Turning the page', 'Fate shuffles its cards'], by_command: {} },
}

/** The save's look, with any part it lacks (an older or hand-made save) filled from the default. */
export function lookOf(s: CoderpgSave | null | undefined): CoderpgLook {
  const l = s?.view?.look
  if (!l) return DEFAULT_LOOK
  const d = DEFAULT_LOOK
  return {
    ...d, ...l,
    palette: { ...d.palette, ...l.palette },
    stat_labels: { ...d.stat_labels, ...l.stat_labels },
    stat_short: { ...d.stat_short, ...l.stat_short },
    tab_labels: { ...d.tab_labels, ...l.tab_labels },
    tab_keys: { ...d.tab_keys, ...l.tab_keys },
    phrases: { idle: l.phrases?.idle?.length ? l.phrases.idle : d.phrases.idle, by_command: { ...l.phrases?.by_command } },
  }
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
