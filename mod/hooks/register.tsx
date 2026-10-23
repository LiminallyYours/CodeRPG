// CodeRPG mod: makes Claude Code look and feel like the game.
// - narration drawn as a page: plain prose at a reading measure, appearing a paragraph at a time, speech
//   beside a keyline in the speaker's color, a rule on arrival, a change line under each turn, title and ending cards
// - the game's plumbing hidden, except dice rolls, which show as a dice tray
// - Claude's chrome (spinner, turn timer, prompt rows) replaced with in-world touches
// - a status band above the prompt and a tabbed character pane (Here / Map / Journal)
//   with clickable exits and actions
// - an HP flash and sound effects when things change; toasts only for what needs attention now
// - instant /inventory, /map, /sheet and /sound commands
// - /budget, with what the session really used in tokens (the owner's check on the meter's prices)
// Everything it shows comes from state/save.json and the rules script's output. It never writes game files.
// Nothing here knows a particular game: colors, labels, tabs and phrases come from the game's look in the save.

import { atom, read, update } from 'claude-code'
import type { ClientProps, ElementConstructor, EngineInterface, Register } from 'claude-code'

import type { CoderpgLook, CoderpgPhase, CoderpgSave, CoderpgStory } from '../types'
import { cursedWords } from './curse'
import { changesOf, feedback } from './feedback'
import { accentOf, lookOf, money, phasePhrase, soundFor, tabsOf } from './look'
import { exitsOf, keyText, mapText, usesUpDown } from './map'
import { commandPhrase, idlePhrase, npcPhrase, phaseOf } from './phrases'
import { drawBlocks, pageMs, STEP_MS } from './page'
import type { Seg } from './reveal'
import { arrivalRow, blocksOf, endingRows, INDENT, looksTagged, measureOf, paragraphsOf, ruleRow, spaced, speakerCards, titleRows } from './story'
import { addUsage, endTurn, helperStep, isSpend, looseStep, measured, newSpend, roleOf, spawned, spendText, withRow, ZERO } from './spend'
import type { Spend, SpendRow, Tokens } from './spend'
import { combatOf, rpgCommand, rpgCommands, TRAY_COMMANDS, trayLines, traySound } from './tray'
import type { CombatSide, TrayLine } from './tray'
import { stripAt, FX_MS } from './trayfx'
import { runsOf, tileGrid } from './tiles'

export { spaced }

const SAVE_PATH = 'state/save.json'
const PANE = 'coderpg-sheet'
const FLASH_MS = 1600
const FRESH_MS = 1500 // a story card or tray this new still animates; older ones are drawn still
const TITLE_MS = 900 // the title card types itself out over this long; the narration under it waits for it

const save = atom({ plugin: 'coderpg', key: 'save' } as const, null)
const story = atom({ plugin: 'coderpg', key: 'story' } as const, [])
const hidden = atom({ plugin: 'coderpg', key: 'hidden' } as const, [])
const activity = atom({ plugin: 'coderpg', key: 'activity' } as const, null)
const flash = atom({ plugin: 'coderpg', key: 'flash' } as const, null)
const tab = atom({ plugin: 'coderpg', key: 'tab' } as const, 'here')
const muted = atom({ plugin: 'coderpg', key: 'muted' } as const, false)
const running = atom({ plugin: 'coderpg', key: 'running' } as const, false)
const cursed = atom({ plugin: 'coderpg', key: 'cursed' } as const, [])
const spend = atom({ plugin: 'coderpg', key: 'spend' } as const, null)
const revealSkip = atom({ plugin: 'coderpg', key: 'revealSkip' } as const, 0)
const latest = atom({ plugin: 'coderpg', key: 'latest' } as const, null)

// ---------------------------------------------------------------- pure helpers

