export type IterableOrAsyncIterable<T> = Iterable<T> | AsyncIterable<T>;
export type MaybePromise<T> = T | Promise<T>;
export type Falsy = false | 0 | '' | null | undefined;
export type Writer = (chunk: string) => MaybePromise<void>;
export type Serializable = string | number | boolean | null | object | undefined | (() => MaybePromise<boolean>);
export declare function writeJson(write: Writer, json: string): Promise<boolean>;
export declare function writeValue(write: Writer, value: Serializable): Promise<boolean>;
export declare function writeArray<T extends Serializable>(write: Writer, values: IterableOrAsyncIterable<T>): Promise<boolean>;
export declare function writeObject(write: Writer, entries: IterableOrAsyncIterable<[key: string, value: Serializable] | Falsy>): Promise<boolean>;
