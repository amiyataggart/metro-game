export function selectNewIds(
  ids: number[],
  found: number[],
): { fresh: number[]; allFound: boolean } {
  const seen = new Set(found || [])
  const fresh = ids.filter((id) => !seen.has(id))
  return { fresh, allFound: ids.length > 0 && fresh.length === 0 }
}

// Saved progress is a list of feature ids; ids that no longer exist in the
// data (a station removed by a scope or service-table change) are dropped.
export function filterKnownIds(found: number[], known: Set<number>): number[] {
  return (found || []).filter((id) => known.has(id))
}

// New finds first, then every stored find (incl. those on disabled lines),
// without duplicates — what gets written back to saved progress.
export function addFound(newIds: number[], stored: number[]): number[] {
  return Array.from(new Set([...newIds, ...(stored || [])]))
}
