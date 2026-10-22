// CodeRPG mod: makes Claude Code look and feel like the game.
// - narration drawn as story cards, with room banners, a title card and ending cards
// - the game's plumbing hidden, except dice rolls, which show as a dice tray
// - Claude's chrome (spinner, turn timer, prompt rows) replaced with in-world touches
// - a status band above the prompt and a tabbed character pane (Here / Map / Journal)
//   with clickable exits and actions
// - toasts, an HP flash and sound effects when things change
// - instant /inventory, /map, /sheet and /sound commands
// Everything it shows comes from state/save.json and the rules script's output. It never writes game files.
// Nothing here knows a particular game: colors, labels, tabs and phrases come from the game's look in the save.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CoderpgLook, CoderpgSave, CoderpgStory } from '../types'
import { feedback } from './feedback'
import { lookOf, money, tabsOf } from './look'
import { drawKey, drawMap, exitsOf, keyText, mapText, usesUpDown } from './map'
import { commandPhrase, idlePhrase, npcPhrase } from './phrases'
import { rpgCommand, TRAY_COMMANDS, trayLines, traySound } from './tray'
import type { TrayLine } from './tray'

const SAVE_PATH = 'state/save.json'
const PANE = 'coderpg-sheet'
const FLASH_MS = 1600

const save = atom({ plugin: 'coderpg', key: 'save' } as const, null)
const story = atom({ plugin: 'coderpg', key: 'story' } as const, [])
const hidden = atom({ plugin: 'coderpg', key: 'hidden' } as const, [])
const activity = atom({ plugin: 'coderpg', key: 'activity' } as const, null)
const flash = atom({ plugin: 'coderpg', key: 'flash' } as const, null)
const tab = atom({ plugin: 'coderpg', key: 'tab' } as const, 'here')
const muted = atom({ plugin: 'coderpg', key: 'muted' } as const, false)
const running = atom({ plugin: 'coderpg', key: 'running' } as const, false)

// ---------------------------------------------------------------- pure helpers

/** A tool call that is game plumbing rather than something the player should see. */
export function isPlumbing(tool: string, input: unknown): boolean {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  switch (tool) {
    case 'Bash':
      return /rules\/rpg\.py|(^|[\s/])(games|state|rules)\//.test(s('command'))
    case 'Read':
      return /\/(games|state|rules)\//.test(s('file_path'))
    case 'Skill':
      return ['gm-turn', 'newgame', 'game'].includes(s('skill'))
    case 'Agent':
      return ['npc', 'world'].includes(s('subagent_type'))
    case 'Write':
    case 'Edit':
      return /(^|\/)proposals\//.test(s('file_path'))
    case 'Grep':
    case 'Glob':
      return /(^|\/)(games|state|rules)(\/|$)/.test(s('path')) || /(^|\/)(games|state|rules)\//.test(s('pattern'))
    default:
      return false
  }
}

/**
 * Whether an unfinished call should stay hidden in a play turn: it is plumbing, or its input is
 * still streaming in (`{}`) so it can't be judged yet. Once its input arrives it is judged again.
 */
export function isPendingPlumbing(tool: string, input: unknown, output: unknown): boolean {
  if (output !== undefined) return false
  const isEmpty = input === undefined || input === null || (typeof input === 'object' && Object.keys(input).length === 0)
  return isEmpty || isPlumbing(tool, input)
}

/**
 * The key an assistant text block is remembered by: its whitespace-normalised length and an FNV-1a
 * hash of the whole text, so two narrations that open the same way never share an entry.
 */
