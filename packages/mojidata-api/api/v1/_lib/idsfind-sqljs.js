"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIdsfind = createIdsfind;
const idsdb_utils_1 = require("@mandel59/idsdb-utils");
const idsfind_query_1 = require("./idsfind-query");
const idsfind_tokenize_1 = require("./idsfind-tokenize");
async function idsmatch(tokens, pattern, getIDSTokens) {
    const matchFrom = async (i) => {
        const vars = new Map();
        let k = i;
        loop: for (let j = 0; j < pattern.length; j++) {
            if (pattern[j] === "§") {
                if (k === 0 || k === tokens.length) {
                    continue loop;
                }
            }
            else if (pattern[j] === "？") {
                k += (0, idsdb_utils_1.nodeLength)(tokens, k);
                continue loop;
            }
            else if (/^[a-zａ-ｚ]$/.test(pattern[j])) {
                const varname = pattern[j];
                const l = (0, idsdb_utils_1.nodeLength)(tokens, k);
                const slice = vars.get(varname);
                if (slice) {
                    if (!slice.every((t, offset) => t === tokens[k + offset])) {
                        return false;
                    }
                }
                else {
                    vars.set(varname, tokens.slice(k, k + l));
                }
                k += l;
                continue loop;
            }
            const ts = await getIDSTokens(pattern[j]);
            if (ts.length === 0 && pattern[j] === tokens[k]) {
                k++;
                continue loop;
            }
            for (const t of ts) {
                const l = t.split(" ").length;
                if (tokens.slice(k, k + l).join(" ") === t) {
                    k += l;
                    continue loop;
                }
            }
            return false;
        }
        if (k > tokens.length) {
            return false;
        }
        return true;
    };
    let count = 0;
    for (let i = 0; i < tokens.length; i++) {
        if (await matchFrom(i)) {
            count++;
        }
    }
    return count;
}
async function postaudit(result, idslist, getIDSTokensForUcs) {
    for (const IDS_tokens of await getIDSTokensForUcs(result)) {
        const tokens = IDS_tokens.split(" ");
        if (await (async () => {
            for (const patterns of idslist) {
                let matched = false;
                for (const pattern of patterns) {
                    if ((await idsmatch(tokens, pattern, getIDSTokensForUcs)) >= pattern.multiplicity) {
                        matched = true;
                        break;
                    }
                }
                if (!matched) {
                    return false;
                }
            }
            return true;
        })()) {
            return true;
        }
    }
    return false;
}
function createIdsfind(getDb) {
    return async (idslist) => {
        const db = await getDb();
        const tokenized = (0, idsfind_tokenize_1.tokenizeIdsList)(idslist);
        const idsTokensCache = new Map();
        const getIDSTokensForUcs = async (ucs) => {
            let rowsPromise = idsTokensCache.get(ucs);
            if (!rowsPromise) {
                rowsPromise = db
                    .query(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`, { $ucs: ucs })
                    .then((rows) => rows.flatMap((row) => typeof row.IDS_tokens === "string" ? [row.IDS_tokens] : []));
                idsTokensCache.set(ucs, rowsPromise);
            }
            return await rowsPromise;
        };
        const out = [];
        const rows = await db.query(idsfind_query_1.idsfindQuery, {
            $idslist: JSON.stringify(tokenized.forQuery),
        });
        for (const row of rows) {
            const ucs = row.UCS;
            if (typeof ucs !== "string")
                continue;
            if (await postaudit(ucs, tokenized.forAudit, getIDSTokensForUcs)) {
                out.push(ucs);
            }
        }
        return out;
    };
}
