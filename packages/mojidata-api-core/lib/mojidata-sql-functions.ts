function regexpAllJson(input: unknown, pattern: unknown) {
  const string = String(input ?? "")
  const re = new RegExp(String(pattern), "gu")
  const out: Array<{ substr: string; groups: Record<string, string> | unknown[] }> =
    []
  let match: RegExpExecArray | null
  while ((match = re.exec(string))) {
    out.push({
      substr: match[0],
      groups: match.groups ?? match.slice(1),
    })
  }
  return JSON.stringify(out)
}

export function installMojidataSqlFunctions(
  registerFunction: (name: string, fn: (...args: never[]) => unknown) => void,
) {
  registerFunction("regexp_all", regexpAllJson as (...args: never[]) => unknown)

  registerFunction("parse_int", ((s: string, base: number) => {
    const i = parseInt(s, base)
    if (!Number.isSafeInteger(i)) {
      return null
    }
    return i
  }) as (...args: never[]) => unknown)

  registerFunction("regexp", ((pattern: string, s: string) => {
    return new RegExp(pattern, "u").test(s) ? 1 : 0
  }) as (...args: never[]) => unknown)
}
