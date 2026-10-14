// Which of a line's services are distinct routes. A service adds nothing when
// its stops are a contiguous run of another service's, in either direction
// (a reversal, or a short working of a longer service). A line "has branches"
// when more than one distinct route remains. Pure: used on the server (data.ts).

const dedupe = (stops: string[]) => stops.filter((s, i) => s !== stops[i - 1])

/** is `a` a contiguous run of `b` (as written or reversed)? */
function within(a: string[], b: string[]) {
  if (a.length > b.length) return false
  const runs = [a, a.slice().reverse()]
  for (const r of runs)
    for (let i = 0; i + r.length <= b.length; i++) {
      let ok = true
      for (let k = 0; k < r.length && ok; k++) ok = b[i + k] === r[k]
      if (ok) return true
    }
  return false
}

/** indices of the services that are distinct routes, in the data's order */
export function distinctRoutes(services: { stops: string[] }[]): number[] {
  const st = services.map((s) => dedupe(s.stops))
  // redundant when inside a longer service; of two equal ones (same or reversed) keep the first
  const redundant = (i: number) =>
    st.some((b, j) => j !== i && within(st[i], b) && (st[i].length < b.length || j < i))
  return st.map((_, i) => i).filter((i) => !redundant(i))
}
