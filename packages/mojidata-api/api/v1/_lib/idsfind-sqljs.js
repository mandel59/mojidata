"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIdsfind = createIdsfind;
const idsdb_utils_1 = require("@mandel59/idsdb-utils");
const idsfind_query_1 = require("./idsfind-query");
const idsfind_tokenize_1 = require("./idsfind-tokenize");
function idsmatch(tokens, pattern, getIDSTokens) {
    const matchFrom = (i) => {
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
            const ts = getIDSTokens(pattern[j]);
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
        if (matchFrom(i)) {
            count++;
        }
    }
    return count;
}
function postaudit(result, idslist, getIDSTokensForUcs) {
    for (const IDS_tokens of getIDSTokensForUcs(result)) {
        const tokens = IDS_tokens.split(" ");
        if (idslist.every((patterns) => {
            return patterns.some((pattern) => idsmatch(tokens, pattern, getIDSTokensForUcs) >= pattern.multiplicity);
        })) {
            return true;
        }
    }
    return false;
}
function createIdsfind(getDb) {
    let statementsPromise;
    async function getStatements() {
        statementsPromise ?? (statementsPromise = getDb().then((db) => {
            return {
                findStmt: db.prepare(idsfind_query_1.idsfindQuery),
                getTokensStmt: db.prepare(`SELECT IDS_tokens FROM idsfind WHERE UCS = $ucs`),
            };
        }));
        return statementsPromise;
    }
    return async (idslist) => {
        const { findStmt, getTokensStmt } = await getStatements();
        const tokenized = (0, idsfind_tokenize_1.tokenizeIdsList)(idslist);
        const getIDSTokensForUcs = (ucs) => {
            const out = [];
            getTokensStmt.bind({ $ucs: ucs });
            while (getTokensStmt.step()) {
                const row = getTokensStmt.getAsObject();
                if (typeof row.IDS_tokens === "string")
                    out.push(row.IDS_tokens);
            }
            getTokensStmt.reset();
            return out;
        };
        const out = [];
        findStmt.bind({ $idslist: JSON.stringify(tokenized.forQuery) });
        while (findStmt.step()) {
            const row = findStmt.getAsObject();
            const ucs = row.UCS;
            if (typeof ucs !== "string")
                continue;
            if (postaudit(ucs, tokenized.forAudit, getIDSTokensForUcs)) {
                out.push(ucs);
            }
        }
        findStmt.reset();
        return out;
    };
}
