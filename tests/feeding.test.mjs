import test from 'node:test';
import assert from 'node:assert/strict';
import { feedingBlockReason, dispenseFeedBatch } from '../game/domain/feeding.mjs';
import { AquariumSimulation } from '../game/aquarium/simulation.mjs';

test('오늘 한도가 한 알 남으면 세 알을 요청해도 한 알만 차감하고 배불러요를 표시한다', async () => {
  const state = { foodCount: 10, fedToday: 4, dailyFeedLimit: 5 };
  const notices = []; let requests = 0;
  const options = { count: 3, getState: () => state,
    feed: async () => { requests++; return { food: state.foodCount - 1, fedToday: state.fedToday + 1 }; },
    onResult: value => { state.foodCount = value.food; state.fedToday = value.fedToday; }, onBlocked: text => notices.push(text) };
  assert.deepEqual(await dispenseFeedBatch(options), { dispensed: 1, foodCount: 9 });
  assert.equal(requests, 1); assert.equal(state.fedToday, 5);
  assert.deepEqual(notices, ['배불러요']);
  assert.deepEqual(await dispenseFeedBatch(options), { dispensed: 0, foodCount: 9 });
  assert.equal(requests, 1);
});

test('재고가 한 알 남으면 그 알만 소비하고 부족 안내를 하며 다음 시도는 차감하지 않는다', async () => {
  const state = { foodCount: 1, fedToday: 0, dailyFeedLimit: 5 };
  const notices = []; let requests = 0;
  const options = { count: 3, getState: () => state,
    feed: async () => { requests++; return {}; },
    onResult: () => { state.foodCount--; state.fedToday++; }, onBlocked: text => notices.push(text) };
  assert.deepEqual(await dispenseFeedBatch(options), { dispensed: 1, foodCount: 0 });
  assert.deepEqual(notices, ['먹이가 부족해요']);
  await dispenseFeedBatch(options);
  assert.equal(requests, 1); assert.equal(state.foodCount, 0); assert.equal(state.fedToday, 1);
});

test('먹이통을 기울여도 배부름·재고 0일 때 알갱이 생성과 급식 API 요청이 없다', async () => {
  for (const state of [{ foodCount: 8, fedToday: 5 }, { foodCount: 0, fedToday: 0 }, { foodCount: 0, fedToday: 5 }]) {
    let requests = 0; const notices = [];
    const model = new AquariumSimulation({ viewerId: 'me', canDispense: () => feedingBlockReason(state),
      onFeedBlocked: text => notices.push(text), onDispense: () => { requests++; return { dispensed: 3, foodCount: 0 }; } });
    model.setFoodCount(state.foodCount); model.setFish(['me']);
    await model.sprinkle(); await model.sprinkle();
    assert.equal(requests, 0); assert.equal(model.pellets.length, 0);
    assert.equal(model.foodCount, state.foodCount);
    assert.equal(notices[0], state.fedToday === 5 ? '배불러요' : '먹이가 부족해요');
  }
});

test('서버가 급식을 거절하면 먹이 알갱이나 재고 변경을 성공으로 처리하지 않는다', async () => {
  const state = { foodCount: 7, fedToday: 2 }; let applied = 0; const notices = [];
  const result = await dispenseFeedBatch({ count: 3, getState: () => state,
    feed: async () => { throw new Error('배불러요'); }, onResult: () => applied++, onBlocked: text => notices.push(text) });
  assert.deepEqual(result, { dispensed: 0, foodCount: 7 });
  assert.equal(applied, 0); assert.deepEqual(notices, ['배불러요']);
});
