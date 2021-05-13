export async function transaction(db: import("better-sqlite3").Database, callback: () => Promise<void>) {
    db.exec("begin")
    try {
        await callback()
        db.exec("commit")
    } catch (err) {
        db.exec("rollback")
        throw err
    }
}

export function transactionSync(db: import("better-sqlite3").Database, callback: () => void) {
    db.exec("begin")
    try {
        callback()
        db.exec("commit")
    } catch (err) {
        db.exec("rollback")
        throw err
    }
}
