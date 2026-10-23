import { expect, mock, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import type { CoderpgSave } from '../types'
import { exitsOf, keyText, mapText } from '../hooks/map'
import { changesOf, feedback, isReset } from '../hooks/feedback'
import { accentOf, DEFAULT_LOOK, lookOf, money, phasePhrase, soundFor, tabsOf } from '../hooks/look'
import { commandPhrase, idlePhrase, npcPhrase, phaseOf } from '../hooks/phrases'
import { pageFrame, pageMs, STEP_MS } from '../hooks/page'
import { revealFrame } from '../hooks/reveal'
import { arrivalRow, blocksOf, endingRows, indentOf, measureOf, paragraphsOf, rowsOf, speakerCards, speakerOf, speechTag } from '../hooks/story'
import { tileGrid, tilesAt } from '../hooks/tiles'
import { FX_MS, hpAt, lineAt, numberAt, stripAt, TUMBLE_MS } from '../hooks/trayfx'
import { bandHpColor, bandParts, budgetText, currentObjective, guideText, PLAY_HINT, WORKING_HINT, fitCells, startsAfresh, isGmNote, isPendingPlumbing, isPlumbing, onlyRecords, pipBar, smoothBar, spaced, storyKey, stripPreamble, trayFor } from '../hooks/register'
import { combatOf, trayLines, traySound } from '../hooks/tray'
import { applyCurse, cursedWords } from '../hooks/curse'
import { addUsage, allTokens, byRole, count, endTurn, helperStep, HISTORY_SIZE, looseStep, measured, newSpend, perPoint, roleOf, rowOf, spawned, spendText, weighted, withRow, ZERO } from '../hooks/spend'
import type { Spend, SpendRow } from '../hooks/spend'
import { CURSE_VECTORS } from './curse_vectors'

const MAP: NonNullable<CoderpgSave['map']> = {
  harbor_square: { name: 'Harbor Square', exits: { north: 'gull_tavern', west: 'lighthouse', east: 'coast_road' },
    neighbors: { gull_tavern: 'The Gull', lighthouse: 'The Lighthouse', coast_road: 'Coast Road' } },
  gull_tavern: { name: 'The Gull', exits: { south: 'harbor_square' } },
  coast_road: { name: 'Coast Road', exits: { west: 'harbor_square', east: 'greywater_bridge' } },
  greywater_bridge: { name: 'Greywater Bridge', exits: { west: 'coast_road', down: 'trolls_hollow' } },
}

const SAVE: CoderpgSave = {
  version: 3,
  adventure: 'The Dark Lighthouse',
  status: 'playing',
  location: 'greywater_bridge',
  stats: { hp: 4, max_hp: 12, might: 1, agility: 1, wits: 1, coins: 1 },
  inventory: ['boarding_cutlass', 'healing_tonic'],
  equipped: 'boarding_cutlass',
  flags: ['grukk_friend'],
  map: MAP,
  npcs: { grukk: { hp: 6, max_hp: 10 } },
  met: ['grukk'],
  view: {
    location_name: 'Greywater Bridge',
    characters_here: [{ id: 'grukk', name: 'Grukk', role: 'the troll' }],
    people: [{ id: 'grukk', name: 'Grukk', role: 'the troll', here: true, memory: ['Hit me with a sword!'] }],
    foes: [{ id: 'grukk', name: 'Grukk', role: 'the troll', hp: 6, max_hp: 10 }],
    quests: [{ id: 'light_the_lamp', name: 'Light the Lamp', complete: false, objectives: [
      { text: 'Find whoever took the lens.', done: true }, { text: 'Get past the troll on Greywater Bridge.', done: false }] }],
    art: '  /\\\n /  \\',
    items: [
      { id: 'boarding_cutlass', name: 'Boarding Cutlass', equipped: true },
      { id: 'healing_tonic', name: 'Healing Tonic', equipped: false },
    ],
    weight: 4,
    carry_limit: 10,
  },
}

const PANE_PROPS = {
  title: 'Character', isFocused: false, bodyColumns: 40, placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 }, view: {},
}


/** The lighthouse's own phrases for fights, as its look.json gives them. */
const LIGHTHOUSE_LOOK = { ...DEFAULT_LOOK, phrases: { ...DEFAULT_LOOK.phrases, by_command: { attack: ['Steel meets steel', 'Blows are traded', 'The fight is on'] } } }

/** A second game's save: its own look travels in view.look. */
const STATION: CoderpgSave = {
  ...SAVE,
  game: 'flooded_station',
  adventure: 'The Flooded Station',
  view: {
    ...SAVE.view!,
    look: {
      ...DEFAULT_LOOK,
      palette: { ...DEFAULT_LOOK.palette, accent: '#4fc3c7' },
      stat_labels: { might: 'Grit', agility: 'Reflex', wits: 'Know-how' },
      stat_short: { might: 'GRT', agility: 'RFX', wits: 'KNW' },
      currency: 'credits',
      tab_labels: { here: 'Deck', map: 'Plan', journal: 'Notes' },
      tab_keys: { here: 'd', map: 'p', journal: 'n' },
      phrases: { idle: ['Water drips somewhere below', 'The hull groans'], by_command: {} },
    },
  },
}

test('map draws boxes: double border for you, dashed ? for unexplored, links between', () => {
  const lines = mapText(MAP, 'greywater_bridge', 60)
  const all = lines.join('\n')
  expect(all).toMatch(/║ *Greywater Bridge *║/) // the player's room, double border
  expect(all).toMatch(/│ *Harbor Square *│/)
  expect(all).toMatch(/┆ *Lighthouse *┆/) // seen from the square, not yet visited: named, dashed
  expect(all).toMatch(/┆ *\? *┆/) // the hollow: no visited room has named it
  expect(all).toMatch(/│─+│|║─+│|│─+║|┆─+│|│─+┆/) // a horizontal link between two boxes
  expect(all).toMatch(/┊/) // the bridge's way down
  const gullLine = lines.findIndex(l => l.includes('Gull'))
  const harborLine = lines.findIndex(l => l.includes('Harbor'))
  expect(gullLine).toBeLessThan(harborLine) // north is up
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(60)
})

test('map shortens names to fit a narrow pane', () => {
  const lines = mapText(MAP, 'greywater_bridge', 40)
  for (const l of lines) expect(l.length).toBeLessThanOrEqual(40)
  expect(lines.join('\n')).toMatch(/Greywater/)
})

test('exits list names explored destinations and marks the rest unexplored', () => {
  expect(exitsOf(MAP, 'harbor_square')).toEqual([
    { dir: 'north', name: 'The Gull', isExplored: true },
    { dir: 'east', name: 'Coast Road', isExplored: true },
    { dir: 'west', name: 'The Lighthouse', isExplored: false },
  ])
})

test('game plumbing is recognised and other tool calls are not', () => {
  expect(isPlumbing('Bash', { command: 'python3 rules/rpg.py look' })).toBe(true)
  expect(onlyRecords('python3 rules/rpg.py remember bucket "A deal."; python3 rules/rpg.py chronicle "Done."')).toBe(true)
  expect(onlyRecords('python3 rules/rpg.py remember bucket "A deal."; python3 rules/rpg.py scene end mopping_dispute reward')).toBe(false)
  expect(onlyRecords('python3 rules/rpg.py look')).toBe(false)
  expect(isPlumbing('Bash', { command: 'cat games/dark_lighthouse/rooms/lighthouse.md' })).toBe(true)
  expect(isPlumbing('Read', { file_path: '/x/CodeRPG/games/dark_lighthouse/characters/grukk.md' })).toBe(true)
  expect(isPlumbing('Skill', { skill: 'game' })).toBe(true)
  expect(isPlumbing('Skill', { skill: 'gm-turn' })).toBe(true)
  expect(isPlumbing('Skill', { skill: 'newworld' })).toBe(true)
  expect(isPlumbing('Agent', { subagent_type: 'worldsmith', prompt: '# Forge a new world' })).toBe(true)
  expect(isPlumbing('Agent', { subagent_type: 'npc', prompt: '', description: '' })).toBe(true)
  expect(isPlumbing('Bash', { command: 'ls -la' })).toBe(false)
  expect(isPlumbing('Edit', { file_path: '/x/CodeRPG/games/dark_lighthouse/rooms/lighthouse.md' })).toBe(false)
  expect(isPlumbing('Agent', { subagent_type: 'Explore', prompt: '', description: '' })).toBe(false)
  expect(isPlumbing('Agent', { subagent_type: 'world', prompt: '', description: '' })).toBe(true)
  expect(isPlumbing('Write', { file_path: '/x/CodeRPG/proposals/extra-tamsin.json', content: '{}' })).toBe(true)
  expect(isPlumbing('Write', { file_path: '/x/CodeRPG/notes.md', content: '' })).toBe(false)
  expect(isPlumbing('Read', { file_path: '/private/tmp/rpg-test/.claude/skills/gm-turn/SKILL.md' })).toBe(true) // the procedure, read by hand
  expect(isPlumbing('Read', { file_path: '/game/.claude/settings.json' })).toBe(false)
})

test('unfinished calls stay hidden until they can be judged', () => {
  expect(isPendingPlumbing('Bash', {}, undefined)).toBe(true) // input still streaming
  expect(isPendingPlumbing('Bash', { command: 'python3 rules/rpg.py look' }, undefined)).toBe(true)
  expect(isPendingPlumbing('Bash', { command: 'ls' }, undefined)).toBe(false)
  expect(isPendingPlumbing('Bash', { command: 'python3 rules/rpg.py look' }, { stdout: '' })).toBe(false) // finished: judged by record
})

test('story keys ignore whitespace differences', () => {
  expect(storyKey('  The troll\n\nsniffs. ')).toBe(storyKey('The troll sniffs.'))
})

test('the pane shows stats, inventory and the map from the save', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: SAVE, version: 1 } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'coderpg', surface, component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
    expect(await ui.find({ text: /The Dark Lighthouse/ })).toBeDefined()
    expect(await ui.find({ text: /4\/12/ })).toBeDefined()
    expect(await ui.find({ text: /Boarding Cutlass/ })).toBeDefined()
    expect(await ui.find({ text: /^1 coin$/ })).toBeDefined()
    expect(await ui.find({ text: /Greywater Bridge/ })).toBeDefined()
    expect(await ui.find({ text: /\(equipped\)/ })).toBeDefined()
    expect(await ui.find({ text: /⚔ Grukk/ })).toBeDefined() // the foe's bar
    expect(await ui.find({ text: /▸ Get past the troll/ })).toBeDefined() // current objective
    expect(await ui.find({ type: 'Button', key: 'go-down' })).toBeDefined() // clickable exit
    expect(await ui.find({ type: 'Button', key: 'talk-grukk' })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane invites a new game when there is no save', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: null, version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ text: /\/newgame/ })).toBeDefined()
  await ui.unmount()
})

