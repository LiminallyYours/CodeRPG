// What a session really used, in tokens, for the owner's part of /budget (NEXT-PLAN.md part 1).
// Two jobs: checking the meter's prices (a point is meant to be about one extra round of game-master work),
// and measuring speed changes before and after (seconds, requests and tokens per play turn).
// Everything here is pure; register.tsx feeds it from turn.step, agent.spawn, session.measure and the turns.

import type { Spend, SpendRole as Role, SpendRow, SpendTokens as Tokens } from '../types'

export type { Role, Spend, SpendRow, Tokens }

/** The API's usage block for one request. */
export type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export const HISTORY_SIZE = 10

/** What the meter's prices assume a point is worth (README, *What the extras cost*). */
export const POINT_TARGET = '10–15k weighted tokens'

export const ZERO: Tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }

export const ROLES: Role[] = ['gm', 'npc', 'world', 'worldsmith', 'other']

export function newSpend(now: number): Spend {
  return { startedAt: now, play: { turns: 0, ms: 0, tokens: ZERO }, dev: { turns: 0, tokens: ZERO }, gm: ZERO, agents: {}, runs: {}, windows: {}, points: 0 }
}

export function addUsage(t: Tokens, u: Usage): Tokens {
  return {
    input: t.input + (u.input_tokens || 0), output: t.output + (u.output_tokens || 0),
    cacheRead: t.cacheRead + (u.cache_read_input_tokens || 0), cacheWrite: t.cacheWrite + (u.cache_creation_input_tokens || 0),
    requests: t.requests + 1,
  }
}

export function sum(a: Tokens, b: Tokens): Tokens {
  return { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite, requests: a.requests + b.requests }
}

/**
 * One comparable figure: tokens weighted by the API's price ratios (cache writes 1.25×, cache reads 0.1×,
 * output 5× an uncached input token). Raw counts are dominated by cheap cache reads. An assumption: on the
 * Max plan nothing is billed per token, so this stands in for what each kind of token is worth.
 */
export function weighted(t: Tokens): number {
  return Math.round(t.input + 1.25 * t.cacheWrite + 0.1 * t.cacheRead + 5 * t.output)
}

/** The role of an agent type; the kit's three helpers by name, anything else as other. */
export function roleOf(subagentType: string | undefined): Role {
  return subagentType === 'npc' || subagentType === 'world' || subagentType === 'worldsmith' ? subagentType : 'other'
}

/** A spawned helper: its id gets its role, and the role one more run. */
export function spawned(s: Spend, agentId: string, role: Role): Spend {
  const had = s.agents[agentId]
  return { ...s, agents: { ...s.agents, [agentId]: { role, tokens: had?.tokens ?? ZERO } }, runs: { ...s.runs, [role]: (s.runs[role] ?? 0) + 1 } }
}

/** A helper's request; an id not seen spawning yet is kept as other until its spawn says what it is. */
export function helperStep(s: Spend, agentId: string, u: Usage): Spend {
  const had = s.agents[agentId] ?? { role: 'other' as Role, tokens: ZERO }
  return { ...s, agents: { ...s.agents, [agentId]: { role: had.role, tokens: addUsage(had.tokens, u) } } }
}

/** The game master's request made outside any turn. */
export function looseStep(s: Spend, u: Usage): Spend {
  return { ...s, gm: addUsage(s.gm, u) }
}

/**
 * A finished main turn. `main` is the game master's requests in it, `all` every request in it but the
 * worldsmith's (it works in the background across turns). A play turn counts toward the per-turn figures;
 * a development turn only toward its own line, so building the game doesn't distort playing it.
 */
export function endTurn(s: Spend, turn: { play: boolean; ms: number; main: Tokens; all: Tokens; points?: number }): Spend {
  if (!turn.play) return { ...s, dev: { turns: s.dev.turns + 1, tokens: sum(s.dev.tokens, turn.main) } }
  const out = { ...s, gm: sum(s.gm, turn.main), play: { turns: s.play.turns + 1, ms: s.play.ms + turn.ms, tokens: sum(s.play.tokens, turn.all) } }
  if (!turn.points || turn.points <= 0) return out
  const was = s.extra ?? { turns: 0, tokens: ZERO, points: 0 }
  return { ...out, extra: { turns: was.turns + 1, tokens: sum(was.tokens, turn.all), points: was.points + turn.points } }
}

/**
 * What a meter point really cost: the turns that spent points, less what the same number of plain turns cost,
 * per point spent in them. Undefined until there are turns of both kinds.
 */
export function perPoint(s: Spend): number | undefined {
  const x = s.extra
  const plain = s.play.turns - (x?.turns ?? 0)
  if (!x || x.points <= 0 || plain <= 0) return undefined
  const plainAvg = (weighted(s.play.tokens) - weighted(x.tokens)) / plain
  return Math.max(0, Math.round((weighted(x.tokens) - x.turns * plainAvg) / x.points))
}

/**
 * A rate-limit reading. Each window's use this session grows by how far it moved; when it reset in between
 * (a new `resetsAt`, or a lower reading), what it reads now was all used since the reset.
 */
export function measured(s: Spend, limits: readonly { kind: string; percentUsed: number; resetsAt?: string }[]): Spend {
  const windows = { ...s.windows }
  for (const l of limits) {
    const w = windows[l.kind]
    if (!w) {
      // the first reading of a window is where this session starts on it
      windows[l.kind] = { used: 0, last: l.percentUsed, resetsAt: l.resetsAt }
      continue
    }
    const reset = (l.resetsAt !== undefined && w.resetsAt !== undefined && l.resetsAt !== w.resetsAt) || l.percentUsed < w.last
    const used = w.used + (reset ? l.percentUsed : l.percentUsed - w.last)
    windows[l.kind] = { used: Math.round(used * 10) / 10, last: l.percentUsed, resetsAt: l.resetsAt }
  }
  return { ...s, windows }
}

