import { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  scenario_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rounds_active ON rounds(is_active);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL REFERENCES rounds(id),
  student_id TEXT NOT NULL,
  student_name TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  result_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  UNIQUE(round_id, student_id)
);
`

function toRound(row) {
  return row && { id: row.id, startedAt: row.started_at, scenario: JSON.parse(row.scenario_json) }
}

function toSubmission(row) {
  return (
    row && {
      id: row.id,
      roundId: row.round_id,
      studentId: row.student_id,
      studentName: row.student_name,
      answer: JSON.parse(row.answer_json),
      result: JSON.parse(row.result_json),
      submittedAt: row.submitted_at,
    }
  )
}

export function openDb(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'app.db'))
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
  db.exec(SCHEMA)

  const stmt = {
    activeRound: db.prepare('SELECT * FROM rounds WHERE is_active = 1'),
    deactivate: db.prepare('UPDATE rounds SET is_active = 0 WHERE is_active = 1'),
    insertRound: db.prepare('INSERT INTO rounds (id, started_at, is_active, scenario_json) VALUES (?, ?, 1, ?)'),
    countSubmissions: db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE round_id = ?'),
    listSubmissions: db.prepare('SELECT * FROM submissions WHERE round_id = ? ORDER BY student_id'),
    getSubmission: db.prepare('SELECT * FROM submissions WHERE id = ?'),
    findSubmission: db.prepare('SELECT * FROM submissions WHERE round_id = ? AND student_id = ?'),
    insertSubmission: db.prepare(
      `INSERT INTO submissions (id, round_id, student_id, student_name, answer_json, result_json, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    deleteSubmission: db.prepare('DELETE FROM submissions WHERE id = ? AND round_id = ?'),
  }

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      db.exec('COMMIT')
      return result
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  return {
    close: () => db.close(),
    transaction,
    activeRound: () => toRound(stmt.activeRound.get()),
    startRound(scenario) {
      return transaction(() => {
        stmt.deactivate.run()
        const id = randomUUID()
        const startedAt = new Date().toISOString()
        stmt.insertRound.run(id, startedAt, JSON.stringify(scenario))
        return { id, startedAt, scenario }
      })
    },
    countSubmissions: (roundId) => stmt.countSubmissions.get(roundId).n,
    listSubmissions: (roundId) => stmt.listSubmissions.all(roundId).map(toSubmission),
    getSubmission: (id) => toSubmission(stmt.getSubmission.get(id)),
    findSubmission: (roundId, studentId) => toSubmission(stmt.findSubmission.get(roundId, studentId)),
    insertSubmission(s) {
      stmt.insertSubmission.run(
        s.id, s.roundId, s.studentId, s.studentName,
        JSON.stringify(s.answer), JSON.stringify(s.result), s.submittedAt,
      )
    },
    deleteSubmission: (id, roundId) => stmt.deleteSubmission.run(id, roundId).changes > 0,
  }
}