test('rule-script calls from game turns are hidden from the transcript', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'hidden' }, () => ({ value: { value: ['t1'], version: 1 } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'coderpg', surface, component: 'ToolUse', requestId: 't1',
      props: { tool_use_id: 't1', tool: 'Bash', input: { command: 'python3 rules/rpg.py look' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    const box = await ui.find({ type: 'Box' })
    expect(box?.props.display).toBe('none')
    await ui.unmount()
  }
})

test('the notice that a background game agent finished is hidden like its call', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'hidden' }, () => ({ value: { value: ['forge1'], version: 1 } }))
  on('ui.render', { component: 'UserMessage' }, () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const notice = (toolUseId: string, isExpanded = false) => $.ui.mount({
    plugin: 'coderpg', surface: 'terminal', component: 'UserMessage', requestId: `n-${toolUseId}-${isExpanded}`,
    props: { text: 'Agent "A new world takes shape" finished', origin: { kind: 'task-notification' }, isExpanded,
             task: { id: 'a1', status: 'completed', toolUseId, durationMs: 504000 } },
  })
  let ui = await notice('forge1')
  expect((await ui.find({ type: 'Box' }))?.props.display).toBe('none')
  await ui.unmount()
  ui = await notice('forge1', true)  // ctrl+o shows everything
  expect(await ui.find({ text: 'engine row' })).toBeDefined()
  await ui.unmount()
  ui = await notice('other')  // someone else's background task
  expect(await ui.find({ text: 'engine row' })).toBeDefined()
  await ui.unmount()
})

test('a call not recorded as game plumbing (an ooc: turn) is drawn normally', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'hidden' }, () => ({ value: { value: [], version: 1 } }))
  on('ui.render', { component: 'ToolUse' }, () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const ui = await $.ui.mount({
    plugin: 'coderpg', surface: 'terminal', component: 'ToolUse', requestId: 't2',
    props: { tool_use_id: 't2', tool: 'Bash', input: { command: 'python3 rules/rpg.py validate' }, isRunning: false, isErrored: false, isInterrupted: false, output: { stdout: 'CONTENT OK' } },
  })
  expect(await ui.find({ text: 'engine row' })).toBeDefined()
  await ui.unmount()
})

test('narration from a game turn is plain prose at the page indent, 72 columns at most, with no border', async ($, on) => {
  const text = 'The troll sniffs the cake, eyes wide.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text) }], version: 1 } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'coderpg', surface, component: 'AssistantMessage', requestId: 'm1',
      props: { text, isFirstOfReply: true }, viewport: { columns: 184, rows: 46 },
    })
    const boxes = await ui.findAll({ type: 'Box' })
    expect(boxes.some(b => b.props.borderStyle !== undefined)).toBe(false)
    expect(boxes[0]?.props.paddingLeft).toBe(56) // centered in a 184-column transcript
    expect(boxes.some(b => b.props.width === 72)).toBe(true)
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(text)
    await ui.unmount()
  }
})

test('the measure is 72 columns, or the transcript\'s column less 6 where 72 won\'t fit', () => {
  expect(measureOf(138)).toBe(72)
  expect(measureOf(74)).toBe(68) // 120 columns with the pane docked beside
  expect(measureOf(10)).toBe(20) // never narrower than this
})

test('the page is centered in its column, never closer than 4 to the edge', () => {
  expect(indentOf(115)).toBe(21) // a docked pane leaves 115 columns: 21 either side of 72
  expect(indentOf(80)).toBe(4)
  expect(indentOf(60)).toBe(4) // 54 columns of text, 4 in
})

test('the journal tab lists quest objectives and the people met, with their memories', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: SAVE, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'tab' }, () => ({ value: { value: 'journal', version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ text: /Light the Lamp/ })).toBeDefined()
  expect(await ui.find({ text: /✓ Find whoever took the lens/ })).toBeDefined()
  expect(await ui.find({ text: /Hit me with a sword/ })).toBeDefined()
  await ui.unmount()
})

test('a new game opens with a title card, and a finished quest closes with an ending card', async ($, on) => {
  const text = 'The lamp blazes into life.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({
    value: { value: [{ key: storyKey(text), title: 'The Dark Lighthouse', runLabel: '2026-10-21 · seed ember-4821', ending: 'victory', endingQuest: 'Light the Lamp' }], version: 1 },
  }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm2', props: { text, isFirstOfReply: true } })
  expect(await ui.find({ text: spaced('The Dark Lighthouse') })).toBeDefined()
  expect(await ui.find({ text: '2026-10-21 · seed ember-4821' })).toBeDefined() // the run's date and seed
  expect(await ui.find({ text: /T H E   E N D/ })).toBeDefined()
  expect(await ui.find({ text: /Quest complete: Light the Lamp/ })).toBeDefined()
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle !== undefined)).toBe(false) // thin rules, no frame
  expect((await ui.findAll({ type: 'Text', text: '─'.repeat(72) })).length).toBe(4) // above and below each card
  await ui.unmount()
})

test('arriving somewhere puts a rule with the place and the time of day above the narration', async ($, on) => {
  const text = 'Warmth and smoke roll over you.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), banner: 'The Gull', bannerTime: 'dusk' }], version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm3',
    props: { text, isFirstOfReply: true }, viewport: { columns: 184, rows: 46 } })
  const name = await ui.find({ type: 'Text', text: '  The Gull' })
  expect(name?.props.bold).toBe(true)
  expect((await ui.find({ type: 'Text', text: 'dusk' }))?.props.dimColor).toBe(true)
  expect(await ui.find({ type: 'Client', key: 'banner' })).toBeUndefined() // no wipe, no block letters
  await ui.unmount()
  const row = arrivalRow('Gorse Thicket', 'dusk', 72, '#d7a640')
  expect(row.map(x => x.t).join('')).toBe('─'.repeat(24) + '  Gorse Thicket · dusk  ' + '─'.repeat(24))
  expect(arrivalRow('The Gull', undefined, 40, 'x').map(x => x.t).join('').length).toBe(40) // no time: name only
})

test('dice rolls from a play turn show as a dice tray instead of a hidden row', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'hidden' }, () => ({ value: { value: ['t9'], version: 1 } }))
  const stdout = 'CHECK might vs DC 14: d20 16 +1 = 17 -> SUCCESS\n'
  const ui = await $.ui.mount({
    plugin: 'coderpg', surface: 'terminal', component: 'ToolUse', requestId: 't9',
    props: { tool_use_id: 't9', tool: 'Bash', input: { command: 'python3 rules/rpg.py check might 14' }, isRunning: false, isErrored: false, isInterrupted: false, output: { stdout } },
  })
  expect(await ui.find({ text: /Might check: d20 16 \+1 = 17 vs DC 14/ })).toBeDefined()
  expect(await ui.find({ text: /SUCCESS/ })).toBeDefined()
  await ui.unmount()
})

test('the rules script output parses into tray lines and a sound', () => {
  const attack = [
    'PLAYER ATTACKS grukk with boarding_cutlass: d20 11 +1 = 12 vs defense 11 -> HIT',
    '  damage 1d6 → [4] = 4 -> grukk HP 6/10',
    'GRUKK ATTACKS: d20 13 +1 = 14 vs your defense 11 -> HIT',
    '  damage 1d6 → [4] = 4 -> Player HP 8/12',
  ].join('\n')
  const lines = trayLines(attack)
  expect(lines.map(l => l.text)).toEqual([
    'You attack Grukk: d20 11 +1 = 12 vs 11', '4 damage · Grukk 6/10',
    'Grukk attacks: d20 13 +1 = 14 vs 11', '4 damage · you 8/12',
  ])
  expect(lines[2]!.tone).toBe('bad')
  expect(traySound(lines)).toBe('hit')
  expect(trayLines('GRUKK IS DEFEATED. Flag set: grukk_defeated')[0]!.text).toBe('Grukk is defeated')
  expect(trayLines('REFUSED: grukk is not here')).toEqual([])
  expect(traySound(trayLines('CHECK wits vs DC 10: d20 3 +1 = 4 -> FAILURE'))).toBe('dice')
  expect(trayFor('Bash', { command: 'python3 rules/rpg.py look' }, { stdout: 'STATUS: playing' })).toEqual([])
})

test('routine changes go in the change line, not a toast; sounds and the HP flash stay', () => {
  const next: CoderpgSave = {
    ...SAVE, stats: { ...SAVE.stats, hp: 2, coins: 6 }, inventory: [...SAVE.inventory, 'brass_lens'],
    view: { ...SAVE.view!, items: [...SAVE.view!.items, { id: 'brass_lens', name: 'Brass Lens', equipped: false }] },
  }
  const fb = feedback(SAVE, next)
  expect(fb.toast).toBeUndefined()
  expect(changesOf(SAVE, next)).toEqual(['−2 ♥', '+5 coins', 'gained Brass Lens'])
  expect(fb.flash).toBe('hurt')
  expect(fb.sounds).toEqual(['coin'])
  const healed: CoderpgSave = { ...SAVE, stats: { ...SAVE.stats, hp: 8, coins: 0 }, inventory: ['boarding_cutlass'] }
  expect(changesOf(SAVE, healed)).toEqual(['+4 ♥', '−1 coin', 'lost Healing Tonic'])
  expect(changesOf(STATION, { ...STATION, stats: { ...STATION.stats, coins: 4 } })).toEqual(['+3 credits']) // the game's currency
  expect(changesOf(SAVE, SAVE)).toEqual([])
  expect(changesOf(null, SAVE)).toEqual([])
  expect(changesOf(SAVE, { ...SAVE, run: { id: 'b' } })).toEqual([]) // a new game: nothing changed, it began
  expect(feedback(null, SAVE).toast).toBeUndefined() // first load: quiet
  expect(feedback(SAVE, { ...SAVE, flags: [] }).toast).toBeUndefined() // a new game: quiet
  const won: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, quests: [{ ...SAVE.view!.quests![0]!, complete: true }] } }
  expect(feedback(SAVE, won).sounds).toContain('fanfare')
})

test('spinner phrases follow what the game master is doing', () => {
  expect(npcPhrase('You are Grukk, the troll who lives under Greywater Bridge.')).toBe('Grukk considers your words')
  expect(['Steel meets steel', 'Blows are traded', 'The fight is on']).toContain(commandPhrase('attack', 3, LIGHTHOUSE_LOOK))
  expect(commandPhrase('validate', 0, LIGHTHOUSE_LOOK)).toBeUndefined()
  expect(commandPhrase('attack', 0, DEFAULT_LOOK)).toBeUndefined() // the default has no phrases of its own for it
  expect(idlePhrase(0, lookOf(STATION))).toBe('Water drips somewhere below')
  expect(currentObjective(SAVE)).toBe('Get past the troll on Greywater Bridge.')
})

