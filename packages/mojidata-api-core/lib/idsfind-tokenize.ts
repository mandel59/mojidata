import { expandOverlaid, tokenizeIDS, type TokenList } from "@mandel59/idsdb-utils"

export function tokenizeIdsList(idslist: string[]) {
  const idslistTokenized = idslist.map(tokenizeIDS).map(expandOverlaid) as TokenList[][]
  /** ids list without variable constraints. variables are replaced into placeholder token ？ */
  const idslistWithoutVC = idslistTokenized.map((x) =>
    x.map((y) => y.map((z) => (/^[a-zａ-ｚ]$/.test(z) ? "？" : z))),
  ) as string[][][]
  return {
    forQuery: idslistWithoutVC,
    forAudit: idslistTokenized,
  }
}
