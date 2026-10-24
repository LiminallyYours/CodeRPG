// CodeRPG mod: makes Claude Code look and feel like the game.
// - narration drawn as a page: plain prose at a reading measure, appearing a paragraph at a time, speech
//   beside a keyline in the speaker's color, a rule on arrival, a change line under each turn, title and ending cards
// - the game's plumbing hidden, except dice rolls, which show as a dice tray
// - Claude's chrome (spinner, turn timer, prompt rows) replaced with in-world touches
// - a status band above the prompt, and the margin: a docked pane of six sections (where, you, at stake, act,
//   carrying, more) with clickable exits and actions, and the map, the journal and the guide behind keys
// - a turn's changes colored in the margin until the next play turn ends, sound effects; toasts only for what
//   needs attention now
// - instant /inventory, /map, /sheet and /sound commands
// - /budget, with what the session really used in tokens (the owner's check on the meter's prices)
// Everything it shows comes from state/save.json and the rules script's output. It never writes game files.
// Nothing here knows a particular game: colors, labels, tabs and phrases come from the game's look in the save.

import { atom, read, update } from 'claude-code'
import type { ClientProps, ElementConstructor, EngineInterface, RasterProps, Register, RenderChildren } from 'claude-code'

import type { CoderpgLook, CoderpgPhase, CoderpgSave, CoderpgScreen, CoderpgStory } from '../types'
import { cursedWords } from './curse'
import { changesOf, feedback, marksOf } from './feedback'
import { accentOf, lookOf, money, phasePhrase, sectionsOf, soundFor, tabsOf } from './look'
import { exitsOf, keyText, mapText, usesUpDown } from './map'
import { barWidth, carried, changeColor, clockSegments, conditions, FAINT, fieldCells, fitMargin, healthColor, MARGIN_COLUMNS, MARGIN_PAD, meterTint, MUTED_ACCENT, openObjectives, PICTURE_COLUMNS, PICTURE_STEPS, pictureCells, ruleCells, statusRow } from './margin'
import type { Cell } from './margin'
import { commandPhrase, idlePhrase, mainCall, npcPhrase, phaseOf } from './phrases'
import { drawBlocks, pageMs, STEP_MS } from './page'
import type { Seg } from './reveal'
import { arrivalRow, blocksOf, endingRows, indentOf, looksTagged, measureOf, paragraphsOf, ruleRow, spaced, speakerCards, titleRows } from './story'
import { addUsage, endTurn, helperStep, isSpend, looseStep, measured, newSpend, roleOf, spawned, spendText, withRow, ZERO } from './spend'
import type { Spend, SpendRow, Tokens } from './spend'
import { combatOf, rpgCommands, TRAY_COMMANDS, trayLines, traySound } from './tray'
import type { CombatSide, TrayLine } from './tray'
import { stripAt, FX_MS } from './trayfx'
import { runsOf, tileGrid } from './tiles'

export { spaced }

const SAVE_PATH = 'state/save.json'
const PANE = 'coderpg-sheet'
const FRESH_MS = 1500 // a story card or tray this new still animates; older ones are drawn still
const TITLE_MS = 900 // the title card types itself out over this long; the narration under it waits for it

const save = atom({ plugin: 'coderpg', key: 'save' } as const, null)
const story = atom({ plugin: 'coderpg', key: 'story' } as const, [])
const hidden = atom({ plugin: 'coderpg', key: 'hidden' } as const, [])
const activity = atom({ plugin: 'coderpg', key: 'activity' } as const, null)
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
// spells numbers out; a status line like "priced at 5 credits, not paid for yet" doesn't), the player in the third
// person or the content the game master reads ("She agreed the player will help, so the content says to set the
// quest flag."), a flag being set (a flag on its own is story: "The flag over the harbor snaps in the wind."), or a
// content id (story has no snake_case).
// A progress line answering Claude Code's mid-turn nudge ("Settling in beside Old Hob now.", "Bringing the
// fisherman into being…"): one short sentence that trails off or says it's happening now.
const GM_PROGRESS = /^[^.!?…]{1,90}(…|\.\.\.|\bnow\.)$/
const GM_ANYWHERE = /(narrating|\bnarration\b|rpg\.py|world agent|subagent|world update|\bworld turn\b|off-screen|proposal|tool calls?|\b(start(ing)?|end(ing)?) the (side )?scene\b|\bI('ve|'m|'ll|'d)?\b|\d|\b[Tt]he (player|content)\b|\bquest flags?\b|\b[Ss]et(s|ting)? (the |a )?flags?\b|\bflags? (is |was )?(un)?set\b|\w_\w)/

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