export function storyKey(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim()
  let h = 0x811c9dc5
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${t.length}:${h.toString(16)}`
}

/** A short single-paragraph status line, as opposed to a piece of narration. */
export function isProgressNote(text: string): boolean {
  const t = text.trim()
  return t.length <= 240 && !t.includes('\n\n')
}

// Openings no story paragraph uses: on their own they mark a note.
const GM_ALWAYS = /^(Recording|Generating|Narrating|Spawning|Updating|Let me|I'll|I will|I'm|I am|Now I|World turn)\b/i
// Openings story can use too ("Saving her breath, ...", "Checking the door, you ..."): a note only if it also
// talks about the machinery.
const GM_MAYBE = /^(I\b|Now\b|Next\b|First\b|Saving|Running|Checking|Placing|Rolling|Bringing|Calling|Asking|Writing|Passing)\b/i
const GM_WORDS = /(narrat|generat|rpg\.py|world turn|world agent|subagent|npc agent|\bagent\b|\bthe brief\b|proposal|\bspawn|\bflags?\b|\bthe save\b|procedure|tool calls?|\brecord(ing)?\b|next thing you see|you'?ll see|\b(her|his|their|the) reply\b)/i

/**
 * A short line the game master wrote about what it's doing ("Recording what Ysolde noticed. Her reply is the
 * next thing you see.", "World turn is due; run it after this."), as opposed to story. It's one short
 * paragraph with no dialogue, and either opens the way no story does, or opens like a note and mentions
 * the machinery. Lines like "Saving her breath, Ysolde points at the stair." or "Flagstones gleam wet."
 * stay story.
 */
export function isGmNote(text: string): boolean {
  const t = text.trim()
  if (t.length > 200 || t.includes('\n\n') || /["“”]/.test(t)) return false
  return GM_ALWAYS.test(t) || (GM_MAYBE.test(t) && GM_WORDS.test(t))
}

/** Narration with a game-master note removed from its start, when story follows it. */
export function stripPreamble(text: string): string {
  const parts = text.trim().split(/\n\s*\n/)
  if (parts.length > 1 && isGmNote(parts[0]!)) return parts.slice(1).join('\n\n')
  return text
}

/**
 * Whether a typed slash command starts a different game, so the screen and the conversation are
 * cleared first: every /newgame, and /game naming a game other than the one being played.
 */
export function startsAfresh(command: string, args: string, currentGame: string | undefined): boolean {
  const a = args.trim()
  return command === 'newgame' || (command === 'game' && a !== '' && a !== currentGame)
}

/** Rules-script commands that only record what happened; the narration may come before them. */
const WRITE_COMMANDS = ['chronicle', 'remember', 'note', 'flag', 'coins', 'gain', 'lose', 'equip']

/** Dice-tray lines for a finished rules-script call, or none. */
export function trayFor(tool: string, input: unknown, output: unknown, look?: CoderpgLook): TrayLine[] {
  if (tool !== 'Bash' || output === undefined) return []
  const command = String((input as { command?: unknown } | null)?.command ?? '')
  const sub = rpgCommand(command)
  if (!sub || !TRAY_COMMANDS.includes(sub)) return []
  return trayLines(String((output as { stdout?: unknown } | null)?.stdout ?? ''), look)
}

/** The objective the player is working on, if any: the main quest's first, then side quests'. */
export function currentObjective(s: CoderpgSave): string | undefined {
  const quests = [...(s.view?.quests ?? [])].sort((a, b) => Number(a.side ?? false) - Number(b.side ?? false))
  for (const q of quests) {
    if (q.complete || q.failed) continue
    const o = q.objectives.find(x => !x.done)
    if (o) return o.text
  }
  return undefined
}

/** "The End" -> "T H E   E N D" for title and ending cards. */
export function spaced(text: string): string {
  return text.toUpperCase().split('').join(' ')
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`
}

function hpColor(hp: number, max: number, look: CoderpgLook): string {
  const p = look.palette
  return hp * 3 <= max ? p.bad : hp * 3 <= max * 2 ? p.warn : p.good
}

const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']

/** A bar filled to the nearest eighth of a cell: [filled part, empty part], `width` cells in all. */
export function smoothBar(value: number, max: number, width: number): [string, string] {
  const eighths = max > 0 ? Math.round(Math.max(0, Math.min(1, value / max)) * width * 8) : 0
  const full = Math.floor(eighths / 8), rem = eighths % 8
  return ['█'.repeat(full) + EIGHTHS[rem], '░'.repeat(Math.max(0, width - full - (rem ? 1 : 0)))]
}

/** A countdown drawn as pips: [left, spent], `width` pips in all. */
export function pipBar(left: number, total: number, width: number): [string, string] {
  const on = total > 0 ? Math.max(0, Math.min(width, Math.round((left / total) * width))) : 0
  return ['▰'.repeat(on), '▱'.repeat(width - on)]
}

/** A run of styled text inside a framed row; lengths are counted in cells. */
type Cell = { text: string; color?: string; dim?: boolean; bold?: boolean }

/** Cells cut to `width`, the last one ending in '…' when something had to go. */
export function fitCells(cells: Cell[], width: number): Cell[] {
  const out: Cell[] = []
  let used = 0
  for (const c of cells) {
    if (used + c.text.length <= width) { out.push(c); used += c.text.length; continue }
    const room = width - used
    if (room > 1) out.push({ ...c, text: c.text.slice(0, room - 1) + '…' })
    break
  }
  return out
}

/** Carried items with display names; a save older than version 3 has no `view`, so names come from ids. */
function itemsOf(s: CoderpgSave): { id: string; name: string; equipped: boolean }[] {
  if (s.view) return s.view.items
  const pretty = (id: string) => id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return s.inventory.map(id => ({ id, name: pretty(id), equipped: id === s.equipped }))
}

/** What each kind of action is, in the player's words, for /budget. */
const PRICE_NAMES: Record<string, string> = {
  turn: 'each turn', npc: 'a character answering in their own voice', generate: 'something new appearing',
  world_turn: 'the world moving on by itself',
}

/** The meter's color: plain while there's plenty, then the warning and danger colors. */
function meterColor(state: string | undefined, look: CoderpgLook): string | undefined {
  return state === 'spent' ? look.palette.bad : state === 'low' ? look.palette.warn : undefined
}

/** /budget: what's left, what things cost, and which of the owner's switches are on. */
export function budgetText(s: CoderpgSave): string {
  const look = lookOf(s)
  const m = s.view?.meter, v = s.view?.settings
  if (!m || !v) return 'Nothing to show yet. Make a move first.'
  const r = look.resource
  const on = (b: boolean) => (b ? 'on' : 'off')
  const prices = Object.entries(v.prices).filter(([k, n]) => n > 0 && PRICE_NAMES[k]).map(([k, n]) => `${PRICE_NAMES[k]} ${n}`)
  return [
    `**${r.icon} ${r.name}:** ${m.left}/${m.capacity}${m.state === 'spent' ? ' (spent)' : m.state === 'low' ? ' (running low)' : ''}. It refills each time you open Claude Code here.`,
    `**What things cost:** ${prices.join(' · ')}. Everything else is free.`,
    `**Characters' own voices:** ${on(v.npc_agents.on)}, up to ${v.npc_agents.lines_per_exchange} lines between two per turn${v.npc_agents.off_for.length ? `; voiced by the storyteller: ${v.npc_agents.off_for.join(', ')}` : ''}.`,
    `**The world moving on by itself:** ${on(v.world_turns.on)}, every ${v.world_turns.every_moves} moves.`,
    `**New things appearing:** ${on(v.generation.on && v.generation.kinds.length > 0)}, up to ${v.generation.max_per_run} per game${v.generation.kinds.length ? ` (${v.generation.kinds.join(', ').replace(/_/g, ' ')})` : ''}.`,
    `*Preset: ${v.preset}. The owner changes these with \`python3 tools/settings.py\`.*`,
  ].join('\n\n')
}

