import type { SqlExecutor } from "./sql-executor"

type RadicalRow = {
  部首?: number
  部首漢字?: string
  radical?: string
  radical_CJKUI?: string
}

type AdobeRsMatch = {
  cid: number
  radical: number
  residualStrokeCount: number
  strokeCount: number
}

type UnicodeRsMatch = {
  radical: string
  radicalNumber: number
  strokeCount: number
}

type UnihanRsValue = {
  kRSAdobe_Japan1_6: Array<[number, number, string, number, string]> | null
  kRSUnicode: Array<[number, number, string, string]> | null
}

const kRSAdobeJapanPattern =
  /(?:^| )[CV]\+(?<cid>[0-9]{1,5})\+(?<r>[1-9][0-9]{0,2})\.(?<rs>[1-9][0-9]?)\.(?<s>[0-9]{1,2})/gu
const kRSUnicodePattern =
  /(?:^| )(?<r>[1-9][0-9]{0,2}'{0,2})\.(?<s>-?[0-9]{1,2})/gu

function unique<T>(values: Iterable<T>) {
  return [...new Set(values)]
}

function parseAdobeRs(value: string | null | undefined): AdobeRsMatch[] {
  if (!value) return []
  return [...value.matchAll(kRSAdobeJapanPattern)].flatMap((match) => {
    const groups = match.groups
    if (!groups) return []
    const cid = Number.parseInt(groups.cid, 10)
    const radical = Number.parseInt(groups.r, 10)
    const residualStrokeCount = Number.parseInt(groups.rs, 10)
    const strokeCount = Number.parseInt(groups.s, 10)
    if (
      !Number.isSafeInteger(cid) ||
      !Number.isSafeInteger(radical) ||
      !Number.isSafeInteger(residualStrokeCount) ||
      !Number.isSafeInteger(strokeCount)
    ) {
      return []
    }
    return [{ cid, radical, residualStrokeCount, strokeCount }]
  })
}

function parseUnicodeRs(value: string | null | undefined): UnicodeRsMatch[] {
  if (!value) return []
  return [...value.matchAll(kRSUnicodePattern)].flatMap((match) => {
    const groups = match.groups
    if (!groups) return []
    const radicalNumber = Number.parseInt(groups.r, 10)
    const strokeCount = Number.parseInt(groups.s, 10)
    if (!Number.isSafeInteger(radicalNumber) || !Number.isSafeInteger(strokeCount)) {
      return []
    }
    return [{ radical: groups.r, radicalNumber, strokeCount }]
  })
}

async function loadRadicals(
  db: SqlExecutor,
  adobeRadicals: number[],
  unicodeRadicals: string[],
) {
  const rows = await db.query<RadicalRow>(
    `
      SELECT 部首, 部首漢字, radical, radical_CJKUI
      FROM radicals
      WHERE 部首 IN (SELECT cast(value as integer) FROM json_each(@indices))
        OR radical IN (SELECT value FROM json_each(@radicals))
    `,
    {
      "@indices": JSON.stringify(unique(adobeRadicals)),
      "@radicals": JSON.stringify(unique(unicodeRadicals)),
    },
  )

  const adobeMap = new Map<number, string>()
  const unicodeMap = new Map<string, string>()

  for (const row of rows) {
    if (typeof row.部首 === "number" && typeof row.部首漢字 === "string") {
      adobeMap.set(row.部首, row.部首漢字)
    }
    if (typeof row.radical === "string" && typeof row.radical_CJKUI === "string") {
      unicodeMap.set(row.radical, row.radical_CJKUI)
    }
  }

  return { adobeMap, unicodeMap }
}

export async function buildUnihanRsValue(
  db: SqlExecutor,
  char: string,
): Promise<UnihanRsValue> {
  const [adobeRow, unicodeRow] = await Promise.all([
    db.queryOne<{ value?: string }>(
      `SELECT value FROM unihan_kRSAdobe_Japan1_6 WHERE UCS = @ucs`,
      { "@ucs": char },
    ),
    db.queryOne<{ value?: string }>(
      `SELECT value FROM unihan_kRSUnicode WHERE UCS = @ucs`,
      { "@ucs": char },
    ),
  ])

  const adobeMatches = parseAdobeRs(adobeRow?.value)
  const unicodeMatches = parseUnicodeRs(unicodeRow?.value)
  const { adobeMap, unicodeMap } = await loadRadicals(
    db,
    adobeMatches.map((match) => match.radical),
    unicodeMatches.map((match) => match.radical),
  )

  const adobeValue = adobeMatches
    .slice()
    .sort(
      (a, b) =>
        a.cid - b.cid ||
        a.radical - b.radical ||
        a.residualStrokeCount - b.residualStrokeCount,
    )
    .flatMap((match) => {
      const radicalChar = adobeMap.get(match.radical)
      if (!radicalChar) return []
      return [
        [
          match.radical,
          match.strokeCount,
          radicalChar,
          match.residualStrokeCount,
          `CID+${match.cid}`,
        ] as [number, number, string, number, string],
      ]
    })

  const unicodeValue = unicodeMatches.flatMap((match) => {
    const radicalChar = unicodeMap.get(match.radical)
    if (!radicalChar) return []
    return [
      [
        match.radicalNumber,
        match.strokeCount,
        radicalChar,
        match.radical,
      ] as [number, number, string, string],
    ]
  })

  return {
    kRSAdobe_Japan1_6: adobeValue.length > 0 ? adobeValue : null,
    kRSUnicode: unicodeValue.length > 0 ? unicodeValue : null,
  }
}
