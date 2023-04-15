export interface SQLite3Constructor {
    (bufferOrFilePath: Uint8Array | string): Promise<SQLite3Database>;
}

export interface SQLite3Database {
    transaction(callback: () => void): void;
    serialize(): Uint8Array;
    prepare<Arg, Result>(sql: string): SQLite3Statement<Arg, Result>;
    run(sql: string, arg?: any): void;
    getAll(sql: string, arg?: any): any[];
    iterate(sql: string, arg?: any): Iterable<any>;
}

export interface SQLite3Statement<Arg, Result> {
    run(arg: Arg): void;
    getAll(arg: Arg): Result[];
    iterate(arg: Arg): Iterable<Result>;
}