function inventoryText(s: CoderpgSave): string {
  const lines = itemsOf(s).map(it => `- ${it.name}${it.equipped ? ' *(equipped)*' : ''}`)
  const weight = s.view ? ` (weight ${s.view.weight}/${s.view.carry_limit})` : ''
  const currency = lookOf(s).currency
  return [`**Inventory**${weight}`, ...(lines.length ? lines : ['- nothing']),
    `**${currency.charAt(0).toUpperCase() + currency.slice(1)}:** ${s.stats.coins}`].join('\n')
}

// ---------------------------------------------------------------- engine-facing helpers

/** Save-file modification time last loaded; -1 forces a reload. */
let lastMtime = -1
/** When the HP flash ends (clock ms), or 0. */
let flashUntil = 0

async function sound($: EngineInterface, name: string): Promise<void> {
  if (await read($, muted)) return
  await $.audio.play({ asset: `sounds/${name}.wav` }).catch(() => undefined)
}

/** Re-read the save into $.state when the file changed, and announce what changed. */
async function refresh($: EngineInterface): Promise<void> {
  const stat = await $.fs.stat(SAVE_PATH).catch(() => undefined)
  if (!stat) {
    if (lastMtime !== 0) await update($, save, () => null)
    lastMtime = 0
    return
  }
  if (stat.mtimeMs === lastMtime) return
  lastMtime = stat.mtimeMs
  let parsed: CoderpgSave
  try {
    parsed = JSON.parse(await $.fs.read(SAVE_PATH)) as CoderpgSave
  } catch {
    lastMtime = -1 // mid-write or malformed: keep the last good copy, try again next tick
    return
  }
  const prev = await read($, save)
  await update($, save, () => parsed)
  const fb = feedback(prev, parsed)
  if (fb.toast) $.ui.toast(fb.toast)
  for (const s of fb.sounds) void sound($, s)
  if (fb.flash) {
    flashUntil = (await $.clock.now()) + FLASH_MS
    await update($, flash, () => fb.flash ?? null)
  }
}

/** Runs every second from session.start: picks up saves made outside a turn and ends the HP flash. */
async function tick($: EngineInterface): Promise<void> {
  await refresh($)
  if (flashUntil && (await $.clock.now()) > flashUntil) {
    flashUntil = 0
    await update($, flash, () => null)
  }
}

// ---------------------------------------------------------------- the mod

