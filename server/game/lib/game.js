const { timeScale } = require('../config');

const SPECIES = [...new Set([...Object.keys(require('../../../game/domain/creature-aliases.json')), ...Object.keys(require('../../../game/domain/creatures.json'))])];
const COLORS = ['original', 'orange', 'coral', 'lemon', 'mint', 'sky', 'grape'];
const ACCESSORIES = { ribbon: 30, hat: 60, crown: 120 };
const FOOD_PRICE = 5;
const MAX_MEMBERS = 10;
const DAILY_FEED_LIMIT = 5;
const ATTENDANCE_REWARD = 10;
const STREAK_BONUS = 30;
const STREAK_DAYS = 7;

/** 단계별 필요 누적 먹이: 1 아기(0) → 2 꼬마(5) → 3 어른(15) → 4 반짝(40) */
const STAGES = [
  { stage: 1, name: 'Lv.1', need: 0 },
  { stage: 2, name: 'Lv.2', need: 5 },
  { stage: 3, name: 'Lv.3', need: 15 },
  { stage: 4, name: 'Lv.4', need: 40 },
];

const HOUR = 3600 * 1000;

function stageFor(foodTotal) {
  let s = 1;
  for (const st of STAGES) if (foodTotal >= st.need) s = st.stage;
  return s;
}

/** 경과 시간(TIME_SCALE 반영)으로 상태 판정. 죽지 않는다. */
function statusFor(lastFedAt, now = Date.now()) {
  const elapsed = (now - new Date(lastFedAt).getTime()) * timeScale;
  if (elapsed >= 72 * HOUR) return 'sad';
  if (elapsed >= 24 * HOUR) return 'hungry';
  return 'healthy';
}

/** 한국 시간 기준 'YYYY-MM-DD' */
function kstDate(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
}

/** DB 행 → API 응답용 물고기 객체 */
function fishView(row) {
  const stage = Math.max(row.stage, stageFor(row.food_total)); // 단계는 내려가지 않음
  const next = STAGES.find((s) => s.stage === stage + 1);
  return {
    id: row.id,
    tankId: row.tank_id,
    userId: row.user_id,
    ownerNickname: row.nickname,
    name: row.name,
    species: row.species,
    color: row.color,
    hue: row.hue ?? null,
    accessory: row.accessory,
    foodTotal: row.food_total,
    stage,
    stageName: STAGES[stage - 1].name,
    nextStageAt: next ? next.need : null,
    foodToNext: next ? Math.max(0, next.need - row.food_total) : 0,
    status: statusFor(row.last_fed_at),
    lastFedAt: row.last_fed_at,
    fedToday: row.fed_today !== undefined ? Number(row.fed_today) : undefined,
    dailyFeedLimit: DAILY_FEED_LIMIT,
  };
}

module.exports = {
  SPECIES, COLORS, ACCESSORIES, FOOD_PRICE, MAX_MEMBERS, DAILY_FEED_LIMIT,
  ATTENDANCE_REWARD, STREAK_BONUS, STREAK_DAYS, STAGES,
  stageFor, statusFor, kstDate, fishView,
};
