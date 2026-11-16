import { randomBytes, timingSafeEqual, createHash } from 'node:crypto'

const COOKIE = 'teacher_session'
const SESSION_MS = 8 * 60 * 60 * 1000
const LOGIN_LIMIT = 10
const LOGIN_WINDOW_MS = 60 * 1000

function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) {
      try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()) } catch { /* Ignore malformed cookies. */ }
    }
  }
  return out
}

function sameSecret(a, b) {
  // 先做哈希使长度一致，再做常量时间比较
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}

export function createAuth(password) {
  const sessions = new Map() // token -> 过期时间
  const attempts = new Map() // ip -> 最近尝试时间列表

  function cookie(req, token, maxAgeSec) {
    const secure = req.secure ? '; Secure' : ''
    return `${COOKIE}=${token}; Path=/api; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`
  }

  function isLoggedIn(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE]
    const expires = token && sessions.get(token)
    if (!expires) return false
    if (expires < Date.now()) {
      sessions.delete(token)
      return false
    }
    return true
  }

  function rateLimited(ip) {
    const now = Date.now()
    const recent = (attempts.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS)
    recent.push(now)
    attempts.set(ip, recent)
    return recent.length > LOGIN_LIMIT
  }

  return {
    login(req, res) {
      if (rateLimited(req.ip)) {
        return res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: '尝试次数过多，请稍后再试' } })
      }
      const given = typeof req.body?.password === 'string' ? req.body.password : ''
      if (!sameSecret(given, password)) {
        return res.status(401).json({ error: { code: 'WRONG_PASSWORD', message: '密码错误' } })
      }
      const token = randomBytes(32).toString('hex')
      sessions.set(token, Date.now() + SESSION_MS)
      res.setHeader('Set-Cookie', cookie(req, token, SESSION_MS / 1000))
      res.json({ ok: true })
    },

    logout(req, res) {
      const token = parseCookies(req.headers.cookie)[COOKIE]
      if (token) sessions.delete(token)
      res.setHeader('Set-Cookie', cookie(req, '', 0))
      res.json({ ok: true })
    },

    requireTeacher(req, res, next) {
      if (!isLoggedIn(req)) {
        return res.status(401).json({ error: { code: 'NOT_LOGGED_IN', message: '请先登录' } })
      }
      next()
    },
  }
}

// 公网代理会重写 Host；仅允许部署域名的精确 Origin（不接受子域名或额外端口）。
const PUBLIC_ORIGINS = new Set(['http://logistic.jaylu.tech', 'https://logistic.jaylu.tech'])

// 修改类请求要求 Origin 与本站一致（浏览器会自动带 Origin；命令行工具不带则放行）
export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.headers.origin
  if (origin) {
    let expected = null
    try {
      expected = new URL(`${req.protocol}://${req.headers.host}`).origin
    } catch {}
    if (origin !== expected && !PUBLIC_ORIGINS.has(origin)) {
      return res.status(403).json({ error: { code: 'BAD_ORIGIN', message: '请求来源不被允许' } })
    }
  }
  next()
}