/** Which of a turn's text blocks (by key) are the narration: those from `from` on, the text after the turn's last
 *  tool call other than recording-only ones, less the blocks the note filter caught (unless that leaves nothing).
 *  `recordsAt` holds where each later recording-only call came. A game master may narrate and then record, so text
 *  before those calls can be story; but when more text follows them, a short one-paragraph block before them was a
 *  note about what was being recorded ("Content allows the cowed flag on success. Apply it, remember, chronicle."). */
export function narrationOf(keys: string[], from: number, recordsAt: number[], short: (key: string) => boolean,
  note: (key: string) => boolean): string[] {
  const records = Math.max(from, ...recordsAt)
  const candidates = keys.slice(from).filter((k, i) => !(from + i < records && records < keys.length && short(k)))
  return candidates.some(k => !note(k)) ? candidates.filter(k => !note(k)) : candidates
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
  // any call in a chain may be the roll ("look | grep … && check might 14"); only roll-shaped lines are drawn
  if (!rpgCommands(command).some(sub => TRAY_COMMANDS.includes(sub))) return []
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

/** Cells cut to `width`, the last one ending in '…' when something had to go: one row of the margin. */
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

/** What /sheet answers when the margin opened (Claude Code puts the plugin's name in front). */
const SHEET_OPENED = 'Character pane opened.'

/** The margin's key for the guide (a Button's hotkey must be a digit or a lowercase letter, so not `?`). */
export const GUIDE_KEY = 'g'

/** The hint line under the prompt in play. */
export const PLAY_HINT = '⏎ act · ooc: speak to the builder · ctrl+x tab to the margin · /guide help'
/** The hint line while a play turn runs. */
export const WORKING_HINT = 'esc to interrupt'

/** Health in the band: red or the heal color for the turn it changed, red while it's at a quarter or less. */
export function bandHpColor(s: CoderpgSave, flashed: 'hurt' | 'heal' | undefined, look: CoderpgLook): string | undefined {
  return healthColor(s, flashed ? { hp: flashed } : null, look)
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
  const tabs = tabsOf(look)
  const keys = tabs.filter(t => t.id !== 'here').map(t => `**${t.hotkey}** ${t.label.toLowerCase()}`).join(', ')
  const back = tabs.find(t => t.id === 'here')?.hotkey ?? 'h'
  return [
    `**How to play${s ? ` ${s.adventure}` : ''}**`,
    'Say what you do, in your own words, and press Enter: *I go north*, *I ask Pell about the lamp*, *I search the boat*.',
    `**The margin** (the pane on the right, on a wide screen): click it, or press **ctrl+x** then **tab**, and its keys work: **1–9** a way out, **l** look around, ${keys}, **${GUIDE_KEY}** this guide; the same key again, or **${back}**, comes back to the margin. **Esc** comes back to the prompt. Its buttons fill the prompt for you; Enter sends.`,
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

function rasterOf(elements: object): ElementConstructor<RasterProps> | undefined {
  return 'Raster' in elements ? (elements as { Raster: ElementConstructor<RasterProps> }).Raster : undefined
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
}

/** Runs every second from session.start: picks up saves made outside a turn. */
async function tick($: EngineInterface): Promise<void> {
  await refresh($)
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
  let recordsAt: number[] = [] // turnKeys indexes where recording-only calls came after that one
  const shortKeys = new Set<string>() // this turn's text blocks that are one short paragraph
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
    void $.ui.open({ id: PANE, title: 'Character', columns: MARGIN_COLUMNS })
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
    recordsAt = []
    shortKeys.clear()
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
      // the band keeps the last turn's that changed anything; the marks (what the margin and the band color)
      // only for the turn their values changed
      await refresh($)
      const after = await read($, save)
      changes = isNewGame ? [] : changesOf(turnStart, after)
      const marks = isNewGame ? {} : marksOf(turnStart, after)
      const marked = Object.keys(marks).length > 0
      await update($, latest, was => (changes.length || marked ? { changes: changes.length ? changes : was?.changes ?? [], ...marks }
        : isNewGame || !was ? null : { changes: was.changes }))
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
      const narration = narrationOf(turnKeys, narrationFrom, recordsAt, k => shortKeys.has(k), isNote)
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
      const command = e.tool === 'Bash' ? String((e as { command?: unknown }).command ?? '') : ''
      // a chained call is judged by its most telling command, and its arguments are that command's
      const { sub, args } = mainCall(command)
      // Text before this call wasn't the narration, unless this call only records what happened (see narrationOf).
      if (e.tool === 'Bash' && onlyRecords(command)) recordsAt.push(turnKeys.length)
      else { narrationFrom = turnKeys.length; recordsAt = [] }
      await update($, hidden, ids => [...ids, e.tool_use_id].slice(-3000))
      const subs = rpgCommands(command)
      if (subs.includes('newgame')) isNewGame = true
      const agentType = String((e as { subagent_type?: unknown }).subagent_type ?? '')
      const now = phaseOf(e.tool, sub, args, agentType, lastBrief)
      const brief = /rules\/rpg\.py\s+world-brief\s+([a-z-]+)/.exec(command)
      if (brief) lastBrief = brief[1]!
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
        for (const b of e.message.content) {
          const t = (b as { type?: string; text?: string })
          if (t.type === 'text' && t.text?.trim() && isProgressNote(t.text)) shortKeys.add(storyKey(t.text))
        }
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
        <Box paddingLeft={indentOf(e.viewport?.columns ?? 80)}>
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
      <Box flexDirection="column" paddingLeft={indentOf(e.viewport?.columns ?? 80)} marginTop={e.props.isFirstOfReply ? 1 : 0}>
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
    return drawFx($, e, e.requestId, trayFor(e.props.tool, e.props.input, e.props.output, look), [e.props.tool_use_id], look, accentOf(s), await nowMs($), e.viewport?.columns ?? 80)
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
    return drawFx($, e, e.requestId, e.props.calls.flatMap(c => trayFor(c.tool, c.input, c.output, look)), callIds, look, accentOf(s), await nowMs($), e.viewport?.columns ?? 80)
  })

  // ---- Claude's chrome, in-world

  // The line that animates while a turn runs. Claude Code adds the elapsed time and tokens to its own drawing,
  // which no prop carries, so in play the mod draws the line itself: beside the pane the band already says what
  // the game master is doing, so nothing; without it, that phrase at the page's column.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    if (!isGame || isOoc) return next(e)
    // Routine status messages ("Running Agent…") give the game away; ones the player must see don't.
    if (e.props.message && /permission|approv|compact|retry|rate|limit|overload|error|context|interrupt|wait/i.test(e.props.message)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    if (await paneShown($)) return <Box display="none" />
    const phrase = (await read($, activity)) ?? e.props.word
    return (
      <Box paddingLeft={indentOf(e.viewport?.columns ?? 80)}>
        <Text dimColor italic wrap="truncate">◌ {phrase}…</Text>
      </Box>
    )
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
      <Box flexDirection="row" marginTop={1} paddingLeft={indentOf(e.viewport?.columns ?? 80)}>
        <Text dimColor>› </Text>
        <Text dimColor italic>{shown ?? e.props.text}</Text>
        {shown !== undefined && <Text color={lookOf(s).palette.bad} dimColor> ✶</Text>}
      </Box>
    )
  })

  // The band above the prompt. Beside the docked pane it carries only health and, while the game master works,
  // what it's doing (the turn's changes are in the change line under the story); without the pane, the
  // essentials in one dim line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!isGame || e.props.hasSurvey) return next(e)
    const s = await read($, save)
    if (!s) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const look = lookOf(s)
    const last = await read($, latest)
    const indent = indentOf(e.viewport?.columns ?? 80) // over the page's column
    if (await paneShown($)) {
      const waiting = e.props.isWorking ? await read($, activity) : null
      return (
        <Box flexDirection="row" paddingLeft={indent}>
          <Text color={bandHpColor(s, last?.hp, look)}>♥ {s.stats.hp}</Text>
          {waiting ? <Text dimColor>{'  │  '}</Text> : null}
          {waiting ? <Text dimColor italic wrap="truncate">◌ {waiting}</Text> : null}
        </Box>
      )
    }
    return (
      <Box flexDirection="row" paddingLeft={indent}>
        {bandParts(s, accentOf(s)).map((part, i, all) => (
          // only the objective, last, gives way when the line is too long
          <Box flexShrink={i === all.length - 1 ? 1 : 0}>
            <Text color={part.color} bold={part.bold} dimColor={!part.color} wrap="truncate">{i ? ' · ' : ''}{part.text}</Text>
          </Box>
        ))}
      </Box>
    )
  })

  // The hint line under the prompt: in play, the game's own, and while a turn runs only that Esc interrupts it;
  // in ooc: turns and with no game, Claude Code's.
  // Claude Code draws its permission-mode label ("auto mode on") in front of this line, outside any hook's reach.
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
    const opened = await $.ui.open({ id: PANE, title: 'Character', focus: true, columns: MARGIN_COLUMNS })
    return { text: opened.isPlaced ? SHEET_OPENED : `The margin couldn't be shown: ${opened.reason}` }
  })

  // The pane opening is answer enough for /sheet, so its line goes (a reason it couldn't open stays). The other
  // commands' answers stay where Claude Code draws them: under their echo ("❯ /map"), which no hook can move.
  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.props.command !== 'sheet' || e.props.isErrored || !e.props.text.endsWith(SHEET_OPENED)) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box display="none" />
  })

  on('command.run', { command: 'sound' }, async $ => {
    const isMuted = !(await read($, muted))
    await update($, muted, () => isMuted)
    await $.store.set('muted', isMuted)
    return { text: isMuted ? 'Sound effects off.' : 'Sound effects on.' }
  })

  // ---- the margin: six sections in the order of reading during a turn (where am I, how am I, what is at
  // stake, what can I do, what do I have, where else can I look); the map, the journal and the guide take it over

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Markdown } = $.ui.resolve(e)
    const s = await read($, save)
    const look = lookOf(s)
    const accent = accentOf(s)
    const width = Math.max(24, (e.props.bodyColumns ?? 40) - 2 * MARGIN_PAD)
    const docked = e.props.placement === 'dock'
    const bodyRows = e.props.scroll?.bodyRows ?? 0
    if (!s) {
      return (
        <Box flexDirection="column" paddingX={MARGIN_PAD}>
          <Text color={accent} bold>CodeRPG</Text>
          <Text>Type /newgame to start.</Text>
        </Box>
      )
    }
    const bad = look.palette.bad
    const labels = sectionsOf(look)
    const tabs = tabsOf(look)
    const hereKey = tabs.find(t => t.id === 'here')?.hotkey ?? 'h'
    const stored = await read($, tab)
    const screen: CoderpgScreen = stored === 'guide' || tabs.some(t => t.id === stored && t.id !== 'here') ? stored : 'here'
    const marks = await read($, latest)
    // The same key again comes back to the margin.
    const show = (id: CoderpgScreen) => () => void update($, tab, now => (now === id ? 'here' : id))
    // Buttons put the words in the prompt box for the player to send with Enter. A prompt the mod submitted itself
    // would carry Claude Code's "Prompt from the coderpg plugin" label, and its row never reaches our render hook.
    const say = (text: string) => () => void $.prompt.fill({ text, mode: 'replace' })
    const row = (key: string, cells: Cell[]) => (
      <Box key={key} flexDirection="row">
        {fitCells(cells, width).map(c => <Text color={c.color} dimColor={c.dim} bold={c.bold} italic={c.italic}>{c.text}</Text>)}
      </Box>
    )
    const signedStat = (stat: 'might' | 'agility' | 'wits', n: number) => `${look.stat_labels[stat].toLowerCase()} ${signed(n)}`

    // ---- WHERE: the room's picture (else a field in its terrain's colors, else its text art, dim), its name,
    // the time and the weather. Pictures are the terminal's (a Raster); elsewhere the text art.
    const Raster = e.surface === 'terminal' ? rasterOf($.ui.resolve(e)) : undefined // elsewhere a Raster draws nothing
    const picture = s.view?.picture
    const terrain = s.map?.[s.location]?.terrain
    const field = terrain ? look.terrain?.[terrain] : undefined
    const columns = Math.min(PICTURE_COLUMNS, width)
    const textArt = (s.view?.art ?? '').split('\n').filter(l => l.trim().length > 0)
    const drawn = Raster && (picture || field)
    // the heights it can take in a short dock: a picture or a field shrinks to its middle rows; text art doesn't
    const artSteps = drawn ? PICTURE_STEPS : [textArt.length]
    const artOf = (rows: number) => !rows ? []
      : Raster && picture ? [<Raster key="picture" columns={columns} rows={rows} cells={pictureCells(picture, columns, rows)} />]
      : Raster && field ? [<Raster key="picture" columns={columns} rows={rows} cells={fieldCells(field, s.location, columns, rows)} />]
      : textArt.map((l, i) => <Text key={`art-${i}`} color={accent} dimColor wrap="truncate">{l}</Text>)
    const cond = conditions(s.view?.time, s.view?.weather)
    const whereRows = [
      <Text key="place" color={accent} bold wrap="truncate">{s.view?.location_name ?? s.location}</Text>,
      ...(cond ? [<Text key="conditions" wrap="truncate">{cond}</Text>] : []),
    ]

    // ---- YOU: exact numbers in fixed places, grey until they change or turn dangerous
    const { hp, max_hp, might, agility, wits, coins } = s.stats
    const meter = s.view?.meter
    const cells = barWidth(width)
    const youRows = [
      row('hp', statusRow('♥', 'health', hp, max_hp, healthColor(s, marks, look), undefined, cells)),
      ...(s.view?.foes ?? []).map(f => {
        const [glyph, name, number, ...bar] = statusRow('⚔', f.name, f.hp, f.max_hp, bad, undefined, cells)
        return row(`foe-${f.id}`, [glyph!, { ...name!, dim: false, color: bad }, { ...number!, color: undefined }, ...bar])
      }),
      ...(meter ? [row('meter', statusRow(look.resource.icon, look.resource.name.toLowerCase(), meter.left, meter.capacity,
        meterTint(meter.state, marks, look), meter.state === 'spent' ? 'spent' : undefined, cells))] : []),
      row('coins', statusRow('◎', look.currency, coins, undefined, changeColor(marks?.coins, look))),
      row('stats', [{ text: '  ' }, { text: [signedStat('might', might), signedStat('agility', agility), signedStat('wits', wits)].join(' · '), dim: true }]),
    ]

    // ---- AT STAKE: the clock, every objective still in play, curses
    const clock = s.view?.clock ?? null
    const urgent = !!clock && clock.left <= 3
    const [lit, spent] = clock ? clockSegments(clock.left, clock.total, width - 2) : [0, 0]
    const stakeRows = [
      ...(!clock ? [] : clock.left > 0 ? [
        row('clock', [{ text: '⧗ ', color: urgent ? bad : MUTED_ACCENT }, { text: clock.name }, { text: ' · ', dim: true },
          { text: `${clock.left} move${clock.left === 1 ? '' : 's'}`, ...(urgent ? { color: bad } : { dim: true }) }]),
        row('clock-left', [{ text: '  ' }, { text: '◉'.repeat(lit), color: urgent ? bad : MUTED_ACCENT }, { text: '○'.repeat(spent), color: FAINT }]),
      ] : [row('clock', [{ text: `⧗ ${clock.name}: it has happened`, color: bad }])]),
      ...(s.status !== 'playing'
        ? [row('the-end', [{ text: 'THE END · type /newgame', color: bad, bold: true }])]
        : openObjectives(s).map((o, i) => row(`goal-${i}`, o.side ? [{ text: `▹ ${o.text}`, dim: true }] : [{ text: `▸ ${o.text}`, color: accent }]))),
      ...(s.view?.curses ?? []).map(c => row(`curse-${c.id}`, [{ text: `✶ ${c.name}`, color: bad }])),
    ]

    // ---- ACT: the only text that does something, so the brightest
    const exits = s.map ? exitsOf(s.map, s.location) : []
    const here = s.view?.characters_here ?? []
    const voices = speakerCards(s, look)
    const actRows = [
      ...(!s.map?.[s.location] ? [<Text key="no-exits" dimColor wrap="truncate">exits appear after your next move</Text>] : []),
      ...exits.map((x, i) => (
        <Button key={`go-${x.dir}`} label={`${x.dir} → ${x.name === 'unexplored' ? '?' : x.name}`} hotkey={i < 9 ? String(i + 1) : undefined}
          plain onPress={say(`go ${x.dir}`)} />
      )),
      <Button key="look" label="look around" hotkey="l" plain onPress={say('look around')} />,
      ...(here.length ? here.map(p => (
        <Box key={`talk-row-${p.id}`} flexDirection="row">
          <Text>{'   '}</Text>
          <Button key={`talk-${p.id}`} label={`talk to ${p.name}`} plain onPress={() => void $.prompt.fill({ text: `I say to ${p.name}: "`, mode: 'replace' })}>
            <Text>talk to </Text>
            <Text color={voices.find(v => v.name === p.name)?.color}>{p.name}</Text>
          </Button>
        </Box>
      )) : [<Text key="no-one" dimColor italic wrap="truncate">{'   no one here to talk to'}</Text>]),
    ]

    // ---- CARRYING: what fits; in the dock, the list gives way first, then the picture
    const things = carried(s)
    const gained = new Set(marks?.gained ?? [])
    const sections = 4 + (stakeRows.length ? 1 : 0) + 1 // where, you, act, carrying, (at stake), more
    const fixed = (1 + whereRows.length) + (1 + youRows.length) + (stakeRows.length ? 1 + stakeRows.length : 0)
      + (1 + actRows.length) + 1 + 2 + (sections - 1)
    const fit = docked && bodyRows > 0 ? fitMargin(bodyRows, fixed, artSteps, things.length) : { items: things.length, more: 0, art: artSteps[0] ?? 0 }
    const carryRows = things.length === 0 ? [<Text key="nothing" dimColor>{'  nothing'}</Text>] : [
      ...things.slice(0, fit.items).map(it => row(`item-${it.id}`, [
        { text: '  ' }, { text: it.name, color: gained.has(it.id) ? look.palette.heal : undefined },
        ...(it.equipped ? [{ text: ' equipped', dim: true }] : []),
        ...(it.count > 1 ? [{ text: ` ×${it.count}`, dim: true }] : []),
        ...(it.own ? [{ text: ' made for you', dim: true }] : []),
      ])),
      ...(fit.more ? [<Text key="more-items" dimColor wrap="truncate">{`  +${fit.more} more · /inventory`}</Text>] : []),
    ]

    const section = (key: string, label: string, rows: RenderChildren[], first: boolean, note?: string) => (
      <Box key={key} flexDirection="column" marginTop={first ? 0 : 1}>
        {row(`${key}-rule`, ruleCells(label, width, note))}
        {rows}
      </Box>
    )
    const margin = [
      section('where', labels.where, [
        ...artOf(fit.art),
        ...whereRows,
      ], true),
      section('you', labels.you, youRows, false),
      ...(stakeRows.length ? [section('at-stake', labels.at_stake, stakeRows, false)] : []),
      section('act', labels.act, actRows, false),
      section('carrying', labels.carrying, carryRows, false, s.view ? `${s.view.weight}/${s.view.carry_limit}` : undefined),
    ]

    // ---- the deeper screens: the map, the journal and the guide, each in place of the margin
    const people = s.view?.people ?? []
    const quests = s.view?.quests ?? []
    const chronicle = s.view?.chronicle ?? []
    const rumors = s.view?.rumors ?? []
    const grid = s.map ? tileGrid(s.map, s.location, width, look) : []
    const Client = clientOf($.ui.resolve(e))
    const seen = new Set(Object.values(s.map ?? {}).map(r => r.terrain).filter((t): t is string => !!t))
    const swatches = Object.entries(look.terrain ?? {}).filter(([t]) => seen.has(t))

    const mapScreen = (
      <Box flexDirection="column">
        {grid.length === 0 && <Text dimColor>The map fills in as you explore.</Text>}
        {grid.length > 0 && (Client && !faulted.has(`${e.requestId} map`)
          ? <Client key="map" module="./tilemap.tsx" props={plain({ grid })} />
          : grid.map(r => (
              <Box flexDirection="row">
                {runsOf(r).map(c => <Text color={c.fg} backgroundColor={c.bg} bold={c.b} dimColor={c.d}>{c.ch}</Text>)}
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

    const journalScreen = (
      <Box flexDirection="column">
        <Text bold>Quests</Text>
        {quests.length === 0 && <Text dimColor>  none yet</Text>}
        {quests.map(q => (
          <Box flexDirection="column">
            <Text color={q.failed ? bad : accent} bold>
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

    const screenLabel = screen === 'guide' ? 'GUIDE' : (look.tab_labels[screen] ?? screen).toUpperCase()
    const deeper = [
      <Button key="back" label="‹ back" hotkey={hereKey} plain onPress={() => void update($, tab, () => 'here')} />,
      section('screen', screenLabel, [
        screen === 'map' ? mapScreen : screen === 'journal' ? journalScreen : <Box key="guide" width={width}><Markdown text={guideText(s)} /></Box>,
      ], false),
    ]

    // ---- MORE: pinned to the bottom of the pane
    return (
      <Box flexDirection="column" paddingX={MARGIN_PAD} minHeight={docked ? bodyRows : 0}>
        {screen === 'here' ? margin : deeper}
        <Box flexGrow={1} />
        <Box key="more" flexDirection="column" marginTop={1}>
          {row('more-rule', ruleCells(labels.more, width))}
          <Box flexDirection="row" columnGap={4}>
            {tabs.filter(t => t.id !== 'here').map(t => (
              <Button key={`screen-${t.id}`} label={t.label.toLowerCase()} hotkey={t.hotkey} plain onPress={show(t.id)} />
            ))}
            <Button key="screen-guide" label="guide" hotkey={GUIDE_KEY} plain onPress={show('guide')} />
          </Box>
        </Box>
      </Box>
    )
  })
}

/**
 * A dice tray in place of a hidden tool row, or nothing when the row has nothing to show. A fresh one
 * runs trayfx.tsx once (the dice tumble; a fight drains both bars); an older one is drawn still, a fight
 * with its strip as it ended.
 */
function drawFx($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], requestId: string, lines: TrayLine[], ids: string[], look: CoderpgLook, accent: string, now: number, columns: number) {
  const { Box, Text } = $.ui.resolve(e)
  const Client = clientOf($.ui.resolve(e))
  if (lines.length === 0) return <Box display="none" />
  const fight = ids.map(id => combats.get(id)).find(Boolean)
  const colors = { accent, good: look.palette.good, bad: look.palette.bad, heal: look.palette.heal }
  const indent = indentOf(columns) // aligned with the page
  const props = { lines, you: fight?.you, foe: fight?.foe, colors, indent }
  const born = Math.max(...ids.map(id => trayAt.get(id) ?? 0))
  if (Client && born > 0 && now - born < FRESH_MS && !faulted.has(`${requestId} fx`)) {
    return <Client key="fx" module="./trayfx.tsx" props={plain(props)} />
  }
  return (
    <Box flexDirection="column" paddingLeft={indent}>
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