test('encounters, the clock and new generated things show in the tray', () => {
  const out = [
    'MOVED east.',
    'CLOCK: The fleet comes home in 3 moves',
    'ENCOUNTER: A gull drops out of the wind and flaps off with a coin.',
    '  effect: COINS -1 -> 2',
    'STATUS: playing | HP 13/13',
  ].join('\n')
  expect(trayLines(out).map(l => l.text)).toEqual([
    'The fleet comes home: 3 moves left',
    'A gull drops out of the wind and flaps off with a coin.',
    '-1 coin · 2 left',
  ])
  expect(trayLines('CLOCK: The fleet comes home. Flag set: fleet_arrived')[0]!.text).toBe('The fleet comes home.')
  expect(trayLines('GENERATED: room The Mooring Steps (mooring_steps), character Old Tamsin (old_tamsin)')[0]!.text)
    .toBe('The world grows: The Mooring Steps, Old Tamsin')
  expect(trayLines('  effect: HURT 1d2 → [2] = 2. Player HP 11/13')[0]!.text).toBe('Hurt for 2 · Player HP 11/13')
})

test('the change line names what the world grew, objectives done and curses, once each', () => {
  const grown: CoderpgSave = {
    ...SAVE,
    run: { rooms: { gorse_thicket: { meta: { name: 'Gorse Thicket' } } },
      items: { driftwood_whistle: { meta: { name: 'Driftwood Whistle' } }, bone_ring: { meta: { name: 'Bone Ring', made_by: 'player' } } } },
    view: { ...SAVE.view!, quests: [{ ...SAVE.view!.quests![0]!, objectives: [
      { text: 'Find whoever took the lens.', done: true }, { text: 'Get past the troll on Greywater Bridge.', done: true }] }] },
  }
  expect(changesOf(SAVE, grown)).toEqual(['✓ Get past the troll on Greywater Bridge.', 'the world grows · Gorse Thicket · Driftwood Whistle'])
  expect(changesOf(grown, grown)).toEqual([]) // already there
  expect(changesOf(SAVE, CURSED)).toEqual(['✶ cursed: The Backwards Tongue'])
  expect(changesOf(CURSED, SAVE)).toEqual(['✶ curse lifted: The Backwards Tongue'])
})

test('someone acting close by is only a soft sound (the story tells it); a new world ready is a toast too', () => {
  const heard: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, signals: [{ n: 1, text: 'Heavy bare feet thud along the coast road.', kind: 'plan' }] } }
  const fb = feedback(SAVE, heard)
  expect(fb.toast).toBeUndefined()
  expect(fb.sounds).toEqual(['signal'])
  expect(feedback(heard, heard).sounds).toEqual([]) // already heard
  const again: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, signals: [...heard.view!.signals!, { n: 2, text: 'Heavy bare feet thud along the coast road.' }] } }
  expect(feedback(heard, again).sounds).toEqual(['signal']) // heard again later; an older save's signal has no kind: a plan's
  const world: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, signals: [{ n: 1, text: 'A new world has taken shape: The Salt Mines. /game salt_mines goes there.', kind: 'world' }] } }
  expect(feedback(SAVE, world).toast).toBe('A new world has taken shape: The Salt Mines. /game salt_mines goes there.')
  expect(feedback(SAVE, world).sounds).toEqual(['signal'])
})

test('a failed quest and a new side quest are in the change line', () => {
  const failed: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, quests: [{ ...SAVE.view!.quests![0]!, failed: true }] } }
  expect(changesOf(SAVE, failed)).toEqual(['✗ quest failed: Light the Lamp'])
  expect(feedback(SAVE, failed).toast).toBeUndefined()
  expect(feedback(SAVE, failed).sounds).toContain('defeat')
  const side: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, quests: [...SAVE.view!.quests!, { id: 'lost_line', name: 'The Lost Line', complete: false, side: true, objectives: [] }] } }
  expect(changesOf(SAVE, side)).toEqual(['new side quest: The Lost Line'])
  const won: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, quests: [{ ...SAVE.view!.quests![0]!, complete: true }] } }
  expect(changesOf(SAVE, won)).toEqual(['★ quest complete: Light the Lamp'])
})

test('the pane shows the time, weather and clock; the journal shows the story so far and rumors', async ($, on) => {
  const save: CoderpgSave = {
    ...SAVE,
    view: { ...SAVE.view!, time: 'nightfall', weather: 'sea fog rolling in over the quay', clock: { name: 'The fleet comes home', left: 2, total: 18 },
      chronicle: ['Befriended the troll with a honey cake.'], rumors: ['A stranger is asking about the light.'] },
  }
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: save, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'tab' }, () => ({ value: { value: 'journal', version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ text: /nightfall · sea fog/ })).toBeDefined()
  expect(await ui.find({ text: /^The fleet comes home$/ })).toBeDefined()
  expect(await ui.find({ text: /2 moves left/ })).toBeDefined()
  expect(await ui.find({ text: /Befriended the troll/ })).toBeDefined()
  expect(await ui.find({ text: /A stranger is asking/ })).toBeDefined()
  await ui.unmount()
})

test('losing the main quest closes with a quieter ending card', async ($, on) => {
  const text = 'The boats came home in the dark.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), ending: 'lost', endingQuest: 'Light the Lamp' }], version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm4', props: { text, isFirstOfReply: true } })
  expect(await ui.find({ text: /Quest failed: Light the Lamp/ })).toBeDefined()
  await ui.unmount()
})

test('a one-line progress note between tool calls is hidden; a longer aside is dimmed', async ($, on) => {
  const note = 'Saving the regenerated fisherman so I can place him on the landing and answer you.'
  const long = 'You step down onto the landing.\n\nThe boats knock together in the fog.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({
    value: { value: [{ key: storyKey(note), aside: true }, { key: storyKey(long), aside: true }], version: 1 },
  }))
  const a = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm5', props: { text: note, isFirstOfReply: false } })
  expect((await a.find({ type: 'Box' }))?.props.display).toBe('none')
  await a.unmount()
  const b = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm6', props: { text: long, isFirstOfReply: false } })
  expect((await b.findAll({ type: 'Box' })).some(x => x.props.borderStyle === 'round')).toBe(false)
  expect((await b.find({ type: 'Markdown' }))?.props.dimColor).toBe(true)
  await b.unmount()
})

test('the map key is drawn as whole boxes, stacked when the pane is narrow', () => {
  const wide = keyText(60, true)
  expect(wide[0]).toBe('╔═════╗  ╭─────────╮  ╭┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄╮')
  expect(wide[1]).toBe('║ you ║  │ visited │  ┆ not visited yet ┆')
  expect(wide[3]).toBe('┊ stairs or a path up or down')
  expect(keyText(60, false)).toHaveLength(3)
  const narrow = keyText(30, false)
  expect(narrow).toHaveLength(9)
  for (const l of narrow) expect(l.length).toBeLessThanOrEqual(30)
})

test('text from an unfinished play turn is held back until the turn ends', async ($, on) => {
  const text = 'Bringing the fisherman into being…'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), pending: true }], version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm7', props: { text, isFirstOfReply: true } })
  expect((await ui.find({ type: 'Box' }))?.props.display).toBe('none')
  expect(await ui.find({ type: 'Markdown' })).toBeUndefined()
  await ui.unmount()
})

test('a game-master preamble before the story is dropped from the card, but story is never cut', () => {
  expect(stripPreamble("Recording Ysolde's reply, then narrating.\n\nYsolde's eyes slide to the window.")).toBe("Ysolde's eyes slide to the window.")
  expect(stripPreamble('The gulls scream overhead.\n\nYou climb the path.')).toBe('The gulls scream overhead.\n\nYou climb the path.')
  expect(stripPreamble('Recording nothing, only one paragraph.')).toBe('Recording nothing, only one paragraph.')
})

test('ordinary story is never taken for a game-master note (QA finding 1)', () => {
  for (const first of [
    'Flagstones gleam wet under the lamplight.',
    'She records your name in a ledger.',
    'Generations of fishermen have mended nets here.',
    'The tools of her trade hang on pegs.',
    'Saving her breath, Ysolde points at the stair.',
    'Now the tide turns, and the wind with it.',
    'Next to the hearth, an old man stirs.',
    'The world turns grey as the fog rolls in.',
    'In the corner, a lantern gutters and dies.',
    'The fire is low now, and the room is quiet.',
  ]) {
    const text = `${first}\n\nYou climb the path.`
    expect(stripPreamble(text)).toBe(text)
    expect(isGmNote(first)).toBe(false)
  }
  for (const note of [
    "Recording Ysolde's reply, then narrating.",
    'Saving the regenerated fisherman so I can place him on the landing and answer you.',
    'World turn is due; run it after this.',
    "Now I'll spawn the world agent for the fisherman.",
    'Recording what Ysolde noticed. Her reply is the next thing you see.',
    'Updating her memory first.',
    "Back on the Landing, I've finished the off-screen world update, and now I'm narrating.", // Stage 5 playtest
    "Bucket's drawing up the Lookout Float; it's priced at 5 credits and isn't paid for yet.",
    'Settling in beside Old Hob now.',
    'Bringing the fisherman into being…',
    'Compromise reached; ending the scene with the reward.', // Stage 7 live check
  ]) expect(isGmNote(note)).toBe(true)
  expect(isGmNote('You take in the scene: rain on the glass, dark screens, one red light.')).toBe(false)
  expect(stripPreamble('Recording what Ysolde noticed. Her reply is the next thing you see.\n\nYou skip up the path.'))
    .toBe('You skip up the path.')
  for (const story of ['Checking the door, you find it locked.', 'Passing the nets, you smell tar.', 'Calling out, you hear only gulls.'])
    expect(isGmNote(story)).toBe(false)
  expect(isGmNote('Recording, she said, "is for clerks."')).toBe(false) // dialogue is always story
  expect(isGmNote("Pell: I'll fetch it, love.")).toBe(false) // speech tagged with a name, even without quotation marks
  expect(stripPreamble("Pell: I'll fetch it.\n\nShe bustles off.")).toBe("Pell: I'll fetch it.\n\nShe bustles off.")
  expect(isGmNote('World turn: nothing moved.')).toBe(true) // the machinery, however it's dressed
  expect(isGmNote("Note: I'll narrate after the brief.")).toBe(true)
})

test('story keys tell apart narrations that open the same way (QA finding 10)', () => {
  const opening = 'You look around the square. ' + 'Gulls wheel overhead. '.repeat(20)
  expect(storyKey(opening + 'A boat bumps the quay.')).not.toBe(storyKey(opening + 'A bell rings far out.'))
})

