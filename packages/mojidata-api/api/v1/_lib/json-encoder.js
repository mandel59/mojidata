"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeJson = writeJson;
exports.writeValue = writeValue;
exports.writeArray = writeArray;
exports.writeObject = writeObject;
async function writeJson(write, json) {
    await write(json);
    return true;
}
async function writeValue(write, value) {
    if (value === undefined) {
        return false;
    }
    if (typeof value === 'function') {
        return await value();
    }
    else {
        await write(JSON.stringify(value));
        return true;
    }
}
async function writeArray(write, values) {
    await write('[');
    let previous = false;
    for await (const value of values) {
        if (previous) {
            await write(',');
        }
        previous = (await writeValue(write, value)) || false;
    }
    await write(']');
    return true;
}
async function writeObject(write, entries) {
    await write('{');
    let previous = false;
    for await (const entry of entries) {
        if (!entry) {
            continue;
        }
        const [key, value] = entry;
        if (previous) {
            await write(',');
        }
        await write(JSON.stringify(key));
        await write(':');
        previous = true;
        const filled = await writeValue(write, value);
        if (!filled) {
            // fallback to null
            write('null');
        }
    }
    await write('}');
    return true;
}
