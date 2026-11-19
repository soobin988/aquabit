const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, tx } = require('../db');
const { wrap, bad, ApiError } = require('../lib/http');
const { requireAuth } = require('../lib/auth');

const router = express.Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

function publicUser(u) {
  return { id: u.id, username: u.username, nickname: u.nickname, pearls: u.pearls, isAdmin: !!u.is_admin && require('../config').admin.enabled };
}

router.post('/register', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const nickname = String(req.body.nickname || '').trim();
  if (!USERNAME_RE.test(username)) throw bad('아이디는 영문, 숫자, _ 로 4~20자여야 해요.');
  if (password.length < 6 || password.length > 72) throw bad('비밀번호는 6~72자로 정해 주세요.');
  if (nickname.length < 1 || nickname.length > 12) throw bad('닉네임은 1~12자로 정해 주세요.');

  const hash = await bcrypt.hash(password, 10);
  try {
    const r = await tx(async conn => {
      const [created] = await conn.query(
      'INSERT INTO users (username, password_hash, nickname) VALUES (?, ?, ?)',
      [username, hash, nickname]
      );
      await conn.query("INSERT INTO inventory (user_id, item, quantity) VALUES (?, 'food', 10)", [created.insertId]);
      return created;
    });
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.userId = r.insertId;
    res.status(201).json({ user: { id: r.insertId, username, nickname, pearls: 0 } });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') throw bad('이미 쓰이고 있는 아이디예요.', 'DUP_USERNAME');
    throw e;
  }
}));

router.post('/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, '아이디 또는 비밀번호가 맞지 않아요.', 'BAD_LOGIN');
  }
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.userId = user.id;
  res.json({ user: publicUser(user) });
}));

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('aquabit.game');
    res.json({ ok: true });
  });
});

router.get('/me', requireAuth, wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [req.session.userId]);
  if (!rows.length) {
    req.session.destroy(() => {});
    throw new ApiError(401, '로그인이 필요해요.', 'UNAUTHORIZED');
  }
  res.json({ user: publicUser(rows[0]) });
}));

module.exports = router;