/** A tool call that is game plumbing rather than something the player should see. */
export function isPlumbing(tool: string, input: unknown): boolean {
  const i = (input ?? {}) as Record<string, unknown>
  const s = (k: string) => (typeof i[k] === 'string' ? (i[k] as string) : '')
  switch (tool) {
    case 'Bash':
      return /rules\/rpg\.py|(^|[\s/])(games|state|rules)\//.test(s('command'))
    case 'Read':
      // the game's files, and its own procedure (a game master sometimes reads the skill file rather than loading it)
      return /\/(games|state|rules)\/|(^|\/)\.claude\/(skills|agents)\//.test(s('file_path'))
    case 'Skill':
      return ['gm-turn', 'newgame', 'game', 'newworld'].includes(s('skill'))
    case 'Agent':
      return ['npc', 'world', 'worldsmith'].includes(s('subagent_type'))
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
// Anywhere in a note-shaped paragraph, these give it away however it opens: the machinery by name, the game
// master speaking as "I" (narration is in the second person and dialogue is in quotes), or figures (narration
// spells numbers out; a status line like "priced at 5 credits, not paid for yet" doesn't).
// A progress line answering Claude Code's mid-turn nudge ("Settling in beside Old Hob now.", "Bringing the
// fisherman into being…"): one short sentence that trails off or says it's happening now.
const GM_PROGRESS = /^[^.!?…]{1,90}(…|\.\.\.|\bnow\.)$/
const GM_ANYWHERE = /(narrating|\bnarration\b|rpg\.py|world agent|subagent|world update|\bworld turn\b|off-screen|proposal|tool calls?|\b(start(ing)?|end(ing)?) the (side )?scene\b|\bI('ve|'m|'ll|'d)?\b|\d)/

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
  if (looksTagged(t) && !GM_ALWAYS.test(t)) return false // someone's speech, tagged with their name ("Pell: I'll fetch it.")
  return GM_ALWAYS.test(t) || GM_ANYWHERE.test(t) || GM_PROGRESS.test(t) || (GM_MAYBE.test(t) && GM_WORDS.test(t))
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
const WRITE_COMMANDS = ['chronicle', 'remember', 'note', 'flag', 'coins', 'gain', 'lose', 'equip', 'library']

/** Whether a shell command only records what happened: every rules-script command in it is a recording one
 *  ("remember …; scene end …" is not, so text before it is no narration). */
export function onlyRecords(command: string): boolean {
  const subs = rpgCommands(command)
  return subs.length > 0 && subs.every(s => WRITE_COMMANDS.includes(s))
}

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
function itemsOf(s: CoderpgSave): { id: string; name: string; equipped: boolean; own?: boolean }[] {
  if (s.view) return s.view.items
  const pretty = (id: string) => id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  return s.inventory.map(id => ({ id, name: pretty(id), equipped: id === s.equipped }))
}

/** What each priced extra is, in the player's words, for /budget. Playing the game as written is free. */
const PRICE_NAMES: Record<string, string> = {
  generate: 'something new appearing', world_turn: 'the world moving on by itself', craft: 'having something made', build: 'having something built',
  reuse: 'someone or something coming back from an earlier game',
  promote: 'someone you keep coming back to finding their own voice',
  scene: 'a little scene between two characters',
}

/** The hint line under the prompt in play. */
export const PLAY_HINT = '⏎ act · ooc: speak to the builder · ctrl+x tab to the margin · /guide help'
/** The hint line while a play turn runs. */
export const WORKING_HINT = 'esc to interrupt'

/** Health in the band: red or the heal color for the turn it changed, red while it's at a quarter or less. */
export function bandHpColor(s: CoderpgSave, flashed: 'hurt' | 'heal' | undefined, look: CoderpgLook): string | undefined {
  if (flashed === 'hurt') return look.palette.bad
  if (flashed === 'heal') return look.palette.heal
  return s.stats.hp * 4 <= s.stats.max_hp ? look.palette.bad : undefined
}

/** The band without the pane: place, health, money, the resource, curses, the clock, the time and the objective. */
export function bandParts(s: CoderpgSave, accent: string): { text: string; color?: string; bold?: boolean }[] {
  const look = lookOf(s)
  const v = s.view
  const clock = v?.clock
  const objective = currentObjective(s)
  return [
    { text: `◆ ${v?.location_name ?? s.location}`, color: accent, bold: true },
    { text: `♥ ${s.stats.hp}`, color: bandHpColor(s, undefined, look) },
    { text: `◎ ${s.stats.coins}` },
    ...(v?.meter ? [{ text: `${look.resource.icon} ${v.meter.left}`, color: meterColor(v.meter.state, look) }] : []),
    ...(v?.curses ?? []).map(c => ({ text: `✶ ${c.name}`, color: look.palette.bad })),
    ...(clock ? [{ text: `⧗ ${clock.left > 0 ? clock.left : '!'}`, color: clock.left <= 3 ? look.palette.bad : undefined }] : []),
    ...(v?.time ? [{ text: v.time }] : []),
    ...(objective ? [{ text: `▸ ${objective}`, color: accent }] : []),
  ]
}

/** /guide: how to play, in the game's own names. */
export function guideText(s: CoderpgSave | null): string {
  const look = lookOf(s)
  const keys = tabsOf(look).filter(t => t.id !== 'here').map(t => `**${t.hotkey}** ${t.label.toLowerCase()}`).join(', ')
  return [
    `**How to play${s ? ` ${s.adventure}` : ''}**`,
    'Say what you do, in your own words, and press Enter: *I go north*, *I ask Pell about the lamp*, *I search the boat*.',
    `**The margin** (the pane on the right, on a wide screen): click it, or press **ctrl+x** then **tab**, and its keys work: **1–9** a way out, **l** look around, ${keys}. **Esc** comes back to the prompt. Its buttons fill the prompt for you; Enter sends.`,
    '**Instant, and free:** `/map` the map and the ways out, `/inventory` what you carry, `/sheet` opens the margin, `/budget` what is left to spend, `/sound` sound on or off, `/guide` this.',
    '**Games:** `/newgame` starts over (`/newgame <seed>` replays a run), `/game` lists the games and `/game <id>` switches, `/newworld <a sentence>` asks for a new world to be made.',
    '**Outside the game:** start a message with `ooc:` to talk to the builder rather than play.',
  ].join('\n\n')
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
    `**What the extras cost:** ${prices.join(' · ')}. Playing the game as written is always free.`,
    `**Characters' own voices:** ${on(v.npc_agents.on)}, up to ${v.npc_agents.lines_per_exchange} lines between two per turn${v.npc_agents.off_for.length ? `; voiced by the storyteller: ${v.npc_agents.off_for.join(', ')}` : ''}.`,
    `**The world moving on by itself:** ${on(v.world_turns.on)}, every ${v.world_turns.every_moves} moves${v.world_turns.on && v.world_turns.plans ? ', with people following their own plans' : ''}.`,
    `**New things appearing:** ${on(v.generation.on && v.generation.kinds.length > 0)}, up to ${v.generation.max_per_run} per game${v.generation.kinds.length ? ` (${v.generation.kinds.join(', ').replace(/_/g, ' ')})` : ''}.`,
    ...(v.crafting ? [`**Having things made:** ${on(v.crafting.on)}, up to ${v.crafting.max_per_run} orders per game.`] : []),
    ...(v.building ? [`**Having places built:** ${on(v.building.on)}, up to ${v.building.max_per_run} per game.`] : []),
    ...(v.promotion ? [`**People finding their own voice:** ${on(v.promotion.on)}${v.promotion.on ? `, after ${v.promotion.after_conversations} conversations, up to ${v.promotion.max_per_run} per game` : ''}.`] : []),
    ...(v.side_scenes ? [`**Little scenes between two characters:** ${on(v.side_scenes.on && v.npc_agents.on)}${v.side_scenes.on && v.npc_agents.on ? `, up to ${v.side_scenes.max_per_run} per game, ${v.side_scenes.replies} replies each` : ''}.`] : []),
    ...(v.new_worlds ? [`**New worlds made to order** (\`/newworld\`): ${on(v.new_worlds.on)}${v.new_worlds.on ? `; they don't use the ${r.name.toLowerCase()}` : ''}.`] : []),
    `*Preset: ${v.preset}. The owner changes these with \`python3 tools/settings.py\`.*`,
  ].join('\n\n')
}

/** Meter points spent this session: the meter refills when Claude Code starts, so it's what's gone from it. */
function pointsOf(s: CoderpgSave | null): number {
  const m = s?.view?.meter
  return m ? Math.max(0, m.capacity - m.left) : 0
}

/** The spend records of this project folder (the plugin's store is shared by every folder, scratch copies too). */
async function spendKey($: EngineInterface): Promise<string> {
  return `spend:${await $.session.root().catch(() => '')}`
}

type SpendStore = { current?: Spend; history?: SpendRow[] }

async function spendStore($: EngineInterface): Promise<SpendStore> {
  const v = await $.store.get(await spendKey($)).catch(() => undefined)
  return v && typeof v === 'object' ? (v as SpendStore) : {}
}

/**
 * The session's figures in $.state, brought back from the store when they're gone. $.state is per Claude Code
 * session, and `/clear` (which /newgame and /game run) starts a new one in the same process, so it comes back
 * empty; the store has the figures as they stood at the last turn's end.
 */
async function ensureSpend($: EngineInterface): Promise<void> {
  if (await read($, spend)) return
  const kept = (await spendStore($)).current
  const s = isSpend(kept) ? kept : newSpend(await nowMs($))
  await update($, spend, now => now ?? s)
}

function inventoryText(s: CoderpgSave): string {
  const lines = itemsOf(s).map(it => `- ${it.name}${it.equipped ? ' *(equipped)*' : ''}${it.own ? ' *(made for you)*' : ''}`)
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
/** When the last turn's narration has finished appearing (clock ms): a key pressed before then shows it whole. */
let revealUntil = 0

async function sound($: EngineInterface, beat: string): Promise<void> {
  if (await read($, muted)) return
  const name = soundFor(lookOf(await read($, save)), beat)
  if (!name) return
  await $.audio.play({ asset: `sounds/${name}.wav` }).catch(() => undefined)
}

/** Clients that failed on a surface, as "requestId key": from then on they're drawn still. */
const faulted = new Set<string>()

/** Props for a surface module: plain JSON, nothing undefined (a Client's props must be JsonValue). */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** When each fresh tray was drawn, and each fight's two sides, by tool_use_id (this session only). */
const trayAt = new Map<string, number>()
const combats = new Map<string, { you?: CombatSide; foe?: CombatSide }>()

/** The clock now, or 0 where there's none to ask: then nothing counts as fresh, and all is drawn still. */
async function nowMs($: EngineInterface): Promise<number> {
  return $.clock.now().catch(() => 0)
}

/** The surface's `Client` element, where it has one (the terminal and the desktop app). */
function clientOf(elements: object): ElementConstructor<ClientProps> | undefined {
  return 'Client' in elements ? (elements as { Client: ElementConstructor<ClientProps> }).Client : undefined
}

/** Rows of styled text drawn still: what reveal.tsx shows once it's done. */
function drawRows($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], rows: Seg[][], align: 'center' | 'left') {
  const { Box, Text } = $.ui.resolve(e)
  return (
    <Box flexDirection="column" alignItems={align === 'center' ? 'center' : 'flex-start'}>
      {rows.map(r => (
        <Box flexDirection="row">{r.map(x => <Text color={x.c} backgroundColor={x.bg} bold={x.b} dimColor={x.d}>{x.t || ' '}</Text>)}</Box>
      ))}
    </Box>
  )
}

/**
 * Whether the character pane is drawn beside the transcript now. Claude Code docks it from 144 columns, or 110
 * once the player has opened it; a render's viewport is the transcript's column, so it can't tell.
 */
async function paneShown($: EngineInterface): Promise<boolean> {
  const panes = await $.ui.panes().catch(() => [])
  return panes.some(p => p.id === PANE && p.isPlaced && p.isShown)
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
  let phase: CoderpgPhase | undefined // the stage the turn is in, for the waiting line and its chime
  let lastBrief = '' // the last world-brief's request: a world agent then shapes something, or stirs the world
  // What the running main turn has used: the game master's requests, and every request in it but the worldsmith's.
  let turnBegan = 0
  let turnPoints = 0 // meter points spent before the turn
  let turnMain: Tokens = ZERO
  let turnAll: Tokens = ZERO

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    if (!(await $.fs.exists('rules/rpg.py'))) return result // not a CodeRPG folder: stay inert
    isGame = true

    await $.command.register({ name: 'inventory', description: 'CodeRPG: show what you carry (instant, no turn)', immediate: true })
    await $.command.register({ name: 'map', description: 'CodeRPG: show the map and exits (instant, no turn)', immediate: true })
    await $.command.register({ name: 'sheet', description: 'CodeRPG: open the character pane', immediate: true })
    await $.command.register({ name: 'sound', description: 'CodeRPG: turn sound effects on or off', immediate: true })
    await $.command.register({ name: 'budget', description: 'CodeRPG: what is left to spend, what things cost, and what is switched on', immediate: true })
    await $.command.register({ name: 'guide', description: 'CodeRPG: how to play, and the keys and commands (instant, no turn)', immediate: true })

    const stored = await $.store.get('muted').catch(() => undefined)
    if (stored === true) await update($, muted, () => true)
    // A new Claude Code session: the last one's figures go into the history, and counting starts again.
    const was = await spendStore($)
    const fresh = newSpend(await nowMs($))
    await update($, spend, () => fresh)
    void $.store.set(await spendKey($), { current: fresh, history: withRow(Array.isArray(was.history) ? was.history : [], was.current) }).catch(() => undefined)
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
    turnBegan = await nowMs($)
    turnPoints = pointsOf(await read($, save))
    if (isGame) await ensureSpend($)
    turnMain = ZERO
    turnAll = ZERO
    isOoc = /^\s*ooc:/i.test(e.text)
    isGameTurn = false
    isNewGame = false
    turnKeys = []
    narrationFrom = 0
    usedOtherTools = false
    phase = undefined
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
    if (isGame) {
      const ms = turnBegan ? Math.max(0, (await nowMs($)) - turnBegan) : 0
      const points = pointsOf(await read($, save))
      await ensureSpend($)
      const after = await update($, spend, s => s && { ...endTurn(s, { play: isGameTurn, ms, main: turnMain, all: turnAll, points: points - turnPoints }), points })
      turnBegan = 0
      if (after) void spendKey($).then(async k => $.store.set(k, { ...(await spendStore($)), current: after })).catch(() => undefined)
    }
    // what the turn changed: the change line under its narration, and the band's latest change
    let changes: string[] = []
    if (isGame && isGameTurn) {
      // the band keeps the last turn's that changed anything; health takes its color only for the turn it changed
      await refresh($)
      changes = isNewGame ? [] : changesOf(turnStart, await read($, save))
      const dhp = changes.find(c => c.endsWith(' ♥'))
      const hp = dhp ? (dhp.startsWith('+') ? 'heal' as const : 'hurt' as const) : undefined
      await update($, latest, was => (changes.length ? { changes, ...(hp ? { hp } : {}) } : isNewGame || !was ? null : { changes: was.changes }))
    }
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
      const bannerTime = banner ? now?.view?.time ?? undefined : undefined
      const title = isNewGame && now ? now.adventure : undefined
      const runLabel = isNewGame ? now?.view?.run_label ?? undefined : undefined
      const mine = new Set(turnKeys)
      const shownAt = await nowMs($)
      const accent = accentOf(now)
      // everyone who might speak, someone who left this turn too, with the color their lines are drawn in
      const cards = speakerCards(now, lookOf(now), was?.view?.characters_here)
      const told = { pending: false, shownAt, accent, ...(cards.length ? { cards } : {}) }
      // the narration's blocks appear one after another, under the title card once it has typed itself out
      const delays = new Map<string, number>()
      let at = title ? TITLE_MS : 0
      for (const k of narration) {
        delays.set(k, at)
        at += (list.find(x => x.key === k)?.paras ?? 1) * STEP_MS
      }
      revealUntil = shownAt + at
      const last = narration[narration.length - 1]
      await update($, story, list => list.map(s =>
        asides.has(s.key) ? { ...s, aside: true, pending: false }
        : mine.has(s.key) ? {
            ...s, ...told, delay: delays.get(s.key) ?? 0,
            ...(s.key === first && banner ? { banner, ...(bannerTime ? { bannerTime } : {}) } : {}),
            ...(s.key === first && title ? { title } : {}), ...(s.key === first && runLabel ? { runLabel } : {}),
            ...(s.key === last && changes.length ? { changes } : {}),
          }
        : s))
      if (title) void sound($, 'type')
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
    // the yes/no question /newworld asks is part of play, not development
    if (!e.agentId && !isPlumbing(e.tool, e) && e.tool !== 'AskUserQuestion') usedOtherTools = true
    if (isPlay) {
      isGameTurn = true
      const sub = e.tool === 'Bash' ? rpgCommand(String((e as { command?: unknown }).command)) : undefined
      // Text before this call wasn't the narration, unless this call only records what happened.
      if (!(e.tool === 'Bash' && onlyRecords(String((e as { command?: unknown }).command)))) narrationFrom = turnKeys.length
      await update($, hidden, ids => [...ids, e.tool_use_id].slice(-3000))
      if (sub === 'newgame') isNewGame = true
      const agentType = String((e as { subagent_type?: unknown }).subagent_type ?? '')
      const command = String((e as { command?: unknown }).command ?? '')
      const args = /rules\/rpg\.py\s+[a-z-]+\s*(.*)$/.exec(command)?.[1] ?? ''
      const now = phaseOf(e.tool, sub, args, agentType, lastBrief)
      if (sub === 'world-brief') lastBrief = args.trim().split(/\s+/)[0] ?? ''
      const look = lookOf(await read($, save))
      const name = /^(.+?) considers your words$/.exec(npcPhrase(String((e as { prompt?: unknown }).prompt ?? '')))?.[1]
      // the phase says which stage the turn is in, in the game's voice; a command's own phrase is more particular
      const phrase = (agentType === 'worldsmith' ? 'A new world takes shape' : undefined)
        ?? (now === 'resolving' && sub ? commandPhrase(sub, seed++, look) : undefined)
        ?? (now ? phasePhrase(look, now, seed++, now === 'considering' ? name : undefined) : undefined)
        ?? (e.tool === 'Agent' ? (agentType === 'world' ? 'The world takes shape' : npcPhrase(String((e as { prompt?: unknown }).prompt ?? '')))
          : sub ? commandPhrase(sub, seed++, look) : undefined)
      if (phrase) await update($, activity, () => phrase)
      if (now && now !== phase) {
        phase = now
        void sound($, `phase_${now}`)
      }
    }
    // The running-agents list shows each Agent call's description ("Generate fisherman extra");
    // in play it gets the in-world phrase instead.
    const call = isPlay && e.tool === 'Agent' ? { ...e, description: (await read($, activity)) ?? 'The world takes shape' } : e
    const ran = await next(call)
    if (e.tool === 'Bash' && /rules\/rpg\.py/.test(String((e as { command?: unknown }).command))) {
      await refresh($)
      if (isPlay && ran.result !== undefined) {
        const after = await read($, save)
        const lines = trayFor('Bash', e, ran.result, lookOf(after))
        if (lines.length) trayAt.set(e.tool_use_id, await nowMs($))
        const stdout = String((ran.result as { stdout?: unknown } | null)?.stdout ?? '')
        const fight = combatOf(stdout, after)
        if (fight) combats.set(e.tool_use_id, fight)
        const s = traySound(lines)
        if (s) void sound($, s)
      }
    }
    return ran
  })

  // ---- what the session really uses

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    const id = r.agentId
    if (isGame && id) {
      await ensureSpend($)
      await update($, spend, s => s && spawned(s, id, roleOf(e.subagentType)))
    }
    return r
  })

  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    const u = r.usage
    if (isGame && u) {
      const id = e.agentId
      await ensureSpend($)
      const s = await update($, spend, s => s && (id ? helperStep(s, id, u) : turnActive ? s : looseStep(s, u)))
      if (turnActive && (!id || s?.agents[id]?.role !== 'worldsmith')) {
        turnAll = addUsage(turnAll, u)
        if (!id) turnMain = addUsage(turnMain, u)
      }
    }
    return r
  })

  on('session.measure', async ($, e, next) => {
    const r = await next(e)
    if (isGame && e.rateLimits.length) {
      await ensureSpend($)
      await update($, spend, s => s && measured(s, e.rateLimits))
    }
    return r
  })

  on('session.append', async ($, e, next) => {
    const stored = await next(e)
    // Every text block of a non-ooc turn is held back (pending) until the turn shows what it was.
    if (isGame && !isOoc && !e.agentId && e.door === 'response' && e.message.role === 'assistant') {
      const blocks = e.message.content
        .filter((b): b is { type: 'text'; text: string } => (b as { type?: string }).type === 'text' && (b as { text?: string }).text?.trim() !== '')
        .map(b => ({ key: storyKey(b.text), pending: true, note: isGmNote(b.text), paras: paragraphsOf(stripPreamble(b.text)).length }))
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
    const Client = clientOf($.ui.resolve(e))
    const s = await read($, save)
    const look = lookOf(s)
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
        <Box paddingLeft={INDENT}>
          <Markdown text={e.props.text} dimColor />
        </Box>
      )
    }
    const accent = entry.accent ?? accentOf(s)
    const measure = measureOf(e.viewport?.columns ?? 80) // the transcript's column, beside any docked pane
    const blocks = blocksOf(stripPreamble(e.props.text), entry.cards ?? [])
    const delay = entry.delay ?? 0
    // Fresh pages reveal themselves once (surface modules on the terminal's frame clock); older ones,
    // and every page on a surface without modules, are drawn still.
    const now = await nowMs($)
    const age = entry.shownAt !== undefined && now > 0 ? now - entry.shownAt : Infinity
    const fresh = age < Math.max(FRESH_MS, pageMs(blocks.length, delay) + FRESH_MS)
    const skip = entry.shownAt !== undefined && entry.shownAt <= (await read($, revealSkip))
    // the element must be written <Client module="..."> literally: the engine finds modules in the source
    const reveal = (rows: Seg[][], mode: 'type' | 'lines', ms: number, k: string) =>
      Client && fresh && !faulted.has(`${e.requestId} ${k}`)
        ? <Client key={k} module="./reveal.tsx" props={plain({ rows, mode, ms, align: 'center' })} />
        : drawRows($, e, rows, 'center')
    const card = (rows: Seg[][], color: string | undefined, mode: 'type' | 'lines', ms: number, k: string) => (
      <Box flexDirection="column" width={measure}>
        {drawRows($, e, [ruleRow(measure, color)], 'left')}
        <Box flexDirection="column" alignItems="center" width={measure} marginY={1}>{reveal(rows, mode, ms, k)}</Box>
        {drawRows($, e, [ruleRow(measure, color)], 'left')}
      </Box>
    )
    const ending = entry.ending ? endingRows(entry.ending, entry.endingQuest, { accent, bad: look.palette.bad }) : undefined
    const prose = Client && fresh && !skip && !faulted.has(`${e.requestId} page`)
      ? <Client key="page" module="./page.tsx" props={plain({ blocks, width: measure, delay })} />
      : drawBlocks($.ui.resolve(e), blocks, measure)
    return (
      <Box flexDirection="column" paddingLeft={INDENT} marginTop={e.props.isFirstOfReply ? 1 : 0}>
        {entry.title && <Box marginBottom={1}>{card(titleRows(entry.title, look.tagline, entry.runLabel, accent), accent, 'type', TITLE_MS, 'title')}</Box>}
        {entry.banner && <Box marginBottom={1}>{drawRows($, e, [arrivalRow(entry.banner, entry.bannerTime, measure, accent)], 'left')}</Box>}
        {prose}
        {entry.changes?.length ? (
          <Box flexDirection="row" marginTop={1} width={measure}>
            <Text color={accent} dimColor>✧ </Text>
            <Text dimColor>{entry.changes.join(' · ')}</Text>
          </Box>
        ) : null}
        {ending && <Box marginTop={1}>{card(ending.rows, ending.border === 'gray' ? undefined : ending.border, 'lines', ending.rows.length * 260, 'ending')}</Box>}
      </Box>
    )
  })

  // ---- hide the plumbing; show dice rolls as a tray

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    // A finished call is hidden when tool.call recorded it. An unfinished one (no output yet)
    // can draw before that record lands, so it is judged from its input while the turn isn't ooc:.
    const isLivePlumbing = isGame && !isOoc && isPendingPlumbing(e.props.tool, e.props.input, e.props.output)
    if (!isLivePlumbing && !(await read($, hidden)).includes(e.props.tool_use_id)) return next(e)
    const s = await read($, save)
    const look = lookOf(s)
    return drawFx($, e, e.requestId, trayFor(e.props.tool, e.props.input, e.props.output, look), [e.props.tool_use_id], look, accentOf(s), await nowMs($))
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
    const s = await read($, save)
    const look = lookOf(s)
    const callIds = e.props.calls.map(c => c.tool_use_id).filter((x): x is string => x !== undefined)
    return drawFx($, e, e.requestId, e.props.calls.flatMap(c => trayFor(c.tool, c.input, c.output, look)), callIds, look, accentOf(s), await nowMs($))
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

  // the line that closes a turn ("Baked for 3s"): in play, nothing; the blank rows around the player's line part turns
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (!isGame || isOoc || e.props.isExpanded || e.props.waitingFor) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    // A game agent's reply row ("Message from @world"), and the notice that a background game agent finished
    // (the worldsmith: its call was recorded as plumbing): hidden in play.
    const fromGameAgent = isGame && !isOoc && /^(world|worldsmith|npc)\b/.test(e.props.from?.name ?? '')
    const endOfHidden = e.props.task?.toolUseId !== undefined && (await read($, hidden)).includes(e.props.task.toolUseId)
    if (!e.props.isExpanded && (fromGameAgent || endOfHidden)) {
      const { Box } = $.ui.resolve(e)
      return <Box display="none" />
    }
    const kind = e.props.origin.kind
    if (!isGame || e.props.isExpanded || (kind !== 'composer' && kind !== 'plugin') || /^\s*(ooc:|\/)/i.test(e.props.text)) return next(e)
    // The player's own words are context, not the thing to look at: dim and italic, at the page's indent.
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, save)
    const shown = (await read($, cursed)).find(x => x.key === storyKey(e.props.text))?.shown
    return (
      <Box flexDirection="row" marginTop={1} paddingLeft={INDENT}>
        <Text dimColor>› </Text>
        <Text dimColor italic>{shown ?? e.props.text}</Text>
        {shown !== undefined && <Text color={lookOf(s).palette.bad} dimColor> ✶</Text>}
      </Box>
    )
  })

  // The band above the prompt. Beside the docked pane it carries only health and the latest change (or, while
  // the game master works, what it's doing); without the pane, the essentials in one dim line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isGame || e.props.hasSurvey) return next(e)
    const s = await read($, save)
    if (!s) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const look = lookOf(s)
    const last = await read($, latest)
    if (await paneShown($)) {
      const waiting = e.props.isWorking ? await read($, activity) : null
      return (
        <Box flexDirection="row" paddingLeft={INDENT}>
          <Text color={bandHpColor(s, last?.hp, look)}>♥ {s.stats.hp}</Text>
          <Text dimColor>{'  │  '}</Text>
          {waiting
            ? <Text dimColor italic wrap="truncate">◌ {waiting}</Text>
            : last?.changes.length ? <Text dimColor wrap="truncate">✧ {last.changes.join(' · ')}</Text> : null}
        </Box>
      )
    }
    return (
      <Box flexDirection="row" paddingLeft={INDENT}>
        {bandParts(s, accentOf(s)).map((part, i, all) => (
          // only the objective, last, gives way when the line is too long
          <Box flexShrink={i === all.length - 1 ? 1 : 0}>
            <Text color={part.color} bold={part.bold} dimColor={!part.color} wrap="truncate">{i ? ' · ' : ''}{part.text}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  // The hint line under the prompt: in play, the game's own, and while a turn runs only that Esc interrupts it
  // (Claude Code's line names its mode there); in ooc: turns and with no game, Claude Code's.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!isGame || isOoc || !(await read($, save))) return next(e)
    return next({ ...e, props: { ...e.props, hint: e.props.isWorking ? WORKING_HINT : PLAY_HINT } })
  })

  // The mode labels in the prompt footer ("auto mode on") are Claude Code's voice: hidden in play.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (!isGame || isOoc) return next(e)
    return next({ ...e, props: { ...e.props, modes: [] } })
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
    // A cursed player's own words are drawn as they came out (the prompt hook tells the game master both).
    const curses = (await read($, save))?.view?.curses ?? []
    if (isGame && !c && curses.length && e.origin.kind === 'composer' && !/^\s*(ooc:|\/)/i.test(e.text)) {
      const entry = { key: storyKey(e.text), shown: cursedWords(curses, e.text) }
      await update($, cursed, list => [...list, entry].slice(-500))
    }
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

  // ---- any key pressed while a turn's narration is appearing shows it whole (the key still goes to the prompt)
  on('prompt.edit', async ($, e, next) => {
    if (isGame && revealUntil) {
      const now = await nowMs($)
      if (now < revealUntil) await update($, revealSkip, () => now)
      else revealUntil = 0
    }
    return next(e)
  })

  // ---- a surface module that fails is drawn still from then on (the engine redraws the site at once)
  on('ui.fault', async ($, e, next) => {
    faulted.add(`${e.requestId} ${e.element}`)
    $.ui.log(`coderpg: ${e.module} failed (${e.phase}): ${e.reason}`, { to: 'debug' })
    return next(e)
  })

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
    await ensureSpend($)
    const used = await read($, spend)
    const real = used ? '\n\n' + spendText({ ...used, points: pointsOf(s) }, (await spendStore($)).history ?? []) : ''
    return { text: (s ? budgetText(s) : 'No game yet. Type /newgame to start.') + real }
  })

  on('command.run', { command: 'guide' }, async $ => {
    await refresh($)
    return { text: guideText(await read($, save)) }
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
    const accent = accentOf(s)
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
    const waiting = (await read($, running)) ? await read($, activity) : null
    const flashing = await read($, flash)
    const { hp, max_hp, might, agility, wits, coins } = s.stats
    const objective = currentObjective(s)
    // Buttons put the words in the prompt box for the player to send with Enter. A prompt the mod submitted itself
    // would carry Claude Code's "Prompt from the coderpg plugin" label, and its row never reaches our render hook.
    const say = (text: string) => () => void $.prompt.fill({ text, mode: 'replace' })
    const exits = s.map ? exitsOf(s.map, s.location) : []
    const here = s.view?.characters_here ?? []
    const items = itemsOf(s)
    const frameW = Math.min(width, 56)
    const grid = s.map ? tileGrid(s.map, s.location, frameW - 4, look) : []
    const Client = clientOf($.ui.resolve(e))
    const seen = new Set(Object.values(s.map ?? {}).map(r => r.terrain).filter((t): t is string => !!t))
    const swatches = Object.entries(look.terrain ?? {}).filter(([t]) => seen.has(t))
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
            {it.own && <Text dimColor> (made for you)</Text>}
          </Box>
        ))}
      </Box>
    )

    const mapTab = (
      <Box flexDirection="column">
        {grid.length === 0 && <Text dimColor>The map fills in as you explore.</Text>}
        {grid.length > 0 && (Client && !faulted.has(`${e.requestId} map`)
          ? <Client key="map" module="./tilemap.tsx" props={plain({ grid })} />
          : grid.map(row => (
              <Box flexDirection="row">
                {runsOf(row).map(c => <Text color={c.fg} backgroundColor={c.bg} bold={c.b} dimColor={c.d}>{c.ch}</Text>)}
              </Box>
            )))}
        {grid.length > 0 && <Text> </Text>}
        {grid.length > 0 && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
            <Box flexDirection="row"><Text color={accent} bold>◆</Text><Text dimColor> you</Text></Box>
            <Box flexDirection="row"><Text backgroundColor="#2b2b30" color="#8a8a92">{' ? '}</Text><Text dimColor> not visited</Text></Box>
            {swatches.map(([t, c]) => (
              <Box flexDirection="row"><Text backgroundColor={c.bg} color={c.fg}>{c.moves ? ' ~ ' : '   '}</Text><Text dimColor> {t}</Text></Box>
            ))}
            {usesUpDown(s.map ?? {}) && <Box flexDirection="row"><Text dimColor>┊ up or down</Text></Box>}
            {Object.values(s.map ?? {}).some(r => r.made_by === 'player') && (
              <Box flexDirection="row"><Text color={accent} bold>⌂</Text><Text dimColor> built for you</Text></Box>
            )}
          </Box>
        )}
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
              <Text bold>{p.name}{p.promoted && <Text color={accent}> ★</Text>}</Text>
              <Text dimColor wrap="truncate">, {p.role}{p.here ? ' · here' : ''}</Text>
            </Box>
            {p.promoted && <Text color={accent} dimColor>  knows you well</Text>}
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
        {(s.view?.curses ?? []).map(c => <Text color={look.palette.bad} wrap="truncate">✶ {c.name}</Text>)}
        {waiting && <Text dimColor italic wrap="truncate">◌ {waiting}…</Text>}
        <Text> </Text>
        <Box flexDirection="column" width={frameW} flexGrow={1} borderStyle="round" borderDimColor>
          {tabStrip}
          <Text dimColor>{'─'.repeat(frameW - 2)}</Text>
          <Box flexDirection="column" paddingX={1} paddingTop={1}>
            {open === 'here' ? hereTab : open === 'map' ? mapTab : journalTab}
          </Box>
        </Box>
        <Text dimColor wrap="truncate">1–9 then ⏎ go  ·  l look  ·  {tabs.map(t => t.hotkey).join(' ')} tabs</Text>
      </Box>
    )
  })
}

