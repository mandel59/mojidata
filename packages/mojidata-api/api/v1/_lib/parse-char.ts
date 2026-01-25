export function parseSingleChar(input: string): string | null {
  let s = input
  if (s.length > 1) {
    const m = /U\+?([0-9A-F]+)/i.exec(s)
    if (m) {
      s = String.fromCodePoint(parseInt(m[1], 16))
    }
  }
  if ([...s].length !== 1) {
    return null
  }
  return s
}

