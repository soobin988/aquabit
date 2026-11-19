// 수업 외 내용: 레벨별 꾸미기 보상. 물고기 크기와 종류 그림은 바꾸지 않습니다.
const stages = [
  { min: 0, name: 'Lv.1', reward: '기본 모습', slot: null, item: 'none' },
  { min: 20, name: 'Lv.2', reward: '리본', slot: 'accessory', item: 'bow' },
  { min: 60, name: 'Lv.3', reward: '꽃', slot: 'accessory', item: 'flower' },
  { min: 120, name: 'Lv.4', reward: '별빛 반짝이', slot: 'effect', item: 'sparkle' },
  { min: 200, name: 'Lv.5', reward: '작은 왕관', slot: 'accessory', item: 'crown' },
  { min: 300, name: 'Lv.6', reward: '오로라 반짝이', slot: 'effect', item: 'aurora' },
];
const maxXp = 300;
const xpPerPellet = 5;

function xp(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(maxXp, Math.floor(number))) : 0;
}

function describe(value) {
  const amount = xp(value);
  let index = 0;
  for (let i = 1; i < stages.length; i++) if (amount >= stages[i].min) index = i;
  const stage = stages[index], next = stages[index + 1];
  return { ...stage, level: index + 1, xp: amount, next: next?.min ?? null,
    nextReward: next?.reward ?? null, remaining: next ? next.min - amount : 0 };
}

function unlocked(value, slot, item) {
  return item === 'none' || stages.some(s => s.slot === slot && s.item === item && xp(value) >= s.min);
}

function normalize(fish) {
  fish.xp = xp(fish.xp);
  for (const slot of ['accessory', 'effect']) if (!unlocked(fish.xp, slot, fish[slot])) fish[slot] = 'none';
  return fish;
}

function award(fish) {
  const before = describe(fish.xp);
  fish.xp = xp(before.xp + xpPerPellet);
  const after = describe(fish.xp);
  return { before, after, gained: after.xp - before.xp, leveledUp: after.level > before.level };
}

export default { stages, maxXp, xpPerPellet, xp, describe, award, unlocked, normalize };
