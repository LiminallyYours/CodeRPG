// What the page is made of: the measure, the arrival rule, the title and ending cards as rows of styled
// text, and the narration split into paragraphs, each one a character speaks marked with who speaks it and
// in what color. Pure, so the shapes are testable; register.tsx draws them, the cards animated once through
// reveal.tsx and the paragraphs through page.tsx when they're fresh.

import type { CoderpgLook, CoderpgPerson, CoderpgSave } from '../types'
import type { Seg } from './reveal'

/** Someone in the scene: their name, and their card color if they have one. */
export type Card = { name: string; color?: string }

/** Words in a name that don't identify anyone ("the Shellback" is "Shellback"; "Dr. Ines Halloran" is either name). */
const FILLER = new Set(['the', 'a', 'an', 'dr', 'mr', 'mrs', 'ms', 'old', 'young', 'of'])

function nameWords(name: string): string[] {
  return name.split(/\s+/).map(w => w.replace(/[^\p{L}'’-]/gu, '')).filter(w => w.length > 1 && !FILLER.has(w.toLowerCase()))
}

/** The narration's paragraphs. */
export function paragraphsOf(text: string): string[] {
  return text.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)
}

/**
 * Who speaks in a paragraph that quotes someone: the first person in the scene named outside the
 * quotation marks ("Pell looks up. 'Well now…'"). A name inside the quote is someone being talked about,
 * not the speaker. The paragraph is drawn in their card color only if they have one: a person without
 * a card (someone generated this run) keeps it plain rather than lending it to whoever is named next.
 */
export function speakerOf(paragraph: string, cards: Card[]): Card | undefined {
  if (!/["“”]/.test(paragraph)) return undefined
  const outside = paragraph.replace(/"[^"]*"|“[^”]*”/g, ' … ')
  let best: { card: Card; at: number } | undefined
  for (const card of cards) {
    for (const w of nameWords(card.name)) {
      const m = new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}])`, 'u').exec(outside)
      if (m && (!best || m.index < best.at)) best = { card, at: m.index }
    }
  }
  return best?.card.color ? best.card : undefined
}

/** The page's indent from the left edge, and its widest measure. */
export const INDENT = 4
export const MEASURE = 72

/** How wide the narration runs in a column `columns` wide: 72, or the column less 6 where 72 won't fit. */
export function measureOf(columns: number): number {
  return Math.max(20, Math.min(MEASURE, columns - 6))
}

/** The arrival rule: a dim line, the place in bold accent, a dim `·` and the time of day, centered in the measure. */
export function arrivalRow(name: string, time: string | undefined, measure: number, accent: string): Seg[] {
  const label = `  ${name}${time ? ` · ${time}` : ''}  `
  const left = Math.max(2, Math.floor((measure - label.length) / 2))
  const right = Math.max(2, measure - label.length - left)
  return [
    { t: '─'.repeat(left), d: true }, { t: `  ${name}`, c: accent, b: true },
    ...(time ? [{ t: ' · ', d: true }, { t: time, d: true }] : []),
    { t: '  ' + '─'.repeat(right), d: true },
  ]
}

/** A thin rule the width of the measure, above and below the title and ending cards. */
export function ruleRow(measure: number, color?: string): Seg[] {
  return [{ t: '─'.repeat(measure), c: color, d: !color }]
}

/**
 * Everyone who may speak, with a color: their own card's if they have one; else the next of the look's
 * speaker colors, in the order the player met them (the save's `met`, so it holds for the whole run),
 * skipping colors someone's card already uses while others are left. `also`: anyone else to include (who
 * was here when the turn began).
 */
export function speakerCards(s: CoderpgSave | null, look: CoderpgLook, also: CoderpgPerson[] = []): Card[] {
  const people = [...(s?.view?.people ?? []), ...(s?.view?.characters_here ?? []), ...also]
  const unique = people.filter((p, i) => people.findIndex(x => x.id === p.id) === i)
  const taken = new Set(unique.map(p => p.card?.toLowerCase()).filter(Boolean))
  const all = look.speaker_colors ?? []
  const free = all.filter(c => !taken.has(c.toLowerCase()))
  const palette = free.length ? free : all
  let next = 0
  return unique.map(p => ({ name: p.name, color: p.card ?? (palette.length ? palette[next++ % palette.length] : undefined) }))
}

/** One paragraph of narration, and who speaks it if it's someone's speech (no color: drawn with a dim keyline). */
export type Block = { text: string; who?: Card }

// "Tamsin: ", "**Old Hob:** ": a name tag before the speech
const TAG = /^\*{0,2}([^\s:"“*][^:"“\n*]{0,40}?)(?::\*{0,2}|\*{0,2}:)\s+/u
// what the game master might write before a colon that is no one's name
const NOT_A_NAME = /^(note|recording|generating|narrating|next|now|first|then|also|update|ooc|gm)\b/i

/**
 * The person a name tag names: by their whole name, or by words all of which are in it ("Halloran" or
 * "Dr. Halloran" for "Dr. Ines Halloran"), so "Ysolde stands at the door: …" is no tag.
 */
function cardNamed(tag: string, cards: Card[]): Card | undefined {
  const t = tag.trim().toLowerCase()
  const words = nameWords(tag).map(w => w.toLowerCase())
  return cards.find(c => c.name.toLowerCase() === t)
    ?? (words.length ? cards.find(c => words.every(w => nameWords(c.name).some(n => n.toLowerCase() === w))) : undefined)
}

/**
 * A paragraph tagged as speech ("Tamsin: "Black-faced, she is," she calls…"): who, and the paragraph without
 * the tag. A tag names someone met or here, or is a short capitalized name followed by a quotation.
 */
export function speechTag(paragraph: string, cards: Card[]): Block | undefined {
  const m = TAG.exec(paragraph)
  if (!m || NOT_A_NAME.test(m[1]!)) return undefined
  const rest = paragraph.slice(m[0].length)
  const known = cardNamed(m[1]!, cards)
  if (known) return { text: rest, who: known }
  const looksLikeName = /^(\p{Lu}[\p{L}'’.-]*)( \p{Lu}[\p{L}'’.-]*){0,3}$/u.test(m[1]!.trim())
  return looksLikeName && /^["“]/.test(rest) ? { text: rest, who: { name: m[1]!.trim() } } : undefined
}

/** Whether a paragraph opens with what reads as a speaker's name tag (`Pell: `), known or not. */
export function looksTagged(paragraph: string): boolean {
  const m = TAG.exec(paragraph)
  return !!m && !NOT_A_NAME.test(m[1]!) && /^(\p{Lu}[\p{L}'’.-]*)( \p{Lu}[\p{L}'’.-]*){0,3}$/u.test(m[1]!.trim())
}

/** The narration as the page draws it: each paragraph, with its speaker by tag, else by the old heuristic. */
export function blocksOf(text: string, cards: Card[]): Block[] {
  return paragraphsOf(text).map(p => speechTag(p, cards) ?? { text: p, who: speakerOf(p, cards) })
}

/** How many rows a paragraph wraps to at `width` columns, words kept whole (markdown markers don't take room). */
export function rowsOf(text: string, width: number): number {
  let rows = 0
  for (const line of text.replace(/\*\*|[*_`]/g, '').split('\n')) {
    let used = 0
    rows++
    for (const word of line.split(/\s+/).filter(Boolean)) {
      const n = [...word].length
      if (used === 0) used = n
      else if (used + 1 + n <= width) used += 1 + n
      else { rows++; used = n }
      while (used > width) { rows++; used -= width }
    }
  }
  return rows
}

