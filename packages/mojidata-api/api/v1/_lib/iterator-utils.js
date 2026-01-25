"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drop = drop;
exports.take = take;
exports.filter = filter;
function* drop(n, gen) {
    for (let i = 0; i < n; i++) {
        const { done } = gen.next();
        if (done) {
            return;
        }
    }
    yield* gen;
}
function* take(n, gen, doneRef) {
    let next = gen.next();
    for (let i = 0; i < n; i++) {
        if (next.done) {
            if (doneRef)
                doneRef.current = true;
            return;
        }
        yield next.value;
        next = gen.next();
    }
    if (doneRef)
        doneRef.current = next.done ?? false;
}
function* filter(fn, gen) {
    for (const x of gen) {
        if (fn(x)) {
            yield x;
        }
    }
}