test('a new game is recognised by its run id, and a flag being unset is not a new game (QA finding 3)', () => {
  const a: CoderpgSave = { ...SAVE, run: { id: 'aaa', moves: 4 } }
  expect(isReset(a, { ...a, flags: [] })).toBe(false)
  expect(isReset(a, { ...a, run: { id: 'bbb', moves: 0 } })).toBe(true)
  // the same variants rolled again, with a different run id: still a new game, so no bogus toast
  const fresh: CoderpgSave = { ...a, run: { id: 'ccc', moves: 0 }, stats: { ...a.stats, coins: 3 } }
  expect(feedback({ ...a, stats: { ...a.stats, coins: 8 } }, fresh).toast).toBeUndefined()
})

test('an encounter fall held short of killing shows what was taken', () => {
  expect(trayLines('  effect: HURT 1d2 → [2] = 2, held to 0. Player HP 1/13')[0]!.text).toBe('Hurt for 0 · Player HP 1/13')
})

test('searching the game files with Grep or Glob is plumbing too', () => {
  expect(isPlumbing('Grep', { pattern: 'grukk', path: 'games/dark_lighthouse/characters' })).toBe(true)
  expect(isPlumbing('Glob', { pattern: 'games/*/rooms/*.md' })).toBe(true)
  expect(isPlumbing('Grep', { pattern: 'TODO', path: 'mod/hooks' })).toBe(false)
})

test('bars fill to the nearest eighth of a cell and always keep their width', () => {
  expect(smoothBar(12, 12, 10)).toEqual(['██████████', ''])
  expect(smoothBar(0, 12, 10)).toEqual(['', '░░░░░░░░░░'])
  const [full, empty] = smoothBar(7, 12, 10) // 5.83 cells = 47 eighths: 5 full and a 7/8 block
  expect(full).toBe('█████▉')
  expect(full.length + empty.length).toBe(10)
  expect(pipBar(3, 12, 8)).toEqual(['▰▰', '▱▱▱▱▱▱'])
})

test('framed rows are cut to fit with an ellipsis, never overflowing', () => {
  const cut = fitCells([{ text: '⧗ ' }, { text: 'The fleet comes home through the rocks' }], 20)
  expect(cut.map(c => c.text).join('')).toBe('⧗ The fleet comes h…')
  expect(cut.map(c => c.text).join('').length).toBe(20)
})

test('the pane: vitals in a titled frame, a tab strip, and a footer of keys, with room on the left', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: SAVE, version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ text: 'VITALS' })).toBeDefined()
  expect(await ui.find({ text: /^╰─+╯$/ })).toBeDefined()
  expect(await ui.find({ text: /^MIG $/ })).toBeDefined()
  expect(await ui.find({ text: /1–9 then ⏎ go/ })).toBeDefined()
  // the open tab is a solid pill, not a button; the others are dim buttons
  const pill = await ui.find({ type: 'Text', text: ' h: Here ' })
  expect(pill?.props.backgroundColor).toBe('#d7a640')
  const tabs = await ui.findAll({ type: 'Button' })
  expect(tabs.find(b => b.key === 'tab-here')).toBeUndefined()
  expect(tabs.find(b => b.key === 'tab-map')?.props.dimColor).toBe(true)
  // the tabs and their content share one rounded frame
  expect((await ui.findAll({ type: 'Box' })).some(b => b.props.borderStyle === 'round')).toBe(true)
  const outer = (await ui.findAll({ type: 'Box' }))[0]
  expect(outer?.props.paddingLeft).toBe(2)
  await ui.unmount()
})

test("each game's look comes from the save: colors, stat and tab labels, currency, phrases", async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: STATION, version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  const pill = await ui.find({ type: 'Text', text: ' d: Deck ' })
  expect(pill?.props.backgroundColor).toBe('#4fc3c7')
  expect(await ui.find({ text: /^GRT $/ })).toBeDefined()
  expect(await ui.find({ text: /^1 credit$/ })).toBeDefined()
  expect(await ui.find({ text: /d p n tabs/ })).toBeDefined()
  expect(await ui.find({ text: /^MIG $/ })).toBeUndefined()
  await ui.unmount()
})

test('a save without a look falls back to the kit default, and partial looks are filled in', () => {
  expect(lookOf(null)).toBe(DEFAULT_LOOK)
  const partial = lookOf({ ...SAVE, view: { ...SAVE.view!, look: { palette: { accent: '#123456' } } as never } })
  expect(partial.palette.accent).toBe('#123456')
  expect(partial.palette.bad).toBe('red')
  expect(partial.stat_short.might).toBe('MIG')
  expect(tabsOf(partial).map(t => t.hotkey)).toEqual(['h', 'm', 'j'])
  expect(money(1, DEFAULT_LOOK)).toBe('1 coin')
  expect(money(3, lookOf(STATION))).toBe('3 credits')
})

test("the dice tray uses the game's names for stats and money", () => {
  const look = lookOf(STATION)
  expect(trayLines('CHECK might vs DC 12: d20 9 +0 = 9 -> FAILURE', look)[0]!.text).toBe('Grit check: d20 9 +0 = 9 vs DC 12')
  expect(trayLines('COINS -2 -> 2', look)[0]!.text).toBe('-2 credits · 2 left')
  expect(trayLines('CHECK might vs DC 12: d20 9 +0 = 9 -> FAILURE')[0]!.text).toBe('Might check: d20 9 +0 = 9 vs DC 12')
})

test('a new game, or switching to another game, starts on a cleared screen; listing games does not', () => {
  expect(startsAfresh('newgame', '', 'dark_lighthouse')).toBe(true)
  expect(startsAfresh('newgame', 'daily', undefined)).toBe(true)
  expect(startsAfresh('game', 'flooded_station', 'dark_lighthouse')).toBe(true)
  expect(startsAfresh('game', ' The Flooded Station ', 'dark_lighthouse')).toBe(true) // a title: the skill resolves it
  expect(startsAfresh('game', '', 'dark_lighthouse')).toBe(false) // only lists
  expect(startsAfresh('game', 'dark_lighthouse', 'dark_lighthouse')).toBe(false) // already playing it
  expect(startsAfresh('inventory', '', 'dark_lighthouse')).toBe(false)
})

const SETTINGS = {
  preset: 'normal', capacity: 30, prices: { generate: 2, world_turn: 2, craft: 2, build: 3, reuse: 1, promote: 2 },
  npc_agents: { on: true, lines_per_exchange: 4, off_for: ['grukk'] },
  world_turns: { on: false, every_moves: 5 },
  generation: { on: true, max_per_run: 16, kinds: ['extras', 'side_quests'] },
  crafting: { on: true, max_per_run: 5 },
  building: { on: true, max_per_run: 3 },
  promotion: { on: true, max_per_run: 2, after_conversations: 3 },
}
const metered = (left: number, state: 'ok' | 'low' | 'spent'): CoderpgSave => ({
  ...STATION, view: { ...STATION.view!, meter: { left, capacity: 30, state }, settings: SETTINGS,
    look: { ...STATION.view!.look!, resource: { name: 'Power', icon: 'ϟ', low: 'Batteries low.', spent: 'Flat.' } } },
})

test("the pane shows the meter under the game's own name, colored when it runs low", async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: metered(6, 'low'), version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  const icon = await ui.find({ type: 'Text', text: 'ϟ Power ' })
  expect(icon?.props.color).toBe(STATION.view!.look!.palette.warn)
  expect(await ui.find({ text: ' 6/30' })).toBeDefined()
  await ui.unmount()
})

test('/budget tells the player what is left, what things cost and what is on, in plain words', () => {
  const text = budgetText(metered(22, 'ok'))
  expect(text).toContain('**ϟ Power:** 22/30.')
  expect(text).toContain('something new appearing 2 · the world moving on by itself 2 · having something made 2 · having something built 3 · someone or something coming back from an earlier game 1 · someone you keep coming back to finding their own voice 2. Playing the game as written is always free.')
  expect(text).toContain('**Having things made:** on, up to 5 orders per game.')
  expect(text).toContain('**Having places built:** on, up to 3 per game.')
  expect(text).toContain('**People finding their own voice:** on, after 3 conversations, up to 2 per game.')
  expect(text).toContain('voiced by the storyteller: grukk')
  expect(text).toContain('**The world moving on by itself:** off')
  expect(text).toContain('(extras, side quests)')
  const lively = { ...metered(22, 'ok') }
  lively.view = { ...lively.view!, settings: { ...SETTINGS, world_turns: { on: true, every_moves: 5, plans: true },
    prices: { ...SETTINGS.prices, scene: 2 }, side_scenes: { on: true, max_per_run: 2, replies: 6 } } }
  expect(budgetText(lively)).toContain('**The world moving on by itself:** on, every 5 moves, with people following their own plans.')
  expect(budgetText(lively)).toContain('a little scene between two characters 2')
  expect(budgetText(lively)).toContain('**Little scenes between two characters:** on, up to 2 per game, 6 replies each.')
  const forging = { ...lively, view: { ...lively.view!, settings: { ...lively.view!.settings!, new_worlds: { on: true } } } }
  expect(budgetText(forging)).toContain("**New worlds made to order** (`/newworld`): on; they don't use the power.")
  expect(budgetText(forging)).not.toContain('a whole new world')
  expect(budgetText(metered(0, 'spent'))).toContain('0/30 (spent)')
  expect(budgetText(SAVE)).toContain('Nothing to show yet')
})

test('the meter running low, running out and refilling each get one toast', () => {
  expect(feedback(metered(9, 'ok'), metered(7, 'low')).toast).toBe('ϟ Power running low')
  expect(feedback(metered(9, 'ok'), metered(7, 'low')).sounds).toEqual(['meter_low'])
  expect(feedback(metered(2, 'low'), metered(0, 'spent')).toast).toBe('ϟ Power spent')
  expect(feedback(metered(0, 'spent'), metered(30, 'ok')).toast).toBe('ϟ Power refilled')
  expect(feedback(metered(20, 'ok'), metered(18, 'ok')).toast).toBeUndefined() // one extra's price: quiet
})

// ---------------------------------------------------------------- Stage 3: look and feel

test('a reveal types, or draws its lines in, and holds still once done', () => {
  const rows = [[{ t: 'ABCDEFGHIJ', c: 'red' }], [{ t: 'xy' }]]
  expect(revealFrame(rows, 'type', 50, 100).map(r => r.map(s => s.t).join(''))).toEqual(['ABCDEF', ''])
  expect(revealFrame(rows, 'lines', 10, 100).length).toBe(1)
  expect(revealFrame(rows, 'lines', 500, 200)).toBe(rows)
})

