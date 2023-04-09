// Type definitions for better-sqlite3 7.6
// Project: https://github.com/JoshuaWise/better-sqlite3
// Definitions by: Ben Davies <https://github.com/Morfent>
//                 Mathew Rumsey <https://github.com/matrumz>
//                 Santiago Aguilar <https://github.com/sant123>
//                 Alessandro Vergani <https://github.com/loghorn>
//                 Andrew Kaiser <https://github.com/andykais>
//                 Mark Stewart <https://github.com/mrkstwrt>
//                 Florian Stamer <https://github.com/stamerf>
//                 Ryusei Yamaguchi <https://github.com/mandel59>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 3.8

/// <reference types="node" />

// FIXME: Is this `any` really necessary?
type VariableArgFunction = (...params: any[]) => unknown;
type ArgumentTypes<F extends VariableArgFunction> = F extends (...args: infer A) => unknown ? A : never;
type ElementOf<T> = T extends Array<infer E> ? E : T;
type First<T> = T extends [infer F, ...unknown[]] ? F : never;
type Pluck<Columns extends string[], Result> = Result extends Record<First<Columns> & string, infer R> ? R : never
type Raw<Columns extends string[], Result> = { [K in ElementOf<Columns>]: Result extends Record<K, infer R> ? R : never }
type CastIntoArray<T> = T extends unknown[] ? T : T[];

declare module "better-sqlite3" {
    export interface Statement<
        BindParameters extends unknown[],
        Columns extends string[] = string[],
        RecordType extends Record<ElementOf<Columns>, unknown> = Record<ElementOf<Columns>, unknown>,
        Result = RecordType
        > {

        database: Database;
        source: string;
        reader: boolean;
        readonly: boolean;
        busy: boolean;

        run(...params: BindParameters): Database.RunResult;
        get(...params: BindParameters): Result;
        all(...params: BindParameters): Result[];
        iterate(...params: BindParameters): IterableIterator<Result>;
        pluck(toggleState?: true): Statement<BindParameters, Columns, RecordType, Pluck<Columns, RecordType>>;
        expand<R = Record<string, Partial<RecordType>>>(toggleState?: true): Statement<BindParameters, Columns, RecordType, R>;
        raw(toggleState?: true): Statement<BindParameters, Columns, RecordType, Raw<Columns, RecordType>>;
        bind(...params: BindParameters): this;
        columns(): ColumnDefinition[];
        safeIntegers(toggleState?: boolean): this;
    }

    export interface ColumnDefinition {
        name: string;
        column: string | null;
        table: string | null;
        database: string | null;
        type: string | null;
    }

    export interface Transaction<F extends VariableArgFunction> {
        (...params: ArgumentTypes<F>): ReturnType<F>;
        default(...params: ArgumentTypes<F>): ReturnType<F>;
        deferred(...params: ArgumentTypes<F>): ReturnType<F>;
        immediate(...params: ArgumentTypes<F>): ReturnType<F>;
        exclusive(...params: ArgumentTypes<F>): ReturnType<F>;
    }

    export interface VirtualTableOptions {
        rows: () => Generator;
        columns: string[];
        parameters?: string[] | undefined;
        safeIntegers?: boolean | undefined;
        directOnly?: boolean | undefined;
    }

    class Database {
        memory: boolean;
        readonly: boolean;
        name: string;
        open: boolean;
        inTransaction: boolean;

        prepare<
            BindParameters extends unknown[] | {},
            Columns extends string[],
            RecordType extends Record<ElementOf<Columns>, unknown> = Record<ElementOf<Columns>, unknown>,
            Result = RecordType
        >(
            source: string,
        ): Statement<CastIntoArray<BindParameters>, Columns, RecordType, Result>;
        transaction<F extends VariableArgFunction>(fn: F): Transaction<F>;
        exec(source: string): this;
        pragma(source: string, options?: Database.PragmaOptions): unknown;
        function(name: string, cb: (...params: unknown[]) => unknown): this;
        function(name: string, options: Database.RegistrationOptions, cb: (...params: unknown[]) => unknown): this;
        aggregate<T>(name: string, options: Database.RegistrationOptions & {
            start?: T | (() => T);
            step: (total: T, next: ElementOf<T>) => T | void;
            inverse?: ((total: T, dropped: T) => T) | undefined;
            result?: ((total: T) => unknown) | undefined;
        }): this;
        loadExtension(path: string): this;
        close(): this;
        defaultSafeIntegers(toggleState?: boolean): this;
        backup(destinationFile: string, options?: Database.BackupOptions): Promise<Database.BackupMetadata>;
        table(name: string, options: VirtualTableOptions): this;
        unsafeMode(unsafe?: boolean): this;
        serialize(options?: Database.SerializeOptions): Buffer;

        constructor(filename: string | Buffer, options?: Database.Options);
    }

    namespace Database {
        interface RunResult {
            changes: number;
            lastInsertRowid: number | bigint;
        }

        interface Options {
            readonly?: boolean | undefined;
            fileMustExist?: boolean | undefined;
            timeout?: number | undefined;
            verbose?: ((message?: unknown, ...additionalArgs: unknown[]) => void) | undefined;
            nativeBinding?: string | undefined;
        }

        interface SerializeOptions {
            attached?: string;
        }

        interface PragmaOptions {
            simple?: boolean | undefined;
        }

        interface RegistrationOptions {
            varargs?: boolean | undefined;
            deterministic?: boolean | undefined;
            safeIntegers?: boolean | undefined;
            directOnly?: boolean | undefined;
        }

        type AggregateOptions = Parameters<Database["aggregate"]>[1];

        interface BackupMetadata {
            totalPages: number;
            remainingPages: number;
        }
        interface BackupOptions {
            progress: (info: BackupMetadata) => number;
        }

        class SqliteError extends Error {
            name: string;
            message: string;
            code: string;
            constructor(message: string, code: string);
        }
    }

    export default Database;
}
