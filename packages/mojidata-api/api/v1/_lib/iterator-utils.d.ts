export type Ref<T> = {
    current: T;
};
export declare function drop<T>(n: number, gen: Generator<T>): Generator<T>;
export declare function take<T>(n: number, gen: Generator<T>, doneRef?: Ref<boolean | undefined>): Generator<T>;
export declare function filter<T>(fn: (x: T) => boolean, gen: Generator<T>): Generator<T>;
