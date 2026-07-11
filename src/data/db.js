// db.js -- loads the read-only seed database (public/ppms.db) into sql.js
// (WebAssembly SQLite running in the browser). No server involved.
import initSqlJs from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

let _db = null

export async function openDb() {
  if (_db) return _db
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const buf = await fetch(`${import.meta.env.BASE_URL}ppms.db`).then((r) => r.arrayBuffer())
  _db = new SQL.Database(new Uint8Array(buf))
  return _db
}

// run a query, return array of plain row objects
export function query(db, sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}
