import { validatePlacement } from './warehouse.js'
import { validateReview } from './review.js'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import express from 'express'
import { createAuth, sameOrigin } from './auth.js'
import { submissionsCsv } from './csv.js'
import { classifyAbc, countChars, parseMap, REFLECTION_MAX_CHARS, scoreSubmission } from './calc.js'
import { describeScenario, normalizeScenario, placementErrors, validateScenario } from './scenario.js'

const STUDENT_ID = /^[A-Za-z0-9_-]{1,32}$/

class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function roundSummary(db, round) {
  return round ? { id: round.id, startedAt: round.startedAt, submissionCount: db.countSubmissions(round.id) } : null
}

// 把对象按键排序后序列化，用于判断两次提交内容是否相同
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function parseSubmission(body, scenario) {
  const errors = []
  const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : ''
  const studentName = typeof body.studentName === 'string' ? body.studentName.trim() : ''
  const reflection = typeof body.reflection === 'string' ? body.reflection.trim() : null
  const abcAnswers = body.abcAnswers && typeof body.abcAnswers === 'object' ? body.abcAnswers : null
  const placement = body.placement && typeof body.placement === 'object' ? body.placement : null

  if (!STUDENT_ID.test(studentId)) errors.push('学号须为 1～32 位字母、数字、- 或 _')
  const nameLength = Array.from(studentName).length
  if (nameLength < 1 || nameLength > 20) errors.push('姓名须为 1～20 个字')
  if (reflection === null) errors.push('缺少反思内容')
  else if (countChars(reflection) > REFLECTION_MAX_CHARS) errors.push(`反思不能超过 ${REFLECTION_MAX_CHARS} 字`)

  const skus = scenario.products.map((p) => p.sku)
  if (!abcAnswers) errors.push('缺少分类答案')
  else {
    const unanswered = skus.filter((sku) => !['A', 'B', 'C'].includes(abcAnswers[sku]))
    if (unanswered.length) errors.push(`有 ${unanswered.length} 个商品未分类`)
    const extra = Object.keys(abcAnswers).filter((k) => !skus.includes(k))
    if (extra.length) errors.push(`分类答案包含未知商品：${extra.join('、')}`)
  }
  if (!placement) errors.push('缺少储位摆放')
  else if (scenario.schemaVersion === 3) errors.push(...validatePlacement(placement, scenario))
  else {
    const slotIds = new Set(parseMap(scenario.map).slots.map((s) => s.slotId))
    errors.push(...placementErrors(placement, skus, slotIds))
  }

  if (scenario.schemaVersion === 3) {
    if (body.schemaVersion !== 3) errors.push('场景版本已更新，请重新开始')
    if (!errors.length) errors.push(...validateReview(body.review, placement, scenario, { sessionId: body.roundId, studentId }))
  }
  if (errors.length) throw new HttpError(422, 'INVALID_SUBMISSION', errors.join('；'))
  return {
    studentId,
    studentName,
    answer: {
      abcAnswers: Object.fromEntries(skus.map((sku) => [sku, abcAnswers[sku]])),
      placement: Object.fromEntries(skus.map((sku) => [sku, placement[sku]])),
      reflection,
      ...(scenario.schemaVersion === 3 ? { schemaVersion: 3, review: { reviewId: body.review.reviewId, reviewAttemptId: body.review.reviewAttemptId, createdAt: body.review.createdAt, placementFingerprint: body.review.placementFingerprint, placementSnapshot: { ...body.review.placementSnapshot }, completed: true, marks: body.review.marks.map(({ rowId, fieldKey }) => ({ rowId, fieldKey })).sort((a, b) => `${a.rowId}:${a.fieldKey}`.localeCompare(`${b.rowId}:${b.fieldKey}`)) } } : {}),
    },
  }
}

function publicResult(s) {
  return { submissionId: s.id, submittedAt: s.submittedAt, ...s.result }
}

