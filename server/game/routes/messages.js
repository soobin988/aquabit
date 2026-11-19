const express = require('express');
const { pool } = require('../db');
const { wrap, bad } = require('../lib/http');
const { requireAuth, requireMember } = require('../lib/auth');
const realtime = require('../lib/realtime');

const router = express.Router({ mergeParams: true });
router.use(requireAuth, requireMember);

const view = (m) => ({
  id: Number(m.id), userId: m.user_id, nickname: m.nickname, body: m.body, createdAt: m.created_at, isAdmin: !!m.is_admin,
});

// 채팅 목록: ?after=<id> 이면 그 뒤 메시지만 (폴링용), 없으면 최근 50개
router.get('/', wrap(async (req, res) => {
  const after = Number(req.query.after) || 0;
  let rows;
  if (after > 0) {
    [rows] = await pool.query(
      `SELECT m.*, u.nickname, u.is_admin FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.tank_id = ? AND m.id > ? ORDER BY m.id LIMIT 100`,
      [req.tank.id, after]
    );
  } else {
    [rows] = await pool.query(
      `SELECT * FROM (SELECT m.*, u.nickname, u.is_admin FROM messages m JOIN users u ON u.id = m.user_id
        WHERE m.tank_id = ? ORDER BY m.id DESC LIMIT 50) x ORDER BY id`,
      [req.tank.id]
    );
  }
  res.json({ messages: rows.map(view) });
}));

router.post('/', wrap(async (req, res) => {
  const body = String(req.body.body || '').trim();
  if (!body) throw bad('메시지를 입력해 주세요.');
  if (body.length > 300) throw bad('메시지는 300자까지 보낼 수 있어요.');
  const [r] = await pool.query(
    'INSERT INTO messages (tank_id, user_id, body, created_at) VALUES (?, ?, ?, ?)',
    [req.tank.id, req.session.userId, body, new Date()]
  );
  const [[row]] = await pool.query(
    'SELECT m.*, u.nickname, u.is_admin FROM messages m JOIN users u ON u.id = m.user_id WHERE m.id = ?', [r.insertId]
  );
  const message = view(row);
  realtime.toTank(req.tank.id, 'chat:message', message);
  res.status(201).json({ message });
}));

module.exports = router;
