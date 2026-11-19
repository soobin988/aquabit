'use strict';
const express = require('express');
const config = require('./config');
const router = express.Router();
let sessionMiddleware;
const authAttempts = new Map();
router.use('/auth', (req, res, next) => {
  if (req.method !== 'POST' || !['/login', '/register'].includes(req.path)) return next();
  const now = Date.now();
  for (const [key, record] of authAttempts) if (record.until < now) authAttempts.delete(key);
  const record = authAttempts.get(req.ip) || { count: 0, until: now + 60000 };
  authAttempts.set(req.ip, record);
  if (++record.count > 10) return res.status(429).json({ error: '잠시 뒤 다시 시도해 주세요.' });
  next();
});
router.use(express.json({ limit: '32kb' }));
router.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.get('Origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: '같은 사이트에서 요청해 주세요.' }); }
      catch { return res.status(403).json({ error: '올바르지 않은 요청이에요.' }); }
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON 요청이 필요해요.' });
  }
  next();
});
router.get('/health', (req, res) => res.json({ ok: true, databaseEnabled: config.enabled }));
if (config.enabled) {
  const session = require('express-session');
  const MySQLStore = require('express-mysql-session')(session);
  const { pool } = require('./db');
  sessionMiddleware = session({ name: 'aquabit.game', secret: config.sessionSecret,
    store: new MySQLStore({ createDatabaseTable: true, schema: { tableName: 'game_sessions' } }, pool),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'strict', secure: 'auto', maxAge: 1000 * 60 * 60 * 24 } });
  router.use(sessionMiddleware);
  router.use('/auth', require('./routes/auth'));
  router.use('/tanks/:tankId/fish', require('./routes/fish'));
  router.use('/tanks/:tankId/messages', require('./routes/messages'));
  router.use('/tanks/:tankId/tasks', require('./routes/tasks'));
  router.use('/tanks', require('./routes/tanks'));
  router.use('/', require('./routes/economy'));
} else router.use((req, res) => res.status(503).json({ error: '계정 저장은 MySQL 설정 후 사용할 수 있어요. 지금은 체험하기로 들어가세요.', code: 'DATABASE_NOT_CONFIGURED' }));
router.use((err, req, res, next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: '요청 형식을 확인해 주세요.' });
  console.error('[게임 API]', err.code || err.name);
  res.status(503).json({ error: '게임 저장소를 사용할 수 없어요. 서버의 DB 설정을 확인해 주세요.' });
});
module.exports = { router, attach(server) { if (config.enabled) require('./socket').attachSocket(server, sessionMiddleware); } };
