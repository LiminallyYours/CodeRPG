/** The parts of state/save.json the mod reads. The save file is the source of truth; this is a read-only copy. */
export type CoderpgSave = {
  version: number
  /** Which game in games/ this save belongs to (version 7+). */
  game?: string
  adventure: string
  status: string
  location: string
  stats: { hp: number; max_hp: number; might: number; agility: number; wits: number; coins: number }
  inventory: string[]
  equipped: string | null
  flags: string[]
  npcs?: Record<string, { hp: number; max_hp?: number }>
  /** This playthrough: its id changes with every new game (save version 6+). */
  run?: { id?: string; moves?: number }
  /** Rooms visited, with the exits open when last there (save version 3+). */
  map?: Record<string, { name: string; exits: Record<string, string>; neighbors?: Record<string, string> }>
  /** Characters the player has seen (save version 4+). */
  met?: string[]
  /** Display-ready values recomputed on every save (version 3+; people, foes, quests, art from 4). */
  view?: {
    /** The game being played and its look, copied from games/<id>/ (version 7+). */
    game?: { id: string; title: string }
    look?: CoderpgLook
    /** "2026-10-21 · seed ember-4821" or "2026-10-21 · daily world", for the title card (version 7+). */
    run_label?: string | null
    location_name: string
    items: { id: string; name: string; equipped: boolean }[]
    weight: number
    carry_limit: number
    characters_here?: CoderpgPerson[]
    people?: (CoderpgPerson & { here: boolean; memory: string[] })[]
    foes?: (CoderpgPerson & { hp: number; max_hp: number })[]
    quests?: CoderpgQuest[]
    art?: string | null
    location_generated?: boolean
    time?: string | null
    weather?: string | null
    clock?: { name: string; left: number; total: number } | null
    chronicle?: string[]
    rumors?: string[]
  }
}

/** A game's look: the kit's rules/look.default.json with the game's look.json laid over it. */
export type CoderpgLook = {
  palette: { accent: string; good: string; bad: string; warn: string; heal: string }
  stat_labels: { might: string; agility: string; wits: string }
  stat_short: { might: string; agility: string; wits: string }
  currency: string
  tagline: string
  tabs: CoderpgTab[]
  tab_labels: Record<CoderpgTab, string>
  tab_keys: Record<CoderpgTab, string>
  phrases: { idle: string[]; by_command: Record<string, string[]> }
}

export type CoderpgPerson = { id: string; name: string; role: string; generated?: boolean }

export type CoderpgQuest = {
  id: string
  name: string
  complete: boolean
  failed?: boolean
  /** A side quest generated this run. */
  side?: boolean
  /** Objectives done so far, then the current one. */
  objectives: { text: string; done: boolean }[]
}

/** One assistant text block drawn as story, with any card to show above it. */
export type CoderpgStory = {
  key: string
  /** The room's name, when the player arrived there this turn. */
  banner?: string
  /** The adventure's title, on a new game's opening narration. */
  title?: string
  /** The run's date and seed, under the title. */
  runLabel?: string
  /** An ending card after this block. */
  ending?: 'victory' | 'defeat' | 'lost'
  /** The quest completed, for a victory card. */
  endingQuest?: string
  /** Text the game master wrote before further tool calls: hidden (or dim if long), not story. */
  aside?: boolean
  /** Written during a play turn that hasn't finished: hidden until the turn decides what it was. */
  pending?: boolean
  /** It reads like a game-master note rather than story. */
  note?: boolean
}

export type CoderpgTab = 'here' | 'map' | 'journal'

declare module 'claude-code' {
  interface PluginState {
    coderpg: {
      /** Latest parsed save, or null before /newgame. */
      save: CoderpgSave | null
      /** Assistant text blocks written during play turns: drawn as story cards. */
      story: CoderpgStory[]
      /** tool_use_ids of game plumbing calls: their rows are hidden (or drawn as a dice tray). */
      hidden: string[]
      /** What the spinner says while a play turn runs. */
      activity: string | null
      /** The HP bar flashes after damage or healing. */
      flash: 'hurt' | 'heal' | null
      /** A play turn is running: text is held back until it ends. */
      running: boolean
      /** The pane's open tab. */
      tab: CoderpgTab
      /** Sound effects off. */
      muted: boolean
    }
  }
}
