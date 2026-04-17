import { type TokenList } from "@mandel59/idsdb-utils";
export declare function tokenizeIdsList(idslist: string[]): {
    forQuery: string[][][];
    forAudit: TokenList[][];
};
