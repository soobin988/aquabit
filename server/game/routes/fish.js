const express = require('express');
const { pool, tx } = require('../db');
const { wrap, bad, notFound } = require('../lib/http');
const { requireAuth, requireMember } = require('../lib/auth');
const { getInventory } = require('../lib/pearls');
const {
  SPECIES, COLORS, ACCESSORIES, DAILY_FEED_LIMIT, STAGES, stageFor, statusFor, kstDate, fishView,
} = require('../lib/game');
const realtime = require('../lib/realtime');

const router = express.Router({ mergeParams: true });
router.use(requireAuth, requireMember);

/** 물고기 한 마리 (오늘 받은 먹이 수 포함) */
async function loadFish(conn, where, params) {
  const [[row]] = await conn.query(
    `SELECT f.*, u.nickname,
            (SELECT COUNT(*) FROM feedings fd WHERE fd.fish_id = f.id AND fd.feed_date = ?) AS fed_today
       FROM fish f JOIN users u ON u.id = f.user_id
      WHERE ${where}`,
    [kstDate(), ...params]
  );
  return row;
}

// 내 물고기 꾸미기: 이름, 종류, 색, 장신구(구매한 것만, null이면 벗기)
router.patch('/me', wrap(async (req, res) => {
  const fish = await loadFish(pool, 'f.tank_id = ? AND f.user_id = ?', [req.tank.id, req.session.userId]);
  if (!fish) throw notFound('이 어항에 내 물고기가 없어요.');

  const name = req.body.name !== undefined ? String(req.body.name).trim() : fish.name;
  const species = req.body.species ?? fish.species;
  const color = req.body.color ?? fish.color;
  const hue = req.body.hue === undefined ? fish.hue ?? null : req.body.hue;
  if (hue !== null && (!Number.isInteger(hue) || hue < 0 || hue > 359)) throw bad('색상 슬라이더 값을 확인해 주세요.');
  const accessory = req.body.accessory !== undefined ? req.body.accessory : fish.accessory;
  if (name.length < 1 || name.length > 12) throw bad('물고기 이름은 1~12자로 정해 주세요.');
  if (!SPECIES.includes(species)) throw bad('없는 물고기 종류예요.');
  if (!COLORS.includes(color)) throw bad('없는 색이에요.');
  if (accessory !== null) {
    const requiredLevel = { ribbon: 2, hat: 3, crown: 4 }[accessory] || 1;
    if (fish.stage < requiredLevel) throw bad(`Lv.${requiredLevel}에 해금되는 장식이에요.`);
    if (!(accessory in ACCESSORIES)) throw bad('없는 장신구예요.');
    const inv = await getInventory(pool, req.session.userId);
    if (!inv[accessory]) throw bad('상점에서 먼저 사야 착용할 수 있어요.', 'NOT_OWNED');
  }

  await pool.query('UPDATE fish SET name = ?, species = ?, color = ?, accessory = ?, hue = ? WHERE id = ?',
    [name, species, color, accessory, hue, fish.id]);
  const view = fishView(await loadFish(pool, 'f.id = ?', [fish.id]));
  realtime.toTank(req.tank.id, 'fish:updated', { fish: view });
  res.json({ fish: view });
}));

// 내 물고기에게 하루 5번까지. 한도·재고 검사에 실패하면 차감하지 않습니다.
router.post('/:fishId/feed', wrap(async (req, res) => {
  const fishId = Number(req.params.fishId);
  const uid = req.session.userId;
  const today = kstDate();

  const result = await tx(async (conn) => {
    const [[target]] = await conn.query('SELECT * FROM fish WHERE id = ? AND tank_id = ? FOR UPDATE', [fishId, req.tank.id]);
    if (!target) throw notFound('이 어항에 없는 물고기예요.');
    if (target.user_id !== uid) throw bad('내 물고기에게만 먹이를 줄 수 있어요.');

    const [[{ n }]] = await conn.query(
      'SELECT COUNT(*) AS n FROM feedings WHERE fish_id = ? AND feed_date = ?', [fishId, today]
    );
    if (n >= DAILY_FEED_LIMIT) throw bad('배불러요', 'FEED_LIMIT');

    const [r] = await conn.query(
      "UPDATE inventory SET quantity = quantity - 1 WHERE user_id = ? AND item = 'food' AND quantity > 0", [uid]
    );
    if (!r.affectedRows) throw bad('먹이가 부족해요', 'NO_FOOD');

    const wasStatus = statusFor(target.last_fed_at);
    const prevStage = Math.max(target.stage, stageFor(target.food_total));
    const foodTotal = target.food_total + 1;
    const stage = Math.max(prevStage, stageFor(foodTotal)); // 단계는 내려가지 않음
    const now = new Date();
    await conn.query('UPDATE fish SET food_total = ?, stage = ?, last_fed_at = ? WHERE id = ?', [foodTotal, stage, now, fishId]);
    await conn.query('INSERT INTO feedings (fish_id, feeder_id, feed_date, created_at) VALUES (?, ?, ?, ?)', [fishId, uid, today, now]);

    const fish = fishView(await loadFish(conn, 'f.id = ?', [fishId]));
    const inv = await getInventory(conn, uid);
    return { fish, food: inv.food, leveledUp: stage > prevStage, prevStage, wasStatus };
  });

  const [[me]] = await pool.query('SELECT nickname FROM users WHERE id = ?', [uid]);
  realtime.toTank(req.tank.id, 'fish:fed', {
    feederId: uid, feederNickname: me.nickname, fish: result.fish, wasStatus: result.wasStatus,
  });
  if (result.leveledUp) {
    realtime.toTank(req.tank.id, 'fish:grew', {
      feederId: uid, fish: result.fish, stage: result.fish.stage, stageName: STAGES[result.fish.stage - 1].name,
    });
  }
  res.json(result);
}));

module.exports = router;
