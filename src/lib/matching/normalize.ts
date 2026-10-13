// Canonical form used for every station-name comparison: case, accents,
// apostrophes, punctuation and spacing are ignored; & / and are dropped;
// saint/street -> st, road -> rd, jn/jct/junc -> junction so either
// spelling matches.
export function normalize(input: string): string {
  return (input || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['‘’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bstreet\b/g, 'st')
    .replace(/\broad\b/g, 'rd')
    .replace(/\b(jn|jct|junc)\b/g, 'junction')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, '')
}

export function stripLondonPrefix(name: string): string | null {
  const m = /^london\s+(.+)$/i.exec(name.trim())
  return m ? m[1] : null
}
