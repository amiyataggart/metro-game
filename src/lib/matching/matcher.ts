import { normalize, stripLondonPrefix } from './normalize'
import { deletions, osaWithin1 } from './osa'

export interface StationRecord { id: number; name: string; alternate_names?: string[] }
export interface AliasConfig {
  groups: string[][]
  aliases: Record<string, string>
  ambiguous: string[]
  prefixKeepers: string[]
}
export type Resolution =
  | { kind: 'match'; ids: number[]; names: string[] }
  | { kind: 'ambiguous' }
  | { kind: 'none' }

export const MIN_TYPO_LENGTH = 4
export const EMPTY_ALIASES: AliasConfig = { groups: [], aliases: {}, ambiguous: [], prefixKeepers: [] }

const NONE: Resolution = { kind: 'none' }
const AMBIGUOUS: Resolution = { kind: 'ambiguous' }
const DECOY = '\u0000decoy:'
const PSEUDO = '\u0000' // any pseudo-group (decoy, prefix, ambiguous): never a match

export function createMatcher(
  stations: StationRecord[],
  config: AliasConfig,
  decoyNames: string[] = [],
): (query: string) => Resolution {
  // Union-find over station names: one group per real-world place.
  const parent = new Map<string, string>()
  for (const s of stations) parent.set(s.name, s.name)
  const find = (n: string): string => {
    let r = n
    while (parent.get(r) !== r) r = parent.get(r)!
    parent.set(n, r)
    return r
  }
  const union = (a: string, b: string) => {
    if (!parent.has(a) || !parent.has(b)) return
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  const keepers = new Set(config.prefixKeepers.map(normalize))
  const optionalPrefix = (name: string): string | null => {
    const stripped = stripLondonPrefix(name)
    return stripped && !keepers.has(normalize(name)) ? stripped : null
  }

  const byCanon = new Map<string, string>()
  for (const name of Array.from(parent.keys())) {
    const canon = normalize(optionalPrefix(name) ?? name)
    const prev = byCanon.get(canon)
    if (prev) union(prev, name)
    else byCanon.set(canon, name)
  }
  // Curated groups: union every present member to the first present one, so a
  // missing head (e.g. a hidden tube station) doesn't split the rest.
  const presentOf = (g: string[]) => g.filter((n) => parent.has(n))
  for (const g of config.groups) {
    const present = presentOf(g)
    for (let i = 1; i < present.length; i++) union(present[0], present[i])
  }
  // An alias target that is absent still resolves via a present curated-group member.
  const resolveTarget = (target: string): string | null => {
    if (parent.has(target)) return target
    for (const g of config.groups)
      if (g.includes(target)) {
        const present = presentOf(g)
        if (present.length) return present[0]
      }
    return null
  }

  const groupIds = new Map<string, number[]>()
  const groupNames = new Map<string, Set<string>>()
  for (const s of stations) {
    const g = find(s.name)
    if (!groupIds.has(g)) { groupIds.set(g, []); groupNames.set(g, new Set()) }
    groupIds.get(g)!.push(s.id)
    groupNames.get(g)!.add(s.name)
  }

  // Normalised key -> groups it names (more than one = ambiguous).
  const keyGroups = new Map<string, Set<string>>()
  const addKey = (text: string, group: string) => {
    const k = normalize(text)
    if (!k) return
    if (!keyGroups.has(k)) keyGroups.set(k, new Set())
    keyGroups.get(k)!.add(group)
  }
  for (const s of stations) {
    const g = find(s.name)
    addKey(s.name, g)
    const stripped = optionalPrefix(s.name)
    if (stripped) addKey(stripped, g)
    for (const a of s.alternate_names ?? []) addKey(a, g)
  }
  for (const [alias, target] of Object.entries(config.aliases)) {
    const t = resolveTarget(target)
    if (t) addKey(alias, find(t))
  }
  const ambiguousKeys = new Set(config.ambiguous.map(normalize))

  // Leading-word prefixes of every game / decoy name ("Harlow" of "Harlow Town").
  const prefixKeys = (name: string): string[] => {
    const words = name.split(/\s+/).filter(Boolean)
    const out: string[] = []
    for (let k = 1; k < words.length; k++) {
      const p = normalize(words.slice(0, k).join(' '))
      if (p && p !== 'london' && !keyGroups.has(p)) out.push(p)
    }
    return out
  }
  // Both the raw name and its optional-London-stripped form ("Fenchurch" of "London Fenchurch Street").
  const prefixKeysOf = (name: string): string[] => {
    const stripped = optionalPrefix(name)
    return stripped ? [...prefixKeys(name), ...prefixKeys(stripped)] : prefixKeys(name)
  }
  const gamePrefixes = new Set<string>()
  for (const n of Array.from(new Set(stations.map((s) => s.name))))
    for (const p of prefixKeysOf(n)) gamePrefixes.add(p)
  const decoyPrefixes = new Set<string>()
  for (const d of decoyNames) for (const p of prefixKeysOf(d)) if (!gamePrefixes.has(p)) decoyPrefixes.add(p)

  // Typo candidates: game keys plus decoys (real stations not in the game),
  // each decoy its own pseudo-group so it can make a typo ambiguous.
  const typoGroups = new Map<string, Set<string>>(keyGroups)
  for (const d of decoyNames) {
    const k = normalize(d)
    if (k && !typoGroups.has(k)) typoGroups.set(k, new Set([DECOY + k]))
  }
  const addPseudo = (k: string, tag: string) => {
    if (k && !typoGroups.has(k)) typoGroups.set(k, new Set([PSEUDO + tag + k]))
  }
  Array.from(gamePrefixes).forEach((k) => addPseudo(k, 'prefix:'))
  Array.from(decoyPrefixes).forEach((k) => addPseudo(k, 'prefix:'))
  Array.from(ambiguousKeys).forEach((k) => addPseudo(k, 'amb:'))
  const delIndex = new Map<string, string[]>()
  for (const k of Array.from(typoGroups.keys()))
    for (const v of deletions(k)) {
      const list = delIndex.get(v)
      if (list) list.push(k)
      else delIndex.set(v, [k])
    }

  const matchGroup = (g: string): Resolution => ({
    kind: 'match',
    ids: groupIds.get(g)!,
    names: Array.from(groupNames.get(g)!),
  })

  const exactOf = (k: string): Resolution | null => {
    if (ambiguousKeys.has(k)) return AMBIGUOUS
    const exact = keyGroups.get(k)
    if (!exact) return null
    return exact.size === 1 ? matchGroup(Array.from(exact)[0]) : AMBIGUOUS
  }

  const resolve = (query: string): Resolution => {
    const q = normalize(query)
    if (!q) return NONE
    // Optional "London " typed on the query side (never for prefix keepers).
    const stripped = keepers.has(q) ? null : stripLondonPrefix(query.trim())
    const sq = stripped ? normalize(stripped) : ''
    const cands = sq ? [q, sq] : [q]

    for (const k of cands) {
      const r = exactOf(k)
      if (r) return r
    }
    if (cands.some((k) => gamePrefixes.has(k))) return AMBIGUOUS
    if (cands.some((k) => typoGroups.has(k))) return NONE // real station / prefix not in the game
    if (q === 'london' || q.length < MIN_TYPO_LENGTH) return NONE

    const groups = new Set<string>()
    const seen = new Set<string>()
    for (const v of deletions(q))
      for (const k of delIndex.get(v) ?? []) {
        if (seen.has(k)) continue
        seen.add(k)
        if (osaWithin1(q, k)) typoGroups.get(k)!.forEach((g) => groups.add(g))
      }
    if (groups.size !== 1) return NONE
    const g = Array.from(groups)[0]
    return g.startsWith(PSEUDO) ? NONE : matchGroup(g)
  }

  return (rawQuery: string): Resolution => {
    if (keyGroups.has(normalize(rawQuery))) return resolve(rawQuery)
    // A trailing "station"/"stn" is optional; when the trimmed query finds
    // nothing, try the untrimmed one too (a typo of "Battersea Power Station").
    const trimmed = rawQuery.replace(/\s+(station|stn)\s*$/i, '')
    if (trimmed === rawQuery || !normalize(trimmed)) return resolve(rawQuery)
    const r = resolve(trimmed)
    return r.kind === 'none' ? resolve(rawQuery) : r
  }
}

/**
 * Restrict a resolution to the enabled stations (id -> name). The matcher is
 * built over every station so curated groups and aliases work whatever the
 * line selection; a match left with no enabled station is `none` (a guess for
 * a disabled line is wrong). `ambiguous` and `none` pass through.
 */
export function restrictToEnabled(r: Resolution, enabled: Map<number, string>): Resolution {
  if (r.kind !== 'match') return r
  const ids = r.ids.filter((id) => enabled.has(id))
  if (!ids.length) return NONE
  return { kind: 'match', ids, names: Array.from(new Set(ids.map((id) => enabled.get(id)!))) }
}