test('paragraphs appear one after another, each dim for a moment, the first after any delay', () => {
  expect(pageFrame(3, 0, 0)).toEqual(['fading', 'hidden', 'hidden'])
  expect(pageFrame(3, STEP_MS + 10, 0)).toEqual(['shown', 'fading', 'hidden'])
  expect(pageFrame(3, 3 * STEP_MS, 0)).toEqual(['shown', 'shown', 'shown'])
  expect(pageFrame(2, 100, 900)).toEqual(['hidden', 'hidden']) // under a title card still typing
  expect(pageMs(3, 900)).toBe(900 + 3 * STEP_MS)
})

test('a fresh page shows a paragraph at a time on the terminal clock; a key, or age, shows it whole', async ($, on) => {
  const clock = mock.clock(on, { now: 10_000 })
  const text = 'Warmth and smoke roll over you.\n\nThe fire spits.'
  let skip = 0
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), shownAt: 10_000 }], version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'revealSkip' }, () => ({ value: { value: skip, version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm8',
    props: { text, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await ui.find({ type: 'Client', key: 'page' })).toBeDefined()
  expect((await ui.findAll({ type: 'Markdown', in: 'page' })).map(m => m.props.dimColor)).toEqual([true]) // the first, fading in
  await ui.advance(400)
  expect((await ui.findAll({ type: 'Markdown', in: 'page' })).map(m => m.props.dimColor)).toEqual([false, false])
  await ui.unmount()
  skip = 10_000 // a key was pressed while it appeared
  const skipped = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm8b',
    props: { text, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await skipped.find({ type: 'Client' })).toBeUndefined()
  expect((await skipped.findAll({ type: 'Markdown' })).length).toBe(2)
  await skipped.unmount()
  skip = 0
  await clock.advance(5_000)
  const old = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm9',
    props: { text, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await old.find({ type: 'Client' })).toBeUndefined()
  await old.unmount()
})

test("a character's lines are drawn beside a keyline in their color, under their name, the tag taken off", async ($, on) => {
  const tamsin = 'Tamsin: "Black-faced, she is," she calls, low, so as not to wake the flock\'s nerves. "Quick as a thought when she\'s frightened."'
  const text = 'The fog thickens over the quay.\n\n' + tamsin + '\n\n"Grukk not give glass!" Grukk booms, thumping his chest.\n\n"Mine!" the troll adds.'
  const cards = [{ name: 'Grukk', color: '#8fae4a' }, { name: 'Ysolde', color: '#7fb0d0' }, { name: 'Tamsin', color: '#c98a8a' }]
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), cards }], version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm10',
    props: { text, isFirstOfReply: true }, viewport: { columns: 184, rows: 46 } })
  expect((await ui.find({ type: 'Text', text: 'Tamsin' }))?.props.color).toBe('#c98a8a')
  expect(await ui.find({ type: 'Markdown', text: tamsin.slice('Tamsin: '.length) })).toBeDefined() // the tag is gone
  const keyline = '▌\n'.repeat(rowsOf(tamsin.slice(8), 70)) + '▌' // one per row, and one for the name
  expect((await ui.find({ type: 'Text', text: keyline }))?.props.color).toBe('#c98a8a')
  expect((await ui.find({ type: 'Text', text: 'Grukk' }))?.props.color).toBe('#8fae4a') // untagged: the old heuristic
  expect(await ui.find({ type: 'Text', text: 'Ysolde' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text', text: 'Grukk' })).length).toBe(1) // "the troll adds": no one named outside the quote, so plain
  await ui.unmount()
})

test('a speech tag names someone by name or part of it; a sentence with a colon is no tag', () => {
  const cards = [{ name: 'Dr. Ines Halloran', color: 'a' }, { name: 'the Shellback', color: 'b' }, { name: 'Ysolde', color: 'c' }]
  expect(speechTag('Halloran: "Relief, at last."', cards)).toEqual({ text: '"Relief, at last."', who: cards[0] })
  expect(speechTag('**Dr. Halloran:** "Relief."', cards)?.who).toBe(cards[0])
  expect(speechTag('The Shellback: Click.', cards)?.who).toBe(cards[1])
  expect(speechTag('Old Hob: "Who goes?"', cards)).toEqual({ text: '"Who goes?"', who: { name: 'Old Hob' } }) // someone unmet: a dim keyline
  expect(speechTag('Old Hob: who goes there, you wonder.', cards)).toBeUndefined() // an unknown name needs a quotation after it
  expect(speechTag('Ysolde stands at the door: "Out."', cards)).toBeUndefined() // a sentence, not a tag
  expect(speechTag('You take in the scene: rain on the glass.', cards)).toBeUndefined()
  expect(speechTag('Note: "Recording her reply."', cards)).toBeUndefined()
  expect(blocksOf('Rain.\n\nYsolde: "Out."', cards)).toEqual([{ text: 'Rain.', who: undefined }, { text: '"Out."', who: cards[2] }])
  expect(rowsOf('one two three four', 9)).toBe(3) // one two · three · four
  expect(rowsOf('**one** two', 7)).toBe(1) // markers take no room
})

test('speakers take their card color, else the next speaker color in the order they were met', () => {
  const people = (ids: string[]) => ids.map(id => ({ id, name: id, role: '', here: false, memory: [], ...(id === 'grukk' ? { card: '#8fae4a' } : {}) }))
  const s: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, people: people(['tamsin', 'grukk', 'hob']), characters_here: [{ id: 'wren', name: 'wren', role: '' }] } }
  expect(speakerCards(s, DEFAULT_LOOK)).toEqual([
    { name: 'tamsin', color: '#7fa7c9' }, // sage is Grukk's card, so the next one
    { name: 'grukk', color: '#8fae4a' },
    { name: 'hob', color: '#c98a8a' },
    { name: 'wren', color: '#c9a35a' }, // here but not yet in the met list
  ])
  expect(speakerCards(s, DEFAULT_LOOK, [{ id: 'hob', name: 'hob', role: '' }]).length).toBe(4) // no one twice
  expect(lookOf(SAVE).speaker_colors).toEqual(DEFAULT_LOOK.speaker_colors)
})

test('who speaks a paragraph: a quote and a name; titles and articles are skipped', () => {
  const cards = [{ name: 'Dr. Ines Halloran', color: 'a' }, { name: 'the Shellback', color: 'b' }, { name: 'Bucket', color: 'c' }]
  expect(speakerOf('"Relief, at last," Halloran says.', cards)?.color).toBe('a')
  expect(speakerOf('The Shellback hisses. "Click."', cards)?.color).toBe('b')
  expect(speakerOf('Bucket mops the floor.', cards)).toBeUndefined() // no quote: plain description
  expect(speakerOf('"Beep." Bucket rolls past Halloran.', cards)?.color).toBe('c') // the first named
  expect(speakerOf('"Mind the buckets," someone says.', cards)).toBeUndefined() // a word, not the name
  expect(paragraphsOf('One.\n\n  Two.\n\n\n')).toEqual(['One.', 'Two.'])
  // the screenshot: a newly generated fisherman speaks, and his line mentions Pell
  const tavern = [{ name: 'Pell', color: '#d19a5a' }, { name: 'Dunstan Tarry' }]
  const dunstan = '"Two coins, friend, to go rolling about in the fog like a pup?" He shakes his head slowly. "Dunstan Tarry. ' +
    'I mend nets. Keep your coin. Spend it on one of Pell\'s honey cakes, they\'re worth it."'
  expect(speakerOf(dunstan, tavern)).toBeUndefined() // names inside the quotes are talked about, not speaking
  expect(speakerOf('Dunstan Tarry grins. "Pell knows me." Pell rolls his eyes.', tavern)).toBeUndefined() // first named has no card
  expect(speakerOf('Behind the bar, round-faced Pell looks up. "Well now, love."', tavern)?.name).toBe('Pell')
  expect(speakerOf('“Mind the draught,” Pell says.', tavern)?.name).toBe('Pell') // curly quotes too
})

test('an ending card is its lines in order, in its colors', () => {
  const v = endingRows('victory', 'Light the Lamp', { accent: '#d7a640', bad: 'red' })
  expect(v.border).toBe('#d7a640')
  expect(v.rows.map(r => r[0]!.t)).toEqual(['✦  T H E   E N D  ✦', 'Quest complete: Light the Lamp', 'Keep exploring, or type /newgame to play again.'])
  expect(endingRows('defeat', undefined, { accent: 'x', bad: 'red' }).border).toBe('red')
})

test('the dice tumble before the result shows, then the bars drain and the damage rises and fades', () => {
  const line = { icon: '⚔', text: 'You attack Grukk: d20 15 +1 = 16 vs 11', result: 'HIT', tone: 'good' as const }
  const early = lineAt(line, 50, 1)
  expect(early.result).toBeUndefined()
  expect(early.text).toMatch(/^You attack Grukk: d20 \d+$/)
  expect(lineAt(line, TUMBLE_MS, 1)).toBe(line)
  const foe = { name: 'Grukk', was: 10, hp: 6, max: 10, dmg: 4 }
  expect(hpAt(foe, 0)).toBe(10)
  expect(hpAt(foe, FX_MS)).toBe(6)
  expect(numberAt(0)).toBeUndefined()
  expect(numberAt(TUMBLE_MS + 10)).toBe('low')
  expect(numberAt(TUMBLE_MS + 300)).toBe('high')
  expect(numberAt(FX_MS)).toBeUndefined()
  const colors = { accent: '#d7a640', good: 'green', bad: 'red', heal: 'cyan' }
  const you = { name: 'You', was: 12, hp: 12, max: 12, dmg: 0 }
  const end = stripAt({ lines: [line], you, foe, colors }, FX_MS)
  const bars = end[1]!.map(s => s.t).join('')
  expect(bars).toContain('♥ You ')
  expect(bars).toContain('⚔ Grukk ')
  expect(bars).toContain(' 6/10')
  expect(end[0]!.map(s => s.t).join('').trim()).toBe('') // the number has faded
  const mid = stripAt({ lines: [line], you, foe, colors }, TUMBLE_MS + 300)
  expect(mid[0]!.map(s => s.t).join('')).toContain('-4')
})

test("a fight's two sides come from the rules script's words and the save written after", () => {
  const out = ['PLAYER ATTACKS grukk with boarding_cutlass: d20 15 +1 = 16 vs defense 11 -> HIT',
    '  damage 1d6 → [4] = 4 -> grukk HP 6/10',
    'GRUKK ATTACKS: d20 14 +1 = 15 vs your defense 11 -> HIT',
    '  damage 1d6 → [3] = 3 -> Player HP 4/12'].join('\n')
  const f = combatOf(out, SAVE)!
  expect(f.foe).toEqual({ name: 'Grukk', was: 10, hp: 6, max: 10, dmg: 4 })
  expect(f.you).toEqual({ name: 'You', was: 7, hp: 4, max: 12, dmg: 3 })
  expect(combatOf('CHECK wits vs DC 12: d20 3 +1 = 4 -> FAILURE', SAVE)).toBeUndefined()
})