/** "The End" -> "T H E   E N D". */
export function spaced(text: string): string {
  return text.toUpperCase().split('').join(' ')
}

/** The title card's rows: the title, spaced; the game's tagline; the run's date and seed. */
export function titleRows(title: string, tagline: string, runLabel: string | undefined, accent: string): Seg[][] {
  const rows: Seg[][] = [[{ t: spaced(title), c: accent, b: true }], [{ t: tagline, d: true }]]
  if (runLabel) rows.push([{ t: runLabel, d: true }])
  return rows
}

export type Ending = 'victory' | 'lost' | 'defeat'

/** An ending card's rows, its border color and its lines in order. */
export function endingRows(ending: Ending, quest: string | undefined, colors: { accent: string; bad: string }): { border: string; rows: Seg[][] } {
  if (ending === 'victory') {
    return { border: colors.accent, rows: [
      [{ t: `✦  ${spaced('The End')}  ✦`, c: colors.accent, b: true }],
      ...(quest ? [[{ t: `Quest complete: ${quest}` }]] : []),
      [{ t: 'Keep exploring, or type /newgame to play again.', d: true }],
    ] }
  }
  if (ending === 'lost') {
    return { border: 'gray', rows: [
      [{ t: `✦  ${spaced('The End')}  ✦`, b: true }],
      ...(quest ? [[{ t: `Quest failed: ${quest}`, d: true }]] : []),
      [{ t: 'Keep exploring, or type /newgame to try again.', d: true }],
    ] }
  }
  return { border: colors.bad, rows: [
    [{ t: `✦  ${spaced('You have fallen')}  ✦`, c: colors.bad, b: true }],
    [{ t: 'Type /newgame to try again.', d: true }],
  ] }
}
