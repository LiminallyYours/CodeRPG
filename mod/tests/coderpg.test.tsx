import { expect, mock, test } from 'claude-code/testing'

import type { CoderpgSave } from '../types'
import { exitsOf, keyText, mapText } from '../hooks/map'
import { feedback, isReset } from '../hooks/feedback'
import { blockLetters } from '../hooks/font'
import { accentOf, DEFAULT_LOOK, lookOf, money, phasePhrase, soundFor, tabsOf } from '../hooks/look'
import { commandPhrase, idlePhrase, npcPhrase, phaseOf } from '../hooks/phrases'
import { revealFrame } from '../hooks/reveal'
import { endingRows, paragraphsOf, speakerOf } from '../hooks/story'
import { tileGrid, tilesAt } from '../hooks/tiles'
import { FX_MS, hpAt, lineAt, numberAt, stripAt, TUMBLE_MS } from '../hooks/trayfx'
import { budgetText, currentObjective, fitCells, startsAfresh, isGmNote, isPendingPlumbing, isPlumbing, pipBar, smoothBar, spaced, storyKey, stripPreamble, trayFor } from '../hooks/register'
import { combatOf, trayLines, traySound } from '../hooks/tray'
import { applyCurse, cursedWords } from '../hooks/curse'
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
  expect(isPlumbing('Bash', { command: 'cat games/dark_lighthouse/rooms/lighthouse.md' })).toBe(true)
  expect(isPlumbing('Read', { file_path: '/x/CodeRPG/games/dark_lighthouse/characters/grukk.md' })).toBe(true)
  expect(isPlumbing('Skill', { skill: 'game' })).toBe(true)
  expect(isPlumbing('Skill', { skill: 'gm-turn' })).toBe(true)
  expect(isPlumbing('Agent', { subagent_type: 'npc', prompt: '', description: '' })).toBe(true)
  expect(isPlumbing('Bash', { command: 'ls -la' })).toBe(false)
  expect(isPlumbing('Edit', { file_path: '/x/CodeRPG/games/dark_lighthouse/rooms/lighthouse.md' })).toBe(false)
  expect(isPlumbing('Agent', { subagent_type: 'Explore', prompt: '', description: '' })).toBe(false)
  expect(isPlumbing('Agent', { subagent_type: 'world', prompt: '', description: '' })).toBe(true)
  expect(isPlumbing('Write', { file_path: '/x/CodeRPG/proposals/extra-tamsin.json', content: '{}' })).toBe(true)
  expect(isPlumbing('Write', { file_path: '/x/CodeRPG/notes.md', content: '' })).toBe(false)
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

test('narration from a game turn is drawn as story text', async ($, on) => {
  const text = 'The troll sniffs the cake, eyes wide.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text) }], version: 1 } }))
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({
      plugin: 'coderpg', surface, component: 'AssistantMessage', requestId: 'm1',
      props: { text, isFirstOfReply: true },
    })
    const boxes = await ui.findAll({ type: 'Box' })
    expect(boxes.some(b => b.props.borderStyle === 'round')).toBe(true)
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()
    await ui.unmount()
  }
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
  await ui.unmount()
})

test('arriving somewhere puts the room name on the narration card', async ($, on) => {
  const text = 'Warmth and smoke roll over you.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), banner: 'The Gull' }], version: 1 } }))
  const wide = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm3',
    props: { text, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await wide.find({ text: blockLetters('The Gull', 999)![0]! })).toBeDefined() // block letters when they fit
  await wide.unmount()
  const narrow = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm3b',
    props: { text, isFirstOfReply: true }, viewport: { columns: 30, rows: 40 } })
  expect(await narrow.find({ text: /── THE GULL ──/ })).toBeDefined() // the plain banner when they don't
  await narrow.unmount()
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

test('changes between saves become one toast, sounds and an HP flash', () => {
  const next: CoderpgSave = {
    ...SAVE, stats: { ...SAVE.stats, hp: 2, coins: 6 }, inventory: [...SAVE.inventory, 'brass_lens'],
    view: { ...SAVE.view!, items: [...SAVE.view!.items, { id: 'brass_lens', name: 'Brass Lens', equipped: false }] },
  }
  const fb = feedback(SAVE, next)
  expect(fb.toast).toBe('-2 HP  ·  +5 coins  ·  gained Brass Lens')
  expect(fb.flash).toBe('hurt')
  expect(fb.sounds).toEqual(['coin'])
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

test('a failed quest and a new side quest are announced', () => {
  const failed: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, quests: [{ ...SAVE.view!.quests![0]!, failed: true }] } }
  const fb = feedback(SAVE, failed)
  expect(fb.toast).toBe('✗ quest failed: Light the Lamp')
  expect(fb.sounds).toContain('defeat')
  const side: CoderpgSave = { ...SAVE, view: { ...SAVE.view!, quests: [...SAVE.view!.quests!, { id: 'lost_line', name: 'The Lost Line', complete: false, side: true, objectives: [] }] } }
  expect(feedback(SAVE, side).toast).toBe('new side quest: The Lost Line')
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
  ]) expect(isGmNote(note)).toBe(true)
  expect(stripPreamble('Recording what Ysolde noticed. Her reply is the next thing you see.\n\nYou skip up the path.'))
    .toBe('You skip up the path.')
  for (const story of ['Checking the door, you find it locked.', 'Passing the nets, you smell tar.', 'Calling out, you hear only gulls.'])
    expect(isGmNote(story)).toBe(false)
  expect(isGmNote('Recording, she said, "is for clerks."')).toBe(false) // dialogue is always story
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
  expect(await ui.find({ text: /1–9 go/ })).toBeDefined()
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
  preset: 'normal', capacity: 30, prices: { generate: 2, world_turn: 2, craft: 2, build: 3 },
  npc_agents: { on: true, lines_per_exchange: 4, off_for: ['grukk'] },
  world_turns: { on: false, every_moves: 5 },
  generation: { on: true, max_per_run: 16, kinds: ['extras', 'side_quests'] },
  crafting: { on: true, max_per_run: 5 },
  building: { on: true, max_per_run: 3 },
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
  expect(text).toContain('something new appearing 2 · the world moving on by itself 2 · having something made 2 · having something built 3. Playing the game as written is always free.')
  expect(text).toContain('**Having things made:** on, up to 5 orders per game.')
  expect(text).toContain('**Having places built:** on, up to 3 per game.')
  expect(text).toContain('voiced by the storyteller: grukk')
  expect(text).toContain('**The world moving on by itself:** off')
  expect(text).toContain('(extras, side quests)')
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