test('the map is colored tiles: terrain from the look, the player marked, unvisited rooms dim, water moving', () => {
  const map = { ...MAP, harbor_square: { ...MAP.harbor_square!, terrain: 'water' }, gull_tavern: { ...MAP.gull_tavern!, terrain: 'indoors' } }
  const look = lookOf(null)
  const grid = tileGrid(map, 'harbor_square', 60, look)
  const cells = grid.flat()
  expect(cells.some(c => c.k === 'mark' && c.ch === '◆')).toBe(true)
  expect(cells.some(c => c.bg === look.terrain!.indoors!.bg)).toBe(true)
  expect(cells.some(c => c.k === 'move')).toBe(true) // the water around the square
  expect(cells.some(c => c.d === true && c.bg === '#2b2b30')).toBe(true) // the lighthouse: heard of, not visited
  expect(grid.every(r => r.length <= 60)).toBe(true)
  const a = tilesAt(grid, 0).flat().filter(c => c.k === 'move').map(c => c.ch).join('')
  const b = tilesAt(grid, 1).flat().filter(c => c.k === 'move').map(c => c.ch).join('')
  expect(a).not.toBe(b)
  expect(tilesAt(grid, 1).flat().some(c => c.k === 'mark' && c.ch === '◇')).toBe(true) // the marker blinks
  expect(tileGrid(map, 'nowhere', 60, look)).toEqual([])
})

test('the map tab draws the tiles as a live module on the terminal', async ($, on) => {
  const s: CoderpgSave = { ...SAVE, map: { ...MAP, greywater_bridge: { ...MAP.greywater_bridge!, terrain: 'water' } } }
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: s, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'tab' }, () => ({ value: { value: 'map', version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ type: 'Client', key: 'map' })).toBeDefined()
  const before = (await ui.findAll({ type: 'Text', in: 'map' })).map(t => t.text).join('')
  await ui.advance(300)
  const after = (await ui.findAll({ type: 'Text', in: 'map' })).map(t => t.text).join('')
  expect(after).not.toBe(before)
  expect(await ui.find({ text: / water/ })).toBeDefined() // the key names the terrains seen
  expect(await ui.find({ text: ' built for you' })).toBeUndefined()
  await ui.unmount()
})

test("the map's key explains the mark on a place built for the player", async ($, on) => {
  const s: CoderpgSave = { ...SAVE, map: { ...MAP, gull_tavern: { ...MAP.gull_tavern!, made_by: 'player' } } }
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: s, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'tab' }, () => ({ value: { value: 'map', version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ text: ' built for you' })).toBeDefined()
  await ui.unmount()
})

test('waiting phases follow what the game master is doing, in the game\'s voice', () => {
  expect(phaseOf('Bash', 'look', '', '')).toBe('reading')
  expect(phaseOf('Bash', 'npc-brief', 'grukk', '')).toBe('considering')
  expect(phaseOf('Bash', 'talk', 'old_tamsin', '')).toBe('considering')
  expect(phaseOf('Agent', undefined, '', 'npc')).toBe('considering')
  expect(phaseOf('Bash', 'world-brief', 'room', '')).toBe('shaping')
  expect(phaseOf('Bash', 'world-brief', 'turn', '')).toBe('stirring')
  expect(phaseOf('Agent', undefined, '', 'world', 'turn')).toBe('stirring')
  expect(phaseOf('Bash', 'attack', 'grukk', '')).toBe('resolving')
  expect(phaseOf('Bash', 'chronicle', '"x"', '')).toBeUndefined()
  const look = lookOf({ ...SAVE, view: { ...SAVE.view!, look: { ...DEFAULT_LOOK, phrases: { ...DEFAULT_LOOK.phrases, phases: { considering: ['{name} considers your words'] } } } } })
  expect(phasePhrase(look, 'considering', 0, 'Grukk')).toBe('Grukk considers your words')
  expect(phasePhrase(look, 'shaping', 0)).toBeUndefined()
})

test('each beat plays the sound the game picks for it, or none', () => {
  const look = { ...DEFAULT_LOOK, sounds: { step: 'splash', phase_reading: null } }
  expect(soundFor(look, 'step')).toBe('splash')
  expect(soundFor(look, 'phase_reading')).toBeNull()
  expect(soundFor(look, 'hit')).toBe('hit')
})

test('the accent follows the time of day when the game gives one', () => {
  const look = { ...DEFAULT_LOOK, palette: { ...DEFAULT_LOOK.palette, accent_by_time: { 'deep night': '#9c7a45' } } }
  const at = (time: string): CoderpgSave => ({ ...SAVE, view: { ...SAVE.view!, look, time } })
  expect(accentOf(at('deep night'))).toBe('#9c7a45')
  expect(accentOf(at('dusk'))).toBe(DEFAULT_LOOK.palette.accent)
})

// ---------------------------------------------------------------- Stage 4: curses

test('curses change words exactly as the rules do (the shared examples)', () => {
  for (const v of CURSE_VECTORS) expect(applyCurse(v.effect, v.input)).toBe(v.output)
  expect(cursedWords([{ effect: 'reverse_words' }, { effect: 'suffix "…over."' }], 'go north')).toBe('north go …over.')
  expect(applyCurse('sing', 'go north')).toBe('go north') // unknown: unchanged (validate refuses it)
})

const CURSED: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, curses: [{ id: 'backwards_tongue', name: 'The Backwards Tongue', effect: 'reverse_words' }] } }

test('an active curse is shown in the pane', async ($, on) => {
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: CURSED, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'cursed' }, () => ({ value: { value: [{ key: storyKey('go north now'), shown: 'now north go' }], version: 1 } }))
  const pane = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await pane.find({ text: '✶ The Backwards Tongue' })).toBeDefined()
  await pane.unmount()
})

test('a curse taking hold gets a toast and its sound; one lifting only its sound', () => {
  const fb = feedback(SAVE, CURSED)
  expect(fb.toast).toBe('✶ cursed: The Backwards Tongue')
  expect(fb.sounds).toEqual(['curse'])
  const lifted = feedback(CURSED, SAVE)
  expect(lifted.toast).toBeUndefined()
  expect(lifted.sounds).toEqual(['curse_lifted'])
})

// ---------------------------------------------------------------- Stage 5: the player leaves a mark

test('paying a maker shows what was made, and how it was paid for', () => {
  const lines = trayLines([
    'COINS -3 -> 0',
    "MADE: Gaff Hook (gaff_hook), made for the player by Morwen. It's theirs now.  [weight 3/10]",
  ].join('\n'))
  expect(lines.map(l => l.text)).toEqual(['-3 coins · 0 left', 'Gaff Hook, made for you by Morwen'])
  expect(trayLines('PAID WITH: sardine_tin')[0]!.text).toBe('paid with Sardine Tin')
  expect(trayLines('COMMISSIONED: Gaff Hook (gaff_hook), light weapon, from Morwen')).toEqual([])
})

test('a place the player had built is marked on the map, and its building shows in the tray', () => {
  const look = lookOf(null)
  const map = { ...MAP, gull_tavern: { ...MAP.gull_tavern!, made_by: 'player' } }
  const cells = tileGrid(map, 'harbor_square', 60, look).flat()
  expect(cells.filter(c => c.ch === '⌂').length).toBe(1)
  expect(tileGrid(MAP, 'harbor_square', 60, look).flat().some(c => c.ch === '⌂')).toBe(false)
  expect(trayLines('BUILDING: The Net-Loft (net_loft), southwest of here, by Morwen: ready in 3 moves. It doesn\'t exist until then.')[0]!.text)
    .toBe('The Net-Loft: ready in 3 moves')
  expect(trayLines('BUILT: The Net-Loft (net_loft) is finished, southwest of Harbor Square, built for the player by Morwen.')[0]!.text)
    .toBe('The Net-Loft is finished')
})

test('the journal marks someone the player kept coming back to, who now speaks for themselves', async ($, on) => {
  const people = [
    { id: 'old_tamsin', name: 'Old Tamsin', role: 'a fishwife', generated: true, promoted: true, here: true, memory: [] },
    { id: 'hob', name: 'Old Hob', role: 'a fisherman', generated: true, here: false, memory: [] },
  ]
  const s: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, people } }
  on('state.get', { plugin: 'coderpg', key: 'save' }, () => ({ value: { value: s, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'tab' }, () => ({ value: { value: 'journal', version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'Pane', requestId: 'coderpg-sheet', props: PANE_PROPS })
  expect(await ui.find({ text: ' ★' })).toBeDefined()
  expect(await ui.find({ text: ', a fishwife · here' })).toBeDefined()
  expect((await ui.findAll({ type: 'Text', text: '  knows you well' })).length).toBe(1)
  expect(await ui.find({ text: ', a fisherman' })).toBeDefined()
  await ui.unmount()
})

// ---- what a session really used (/budget, the owner's part)

const U = (input: number, output: number, read: number, write: number) =>
  ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write })

test('real use: tokens are weighted by price ratios and counted by who made them', () => {
  const t = addUsage(addUsage(ZERO, U(100, 10, 1000, 40)), U(0, 0, 0, 0))
  expect(t).toEqual({ input: 100, output: 10, cacheRead: 1000, cacheWrite: 40, requests: 2 })
  expect(weighted(t)).toBe(100 + 50 + 100 + 50)
  expect(roleOf('npc')).toBe('npc')
  expect(roleOf('worldsmith')).toBe('worldsmith')
  expect(roleOf('Explore')).toBe('other')
  let s = newSpend(0)
  // a helper's first request can come in before its spawn returns: it's kept, and gets its role later
  s = helperStep(s, 'a1', U(0, 100, 0, 0))
  s = spawned(s, 'a1', 'world')
  s = spawned(s, 'a2', 'npc')
  s = helperStep(s, 'a2', U(1000, 0, 0, 0))
  s = looseStep(s, U(10, 0, 0, 0))
  expect(byRole(s)).toEqual({ gm: 10, npc: 1000, world: 500, worldsmith: 0, other: 0 })
  expect(s.runs).toEqual({ world: 1, npc: 1 })
  expect(allTokens(s).requests).toBe(3)
})

