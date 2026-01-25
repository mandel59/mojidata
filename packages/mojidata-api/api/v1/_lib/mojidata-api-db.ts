export interface MojidataApiDb {
  getMojidataJson(char: string, select: string[]): Promise<string | null>
  getIvsList(char: string): Promise<
    Array<{
      IVS: string
      unicode: string
      collection: string
      code: string
    }>
  >
  getMojidataVariantRels(chars: string[]): Promise<
    Array<{
      c1: string
      c2: string
      f: number
      r: string
    }>
  >
  idsfind(idslist: string[]): Promise<string[]>
  idsfindDebugQuery(queryBody: string, idslist: string[]): Promise<Record<string, unknown>[]>
  search(ps: string[], qs: string[]): Promise<string[]>
  filterChars(chars: string[], ps: string[], qs: string[]): Promise<string[]>
}
