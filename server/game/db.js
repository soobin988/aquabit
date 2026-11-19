const mysql = require('mysql2/promise');
const { db } = require('./config');

const pool = mysql.createPool({
  ...db,
  connectionLimit: 10,
  timezone: 'Z',          // DATETIME은 UTC로 읽고 쓴다
  dateStrings: ['DATE'],  // DATE 컬럼은 'YYYY-MM-DD' 문자열 그대로
  charset: 'utf8mb4',
});

// DEFAULT CURRENT_TIMESTAMP도 UTC로 찍히도록 연결마다 세션 시간대를 UTC로 맞춘다
// (MySQL 서버가 KST로 설정돼 있어도 앱이 읽는 시각과 어긋나지 않게)
pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));

/** 트랜잭션 헬퍼: fn(conn)이 throw하면 롤백 */
async function tx(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { pool, tx };
