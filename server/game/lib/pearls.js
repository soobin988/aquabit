const { bad } = require('./http');

/**
 * 진주 지급/사용 + transactions 기록. 반드시 트랜잭션 안(conn)에서 호출한다.
 * amount > 0 지급, amount < 0 사용 (잔액이 모자라면 400)
 * @returns 변경 후 잔액
 */
async function changePearls(conn, { userId, amount, type, description, tankId = null, refId = null }) {
  if (amount < 0) {
    const [r] = await conn.query(
      'UPDATE users SET pearls = pearls - ? WHERE id = ? AND pearls >= ?', [-amount, userId, -amount]
    );
    if (!r.affectedRows) throw bad('진주가 모자라요.', 'NOT_ENOUGH_PEARLS');
  } else {
    await conn.query('UPDATE users SET pearls = pearls + ? WHERE id = ?', [amount, userId]);
  }
  const [[u]] = await conn.query('SELECT pearls FROM users WHERE id = ?', [userId]);
  await conn.query(
    `INSERT INTO transactions (user_id, tank_id, amount, balance_after, type, ref_id, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, tankId, amount, u.pearls, type, refId, description, new Date()]
  );
  return u.pearls;
}

/** 보유 아이템 { food, ribbon, hat, crown } */
async function getInventory(conn, userId) {
  const [rows] = await conn.query('SELECT item, quantity FROM inventory WHERE user_id = ?', [userId]);
  const inv = { food: 0, ribbon: 0, hat: 0, crown: 0 };
  for (const r of rows) inv[r.item] = r.quantity;
  return inv;
}

async function addItem(conn, userId, item, qty) {
  await conn.query(
    `INSERT INTO inventory (user_id, item, quantity) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [userId, item, qty]
  );
}

module.exports = { changePearls, getInventory, addItem };
