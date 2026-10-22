// Block letters for place-name banners: a 3x5 pixel font drawn with half blocks, so each letter is
// 3 cells wide and 3 rows tall. Pure: text in, rows of text out.

// Each glyph is five rows of three pixels, left to right.
const GLYPHS: Record<string, string[]> = {
  A: ['010', '101', '111', '101', '101'], B: ['110', '101', '110', '101', '110'], C: ['011', '100', '100', '100', '011'],
  D: ['110', '101', '101', '101', '110'], E: ['111', '100', '110', '100', '111'], F: ['111', '100', '110', '100', '100'],
  G: ['011', '100', '101', '101', '011'], H: ['101', '101', '111', '101', '101'], I: ['111', '010', '010', '010', '111'],
  J: ['001', '001', '001', '101', '010'], K: ['101', '101', '110', '101', '101'], L: ['100', '100', '100', '100', '111'],
  M: ['101', '111', '111', '101', '101'], N: ['110', '101', '101', '101', '101'], O: ['010', '101', '101', '101', '010'],
  P: ['110', '101', '110', '100', '100'], Q: ['010', '101', '101', '110', '011'], R: ['110', '101', '110', '101', '101'],
  S: ['011', '100', '010', '001', '110'], T: ['111', '010', '010', '010', '010'], U: ['101', '101', '101', '101', '111'],
  V: ['101', '101', '101', '101', '010'], W: ['101', '101', '111', '111', '101'], X: ['101', '101', '010', '101', '101'],
  Y: ['101', '101', '010', '010', '010'], Z: ['111', '001', '010', '100', '111'],
  '0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['110', '001', '010', '100', '111'],
  '3': ['110', '001', '010', '001', '110'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '110', '001', '110'],
  '6': ['011', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '110'],
  ' ': ['000', '000', '000', '000', '000'], '-': ['000', '000', '111', '000', '000'], "'": ['010', '010', '000', '000', '000'],
  '’': ['010', '010', '000', '000', '000'], '.': ['000', '000', '000', '000', '010'], ',': ['000', '000', '000', '010', '100'],
  '!': ['010', '010', '010', '000', '010'], '?': ['110', '001', '010', '000', '010'], ':': ['000', '010', '000', '010', '000'],
  '&': ['010', '101', '010', '101', '011'],
}

/** The cell for a top and a bottom pixel. */
function half(top: boolean, bottom: boolean): string {
  return top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' '
}

/** How many cells wide `text` is in block letters (a cell's gap between letters). */
export function blockWidth(text: string): number {
  return text.length ? text.length * 4 - 1 : 0
}

/**
 * `text` in block letters, three rows, or undefined when it has a character the font lacks or would be
 * wider than `maxColumns`: the caller then draws the plain banner.
 */
export function blockLetters(text: string, maxColumns: number): string[] | undefined {
  const up = text.toUpperCase()
  if (!up.trim() || blockWidth(up) > maxColumns || [...up].some(ch => !GLYPHS[ch])) return undefined
  const rows = ['', '', '']
  ;[...up].forEach((ch, i) => {
    const g = GLYPHS[ch]!
    const px = (r: number, c: number) => r < 5 && g[r]![c] === '1'
    for (let r = 0; r < 3; r++) {
      rows[r] += (i ? ' ' : '') + [0, 1, 2].map(c => half(px(2 * r, c), px(2 * r + 1, c))).join('')
    }
  })
  return rows.map(r => r.replace(/\s+$/, ''))
}
