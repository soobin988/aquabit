'use strict';
const express = require('express');
const crypto = require('node:crypto');
const config = require('../config');
const { createCommunicationStore } = require('../lib/communicationStore');
const { createInternalMail } = require('../lib/internalMail');

function createCommunicationsRouter({ store = createCommunicationStore(config.paths.data), mail = createInternalMail(config.webmail) } = {}) {
  const router = express.Router(), sessions = new Map(), attempts = new Map();
  const ttl = 60 * 60 * 1000;
  router.use(express.json({ limit: '64kb' }));
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      try {
        if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: '허용되지 않은 요청입니다.' });
        if (!req.is('application/json')) return res.status(415).json({ error: 'JSON 요청이 필요합니다.' });
      } catch { return res.status(403).json({ error: '허용되지 않은 요청입니다.' }); }
    }
    const now = Date.now();
    for (const [key, value] of sessions) if (value.expires < now) sessions.delete(key);
    let token = String(req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('aquabit_comms='))?.slice(14);
    if (!sessions.has(token)) {
      if (sessions.size >= 1000) return res.status(503).json({ error: '잠시 후 다시 시도해 주세요.' });
      token = crypto.randomBytes(32).toString('base64url');
      sessions.set(token, { id: crypto.randomUUID(), expires: now + ttl, mail: null, mailBusy: false });
      res.cookie('aquabit_comms', token, { httpOnly: true, sameSite: 'strict', secure: req.secure, path: '/api/communications', maxAge: ttl });
    }
    req.communication = sessions.get(token);
    req.communication.expires = now + ttl;
    next();
  });
  const safe = action => async (req, res) => {
    try { await action(req, res); }
    catch (error) {
      const status = [400, 401, 403, 409, 429, 503].includes(error.status) ? error.status : 502;
      res.status(status).json({ error: status === 502 ? '서버와 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' : error.message });
    }
  };
  function requireMail(req) {
    if (!mail.configured) throw Object.assign(new Error('메일 서버 연결 설정이 필요합니다.'), { status: 503 });
    if (!req.communication.mail) throw Object.assign(new Error('사내 메일 계정으로 로그인해 주세요.'), { status: 401 });
    return req.communication.mail;
  }
  function rate(key, max, windowMs) {
    const now = Date.now();
    for (const [item, dates] of attempts) if (dates.at(-1) < now - 60000) attempts.delete(item);
    const dates = (attempts.get(key) || []).filter(date => date > now - windowMs);
    if (dates.length >= max) throw Object.assign(new Error('요청이 많아요. 잠시 기다렸다가 다시 시도해 주세요.'), { status: 429 });
    dates.push(now); attempts.set(key, dates);
  }
  const publicMessage = (row, session) => ({ id: row.id, name: row.name, text: row.text, createdAt: row.createdAt, own: row.senderId === session.id });
  router.get('/status', (req, res) => res.json({ mail: { configured: mail.configured, domain: mail.domain, authenticated: Boolean(req.communication.mail), address: req.communication.mail?.address || '' } }));
  router.get('/chat', safe(async (req, res) => {
    const after = Math.max(0, Number(req.query.after) || 0);
    res.json({ messages: (await store.chat(after)).map(row => publicMessage(row, req.communication)) });
  }));
  router.post('/chat', safe(async (req, res) => {
    const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    const requestId = typeof req.body.requestId === 'string' ? req.body.requestId : '';
    if (!name || name.length > 12 || /[\r\n\0]/.test(name) || !text || text.length > 1000 || !/^[a-z0-9-]{8,80}$/i.test(requestId)) return res.status(400).json({ error: '닉네임과 1,000자 이내의 메시지를 입력해 주세요.' });
    rate('chat:' + req.communication.id, 5, 10000);
    rate('chat-ip:' + req.ip, 30, 10000);
    const saved = await store.addChat({ senderId: req.communication.id, name, text, requestId });
    res.status(201).json({ message: publicMessage(saved, req.communication) });
  }));
  router.post('/mail/login', safe(async (req, res) => {
    if (!mail.configured) return res.status(503).json({ error: '메일 서버 연결 설정이 필요합니다.' });
    rate('login:' + req.ip, 8, 60000);
    const address = typeof req.body.address === 'string' ? req.body.address.trim().toLowerCase() : '';
    req.communication.mail = await mail.login(address, req.body.password);
    res.json({ authenticated: true, address: req.communication.mail.address });
  }));
  router.post('/mail/logout', (req, res) => { req.communication.mail = null; res.json({ authenticated: false }); });
  router.get('/mail/inbox', safe(async (req, res) => {
    const account = requireMail(req);
    if (req.communication.mailBusy) return res.status(409).json({ error: '메일을 불러오는 중입니다.' });
    req.communication.mailBusy = true;
    try {
      const page = Math.max(1, Math.min(1000, Math.floor(Number(req.query.page) || 1)));
      res.json(await mail.inbox(account, page));
    } finally { req.communication.mailBusy = false; }
  }));
  router.get('/mail/sent', safe(async (req, res) => res.json({ messages: await store.sent(requireMail(req).address) })));
  router.post('/mail/send', safe(async (req, res) => {
    const account = requireMail(req);
    rate('send:' + req.communication.id, 10, 60000);
    const sent = await mail.send(account, req.body);
    // 실제 SMTP가 수신한 뒤에만 보낸 메일로 기록합니다.
    try { res.status(201).json({ message: await store.addSent(sent) }); }
    catch { res.status(201).json({ message: { ...sent, createdAt: new Date().toISOString() }, warning: '메일은 전송됐지만 보낸메일 목록 저장에 실패했어요.' }); }
  }));
  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({ error: '요청 내용을 확인해 주세요.' });
  });
  return router;
}
module.exports = { createCommunicationsRouter };
