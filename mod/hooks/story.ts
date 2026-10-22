// What a story card is made of: the room banner (block letters when they fit), the title and ending
// cards as rows of styled text, and the narration split into paragraphs, each one a character speaks
// drawn in that character's card color. Pure, so the shapes are testable; register.tsx draws them,
// animated once through reveal.tsx when they're fresh.

import { blockLetters } from './font'
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

/** The room banner's rows: block letters if they fit in `columns`, else the plain `── NAME ──` line. */
export function bannerRows(name: string, columns: number, accent: string): Seg[][] {
  const block = blockLetters(name, columns)
  return block ? block.map(t => [{ t, c: accent, b: true }]) : [[{ t: `── ${name.toUpperCase()} ──`, c: accent, b: true }]]
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
