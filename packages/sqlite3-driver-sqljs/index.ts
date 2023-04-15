import initSqlJs, { BindParams, SqlValue } from "sql.js"
import type { Database, Statement, ParamsObject } from "sql.js"
import { SQLite3Database, SQLite3Statement } from "@mandel59/libids/lib/interface/sqlite3"

const SQLPromise = initSqlJs()

class SQLjsSQLite3Database implements SQLite3Database {
    private db: Database
    constructor(db: Database) {
        this.db = db
    }
    transaction(callback: () => void): void {
        this.db.exec("begin")
        try {
            callback()
            this.db.exec("commit")
        } catch (err) {
            this.db.exec("rollback")
            throw err
        }
    }
    serialize(): Uint8Array {
        return this.db.export()
    }
    prepare<Arg, Result>(sql: string): SQLite3Statement<Arg, Result> {
        return new SQLjsSQLite3Statement(this.db.prepare(sql))
    }
    run(sql: string, arg?: any): void {
        const statement = new SQLjsSQLite3Statement(this.db.prepare(sql))
        try {
            statement.run(arg)
        } finally {
            statement.statement.free()
        }
    }
    getAll(sql: string, arg?: any): any[] {
        const statement = new SQLjsSQLite3Statement(this.db.prepare(sql))
        try {
            return statement.getAll(arg)
        } finally {
            statement.statement.free()
        }
    }
    *iterate(sql: string, arg?: any): Iterable<any> {
        const statement = new SQLjsSQLite3Statement(this.db.prepare(sql))
        try {
            yield* statement.iterate(arg)
        } finally {
            statement.statement.free()
        }
    }
}

function convertParams(arg: any): BindParams {
    if (typeof arg === "object") {
        return (
            Object.fromEntries(
                Object.entries(arg)
                    .map(([key, value]) => [`\$${key}`, value])
            ) as ParamsObject
        )
    } else if (Array.isArray(arg)) {
        return arg as SqlValue[]
    } else {
        return [arg] as SqlValue[]
    }
}

class SQLjsSQLite3Statement<Arg, Result> implements SQLite3Statement<Arg, Result> {
    statement: Statement
    constructor(statement: Statement) {
        this.statement = statement
    }
    run(arg: Arg): void {
        this.statement.run(convertParams(arg))
    }
    getAll(arg: Arg): Result[] {
        return Array.from(this.iterate(arg))
    }
    *iterate(arg: Arg): Iterable<Result> {
        this.statement.bind(convertParams(arg))
        while (this.statement.step()) {
            yield this.statement.getAsObject() as any as Result
        }
    }
}

export async function SQLjsSQLite3Constructor(bufferOrFilePath: Uint8Array | string): Promise<SQLite3Database> {
    const SQL = await SQLPromise
    if (typeof bufferOrFilePath === "string") {
        if (bufferOrFilePath === ":memory:") {
            const db = new SQL.Database()
            return new SQLjsSQLite3Database(db)
        }
        throw new Error("SQL.js does not support file paths")
    } else {
        const db = new SQL.Database(bufferOrFilePath)
        return new SQLjsSQLite3Database(db)
    }
}
