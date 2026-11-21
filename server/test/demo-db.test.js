import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { openDb } from '../src/db.js'

test('旧数据库无损迁移：旧轮次默认正常，演示标记重启后保留', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'abc-demo-db-'))
  let db
  try {
    const legacy = new DatabaseSync(path.join(dir, 'app.db'))
    legacy.exec(`CREATE TABLE rounds (id TEXT PRIMARY KEY, started_at TEXT NOT NULL, is_active INTEGER NOT NULL, scenario_json TEXT NOT NULL);
      INSERT INTO rounds VALUES ('old', '2026-11-20', 1, '{"name":"旧快照"}');`)
    legacy.close()
    db = openDb(dir)
    assert.equal(db.activeRound().demo, false)
    assert.equal(db.activeRound().scenario.name, '旧快照')
    const round = db.startRound({ name: '演示快照' }, true)
    db.close(); db = openDb(dir)
    assert.deepEqual(db.activeRound(), round)
    db.startRound({ name: '正常快照' })
    assert.equal(db.activeRound().demo, false)
  } finally { db?.close(); fs.rmSync(dir, { recursive: true, force: true }) }
})