/** Weighted tokens by role. */
export function byRole(s: Spend): Record<Role, number> {
  const out = { gm: weighted(s.gm), npc: 0, world: 0, worldsmith: 0, other: 0 }
  for (const a of Object.values(s.agents)) out[a.role] += weighted(a.tokens)
  return out
}

/** All the raw counts of a session, every request included. */
export function allTokens(s: Spend): Tokens {
  return Object.values(s.agents).reduce((t, a) => sum(t, a.tokens), sum(s.gm, s.dev.tokens))
}

/** The session as the history keeps it. */
export function rowOf(s: Spend): SpendRow {
  const n = s.play.turns
  const per = (x: number) => (n ? Math.round((x / n) * 10) / 10 : 0)
  return {
    startedAt: s.startedAt, turns: n, secondsPerTurn: per(s.play.ms / 1000), requestsPerTurn: per(s.play.tokens.requests),
    weightedPerTurn: n ? Math.round(weighted(s.play.tokens) / n) : 0, points: s.points, perPoint: perPoint(s), roles: byRole(s),
    windows: Object.fromEntries(Object.entries(s.windows).map(([k, w]) => [k, w.used])),
  }
}

/** Whether a stored value is a session's figures (the store outlives versions of this file). */
export function isSpend(v: unknown): v is Spend {
  const s = v as Spend | null | undefined
  return !!s && typeof s.startedAt === 'number' && !!s.play && !!s.dev && !!s.gm && typeof s.agents === 'object' && !!s.agents
}

/** The history with a finished session added: newest last, at most HISTORY_SIZE, sessions with no turns left out. */
export function withRow(history: readonly SpendRow[], s: Spend | null | undefined): SpendRow[] {
  if (!isSpend(s) || s.play.turns + s.dev.turns === 0) return history.slice(-HISTORY_SIZE)
  return [...history, rowOf(s)].slice(-HISTORY_SIZE)
}

/** 812, 12.3k, 4.1M. */
export function count(n: number): string {
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e4 ? `${Math.round(n / 1e3)}k` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : `${Math.round(n)}`
}

const WINDOW_NAMES: Record<string, string> = { five_hour: '5-hour window', seven_day: 'weekly window', spend_limit: 'spend limit' }
const ROLE_NAMES: Record<Role, string> = { gm: 'storyteller', npc: 'characters', world: 'world agent', worldsmith: 'worldsmith', other: 'other agents' }

function day(ms: number): string {
  const d = new Date(ms)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** The owner's part of /budget: what this session really used, and the sessions before it. */
export function spendText(s: Spend, history: readonly SpendRow[]): string {
  const row = rowOf(s)
  const roles = byRole(s)
  const raw = allTokens(s)
  const world = s.agents ? Object.values(s.agents).filter(a => a.role === 'world') : []
  const worldW = world.reduce((n, a) => n + weighted(a.tokens), 0)
  const lines = [`**Real use this session** *(tokens; for checking the prices above)*`]
  lines.push(row.turns
    ? `- **Per play turn:** ${row.secondsPerTurn} s, ${row.requestsPerTurn} requests, ${count(row.weightedPerTurn)} weighted tokens (${row.turns} turns).`
    : '- **Per play turn:** no play turns yet.')
  lines.push(`- **By who** (weighted): ${ROLES.map(r => `${ROLE_NAMES[r]} ${count(roles[r])}`).join(' · ')}.`)
  lines.push(`- **Raw:** ${count(raw.input)} input · ${count(raw.output)} output · ${count(raw.cacheRead)} cache read · ${count(raw.cacheWrite)} cache write · ${raw.requests} requests.`)
  const runs = s.runs.world ?? 0
  lines.push(`- **Extras:** ${s.points} points spent; the world agent ran ${runs} time${runs === 1 ? '' : 's'}, ${count(worldW)} weighted tokens.`)
  const real = perPoint(s), x = s.extra
  lines.push(real !== undefined && x
    ? `- **A point really cost** about ${count(real)} weighted tokens (priced as ${POINT_TARGET}): ${x.turns} turn${x.turns === 1 ? '' : 's'} with extras against ${row.turns - x.turns} without.`
    : `- **A point really cost:** not known yet; it needs play turns both with and without extras (a point is priced as ${POINT_TARGET}).`)
  const w = Object.entries(s.windows)
  if (w.length) lines.push(`- **Plan usage this session:** ${w.map(([k, x]) => `${WINDOW_NAMES[k] ?? k} +${x.used}%`).join(' · ')}.`)
  if (s.dev.turns) lines.push(`- **Development turns:** ${s.dev.turns}, ${count(weighted(s.dev.tokens))} weighted tokens (not in the play figures).`)
  if (history.length) {
    lines.push('', '*Earlier sessions, per play turn:*', '', '| Started | Turns | s | Req. | Tokens | Points | Per point | 5-h % |', '|---|---|---|---|---|---|---|---|')
    for (const h of [...history].reverse()) {
      lines.push(`| ${day(h.startedAt)} | ${h.turns} | ${h.secondsPerTurn} | ${h.requestsPerTurn} | ${count(h.weightedPerTurn)} | ${h.points} | ${h.perPoint !== undefined ? count(h.perPoint) : '–'} | ${h.windows.five_hour ?? '–'} |`)
    }
  }
  lines.push('', '*Weighted = input + 1.25 × cache writes + 0.1 × cache reads + 5 × output, the API\'s price ratios.*')
  return lines.join('\n')
}
