"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createIdsfindHandler = createIdsfindHandler;
const cast_1 = require("./_lib/cast");
const getApiHeaders_1 = require("./_lib/getApiHeaders");
function createIdsfindHandler(db) {
    return async function idsfindHandler(c) {
        const headers = (0, getApiHeaders_1.getApiHeaders)();
        const ps = (0, cast_1.castToStringArray)(c.req.queries("p") ?? []);
        const qs = (0, cast_1.castToStringArray)(c.req.queries("q") ?? []);
        if (qs.length !== ps.length) {
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ error: { message: "q.length must be equal to p.length" } }, 400);
        }
        const ids = (0, cast_1.castToStringArray)(c.req.queries("ids") ?? []);
        const whole = (0, cast_1.castToStringArray)(c.req.queries("whole") ?? []);
        const limitRaw = c.req.query("limit");
        const offsetRaw = c.req.query("offset");
        const all_results = c.req.query("all_results");
        const limitNum = (limitRaw && parseInt(String(limitRaw), 10)) || undefined;
        const offsetNum = (offsetRaw && parseInt(String(offsetRaw), 10)) || undefined;
        const allResults = Boolean(all_results);
        if (ids.length === 0 && whole.length === 0) {
            if (ps.length > 0) {
                try {
                    const results0 = await db.search(ps, qs);
                    const results1 = Number.isSafeInteger(offsetNum) && offsetNum > 0
                        ? results0.slice(offsetNum)
                        : results0;
                    const usingLimit = Number.isSafeInteger(limitNum) && limitNum > 0;
                    const results = usingLimit ? results1.slice(0, limitNum) : results1;
                    const done = usingLimit ? results1.length <= limitNum : undefined;
                    headers.forEach(({ key, value }) => c.header(key, value));
                    return c.json({
                        query: {
                            p: ps,
                            q: qs,
                            limit: limitNum,
                            offset: offsetNum,
                            all_results: all_results ? true : undefined,
                        },
                        results,
                        ...(usingLimit ? { done } : {}),
                        ...(!usingLimit && !(Number.isSafeInteger(offsetNum) && offsetNum > 0)
                            ? { total: results.length }
                            : {}),
                    });
                }
                catch (error) {
                    const message = error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
                    if (message.includes('Unknown query key')) {
                        headers.forEach(({ key, value }) => c.header(key, value));
                        return c.json({ error: { message } }, 400);
                    }
                    throw error;
                }
            }
            headers.forEach(({ key, value }) => c.header(key, value));
            return c.json({ message: "No parameters", error: { message: "No parameters" } }, 400);
        }
        let results0 = await db.idsfind([...ids, ...whole.map((x) => `§${x}§`)]);
        if (!allResults) {
            results0 = results0.filter((x) => x[0] !== "&");
        }
        if (ps.length > 0) {
            try {
                results0 = await db.filterChars(results0, ps, qs);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : `Unknown error: ${String(error)}`;
                if (message.includes('Unknown query key')) {
                    headers.forEach(({ key, value }) => c.header(key, value));
                    return c.json({ error: { message } }, 400);
                }
                throw error;
            }
        }
        const results1 = Number.isSafeInteger(offsetNum) && offsetNum > 0
            ? results0.slice(offsetNum)
            : results0;
        const usingLimit = Number.isSafeInteger(limitNum) && limitNum > 0;
        const results = usingLimit ? results1.slice(0, limitNum) : results1;
        const done = usingLimit ? results1.length <= limitNum : undefined;
        headers.forEach(({ key, value }) => c.header(key, value));
        return c.json({
            query: {
                ids,
                whole,
                p: ps.length > 0 ? ps : undefined,
                q: qs.length > 0 ? qs : undefined,
                limit: limitNum,
                offset: offsetNum,
                all_results: all_results ? true : undefined,
            },
            results,
            ...(usingLimit ? { done } : {}),
            ...(!usingLimit &&
                !(Number.isSafeInteger(offsetNum) && offsetNum > 0)
                ? { total: results.length }
                : {}),
        });
    };
}
