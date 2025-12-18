export interface MojidataApiDb {
  getMojidataJson(char: string, select: string[]): Promise<string | null>
  idsfind(idslist: string[]): Promise<string[]>
  search(ps: string[], qs: string[]): Promise<string[]>
  filterChars(chars: string[], ps: string[], qs: string[]): Promise<string[]>
}