test('real use: play turns make the per-turn figures, development turns are kept apart', () => {
  const main = addUsage(ZERO, U(1000, 0, 0, 0))
  const all = addUsage(main, U(500, 0, 0, 0))
  let s = endTurn(newSpend(0), { play: true, ms: 30_000, main, all })
  s = endTurn(s, { play: true, ms: 10_000, main, all })
  s = endTurn(s, { play: false, ms: 99_000, main: addUsage(ZERO, U(7000, 0, 0, 0)), all: ZERO })
  const row = rowOf(s)
  expect(row.turns).toBe(2)
  expect(row.secondsPerTurn).toBe(20)
  expect(row.requestsPerTurn).toBe(2)
  expect(row.weightedPerTurn).toBe(1500)
  expect(s.dev).toEqual({ turns: 1, tokens: { ...ZERO, input: 7000, requests: 1 } })
  expect(byRole(s).gm).toBe(2000) // the game master's play requests; development ones are on their own line
})

test('real use: what a point really cost is the turns with extras less plain turns, per point', () => {
  const plain = addUsage(ZERO, U(30_000, 0, 0, 0))
  const extra = addUsage(addUsage(ZERO, U(50_000, 0, 0, 0)), U(10_000, 0, 0, 0))
  let s = endTurn(newSpend(0), { play: true, ms: 1, main: plain, all: plain, points: 0 })
  expect(perPoint(s)).toBeUndefined() // no turn with extras yet
  s = endTurn(s, { play: true, ms: 1, main: extra, all: extra, points: 2 })
  expect(perPoint(s)).toBe(15_000) // (60k - 30k) / 2
  s = endTurn(s, { play: true, ms: 1, main: plain, all: plain })
  expect(s.extra).toEqual({ turns: 1, tokens: { ...ZERO, input: 60_000, requests: 2 }, points: 2 })
  expect(perPoint(s)).toBe(15_000) // a third turn as plain as the first changes nothing
  expect(spendText(s, [])).toContain('**A point really cost** about 15k weighted tokens (priced as 10–15k weighted tokens): 1 turn with extras against 2 without.')
  expect(rowOf(s).perPoint).toBe(15_000)
})

test('real use: the plan windows count what this session moved them, across a reset', () => {
  let s = measured(newSpend(0), [{ kind: 'five_hour', percentUsed: 40, resetsAt: 'A' }])
  s = measured(s, [{ kind: 'five_hour', percentUsed: 43.5, resetsAt: 'A' }, { kind: 'seven_day', percentUsed: 12 }])
  expect(s.windows.five_hour!.used).toBe(3.5)
  expect(s.windows.seven_day!.used).toBe(0)
  s = measured(s, [{ kind: 'five_hour', percentUsed: 2, resetsAt: 'B' }, { kind: 'seven_day', percentUsed: 12.4 }])
  expect(s.windows.five_hour!.used).toBe(5.5)
  expect(s.windows.seven_day!.used).toBe(0.4)
})

test('real use: the history keeps the last sessions with turns, newest last', () => {
  const played = endTurn(newSpend(5), { play: true, ms: 1000, main: ZERO, all: ZERO })
  let h: SpendRow[] = []
  h = withRow(h, newSpend(1)) // nothing happened: not kept
  h = withRow(h, undefined)
  h = withRow(h, { nonsense: true } as unknown as Spend)
  expect(h).toEqual([])
  for (let i = 0; i < 12; i++) h = withRow(h, { ...played, startedAt: i })
  expect(h.length).toBe(HISTORY_SIZE)
  expect(h[0]!.startedAt).toBe(2)
  expect(h[HISTORY_SIZE - 1]!.startedAt).toBe(11)
})

test('real use: /budget says it in tokens, with the plan windows and the history only when there are any', () => {
  let s = newSpend(0)
  expect(spendText(s, [])).toContain('**Per play turn:** no play turns yet.')
  s = spawned(s, 'w', 'world')
  s = helperStep(s, 'w', U(0, 4000, 0, 0))
  const main = addUsage(ZERO, U(2000, 1000, 200_000, 8000))
  s = endTurn(s, { play: true, ms: 41_000, main, all: main })
  s = { ...s, points: 2 }
  const text = spendText(s, [])
  expect(text).toContain('**Real use this session**')
  expect(text).toContain('**Per play turn:** 41 s, 1 requests, 37k weighted tokens (1 turns).')
  expect(text).toContain('storyteller 37k · characters 0 · world agent 20k · worldsmith 0 · other agents 0')
  expect(text).toContain('**Extras:** 2 points spent; the world agent ran 1 time, 20k weighted tokens.')
  expect(text).toContain('**A point really cost:** not known yet; it needs play turns both with and without extras (a point is priced as 10–15k weighted tokens).')
  expect(text).not.toContain('Plan usage')
  expect(text).not.toContain('Earlier sessions')
  expect(text).not.toContain('Development turns')
  expect(text).not.toMatch(/\$|dollar|USD/i)
  const later = measured(measured(s, [{ kind: 'five_hour', percentUsed: 10 }]), [{ kind: 'five_hour', percentUsed: 12 }])
  const withHistory = spendText(endTurn(later, { play: false, ms: 0, main, all: ZERO }), [rowOf(s)])
  expect(withHistory).toContain('**Plan usage this session:** 5-hour window +2%.')
  expect(withHistory).toContain('**Development turns:** 1, 37k weighted tokens (not in the play figures).')
  expect(withHistory).toContain('| Started | Turns | s | Req. | Tokens | Points | Per point | 5-h % |')
  expect(withHistory).toMatch(/\| 1 \| 41 \| 1 \| 37k \| 2 \| – \| – \|/)
  expect(count(812)).toBe('812')
  expect(count(1234)).toBe('1.2k')
  expect(count(4_100_000)).toBe('4.1M')
})

test('real use: the hooks count a play turn, a helper by its type, and keep the session in the store', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const kept: Record<string, unknown> = { 'spend:/game': { current: endTurn(newSpend(0), { play: true, ms: 5_000, main: ZERO, all: ZERO }) } }
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => { kept[e.key] = JSON.parse(JSON.stringify(e.value)); return { value: undefined } })
  on('fs.exists', () => ({ value: true }))
  on('session.root', () => ({ value: '/game' }))
  on('session.start', () => ({ cwd: '/game' }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: {} }) as never)
  on('fs.stat', () => ({ value: undefined }) as never)
  on('turn.step', async function* () { return { turnId: 't1', index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { ...U(100, 10, 0, 0), model: 'm' } } } as never)
  on('agent.spawn', () => ({ model: 'm', agentId: 'a1' }) as never)
  await $.session.start({ source: 'startup', cwd: '/game' } as never)
  await clock.settle() // the store is written in the background
  const stored = kept['spend:/game'] as { current: Spend; history: SpendRow[] }
  expect(stored.history.length).toBe(1) // the last session moved into the history
  expect(stored.current.play.turns).toBe(0)
  await $.turn.start({ turnId: 't1', text: 'I walk north.' } as never)
  const step = async (agentId?: string) => {
    for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'm', messageCount: 1, ...(agentId ? { agentId } : {}) } as never)) { /* chunks */ }
  }
  await step()
  await $.agent.spawn({ subagentType: 'npc', prompt: 'p', description: 'd' } as never)
  await step('a1')
  await clock.advance(12_000)
  await $.turn.complete({ turnId: 't1', answer: '' } as never)
  await clock.settle()
  const now = kept['spend:/game'] as { current: Spend }
  expect(now.current.play.turns).toBe(1)
  expect(now.current.play.ms).toBe(12_000)
  expect(now.current.play.tokens.requests).toBe(2)
  expect(byRole(now.current)).toEqual({ gm: 150, npc: 150, world: 0, worldsmith: 0, other: 0 })
})

test('room prose after ROOM TEXT never reads as a roll, however its lines happen to look', () => {
  const out = ['MOVED east.', 'ENCOUNTER: A gull steals your bread.', 'STATUS: playing | HP 9/11', 'ROOM TEXT:',
    'A cobbled square opens onto a stone quay.', 'ROLL 2d6: the dice are carved on the tavern sign',
    'damage done long ago = 3 -> the quay wall', 'effect: GAINED: lantern', 'COINS +5 -> 8', 'PLAYER ATTACKS grukk with words: d20 1 +0 = 1 vs defense 9 -> MISS'].join('\n')
  expect(trayLines(out)).toEqual([{ icon: '⚑', text: 'A gull steals your bread.', tone: 'neutral' }])
  expect(trayFor('Bash', { command: 'python3 rules/rpg.py move east' }, { stdout: out })).toHaveLength(1)
  expect(combatOf(out, SAVE)).toBeUndefined()
})

test("real use: a /clear (as /newgame runs) empties the mod's state, and the figures come back from the store", async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const kept: Record<string, unknown> = {}
  let cell: { value: unknown; version: number } = { value: undefined, version: 0 }
  on('state.get', { plugin: 'coderpg', key: 'spend' }, () => ({ value: { value: cell.value, version: cell.version } }) as never)
  on('state.set', { plugin: 'coderpg', key: 'spend' }, (_, e) => {
    cell = { value: JSON.parse(JSON.stringify((e as { value: unknown }).value ?? null)), version: cell.version + 1 }
    return { value: { isSet: true, version: cell.version } } as never
  })
  on('store.get', (_, e) => ({ value: kept[e.key] }))
  on('store.set', (_, e) => { kept[e.key] = JSON.parse(JSON.stringify(e.value)); return { value: undefined } })
  on('fs.exists', () => ({ value: true }))
  on('session.root', () => ({ value: '/game' }))
  on('session.start', () => ({ cwd: '/game' }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: {} }) as never)
  on('fs.stat', () => ({ value: undefined }) as never)
  on('turn.step', async function* (_: unknown, e: { turnId: string }) { return { turnId: e.turnId, index: 0, answer: '', toolUses: [], stopReason: 'end_turn', usage: { ...U(100, 10, 0, 0), model: 'm' } } } as never)
  await $.session.start({ source: 'startup', cwd: '/game' } as never)
  const turn = async (id: string) => {
    await $.turn.start({ turnId: id, text: 'I walk north.' } as never)
    for await (const _ of $.turn.step({ turnId: id, index: 0, model: 'm', messageCount: 1 } as never)) { /* chunks */ }
    await clock.advance(10_000)
    await $.turn.complete({ turnId: id, answer: '' } as never)
    await clock.settle()
  }
  await turn('t1')
  cell = { value: null, version: cell.version + 1 } // what a /clear does to $.state
  await turn('t2')
  expect((kept['spend:/game'] as { current: Spend }).current.play.turns).toBe(2)
  expect((kept['spend:/game'] as { current: Spend }).current.startedAt).toBe(1_000) // the same session, not a new one
  const r = (await $.command.run({ command: 'budget', args: '' } as never)) as { text?: string }
  expect(r.text).toContain('**Real use this session**')
  expect(r.text).toContain('(2 turns)')
})

// ---------------------------------------------------------------- NEXT-PLAN 3.1: the page