export function createApp({ db, scenarios, password, publicDir, log = console }) {
  const app = express()
  const auth = createAuth(password)
  app.set('trust proxy', 'loopback')
  app.disable('x-powered-by')

  const api = express.Router()
  api.use(sameOrigin)

  api.get('/health', (req, res) => res.json({ ok: true }))

  // ---------- 学生 ----------

  api.get('/round', (req, res) => {
    const round = db.activeRound()
    if (!round) throw new HttpError(404, 'NO_ROUND', '老师还没有开始实训')
    res.json({ id: round.id, startedAt: round.startedAt, scenario: round.scenario })
  })

  api.post('/submissions', express.json({ limit: '32kb' }), (req, res) => {
    const body = req.body ?? {}
    const round = db.activeRound()
    if (!round || body.roundId !== round.id) {
      throw new HttpError(409, 'SESSION_EXPIRED', '老师已开始新一轮，本次草稿不能提交')
    }
    const { studentId, studentName, answer } = parseSubmission(body, round.scenario)

    const saved = db.transaction(() => {
      // 在事务内再次确认轮次，避免与“开始新一轮”同时发生
      if (db.activeRound()?.id !== round.id) {
        throw new HttpError(409, 'SESSION_EXPIRED', '老师已开始新一轮，本次草稿不能提交')
      }
      const existing = db.findSubmission(round.id, studentId)
      if (existing) {
        if (canonical(existing.answer) === canonical(answer)) return existing
        throw new HttpError(409, 'ALREADY_SUBMITTED', '你在本轮已经提交过')
      }
      const submission = {
        id: randomUUID(),
        roundId: round.id,
        studentId,
        studentName,
        answer,
        result: scoreSubmission(round.scenario, answer, { sessionId: round.id, studentId, studentName }),
        submittedAt: new Date().toISOString(),
      }
      db.insertSubmission(submission)
      return submission
    })
    res.json(publicResult(saved))
  })

  // ---------- 教师 ----------

  const teacher = express.Router()
  teacher.use(express.json({ limit: '256kb' }))
  teacher.post('/login', auth.login)
  teacher.use(auth.requireTeacher)
  teacher.post('/logout', auth.logout)

  const requireRound = () => {
    const round = db.activeRound()
    if (!round) throw new HttpError(404, 'NO_ROUND', '还没有开始任何一轮')
    return round
  }

  teacher.get('/me', (req, res) => {
    res.json({ loggedIn: true, round: roundSummary(db, db.activeRound()) })
  })

  teacher.post('/rounds', (req, res) => {
    const round = db.startRound(scenarios.current().scenario)
    log.info(`开始新一轮 ${round.id}`)
    res.json(roundSummary(db, round))
  })

  teacher.get('/submissions', (req, res) => {
    const round = db.activeRound()
    if (!round) return res.json([])
    res.json(
      db.listSubmissions(round.id).map((s) => ({
        id: s.id,
        studentId: s.studentId,
        studentName: s.studentName,
        submittedAt: s.submittedAt,
        scores: s.result.scores,
        improvement: s.result.metrics.improvement,
        review: s.result.review ? { correctMarks: s.result.review.correctMarks, wrongMarks: s.result.review.wrongMarks, missedMarks: s.result.review.missedMarks } : null,
      })),
    )
  })

  teacher.get('/submissions/:id', (req, res) => {
    const round = requireRound()
    const s = db.getSubmission(req.params.id)
    if (!s || s.roundId !== round.id) throw new HttpError(404, 'NOT_FOUND', '找不到该提交')
    res.json({
      ...s,
      scenario: round.scenario,
      correctClasses: classifyAbc(round.scenario.products, round.scenario.thresholds).classes,
    })
  })

  teacher.delete('/submissions/:id', (req, res) => {
    const round = requireRound()
    if (!db.deleteSubmission(req.params.id, round.id)) throw new HttpError(404, 'NOT_FOUND', '找不到该提交')
    res.json({ ok: true })
  })

  teacher.get('/export.csv', (req, res) => {
    const round = requireRound()
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="abc-results-${round.id.slice(0, 6)}.csv"`)
    res.send(submissionsCsv(round.id, db.listSubmissions(round.id)))
  })

  teacher.get('/export.json', (req, res) => {
    const round = requireRound()
    res.setHeader('Content-Disposition', `attachment; filename="abc-details-${round.id.slice(0, 6)}.json"`)
    res.json({ round, submissions: db.listSubmissions(round.id) })
  })

  const checkScenario = (body) => {
    const errors = validateScenario(body)
    if (body?.schemaVersion !== 3) errors.push('新课堂请使用schemaVersion 3场景')
    if (errors.length) throw new HttpError(422, 'INVALID_SCENARIO', errors.join('\n'))
    return normalizeScenario(body)
  }

  teacher.get('/scenario', (req, res) => {
    const { scenario, isDefault } = scenarios.current()
    res.json({ scenario, isDefault, ...describeScenario(scenario) })
  })

  teacher.post('/scenario/validate', (req, res) => {
    const scenario = checkScenario(req.body)
    res.json({ ok: true, ...describeScenario(scenario) })
  })

  teacher.put('/scenario', (req, res) => {
    const scenario = checkScenario(req.body)
    scenarios.save(scenario)
    log.info('已保存自定义实验数据')
    res.json({ scenario, isDefault: false, ...describeScenario(scenario) })
  })

  teacher.delete('/scenario', (req, res) => {
    scenarios.reset()
    const { scenario } = scenarios.current()
    res.json({ scenario, isDefault: true, ...describeScenario(scenario) })
  })

  api.use('/teacher', teacher)
  api.use((req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: '接口不存在' } }))
  app.use('/api', api)

  // ---------- 前端页面 ----------

  const indexFile = publicDir && path.join(publicDir, 'index.html')
  if (indexFile && fs.existsSync(indexFile)) {
    app.use(express.static(publicDir, { index: false, maxAge: '1h' }))
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next()
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(indexFile)
    })
  }

  app.use((err, req, res, next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message } })
    }
    if (err.type === 'entity.too.large') {
      if (req.path === '/api/submissions') return res.status(422).json({ error: { code: 'INVALID_SUBMISSION', message: '提交内容不能超过 32KB，请减少内容后重试' } })
      return res.status(413).json({ error: { code: 'TOO_LARGE', message: '提交内容过大' } })
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'BAD_JSON', message: '请求格式错误' } })
    }
    log.error(err)
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: '服务器出错，请稍后重试' } })
  })

  return app
}