export const register: Register = on => {
  // Per-turn bookkeeping. Module variables are fine here: they only matter within a turn.
  let isGame = false // this session runs in a CodeRPG folder
  let isOoc = false
  let isGameTurn = false
  let isNewGame = false
  let seed = 0
  let turnStart: CoderpgSave | null = null
  let turnKeys: string[] = []
  let narrationFrom = 0 // turnKeys index where the text after the turn's last tool call begins
  let usedOtherTools = false // the turn used tools that aren't the game's (real development work)
  let turnActive = false // a game-master turn is running; a prompt typed meanwhile doesn't reset it

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if (!(await $.fs.exists('rules/rpg.py'))) return result // not a CodeRPG folder: stay inert
    isGame = true

    await $.command.register({ name: 'inventory', description: 'CodeRPG: show what you carry (instant, no turn)', immediate: true })
    await $.command.register({ name: 'map', description: 'CodeRPG: show the map and exits (instant, no turn)', immediate: true })
    await $.command.register({ name: 'sheet', description: 'CodeRPG: open the character pane', immediate: true })
    await $.command.register({ name: 'sound', description: 'CodeRPG: turn sound effects on or off', immediate: true })
    await $.command.register({ name: 'budget', description: 'CodeRPG: what is left to spend, what things cost, and what is switched on', immediate: true })

    const stored = await $.store.get('muted').catch(() => undefined)
    if (stored === true) await update($, muted, () => true)
    await refresh($)
    $.clock.every(1000, () => void tick($))
    void $.ui.open({ id: PANE, title: 'Character' })
    return result
  })

  // ---- telling play turns from developer turns

  // A turn's bookkeeping resets when the turn starts, not when a prompt is submitted: a prompt typed
  // while a turn runs is queued (or folded into it) and must not disturb the running turn.
  on('turn.start', async ($, e, next) => {
    if (turnActive) return next(e)
    turnActive = true
    isOoc = /^\s*ooc:/i.test(e.text)
    isGameTurn = false
    isNewGame = false
    turnKeys = []
    narrationFrom = 0
    usedOtherTools = false
    if (isGame) {
      turnStart = await read($, save)
      await update($, activity, () => (isOoc ? null : idlePhrase(seed++, lookOf(turnStart))))
      // anything a cut-off turn left pending is shown as it stands
      await update($, story, list => list.map(x => (x.pending ? { ...x, pending: false } : x)))
      await update($, running, () => !isOoc)
    }
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId) return result // a subagent's turn (an NPC or the world agent), not the game master's
    turnActive = false
    // A non-ooc turn is play if it touched the game, or if it used no tools at all (a pure-dialogue reply).
    if (isGame && !isOoc && !usedOtherTools) isGameTurn = true
    if (isGame && !isGameTurn && turnKeys.length) {
      // the turn never touched the game: its text was held back for nothing, so draw it as Claude's own
      const mine = new Set(turnKeys)
      await update($, story, list => list.filter(x => !mine.has(x.key)))
    }
    if (isGame && isGameTurn && turnKeys.length) {
      // Once the turn is done: text before its last tool call was an aside; the rest is the narration,
      // which gets the room banner or title card on top and any ending card underneath.
      await refresh($)
      const now = await read($, save)
      const was = turnStart
      const list = await read($, story)
      const isNote = (k: string) => list.find(x => x.key === k)?.note === true
      const candidates = turnKeys.slice(narrationFrom)
      const narration = candidates.some(k => !isNote(k)) ? candidates.filter(k => !isNote(k)) : candidates
      const asides = new Set(turnKeys.filter(k => !narration.includes(k)))
      const first = narration[0]
      const banner = !isNewGame && now && was && now.location !== was.location ? now.view?.location_name ?? now.location : undefined
      const title = isNewGame && now ? now.adventure : undefined
      const runLabel = isNewGame ? now?.view?.run_label ?? undefined : undefined
      const mine = new Set(turnKeys)
      await update($, story, list => list.map(s =>
        asides.has(s.key) ? { ...s, aside: true, pending: false }
        : s.key === first ? { ...s, pending: false, ...(banner ? { banner } : {}), ...(title ? { title } : {}), ...(runLabel ? { runLabel } : {}) }
        : mine.has(s.key) ? { ...s, pending: false }
        : s))
      const last = narration[narration.length - 1]
      const before = (id: string) => was?.view?.quests?.find(p => p.id === id)
      const main = (now?.view?.quests ?? []).filter(q => !q.side)
      const won = main.find(q => q.complete && !before(q.id)?.complete)
      const lost = main.find(q => q.failed && !before(q.id)?.failed)
      const ending: CoderpgStory['ending'] = now?.status === 'defeated' && was?.status !== 'defeated' ? 'defeat'
        : won ? 'victory' : lost ? 'lost' : undefined
      if (ending) {
        const quest = (won ?? lost)?.name
        await update($, story, list => list.map(s => (s.key === last ? { ...s, ending, endingQuest: quest } : s)))
      }
    }
    isGameTurn = false
    await update($, activity, () => null)
    await update($, running, () => false)
    return result
  })

  on('tool.call', async ($, e, next) => {
    // Plumbing is hidden only in play: an ooc: turn shows every call.
    const isPlay = isGame && !isOoc && !e.agentId && isPlumbing(e.tool, e)
    if (!e.agentId && !isPlumbing(e.tool, e)) usedOtherTools = true
    if (isPlay) {
      isGameTurn = true
      const sub = e.tool === 'Bash' ? rpgCommand(String((e as { command?: unknown }).command)) : undefined
      // Text before this call wasn't the narration, unless this call only records what happened.
      if (!(sub && WRITE_COMMANDS.includes(sub))) narrationFrom = turnKeys.length
      await update($, hidden, ids => [...ids, e.tool_use_id].slice(-3000))
      if (sub === 'newgame') isNewGame = true
      const agentType = String((e as { subagent_type?: unknown }).subagent_type ?? '')
      const phrase = e.tool === 'Agent' ? (agentType === 'world' ? 'The world takes shape' : npcPhrase(String((e as { prompt?: unknown }).prompt ?? '')))
        : sub ? commandPhrase(sub, seed++, lookOf(await read($, save)))
        : e.tool === 'Read' ? 'Recalling the place' : undefined
      if (phrase) await update($, activity, () => phrase)
    }
    // The running-agents list shows each Agent call's description ("Generate fisherman extra");
    // in play it gets the in-world phrase instead.
    const call = isPlay && e.tool === 'Agent' ? { ...e, description: (await read($, activity)) ?? 'The world takes shape' } : e
    const ran = await next(call)
    if (e.tool === 'Bash' && /rules\/rpg\.py/.test(String((e as { command?: unknown }).command))) {
      await refresh($)
      if (isPlay && ran.result !== undefined) {
        const s = traySound(trayFor('Bash', e, ran.result, lookOf(await read($, save))))
        if (s) void sound($, s)
      }
    }
    return ran
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    // Every text block of a non-ooc turn is held back (pending) until the turn shows what it was.
    if (isGame && !isOoc && !e.agentId && e.door === 'response' && e.message.role === 'assistant') {
      const blocks = e.message.content
        .filter((b): b is { type: 'text'; text: string } => (b as { type?: string }).type === 'text' && (b as { text?: string }).text?.trim() !== '')
        .map(b => ({ key: storyKey(b.text), pending: true, note: isGmNote(b.text) }))
      if (blocks.length) {
        turnKeys.push(...blocks.map(b => b.key))
        await update($, story, list => [...list, ...blocks].slice(-2000))
      }
    }
    return stored
  })

  // ---- story cards

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    const key = storyKey(e.props.text)
    const entry = (await read($, story)).find(s => s.key === key)
    const { Box, Text, Markdown } = $.ui.resolve(e)
    const look = lookOf(await read($, save))
    const accent = look.palette.accent
    if (!entry) {
      // still streaming in a play turn: say nothing until the turn is done
      return isGame && !isOoc && (await read($, running)) ? <Box display="none" /> : next(e)
    }
    if (entry.pending) return <Box display="none" />
    if (entry.aside) {
      // A one-line progress note ("Saving the fisherman…") is hidden; anything longer stays, dimmed,
      // in case it was narration written out of order.
      if (isProgressNote(e.props.text)) return <Box display="none" />
      return (
        <Box paddingLeft={2}>
          <Markdown text={e.props.text} dimColor />
        </Box>
      )
    }
    return (
      <Box flexDirection="column" marginTop={e.props.isFirstOfReply ? 1 : 0}>
        {entry.title && (
          <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor={accent} paddingX={2} marginBottom={1}>
            <Text color={accent} bold>{spaced(entry.title)}</Text>
            <Text dimColor>{look.tagline}</Text>
            {entry.runLabel && <Text dimColor>{entry.runLabel}</Text>}
          </Box>
        )}
        <Box flexDirection="column" borderStyle="round" borderColor={accent} paddingX={1}>
          {entry.banner && <Text color={accent} bold>── {entry.banner.toUpperCase()} ──</Text>}
          <Markdown text={stripPreamble(e.props.text)} />
        </Box>
        {entry.ending === 'victory' && (
          <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor={accent} paddingX={2} marginTop={1}>
            <Text color={accent} bold>✦  {spaced('The End')}  ✦</Text>
            {entry.endingQuest && <Text>Quest complete: {entry.endingQuest}</Text>}
            <Text dimColor>Keep exploring, or type /newgame to play again.</Text>
          </Box>
        )}
        {entry.ending === 'lost' && (
          <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor="gray" paddingX={2} marginTop={1}>
            <Text bold>✦  {spaced('The End')}  ✦</Text>
            {entry.endingQuest && <Text dimColor>Quest failed: {entry.endingQuest}</Text>}
            <Text dimColor>Keep exploring, or type /newgame to try again.</Text>
          </Box>
        )}
        {entry.ending === 'defeat' && (
          <Box flexDirection="column" alignItems="center" borderStyle="double" borderColor={look.palette.bad} paddingX={2} marginTop={1}>
            <Text color={look.palette.bad} bold>✦  {spaced('You have fallen')}  ✦</Text>
            <Text dimColor>Type /newgame to try again.</Text>
          </Box>
        )}
      </Box>
    )
  })

  // ---- hide the plumbing; show dice rolls as a tray

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    // A finished call is hidden when tool.call recorded it. An unfinished one (no output yet)
    // can draw before that record lands, so it is judged from its input while the turn isn't ooc:.
    const isLivePlumbing = isGame && !isOoc && isPendingPlumbing(e.props.tool, e.props.input, e.props.output)
    if (!isLivePlumbing && !(await read($, hidden)).includes(e.props.tool_use_id)) return next(e)
    const look = lookOf(await read($, save))
    return drawTray($, e, trayFor(e.props.tool, e.props.input, e.props.output, look), look)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (!(await read($, hidden)).includes(e.props.tool_use_id)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.props.isExpanded) return next(e)
    const ids = await read($, hidden)
    const isHidden = (c: (typeof e.props.calls)[number]) =>
      (c.tool_use_id !== undefined && ids.includes(c.tool_use_id)) || (isGame && !isOoc && isPendingPlumbing(c.tool, c.input, c.output))
    if (!e.props.calls.every(isHidden)) return next(e)
    const look = lookOf(await read($, save))
    return drawTray($, e, e.props.calls.flatMap(c => trayFor(c.tool, c.input, c.output, look)), look)
  })

  // ---- Claude's chrome, in-world

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!isGame || isOoc) return next(e)
    // Routine status messages ("Running Agent…") give the game away; ones the player must see don't.
    const message = e.props.message && /permission|approv|compact|retry|rate|limit|overload|error|context|interrupt|wait/i.test(e.props.message)
      ? e.props.message : null
    if (message) return next(e)
    const phrase = await read($, activity)
    return next({ ...e, props: { ...e.props, message: null, word: phrase ?? e.props.word } })
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    if (!(await read($, hidden)).includes(e.props.tool_use_id)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!isGame) return next(e)
    const { Text } = $.ui.resolve(e)
    return <Text dimColor>{'        ~ ✦ ~'}</Text>
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // A game agent's reply row ("Message from @world"): plumbing, so hidden in play.
    if (isGame && !isOoc && !e.props.isExpanded && /^(world|npc)\b/.test(e.props.from?.name ?? '')) {
      const { Box } = $.ui.resolve(e)
      return <Box display="none" />
    }
    const kind = e.props.origin.kind
    if (!isGame || e.props.isExpanded || (kind !== 'composer' && kind !== 'plugin') || /^\s*(ooc:|\/)/i.test(e.props.text)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const accent = lookOf(await read($, save)).palette.accent
    return (
      <Box flexDirection="row" marginTop={1}>
        <Text color={accent} bold>» </Text>
        <Text italic>{e.props.text}</Text>
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isGame || e.props.hasSurvey) return next(e)
    const s = await read($, save)
    if (!s) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const look = lookOf(s)
    const accent = look.palette.accent
    const objective = currentObjective(s)
    const clock = s.view?.clock ?? null
    const sep = <Text dimColor>{'  │  '}</Text>
    return (
      <Box flexDirection="row">
        <Text color={accent} bold wrap="truncate">◆ {s.view?.location_name ?? s.location}</Text>
        {sep}
        <Text color={hpColor(s.stats.hp, s.stats.max_hp, look)}>♥ {s.stats.hp}/{s.stats.max_hp}</Text>
        {sep}
        <Text>{money(s.stats.coins, look)}</Text>
        {s.view?.meter ? sep : null}
        {s.view?.meter ? <Text color={meterColor(s.view.meter.state, look)}>{look.resource.icon} {s.view.meter.left}</Text> : null}
        {clock ? sep : null}
        {clock ? <Text color={clock.left <= 3 ? look.palette.bad : undefined}>⧗ {clock.left > 0 ? clock.left : '!'}</Text> : null}
        {s.view?.time ? sep : null}
        {s.view?.time ? <Text dimColor>{s.view.time}</Text> : null}
        {objective ? sep : null}
        {objective ? <Text dimColor wrap="truncate">▸ {objective}</Text> : null}
      </Box>
    )
  })

  // ---- a fresh screen and a fresh conversation for a new game or another game
  // The save holds everything that matters, so /clear loses nothing; the old game's text would only
  // cost tokens on every later turn and leak stale details. /game with no argument only lists, and
  // /game naming the game already being played changes nothing, so neither clears.
  // Skill commands raise no command.run, and a prompt.submit hook may not run commands itself, so the
  // typed command is dropped and run again, after /clear, from a timer. Claude Code shows the drop's
  // reason for a moment before the screen clears; it reads as part of the story.

  on('prompt.submit', async ($, e, next) => {
    const c = e.command
    if (!isGame || !c || e.origin.kind === 'plugin') return next(e)
    const args = c.args.trim()
    if (!startsAfresh(c.name, args, (await read($, save))?.game)) return next(e)
    $.clock.after(50, async () => {
      // a dropped prompt stays in the prompt box; empty it, or the next thing typed is appended to it
      await $.prompt.fill({ text: '', mode: 'replace' }).catch(() => undefined)
      await $.command.run({ command: 'clear' }).catch(() => undefined) // if it fails, the command still runs
      await $.command.run({ command: c.name, args })
        .catch(() => $.ui.toast(`Type /${c.name}${args ? ' ' + args : ''} again to begin.`))
    })
    return { drop: 'The page turns…' }
  }).catch(($, e, next) => next(e)) // on any failure the command runs as typed, without the clear

  // ---- instant commands

  on('command.run', { command: 'inventory' }, async $ => {
    await refresh($)
    const s = await read($, save)
    return { text: s ? inventoryText(s) : 'No game yet. Type /newgame to start.' }
  })

  on('command.run', { command: 'map' }, async $ => {
    await refresh($)
    const s = await read($, save)
    if (!s) return { text: 'No game yet. Type /newgame to start.' }
    if (!s.map || !s.map[s.location]) return { text: 'The map fills in as you explore. Make a move first.' }
    const exits = exitsOf(s.map, s.location).map(x => `- **${x.dir}**: ${x.name}${x.isExplored ? '' : ' *(not visited yet)*'}`)
    return {
      text: [
        `**You are at:** ${s.view?.location_name ?? s.location}`,
        '',
        '**Exits**',
        ...(exits.length ? exits : ['- none open']),
        '',
        '```',
        ...mapText(s.map, s.location, 72),
        '',
        ...keyText(72, usesUpDown(s.map)),
        '```',
      ].join('\n'),
    }
  })

  on('command.run', { command: 'budget' }, async $ => {
    await refresh($)
    const s = await read($, save)
    return { text: s ? budgetText(s) : 'No game yet. Type /newgame to start.' }
  })

  on('command.run', { command: 'sheet' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Character', focus: true })
    return { text: 'Character pane opened.' }
  })

  on('command.run', { command: 'sound' }, async $ => {
    const isMuted = !(await read($, muted))
    await update($, muted, () => isMuted)
    await $.store.set('muted', isMuted)
    return { text: isMuted ? 'Sound effects off.' : 'Sound effects on.' }
  })

  // ---- the character pane

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const s = await read($, save)
    const look = lookOf(s)
    const accent = look.palette.accent
    // a little room between the pane's divider and its text
    const PAD = 2
    const width = Math.max(26, (e.props.bodyColumns ?? 36) - PAD - 1)
    if (!s) {
      return (
        <Box flexDirection="column" paddingLeft={PAD}>
          <Text color={accent} bold>CodeRPG</Text>
          <Text dimColor>No game yet. Type /newgame to start.</Text>
        </Box>
      )
    }
    const tabs = tabsOf(look)
    const stored = await read($, tab)
    const open = tabs.some(t => t.id === stored) ? stored : tabs[0]!.id
    const flashing = await read($, flash)
    const { hp, max_hp, might, agility, wits, coins } = s.stats
    const objective = currentObjective(s)
    const say = (text: string) => () => void $.prompt.submit({ text, asUser: true })
    const exits = s.map ? exitsOf(s.map, s.location) : []
    const here = s.view?.characters_here ?? []
    const items = itemsOf(s)
    const frameW = Math.min(width, 56)
    const mapRows = s.map ? drawMap(s.map, s.location, frameW - 4) : []
    const keyRows = s.map ? drawKey(frameW - 4, usesUpDown(s.map)) : []
    const quests = s.view?.quests ?? []
    const people = s.view?.people ?? []
    const chronicle = s.view?.chronicle ?? []
    const rumors = s.view?.rumors ?? []

    // ---- the vitals frame: a rounded box drawn by hand so its title sits in the top border
    const inner = frameW - 4
    const cell = (c: Cell) => <Text color={c.color} dimColor={c.dim} bold={c.bold}>{c.text}</Text>
    const frameRow = (cells: Cell[]) => {
      const fitted = fitCells(cells, inner)
      const used = fitted.reduce((n, c) => n + c.text.length, 0)
      return (
        <Box flexDirection="row">
          <Text dimColor>│ </Text>
          {fitted.map(cell)}
          <Text>{' '.repeat(Math.max(0, inner - used))}</Text>
          <Text dimColor> │</Text>
        </Box>
      )
    }
    const barRow = (icon: Cell, value: number, max: number, color: string, bold: boolean) => {
      const tail = ` ${value}/${max}`
      const [full, empty] = smoothBar(value, max, Math.max(4, inner - icon.text.length - tail.length))
      return frameRow([icon, { text: full, color, bold }, { text: empty, dim: true }, { text: tail, bold }])
    }
    const hpBarColor = flashing === 'hurt' ? look.palette.bad : flashing === 'heal' ? look.palette.heal : hpColor(hp, max_hp, look)
    const clock = s.view?.clock ?? null
    const clockColor = clock && clock.left <= 3 ? look.palette.bad : accent
    const clockRows = !clock ? [] : clock.left > 0
      ? (() => {
          const tail = `  ${clock.left} move${clock.left === 1 ? '' : 's'} left`
          const [lit, spent] = pipBar(clock.left, clock.total, Math.max(4, Math.min(16, inner - 2 - tail.length)))
          return [
            frameRow([{ text: '⧗ ', color: clockColor }, { text: clock.name, color: clockColor }]),
            frameRow([{ text: '  ' }, { text: lit, color: clockColor }, { text: spent, dim: true }, { text: tail, dim: true }]),
          ]
        })()
      : [frameRow([{ text: '⧗ ', color: look.palette.bad }, { text: `${clock.name}: it has happened`, color: look.palette.bad }])]

    const vitals = (
      <Box flexDirection="column">
        <Box flexDirection="row">
          <Text dimColor>╭─ </Text>
          <Text color={accent} bold>VITALS</Text>
          <Text dimColor>{' ' + '─'.repeat(Math.max(0, frameW - 11)) + '╮'}</Text>
        </Box>
        {barRow({ text: '♥ ', color: hpBarColor }, hp, max_hp, hpBarColor, flashing !== null)}
        {(s.view?.foes ?? []).map(f => barRow({ text: `⚔ ${f.name} `, color: look.palette.bad, bold: true }, f.hp, f.max_hp, look.palette.bad, false))}
        {frameRow([
          { text: `${look.stat_short.might} `, dim: true }, { text: signed(might) },
          { text: `    ${look.stat_short.agility} `, dim: true }, { text: signed(agility) },
          { text: `    ${look.stat_short.wits} `, dim: true }, { text: signed(wits) },
        ])}
        {frameRow([{ text: '◎ ', color: accent }, { text: money(coins, look) }])}
        {s.view?.meter && barRow({ text: `${look.resource.icon} ${look.resource.name} `, color: meterColor(s.view.meter.state, look) ?? accent },
          s.view.meter.left, s.view.meter.capacity, meterColor(s.view.meter.state, look) ?? accent, false)}
        {clockRows}
        <Text dimColor>{'╰' + '─'.repeat(Math.max(0, frameW - 2)) + '╯'}</Text>
      </Box>
    )

    // ---- tabs: the active one a solid pill in the accent color, the others dim buttons; they head the tab frame
    const tabStrip = (
      <Box flexDirection="row" gap={2} paddingX={1}>
        {tabs.map(t => open === t.id
          ? <Text key={`tab-${t.id}`} backgroundColor={accent} color="black" bold>{` ${t.hotkey}: ${t.label} `}</Text>
          : <Button key={`tab-${t.id}`} label={t.label} hotkey={t.hotkey} plain dimColor onPress={() => update($, tab, () => t.id)} />)}
      </Box>
    )

    const hereTab = (
      <Box flexDirection="column">
        {(s.view?.art ?? '').split('\n').filter(l => l.length > 0).map(l => <Text color={accent} dimColor wrap="truncate">{l}</Text>)}
        <Text color={accent} bold wrap="truncate">{s.view?.location_name ?? s.location}</Text>
        <Text> </Text>
        <Text bold>Go</Text>
        {!s.map?.[s.location] && <Text dimColor>  exits appear after your next move</Text>}
        {exits.map((x, i) => (
          <Button key={`go-${x.dir}`} label={`${x.dir} → ${x.name === 'unexplored' ? '?' : x.name}`} hotkey={i < 9 ? String(i + 1) : undefined}
            plain onPress={say(`go ${x.dir}`)} />
        ))}
        <Button key="look" label="look around" hotkey="l" plain onPress={say('look around')} />
        {here.length > 0 && <Text> </Text>}
        {here.length > 0 && <Text bold>People here</Text>}
        {here.map(p => (
          <Button key={`talk-${p.id}`} label={`talk to ${p.name}`} plain
            onPress={() => void $.prompt.fill({ text: `I say to ${p.name}: "`, mode: 'replace' })} />
        ))}
        <Text> </Text>
        <Box flexDirection="row">
          <Text bold>Inventory</Text>
          {s.view && <Text dimColor> {s.view.weight}/{s.view.carry_limit}</Text>}
        </Box>
        {items.length === 0 && <Text dimColor>  nothing</Text>}
        {items.map(it => (
          <Box flexDirection="row">
            <Text wrap="truncate">  {it.equipped ? '▸' : '·'} {it.name}</Text>
            {it.equipped && <Text dimColor> (equipped)</Text>}
          </Box>
        ))}
      </Box>
    )

    const mapTab = (
      <Box flexDirection="column">
        {mapRows.length === 0 && <Text dimColor>The map fills in as you explore.</Text>}
        {mapRows.map(row => (
          <Box flexDirection="row">
            {row.map(seg =>
              seg.kind === 'here' ? <Text color={accent} bold>{seg.text}</Text>
              : seg.kind === 'room' ? <Text>{seg.text}</Text>
              : <Text dimColor>{seg.text}</Text>,
            )}
          </Box>
        ))}
        {mapRows.length > 0 && <Text> </Text>}
        {mapRows.length > 0 && <Text dimColor>Key</Text>}
        {mapRows.length > 0 && keyRows.map(row => (
          <Box flexDirection="row">
            {row.map(seg =>
              seg.kind === 'here' ? <Text color={accent} bold>{seg.text}</Text>
              : seg.kind === 'room' ? <Text>{seg.text}</Text>
              : <Text dimColor>{seg.text}</Text>,
            )}
          </Box>
        ))}
      </Box>
    )

    const journalTab = (
      <Box flexDirection="column">
        <Text bold>Quests</Text>
        {quests.length === 0 && <Text dimColor>  none yet</Text>}
        {quests.map(q => (
          <Box flexDirection="column">
            <Text color={q.failed ? look.palette.bad : accent} bold>
              {q.complete ? '★' : q.failed ? '✗' : '◆'} {q.name}{q.side ? ' (side)' : ''}{q.complete ? ' (complete)' : q.failed ? ' (failed)' : ''}
            </Text>
            {q.objectives.map(o => (
              <Text dimColor={o.done}>  {o.done ? '✓' : '▸'} {o.text}</Text>
            ))}
          </Box>
        ))}
        {chronicle.length > 0 && <Text> </Text>}
        {chronicle.length > 0 && <Text bold>The story so far</Text>}
        {chronicle.map(c => <Text dimColor>  · {c}</Text>)}
        {rumors.length > 0 && <Text> </Text>}
        {rumors.length > 0 && <Text bold>Heard around</Text>}
        {rumors.map(r => <Text dimColor italic>  “{r}”</Text>)}
        <Text> </Text>
        <Text bold>People you've met</Text>
        {people.length === 0 && <Text dimColor>  no one yet</Text>}
        {people.map(p => (
          <Box flexDirection="column" marginBottom={p.memory.length ? 1 : 0}>
            <Box flexDirection="row">
              <Text bold>{p.name}</Text>
              <Text dimColor wrap="truncate">, {p.role}{p.here ? ' · here' : ''}</Text>
            </Box>
            {p.memory.map(m => <Text dimColor italic>  “{m}”</Text>)}
          </Box>
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" paddingLeft={PAD} minHeight={e.props.scroll?.bodyRows ?? 0}>
        <Text color={accent} bold wrap="truncate">{s.adventure}</Text>
        {s.status !== 'playing' && <Text color={look.palette.bad} bold>{s.status.toUpperCase()}: type /newgame</Text>}
        {(s.view?.time || s.view?.weather) && (
          <Text dimColor wrap="truncate">{[s.view?.time, s.view?.weather].filter(Boolean).join(' · ')}</Text>
        )}
        <Text> </Text>
        {vitals}
        {objective && <Text color={accent} wrap="truncate">▸ {objective}</Text>}
        <Text> </Text>
        <Box flexDirection="column" width={frameW} flexGrow={1} borderStyle="round" borderDimColor>
          {tabStrip}
          <Text dimColor>{'─'.repeat(frameW - 2)}</Text>
          <Box flexDirection="column" paddingX={1} paddingTop={1}>
            {open === 'here' ? hereTab : open === 'map' ? mapTab : journalTab}
          </Box>
        </Box>
        <Text dimColor wrap="truncate">1–9 go  ·  l look  ·  {tabs.map(t => t.hotkey).join(' ')} tabs</Text>
      </Box>
    )
  })
}

/** A dice tray in place of a hidden tool row, or nothing when the row has nothing to show. */
function drawTray($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], lines: TrayLine[], look: CoderpgLook) {
  const { Box, Text } = $.ui.resolve(e)
  if (lines.length === 0) return <Box display="none" />
  return (
    <Box flexDirection="column" paddingLeft={2}>
      {lines.map(l => (
        <Box flexDirection="row">
          <Text color={look.palette.accent}>{l.icon} </Text>
          <Text dimColor={l.tone === 'neutral'}>{l.text}</Text>
          {l.result && <Text color={l.tone === 'good' ? look.palette.good : look.palette.bad} bold>{` ${l.result}`}</Text>}
        </Box>
      ))}
    </Box>
  )
}
