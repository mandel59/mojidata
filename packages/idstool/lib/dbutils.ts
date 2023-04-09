import type Database from "better-sqlite3"

export async function transaction(db: Database, callback: () => Promise<void>) {
    db.exec("begin")
    try {
        await callback()
        db.exec("commit")
    } catch (err) {
        db.exec("rollback")
        throw err
    }
}

export function transactionSync(db: Database, callback: () => void) {
    db.exec("begin")
    try {
        callback()
        db.exec("commit")
    } catch (err) {
        db.exec("rollback")
        throw err
    }
}
