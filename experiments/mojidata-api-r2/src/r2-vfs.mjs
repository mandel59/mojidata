import { FacadeVFS } from 'wa-sqlite/src/FacadeVFS.js'
import * as SQLite from 'wa-sqlite'

export class R2VFS extends FacadeVFS {
  constructor(module, store, files) {
    super('r2-readonly', module)
    this.store = store
    this.files = files
    this.openFiles = new Map()
    this.lastError = null
  }
  async jOpen(name, id, flags, outFlags) {
    try {
      const spec = this.files[new URL(name, 'file:///').pathname]
      if (!spec || !(flags & SQLite.SQLITE_OPEN_READONLY)) return SQLite.SQLITE_CANTOPEN
      this.openFiles.set(id, await this.store.open(spec.key, spec.size))
      outFlags.setInt32(0, SQLite.SQLITE_OPEN_READONLY, true)
      return SQLite.SQLITE_OK
    } catch (error) { this.lastError = error; return SQLite.SQLITE_CANTOPEN }
  }
  jClose(id) { this.openFiles.delete(id); return SQLite.SQLITE_OK }
  async jRead(id, data, offset) {
    try {
      const full = await this.store.read(this.openFiles.get(id), data, offset)
      return full ? SQLite.SQLITE_OK : SQLite.SQLITE_IOERR_SHORT_READ
    } catch (error) { this.lastError = error; return SQLite.SQLITE_IOERR }
  }
  jFileSize(id, out) {
    out.setBigInt64(0, BigInt(this.openFiles.get(id).size), true)
    return SQLite.SQLITE_OK
  }
  jAccess(name, flags, out) {
    out.setInt32(0, this.files[new URL(name, 'file:///').pathname] ? 1 : 0, true)
    return SQLite.SQLITE_OK
  }
  jWrite() { return SQLite.SQLITE_READONLY }
  jTruncate() { return SQLite.SQLITE_READONLY }
  jDelete() { return SQLite.SQLITE_READONLY }
  jDeviceCharacteristics() { return SQLite.SQLITE_IOCAP_IMMUTABLE }
}
