// 기존 자료를 지우지 않는 테이블 생성·호환 확장. 실행은 사용자가 DB를 준비한 뒤 명시적으로 합니다.
require('../config');
const fs = require('node:fs/promises');
const path = require('node:path');
const mysql = require('mysql2/promise');
async function main() {
  if (process.env.GAME_DATABASE_ENABLED !== 'true') throw new Error('GAME_DATABASE_ENABLED=true 설정 후 실행하세요.');
  const { db } = require('../server/game/config');
  const connection = await mysql.createConnection({ ...db, multipleStatements: true });
  try {
    let sql = await fs.readFile(path.join(__dirname, '../sql/community-schema.sql'), 'utf8');
    sql = sql.replace(/CREATE DATABASE[\s\S]*?;\s*USE aquabit;/, '');
    await connection.query(sql);
    const [columns] = await connection.query("SHOW COLUMNS FROM fish LIKE 'hue'");
    if (!columns.length) await connection.query('ALTER TABLE fish ADD COLUMN hue SMALLINT UNSIGNED NULL');
    const catalog = require('../game/domain/creatures.json');
    const species = [...new Set([...Object.keys(require('../game/domain/creature-aliases.json')), ...Object.keys(catalog)])];
    await connection.query(`ALTER TABLE fish MODIFY species ENUM(${species.map(key => connection.escape(key)).join(',')}) NOT NULL DEFAULT 'gold'`);
    await connection.query("ALTER TABLE fish MODIFY color ENUM('original','orange','coral','lemon','mint','sky','grape') NOT NULL DEFAULT 'original'");
    console.log('게임 테이블과 PNG 종 호환 설정을 준비했습니다. 기존 데이터는 삭제하지 않았습니다.');
  } finally { await connection.end(); }
}
main().catch(error => { console.error('게임 DB 준비 실패:', error.code || error.message); process.exitCode = 1; });