test('place names become block letters, and anything the font lacks or that is too wide falls back', () => {
  const rows = blockLetters('Gull', 40)!
  expect(rows.length).toBe(3)
  expect(rows[0]).toBe('▄▀▀ █ █ █   █')
  expect(blockLetters("Troll's Hollow", 80)).toBeDefined()
  expect(blockLetters('Café', 80)).toBeUndefined() // no glyph for é: the plain banner
  expect(blockLetters('Harbor Square', 30)).toBeUndefined() // 51 cells wide
})

test('a reveal wipes, types, or draws its lines in, and holds still once done', () => {
  const rows = [[{ t: 'ABCDEFGHIJ', c: 'red' }], [{ t: 'xy' }]]
  expect(revealFrame(rows, 'wipe', 0, 200).map(r => r.map(s => s.t).join(''))).toEqual(['▌', '▌'])
  expect(revealFrame(rows, 'wipe', 100, 200)[0]!.map(s => s.t).join('')).toBe('ABCDE▌')
  expect(revealFrame(rows, 'type', 50, 100).map(r => r.map(s => s.t).join(''))).toEqual(['ABCDEF', ''])
  expect(revealFrame(rows, 'lines', 10, 100).length).toBe(1)
  expect(revealFrame(rows, 'wipe', 500, 200)).toBe(rows)
})

test('a fresh story card wipes its banner in on the terminal clock; an old one is drawn still', async ($, on) => {
  const clock = mock.clock(on, { now: 10_000 })
  const text = 'Warmth and smoke roll over you.'
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), banner: 'The Gull', shownAt: 9_900 }], version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm8',
    props: { text, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await ui.find({ type: 'Client', key: 'banner' })).toBeDefined()
  expect(await ui.find({ text: blockLetters('The Gull', 999)![0]!, in: 'banner' })).toBeUndefined() // still wiping
  await ui.advance(400)
  expect(await ui.find({ text: blockLetters('The Gull', 999)![0]!, in: 'banner' })).toBeDefined()
  await ui.unmount()
  await clock.advance(5_000)
  const old = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm9',
    props: { text, isFirstOfReply: true }, viewport: { columns: 100, rows: 40 } })
  expect(await old.find({ type: 'Client' })).toBeUndefined()
  await old.unmount()
})

test("a character's lines are drawn in their own card color, under their name", async ($, on) => {
  const text = 'The fog thickens over the quay.\n\n"Grukk not give glass!" Grukk booms, thumping his chest.\n\n"Mine!" the troll adds.'
  const cards = [{ name: 'Grukk', color: '#8fae4a' }, { name: 'Ysolde', color: '#7fb0d0' }]
  on('state.get', { plugin: 'coderpg', key: 'story' }, () => ({ value: { value: [{ key: storyKey(text), cards }], version: 1 } }))
  const ui = await $.ui.mount({ plugin: 'coderpg', surface: 'terminal', component: 'AssistantMessage', requestId: 'm10', props: { text, isFirstOfReply: true } })
  const label = await ui.find({ type: 'Text', text: 'Grukk' })
  expect(label?.props.color).toBe('#8fae4a')
  expect(await ui.find({ type: 'Text', text: 'Ysolde' })).toBeUndefined()
  expect((await ui.findAll({ type: 'Text', text: 'Grukk' })).length).toBe(1) // "the troll adds": no one named outside the quote, so plain
  await ui.unmount()
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

test('a curse taking hold or lifting gets a toast and its sound', () => {
  const fb = feedback(SAVE, CURSED)
  expect(fb.toast).toBe('✶ cursed: The Backwards Tongue')
  expect(fb.sounds).toEqual(['curse'])
  const lifted = feedback(CURSED, SAVE)
  expect(lifted.toast).toBe('✶ curse lifted: The Backwards Tongue')
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
