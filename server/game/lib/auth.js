const { pool } = require('../db');
const { ApiError, wrap, notFound } = require('./http');

/** 로그인 필요 */
function requireAuth(req, res, next) {
  if (!req.session.userId) return next(new ApiError(401, '로그인이 필요해요.', 'UNAUTHORIZED'));
  next();
}

/** :tankId 어항의 참여자인지 확인하고 req.tank, req.isOwner를 채운다 */
const requireMember = wrap(async (req, res, next) => {
  const tankId = Number(req.params.tankId);
  if (!Number.isInteger(tankId)) throw notFound('어항을 찾을 수 없어요.');
  const [rows] = await pool.query(
    `SELECT t.* FROM tanks t
       JOIN tank_members m ON m.tank_id = t.id AND m.user_id = ?
      WHERE t.id = ?`,
    [req.session.userId, tankId]
  );
  if (!rows.length) throw notFound('참여하지 않았거나 없는 어항이에요.');
  req.tank = rows[0];
  req.isOwner = rows[0].owner_id === req.session.userId;
  next();
});

/** 관리자만 (users.is_admin = 1) */
const requireAdmin = wrap(async (req, res, next) => {
  const [[u]] = await pool.query('SELECT is_admin FROM users WHERE id = ?', [req.session.userId]);
  if (!u || !u.is_admin) throw new ApiError(403, '관리자만 쓸 수 있어요.', 'FORBIDDEN');
  next();
});

module.exports = { requireAuth, requireMember, requireAdmin };