test('a play turn: the arrival rule with the time, the change line under the last paragraph, and a key shows it whole', async ($, on) => {
  const clock = mock.clock(on, { now: 1_000 })
  const before: CoderpgSave = { ...SAVE, run: { id: 'r1' } }
  const after: CoderpgSave = {
    ...before, location: 'gorse_thicket', stats: { ...SAVE.stats, hp: 2 },
    run: { id: 'r1', rooms: { gorse_thicket: { meta: { name: 'Gorse Thicket' } } } },
    view: { ...SAVE.view!, location_name: 'Gorse Thicket', time: 'dusk', characters_here: [] },
  }
  let file = before, mtime = 1
  on('fs.exists', () => ({ value: true }))
  on('fs.stat', () => ({ value: { mtimeMs: mtime } }) as never)
  on('fs.read', () => ({ value: JSON.stringify(file) }) as never)
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.root', () => ({ value: '/game' }))
  on('session.start', () => ({ cwd: '/game' }) as never)
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: '' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: {} }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('tool.call', () => ({ result: { stdout: 'MOVED north.' } }) as never)
  on('session.append', (_, e, next) => next(e))
  on('prompt.edit', () => ({ text: 'x', cursor: 1 }) as never)
  await $.session.start({ source: 'startup', cwd: '/game' } as never)
  await $.turn.start({ turnId: 't1', text: 'I push north into the gorse.' } as never)
  file = after; mtime = 2
  await $.tool.call({ tool: 'Bash', command: 'python3 rules/rpg.py move north', tool_use_id: 'c1' } as never)
  const first = 'The gap narrows and the gorse crowds in.\n\nA lamb trembles by a stone.'
  const second = 'The only way out is back south.'
  for (const [i, text] of [first, second].entries()) {
    await $.session.append({ door: 'response', origin: { kind: 'model' }, uuid: `u${i}`, message: { role: 'assistant', content: [{ type: 'text', text }] } } as never)
  }
  await $.turn.complete({ turnId: 't1', answer: '' } as never)
  await clock.settle()
  const draw = (text: string, id: string) => $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: id,
    props: { text, isFirstOfReply: true }, viewport: { columns: 184, rows: 46 } })
  const a = await draw(first, 'p1')
  expect(await a.find({ type: 'Text', text: '  Gorse Thicket' })).toBeDefined()
  expect(await a.find({ type: 'Text', text: 'dusk' })).toBeDefined()
  expect(await a.find({ text: /✧/ })).toBeUndefined() // not under the first block
  expect((await a.find({ type: 'Client', key: 'page' }))?.props.props).toMatchObject({ delay: 0, width: 72 })
  await a.unmount()
  const b = await draw(second, 'p2')
  expect((await b.find({ type: 'Client', key: 'page' }))?.props.props).toMatchObject({ delay: 2 * STEP_MS }) // after the first block's two paragraphs
  expect(await b.find({ type: 'Text', text: '−2 ♥ · the world grows · Gorse Thicket' })).toBeDefined()
  await b.unmount()
  await ($.prompt as unknown as { edit: (e: unknown) => Promise<unknown> }).edit({ origin: { kind: 'composer' }, key: { key: 'x' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'x', kind: 'composer' } as never)
  const c = await draw(second, 'p3')
  expect(await c.find({ type: 'Client', key: 'page' })).toBeUndefined() // the key showed it whole
  await c.unmount()
})

test("the player's line is dim and italic after a quiet ›, and the turn's closing line is hidden in play", async ($, on) => {
  on('fs.exists', () => ({ value: true }))
  on('fs.stat', () => ({ value: undefined }) as never)
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.root', () => ({ value: '/game' }))
  on('session.start', () => ({ cwd: '/game' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: {} }) as never)
  on('ui.render', { component: 'TurnDuration' }, () => ({ type: 'Text', props: {}, children: ['Baked for 3s'] }))
  await $.session.start({ source: 'startup', cwd: '/game' } as never)
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'UserMessage', requestId: 'u1',
    props: { text: 'try north', origin: { kind: 'composer' }, isExpanded: false } })
  expect((await ui.find({ type: 'Text', text: '› ' }))?.props.dimColor).toBe(true)
  const words = await ui.find({ type: 'Text', text: 'try north' })
  expect(words?.props).toMatchObject({ dimColor: true, italic: true })
  expect((await ui.find({ type: 'Box' }))?.props.paddingLeft).toBe(4)
  await ui.unmount()
  const end = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'TurnDuration', requestId: 'd1',
    props: { word: 'Baked', durationMs: 3000 } })
  expect((await end.find({ type: 'Box' }))?.props.display).toBe('none')
  expect(await end.find({ text: /✦/ })).toBeUndefined()
  await end.unmount()
})

// ---------------------------------------------------------------- NEXT-PLAN 3.2: band, hint, footer

/** What the engine answers for a session in a game folder (the mod is inert elsewhere) with a save; register before any $ call. */
function gameFolder(on: Parameters<TestBody>[1], save: CoderpgSave) {
  mock.clock(on, { now: 1_000 })
  on('fs.exists', () => ({ value: true }))
  on('fs.stat', () => ({ value: { mtimeMs: 1 } }) as never)
  on('fs.read', () => ({ value: JSON.stringify(save) }) as never)
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.root', () => ({ value: '/game' }))
  on('session.start', () => ({ cwd: '/game' }) as never)
  on('command.register', () => ({ value: {} }) as never)
  on('ui.open', () => ({ value: {} }) as never)
}

const startSession = ($: Parameters<TestBody>[0]) => $.session.start({ source: 'startup', cwd: '/game' } as never)

const BAND_PROPS = { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} }

test('beside the pane the band is health and the latest change, or what the game master is doing', async ($, on) => {
  const save: CoderpgSave = { ...SAVE, stats: { ...SAVE.stats, hp: 10, max_hp: 12 } }
  gameFolder(on, save)
  on('state.get', { plugin: 'coderpg', key: 'latest' }, () => ({ value: { value: { changes: ['−2 ♥', 'the world grows · Gorse Thicket'], hp: 'hurt' }, version: 1 } }))
  on('state.get', { plugin: 'coderpg', key: 'activity' }, () => ({ value: { value: 'Reading the room', version: 1 } }))
  on('ui.panes', () => ({ value: [{ id: 'coderpg-sheet', title: 'Character', isShown: true, isFocused: false, isPlaced: true }] }) as never)
  await startSession($)
  const band = (isWorking: boolean, id: string) => $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AbovePrompt', requestId: id,
    props: { ...BAND_PROPS, isWorking }, viewport: { columns: 133, rows: 46 } }) // the column beside the pane
  const ui = await band(false, 'b1')
  expect((await ui.find({ type: 'Text', text: '♥ 10' }))?.props.color).toBe('red') // hurt this turn
  expect(await ui.find({ type: 'Text', text: '✧ −2 ♥ · the world grows · Gorse Thicket' })).toBeDefined()
  expect(await ui.find({ text: /Greywater|◎/ })).toBeUndefined() // the pane has the rest
  await ui.unmount()
  const busy = await band(true, 'b2')
  expect((await busy.find({ type: 'Text', text: '◌ Reading the room' }))?.props.italic).toBe(true)
  expect(await busy.find({ text: /✧/ })).toBeUndefined()
  await busy.unmount()
  const look = lookOf(save)
  expect(bandHpColor(save, 'heal', look)).toBe('cyan')
  expect(bandHpColor(save, undefined, look)).toBeUndefined() // quiet when nothing changed
  expect(bandHpColor({ ...save, stats: { ...save.stats, hp: 3 } }, undefined, look)).toBe('red') // a quarter or less
})

test('without the pane the band carries place, health, money, resource, clock, time and objective', async ($, on) => {
  const save: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, time: 'dusk', clock: { name: 'The fleet comes home', left: 14, total: 20 },
    meter: { left: 28, capacity: 30, state: 'ok' } } }
  expect(bandParts(save, '#d7a640').map(p => p.text)).toEqual(['◆ Greywater Bridge', '♥ 4', '◎ 1', '✦ 28', '⧗ 14', 'dusk', '▸ Get past the troll on Greywater Bridge.'])
  const parts = bandParts(save, '#d7a640')
  expect(parts.filter(p => p.color === '#d7a640').map(p => p.text[0])).toEqual(['◆', '▸']) // the accent marks only place and objective
  gameFolder(on, save)
  on('ui.panes', () => ({ value: [{ id: 'coderpg-sheet', title: 'Character', isShown: false, isFocused: false, isPlaced: false }] }) as never)
  await startSession($)
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AbovePrompt', requestId: 'b3',
    props: BAND_PROPS, viewport: { columns: 120, rows: 40 } }) // opened unasked on a narrow screen: not placed
  expect(await ui.find({ type: 'Text', text: ' · dusk' })).toBeDefined()
  await ui.unmount()
})

test('in play the hint line is the game\'s and the mode labels are hidden; ooc: turns keep the engine\'s', async ($, on) => {
  gameFolder(on, SAVE)
  let seen: unknown
  on('ui.render', { component: 'PromptHint' }, (_, e) => ({ type: 'Text', props: {}, children: [String(e.props.hint)] }))
  on('ui.render', { component: 'SessionMode' }, (_, e) => { seen = e.props.modes; return { type: 'Text', props: {}, children: [] } })
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  await startSession($)
  let n = 0
  const hint = async (isWorking: boolean) => {
    const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'PromptHint', requestId: `h${n++}`,
      props: { isDraft: false, isWorking, hint: '? for shortcuts' } })
    const text = (await ui.findAll({ type: 'Text' })).map(t => t.children.join('')).join('')
    await ui.unmount()
    return text
  }
  expect(await hint(false)).toBe(PLAY_HINT)
  expect(PLAY_HINT).toContain('ctrl+x tab to the margin')
  expect(PLAY_HINT).toContain('/guide')
  expect(await hint(true)).toBe(WORKING_HINT) // Esc still interrupts; Claude Code's mode isn't named
  const mode = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'SessionMode', requestId: 'sm', props: { modes: ['auto mode on'] } })
  expect(seen).toEqual([])
  await mode.unmount()
  await $.turn.start({ turnId: 't9', text: 'ooc: how do saves work?' } as never)
  expect(await hint(false)).toBe('? for shortcuts') // Claude Code's own line
})

test('/guide says how to play in the game\'s own words, instantly', async ($, on) => {
  gameFolder(on, STATION)
  await startSession($)
  const r = (await $.command.run({ command: 'guide', args: '' } as never)) as { text?: string }
  expect(r.text).toContain('How to play The Flooded Station')
  expect(r.text).toContain('**p** plan, **n** notes') // the station's own tab keys
  expect(r.text).toContain('ooc:')
  expect(guideText(null)).toContain('**How to play**')
})
