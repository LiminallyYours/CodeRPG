// Curses: the player's words as a curse makes them come out, to draw their row the way the game master
// hears it. A port of rules/curse.py; both are tested against rules/curse_vectors.json. Pure.

/** The player's words under one curse `effect` (reverse_words, mirror, word_limit <n>, suffix "<phrase>"). */
export function applyCurse(effect: string, text: string): string {
  const e = effect.trim().replace(/\s+/g, ' ')
  const words = text.split(/\s+/).filter(Boolean)
  if (!words.length) return text
  if (e === 'reverse_words') return [...words].reverse().join(' ')
  if (e === 'mirror') return words.map(w => [...w].reverse().join('')).join(' ')
  const limit = /^word_limit (\d+)$/.exec(e)
  if (limit && Number(limit[1]) >= 1) {
    const n = Number(limit[1])
    return words.slice(0, n).join(' ') + (words.length > n ? '…' : '')
  }
  const suffix = /^suffix "(.+)"$/.exec(e)
  if (suffix) return `${words.join(' ')} ${suffix[1]}`
  return text // an effect this port doesn't know: the words unchanged (validate refuses such a curse)
}

/** The words under every curse on the player, in order. */
export function cursedWords(curses: { effect: string }[], text: string): string {
  return curses.reduce((t, c) => applyCurse(c.effect, t), text)
}
