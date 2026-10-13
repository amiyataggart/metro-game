// True when a and b are within optimal-string-alignment distance 1:
// equal, or one substitution, insertion, deletion or adjacent transposition.
export function osaWithin1(a: string, b: string): boolean {
  if (a === b) return true
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > 1) return false
  if (la === lb) {
    let i = 0
    while (i < la && a[i] === b[i]) i++
    if (a.slice(i + 1) === b.slice(i + 1)) return true
    return (
      i + 1 < la &&
      a[i] === b[i + 1] &&
      a[i + 1] === b[i] &&
      a.slice(i + 2) === b.slice(i + 2)
    )
  }
  const [s, l] = la < lb ? [a, b] : [b, a]
  let i = 0
  while (i < s.length && s[i] === l[i]) i++
  return s.slice(i) === l.slice(i + 1)
}

// Deletion neighbourhood: any two strings within OSA distance 1 share at
// least one entry, so this indexes typo candidates without a full scan.
export function deletions(s: string): string[] {
  const out = [s]
  for (let i = 0; i < s.length; i++) out.push(s.slice(0, i) + s.slice(i + 1))
  return out
}
