type SqlTransactionDb = {
    exec?: (sql: string) => unknown
    run?: (sql: string) => unknown
}

function execSql(db: SqlTransactionDb, sql: string) {
    if (db.exec) return db.exec(sql)
    if (db.run) return db.run(sql)
    throw new TypeError("db must have exec() or run()")
}

export async function transaction(db: SqlTransactionDb, callback: () => Promise<void>) {
    execSql(db, "begin")
    try {
        await callback()
        execSql(db, "commit")
    } catch (err) {
        execSql(db, "rollback")
        throw err
    }
}

export function transactionSync(db: SqlTransactionDb, callback: () => void) {
    execSql(db, "begin")
    try {
        callback()
        execSql(db, "commit")
    } catch (err) {
        execSql(db, "rollback")
        throw err
    }
}
