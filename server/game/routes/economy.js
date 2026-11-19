// 내 지갑, 진주 내역, 출석, 상점
const express = require('express');
const { pool, tx } = require('../db');
const { wrap, bad } = require('../lib/http');
const { requireAuth } = require('../lib/auth');
const { changePearls, getInventory, addItem } = require('../lib/pearls');
const {
  ACCESSORIES, FOOD_PRICE, ATTENDANCE_REWARD, STREAK_BONUS, STREAK_DAYS, kstDate,
} = require('../lib/game');
const realtime = require('../lib/realtime');

const router = express.Router();
router.use(requireAuth);

const ITEM_LABEL = { food: '먹이', ribbon: '리본', hat: '모자', crown: '왕관' };
const ITEM_TOPIC = { ribbon: '리본은', hat: '모자는', crown: '왕관은' }; // 받침에 맞춘 조사

function prevDate(ymd) {
  const d = new Date(ymd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function attendanceInfo(conn, userId) {
  const today = kstDate();
  const [[last]] = await conn.query(
    'SELECT att_date, streak FROM attendance WHERE user_id = ? ORDER BY att_date DESC LIMIT 1', [userId]
  );
  const checkedToday = !!last && last.att_date === today;
  // 어제까지 이어진 연속 출석이면 유지, 끊겼으면 0
  const streak = !last ? 0 : (last.att_date === today || last.att_date === prevDate(today)) ? last.streak : 0;
  return { today, checkedToday, streak };
}

// 지갑: 진주, 먹이, 장신구, 출석 정보
router.get('/me/wallet', wrap(async (req, res) => {
  const uid = req.session.userId;
  const [[u]] = await pool.query('SELECT pearls FROM users WHERE id = ?', [uid]);
  res.json({
    pearls: u.pearls,
    inventory: await getInventory(pool, uid),
    attendance: await attendanceInfo(pool, uid),
  });
}));

// 진주 내역
router.get('/me/transactions', wrap(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const [rows] = await pool.query(
    `SELECT t.*, k.name AS tank_name FROM transactions t LEFT JOIN tanks k ON k.id = t.tank_id
      WHERE t.user_id = ? ORDER BY t.id DESC LIMIT ?`,
    [req.session.userId, limit]
  );
  res.json({
    transactions: rows.map((r) => ({
      id: Number(r.id), amount: r.amount, balanceAfter: r.balance_after, type: r.type,
      description: r.description, tankName: r.tank_name, createdAt: r.created_at,
    })),
  });
}));

// 출석: 하루 첫 접속에 10진주, 연속 7일마다 보너스 30진주
router.post('/me/attendance', wrap(async (req, res) => {
  const uid = req.session.userId;
  const result = await tx(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [uid]); // 동시 요청 직렬화
    const info = await attendanceInfo(conn, uid);
    if (info.checkedToday) return { awarded: false, streak: info.streak };
    const streak = info.streak + 1;
    await conn.query(
      'INSERT INTO attendance (user_id, att_date, streak, created_at) VALUES (?, ?, ?, ?)',
      [uid, info.today, streak, new Date()]
    );
    let pearls = await changePearls(conn, {
      userId: uid, amount: ATTENDANCE_REWARD, type: 'attendance', description: `출석 보상 (${streak}일 연속)`,
    });
    let bonus = 0;
    if (streak % STREAK_DAYS === 0) {
      bonus = STREAK_BONUS;
      pearls = await changePearls(conn, {
        userId: uid, amount: STREAK_BONUS, type: 'streak_bonus', description: `${streak}일 연속 출석 보너스`,
      });
    }
    return { awarded: true, reward: ATTENDANCE_REWARD, bonus, streak, pearls };
  });
  if (result.awarded) {
    const [[u]] = await pool.query('SELECT nickname FROM users WHERE id = ?', [uid]);
    realtime.attendance(uid, { nickname: u.nickname, reward: result.reward, bonus: result.bonus, streak: result.streak });
  }
  res.json(result);
}));

// 상점 목록
router.get('/shop', (req, res) => {
  res.json({
    items: [
      { item: 'food', label: '먹이', price: FOOD_PRICE, stackable: true },
      ...Object.entries(ACCESSORIES).map(([item, price]) => ({ item, label: ITEM_LABEL[item], price, stackable: false })),
    ],
  });
});

// 구매: 먹이는 여러 개, 장신구는 한 번만
router.post('/shop/buy', wrap(async (req, res) => {
  const uid = req.session.userId;
  const item = String(req.body.item || '');
  const isFood = item === 'food';
  if (!isFood && !(item in ACCESSORIES)) throw bad('없는 상품이에요.');
  const qty = isFood ? (req.body.quantity === undefined ? 1 : Number(req.body.quantity)) : 1;
  if (!Number.isInteger(qty) || qty < 1 || qty > 20) throw bad('먹이는 한 번에 1~20개까지 살 수 있어요.');
  const price = (isFood ? FOOD_PRICE : ACCESSORIES[item]) * qty;

  const result = await tx(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [uid]);
    if (!isFood) {
      const inv = await getInventory(conn, uid);
      if (inv[item] > 0) throw bad(`${ITEM_TOPIC[item]} 이미 가지고 있어요.`, 'ALREADY_OWNED');
    }
    const pearls = await changePearls(conn, {
      userId: uid, amount: -price,
      type: isFood ? 'buy_food' : 'buy_accessory',
      description: isFood ? `먹이 ${qty}개 구매` : `${ITEM_LABEL[item]} 구매`,
    });
    await addItem(conn, uid, item, qty);
    return { pearls, inventory: await getInventory(conn, uid) };
  });
  res.json(result);
}));

module.exports = router;