/**
 * A dice tray in place of a hidden tool row, or nothing when the row has nothing to show. A fresh one
 * runs trayfx.tsx once (the dice tumble; a fight drains both bars); an older one is drawn still, a fight
 * with its strip as it ended.
 */
function drawFx($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], requestId: string, lines: TrayLine[], ids: string[], look: CoderpgLook, accent: string, now: number) {
  const { Box, Text } = $.ui.resolve(e)
  const Client = clientOf($.ui.resolve(e))
  if (lines.length === 0) return <Box display="none" />
  const fight = ids.map(id => combats.get(id)).find(Boolean)
  const colors = { accent, good: look.palette.good, bad: look.palette.bad, heal: look.palette.heal }
  const props = { lines, you: fight?.you, foe: fight?.foe, colors }
  const born = Math.max(...ids.map(id => trayAt.get(id) ?? 0))
  if (Client && born > 0 && now - born < FRESH_MS && !faulted.has(`${requestId} fx`)) {
    return <Client key="fx" module="./trayfx.tsx" props={plain(props)} />
  }
  return (
    <Box flexDirection="column" paddingLeft={INDENT}>
      {lines.map(l => (
        <Box flexDirection="row">
          <Text color={accent}>{l.icon} </Text>
          <Text dimColor>{l.text}</Text>
          {l.result && <Text color={l.tone === 'good' ? look.palette.good : look.palette.bad} bold>{` ${l.result}`}</Text>}
        </Box>
      ))}
      {fight && stripAt(props, FX_MS).slice(1).map(row => (
        <Box flexDirection="row">{row.map(x => <Text color={x.c} bold={x.b} dimColor={x.d}>{x.t || ' '}</Text>)}</Box>
      ))}
    </Box>
  )
}
