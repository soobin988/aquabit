import test from 'node:test';
import assert from 'node:assert/strict';
import { AquariumSimulation, shrimpGroundY, pelletGroundY, foodMouth } from '../game/aquarium/simulation.mjs';
import { drawLandingLight } from '../game/aquarium/landing-light.mjs';
import { SpriteAnimation } from '../game/aquarium/sprite-animation.mjs';
import { species, spriteFrames } from '../game/domain/fish.mjs';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { BubbleField, surfaceWait } from '../game/aquarium/bubbles.mjs';
import { createLocalAquariumRepository } from '../game/services/aquarium-repository.mjs';
import { originalHue, spriteLayers } from '../game/domain/fish.mjs';
import { fishGlowColor } from '../game/domain/color.mjs';

function aquarium(width = 1100, height = 650, onEat) {
  const model = new AquariumSimulation({ random: () => .5, onEat, viewerId: 'mine' });
  model.resize(width, height); model.setFish(['mine', 'friend']);
  return model;
}
function dragFish(model, destination, pointer = 1) {
  const origin = model.toScene(model.fish.get('mine'));
  assert.equal(model.pick('fish', 'mine', origin, pointer), true);
  model.move(destination, pointer);
  assert.equal(model.release(pointer), null);
  return model.toScene(model.fish.get('mine'));
}

for (const kind of ['neon', 'shrimp']) {
  test(`${kind}: 종류·컬러·경험치가 저장되고 같은 PNG와 후광 색상을 사용함`, async () => {
    const values = new Map();
    const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
    const repository = createLocalAquariumRepository(storage);
    await repository.load();
    await repository.feedFish('subin');
    await repository.updateAppearance('subin', { name: '새 친구', species: kind, hue: originalHue[kind], accessory: 'none', effect: 'none' });
    const restored = await createLocalAquariumRepository(storage).load();
    const fish = restored.fish.find(item => item.id === 'subin');
    assert.equal(fish.species, kind);
    assert.equal(fish.hue, originalHue[kind]);
    assert.equal(fish.xp, 5);
    assert.equal(spriteLayers(fish)[0].src, spriteFrames(kind)[0]);
    assert.equal(spriteLayers(fish)[0].hue, 0);
    assert.equal(fishGlowColor(fish), kind === 'neon' ? 0x45cbe9 : 0x1569bc);
  });
}

for (const [width, height] of [[1100, 650], [350, 475]]) {
  test(`물고기를 사각 어항의 네 모서리까지 이동하고 벽 밖으로 나가지 않음 (${width}×${height})`, () => {
    const model = aquarium(width, height);
    for (const x of [-1000, width + 1000]) for (const y of [-1000, height + 1000]) {
      const point = dragFish(model, { x, y });
      assert.ok(point.x >= model.view.fishWidth / 2);
      assert.ok(point.x <= width - model.view.fishWidth / 2);
      assert.ok(point.y >= model.view.fishWidth / 3);
      assert.ok(point.y <= height - model.view.fishWidth / 3 - 35);
      assert.equal(point.x, width * (x < 0 ? model.view.minX : model.view.maxX));
      assert.equal(point.y, height * (y < 0 ? model.view.minY : model.view.maxY));
    }
  });
}

test('처음부터 물고기가 수조에 분산되고 초당 수십 픽셀로 유영함', () => {
  const model = aquarium();
  assert.ok(Math.abs(model.fish.get('mine').x - model.fish.get('friend').x) > .2);
  const initial = model.toScene(model.fish.get('mine'));
  for (let i = 0; i < 100; i++) model.step(50);
  const after = model.toScene(model.fish.get('mine'));
  assert.ok(after.x - initial.x > 200);
  assert.notEqual(after.y, initial.y);
});

test('멈춤 상태에서도 드래그는 되고 놓은 위치에서 유지됨', () => {
  const model = aquarium(); model.paused = true;
  const point = dragFish(model, { x: 1000, y: 90 });
  for (let i = 0; i < 100; i++) model.step(50);
  assert.deepEqual(model.toScene(model.fish.get('mine')), point);
});

test('수면 오른쪽에서도 먹이가 떨어지고 물고기가 먹음', () => {
  let bites = 0;
  const model = aquarium(1100, 650, () => bites++);
  dragFish(model, { x: 970, y: 180 });
  assert.ok(model.pick('food', null, { x: model.can.x, y: model.can.y }, 2));
  model.move({ x: 1000, y: 70 }, 2);
  assert.equal(model.can.ready, true);
  model.step(50);
  assert.ok(model.pellets.length > 0);
  assert.ok(model.pellets.every(p => p.x > .8));
  model.release(2);
  for (let i = 0; i < 140; i++) model.step(50);
  assert.ok(bites > 0);
});

test('화면 폭이 바뀌어도 물고기 위치·클릭과 드래그가 유지됨', () => {
  const model = aquarium();
  dragFish(model, { x: 1050, y: 580 });
  model.resize(350, 475);
  const point = model.toScene(model.fish.get('mine'));
  assert.ok(point.x < 350 && point.y < 475);
  assert.ok(model.pick('fish', 'mine', point, 3));
  assert.equal(model.release(3), 'mine');
});

test('확대한 먹이통이 화면 안에서 회전하고 실제 입구 위치에서 먹이가 떨어짐', () => {
  for (const [width, height] of [[1100, 650], [350, 475]]) {
    const model = aquarium(width, height);
    assert.ok(model.view.canHeight >= model.view.fishWidth);
    assert.equal(model.view.canHeight / model.view.canWidth, 1.5);
    assert.ok(model.pick('food', null, { x: model.can.x, y: model.can.y }, 2));
    model.move({ x: -1000, y: -1000 }, 2);
    assert.equal(model.can.ready, true);
    assert.ok(model.can.x - model.view.canRadius >= 0);
    assert.ok(model.can.y - model.view.canRadius >= 0);
    const mouth = foodMouth(model.view, model.can);
    model.step(50);
    assert.equal(model.pellets[0].x, mouth.x / width);
    assert.equal(model.pellets[0].start, mouth.y / height);
    model.release(2);
  }
});

test('사각 수조의 기포는 3초 간격으로 생성되어 수면에서 4초 대기함', () => {
  const model = aquarium();
  const field = new BubbleField(() => .5);
  field.syncFish(['mine']);
  field.step(2999, model.fish, model.view);
  assert.equal(field.items.length, 0);
  field.step(1, model.fish, model.view);
  const bubble = field.items[0];
  assert.ok(bubble);
  assert.equal(bubble.waterline, .025);
  field.time = bubble.arrival + surfaceWait - 1;
  assert.equal(field.frame(bubble).state, 'waiting');
  field.time++;
  assert.equal(field.frame(bubble).state, 'popping');
});

for (const [width, height] of [[1100, 650], [350, 475]]) {
  test(`새우를 수면에 놓으면 서서히 내려와 모래에서만 기어다님 (${width}×${height})`, () => {
    const model = aquarium(width, height);
    model.setFish([{ id: 'mine', species: 'shrimp' }]);
    const point = dragFish(model, { x: width / 2, y: 0 });
    assert.ok(point.y < height * .15);
    const shrimp = model.fish.get('mine'), startY = shrimp.y;
    model.step(50);
    assert.ok(shrimp.y > startY);
    assert.ok((shrimp.y - startY) * height < 3);
    assert.ok(shrimp.y < shrimpGroundY(model.view));
    model.paused = true;
    const heldHeight = shrimp.y;
    for (let i = 0; i < 20; i++) model.step(50);
    assert.equal(shrimp.y, heldHeight);
    model.paused = false;
    for (let i = 0; i < 400; i++) {
      const before = shrimp.y; model.step(50);
      assert.ok(shrimp.y >= before);
      assert.ok(shrimp.y <= shrimpGroundY(model.view));
    }
    assert.equal(shrimp.y, shrimpGroundY(model.view));
    const groundX = shrimp.x;
    for (let i = 0; i < 40; i++) { model.step(50); assert.equal(shrimp.y, shrimpGroundY(model.view)); }
    assert.notEqual(shrimp.x, groundX);
    model.resize(width === 1100 ? 350 : 1100, height === 650 ? 475 : 650);
    for (let i = 0; i < 20; i++) model.step(50);
    assert.equal(shrimp.y, shrimpGroundY(model.view));
  });
}

test('새우는 먹이를 보면 작게 점프하고 공중에서 먹지 않으며 바닥 먹이만 주워 먹음', () => {
  let bites = 0;
  const model = aquarium(1100, 650, () => bites++);
  model.setFish([{ id: 'mine', species: 'shrimp' }]);
  model.fish.get('mine').y = shrimpGroundY(model.view);
  model.pellets.push({ id: 1, x: model.fish.get('mine').x, y: .1, start: .1, born: 0 });
  let top = model.fish.get('mine').y;
  for (let i = 0; i < 20; i++) {
    model.step(50);
    top = Math.min(top, model.fish.get('mine').y);
  }
  assert.ok(top < shrimpGroundY(model.view));
  assert.ok((shrimpGroundY(model.view) - top) * model.view.height <= 36.01);
  assert.equal(model.fish.get('mine').y, shrimpGroundY(model.view));
  assert.equal(bites, 0);
  model.pellets = [{ id: 2, x: model.fish.get('mine').x, y: pelletGroundY(model.view), start: .1, born: model.time - 6000, grounded: true }];
  model.step(50);
  assert.equal(bites, 1);
});

test('먹이 10개를 전부 떨어뜨리면 0개가 되고 남은 바닥 알갱이는 사라지지 않음', () => {
  const model = aquarium(); model.setFish([]);
  for (let i = 0; i < 20; i++) model.sprinkle();
  assert.equal(model.foodCount, 0);
  assert.equal(model.pellets.length, 10);
  for (let i = 0; i < 300; i++) model.step(50);
  assert.equal(model.pellets.length, 10);
  assert.ok(model.pellets.every(p => p.grounded && p.y === pelletGroundY(model.view)));
  model.sprinkle();
  assert.equal(model.pellets.length, 10);
});

test('연속·동시 급식 요청도 저장소에서 차감한 10개까지만 생성하고 새로고침 후에도 0개 유지', async () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const repository = createLocalAquariumRepository(storage);
  const before = await repository.load();
  assert.equal(before.foodCount, 10);
  const model = new AquariumSimulation({ viewerId: 'subin', onDispense: count => repository.dispenseFood(count) });
  for (let i = 0; i < 5; i++) await Promise.all([model.sprinkle(), model.sprinkle()]);
  assert.equal(model.foodCount, 0);
  assert.equal(model.pellets.length, 10);
  assert.equal((await createLocalAquariumRepository(storage).load()).foodCount, 0);
  assert.deepEqual((await repository.load()).fish, before.fish);
});

test('기존 저장 데이터에 먹이 수량이 없어도 외형과 경험치를 유지하며 10개 지급', async () => {
  let data = JSON.stringify({ fish: [{ id: 'subin', species: 'neon', name: '수빈', hue: 190, xp: 20 }] });
  const repository = createLocalAquariumRepository({ getItem: () => data, setItem: (key, value) => { data = value; } });
  const snapshot = await repository.load();
  assert.equal(snapshot.foodCount, 10);
  assert.equal(snapshot.fish[0].name, '수빈');
  assert.equal(snapshot.fish[0].xp, 20);
  assert.equal((await repository.dispenseFood(2)).foodCount, 8);
  assert.equal((await repository.load()).foodCount, 8);
});

test('메인페이지 실제 코드와 게임 광선의 좌표·크기·색상이 모든 시점에서 같음', () => {
  const source = readFileSync(new URL('../public/js/aquarium.js', import.meta.url), 'utf8');
  const drawWater = source.match(/function drawWater\(t\) \{([\s\S]*?)\n  \}/)[0];
  const recorder = () => ({ calls: [], fillStyle: '', fillRect(...rect) {
    if (this.fillStyle === 'rgba(255,255,255,0.06)') this.calls.push(rect);
  } });
  for (const W of [88, 220, 300]) for (const t of [0, .5, 3, 29, 151]) {
    const main = recorder(), game = recorder();
    runInNewContext(drawWater + '; drawWater(t);', { ctx: main, W, sandTop: 112, t, WATER: ['#1565c0'], sparkles: [] });
    drawLandingLight(game, W, 112, t);
    assert.ok(main.calls.length > 0);
    assert.deepEqual(game.calls, main.calls);
  }
});

test('게임의 연장 광선은 이동 좌표와 밝기를 유지하고 폭과 끝 길이만 늘어남', () => {
  const record = () => ({ calls: [], fillStyle: '', fillRect(...rect) { this.calls.push(rect); } });
  for (const time of [0, 5, 31]) {
    const original = record(), longer = record();
    drawLandingLight(original, 220, 112, time);
    drawLandingLight(longer, 220, 112, time, '#ffffff', 1, { beamWidth: 9, length: 1 });
    assert.equal(longer.fillStyle, original.fillStyle);
    assert.ok(longer.calls.length > original.calls.length);
    for (let beam = 0; beam < 4; beam++) {
      const short = original.calls.slice(beam * original.calls.length / 4, (beam + 1) * original.calls.length / 4);
      const long = longer.calls.slice(beam * longer.calls.length / 4, (beam + 1) * longer.calls.length / 4);
      short.forEach(([x, y], index) => assert.deepEqual(long[index], [x, y, 9, 2]));
      assert.equal(long.at(-1)[1] + 2, 112);
    }
  }
});

test('두 PNG가 번갈아 반복되고, 일시정지·잡기·정지 상태를 지킴', () => {
  const fish = new SpriteAnimation('gold');
  for (let i = 0; i < 13; i++) fish.step(20);
  assert.equal(fish.frame, 1);
  for (let i = 0; i < 50; i++) fish.step(20, { paused: true });
  assert.equal(fish.frame, 1);
  for (let i = 0; i < 13; i++) fish.step(20);
  assert.equal(fish.frame, 0);
  const shrimp = new SpriteAnimation('shrimp');
  for (let i = 0; i < 9; i++) shrimp.step(20);
  assert.equal(shrimp.frame, 1);
  assert.equal(shrimp.step(20, { held: true }), 0);
  for (let i = 0; i < 20; i++) shrimp.step(20, { moving: false });
  assert.equal(shrimp.frame, 0);
});

test('새 6종의 64×40 두 프레임과 롤백한 새우 원본이 빌드 후에도 유지됨', () => {
  function pixels(file, kind) {
    const png = readFileSync(new URL('../game/public/' + file, import.meta.url));
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), kind === 'shrimp' ? 96 : 64);
    assert.equal(png.readUInt32BE(20), kind === 'shrimp' ? 64 : 40);
    const original = readFileSync(new URL('../public/play/' + file, import.meta.url));
    assert.deepEqual(png, original);
    return png;
  }
  for (const kind of Object.keys(species)) {
    const [first, second] = spriteFrames(kind).map(file => pixels(file, kind));
    if (kind === 'shrimp') {
      assert.notDeepEqual(first, second);
      assert.deepEqual(first, readFileSync(new URL('../artwork/attached-shrimp-2026-11-20/frames/shrimp.png', import.meta.url)));
      assert.deepEqual(second, readFileSync(new URL('../artwork/attached-shrimp-2026-11-20/frames/shrimp-2.png', import.meta.url)));
    } else assert.notDeepEqual(first, second);
  }
  assert.equal(Object.keys(species).length, 7);
  assert.equal(species.starfish, '불가사리');
  assert.equal(Object.values(species).some(name => name.includes('쓰레기')), false);
});

test('타인 물고기는 먹이가 있어도 평소처럼 이동하며 먹이를 가로채지 않음', () => {
  const fed = aquarium(), plain = aquarium();
  fed.pellets = [{ id: 1, x: fed.fish.get('friend').x, y: fed.fish.get('friend').y, start: fed.fish.get('friend').y, born: 0 }];
  for (let i = 0; i < 10; i++) { fed.step(50); plain.step(50); }
  assert.equal(fed.fish.get('friend').x, plain.fish.get('friend').x);
  assert.equal(fed.fish.get('friend').y, plain.fish.get('friend').y);
  assert.equal(fed.fish.get('friend').lastBite, -Infinity);
});

test('불가사리는 수면에서 놓으면 모래로 내려와 천천히 움직이고 바닥 먹이만 먹는다', () => {
  const eaten = [], model = aquarium(1100, 650, id => eaten.push(id));
  model.setFish([{ id: 'mine', species: 'starfish' }]);
  const ground = shrimpGroundY(model.view, 'starfish');
  dragFish(model, { x: 550, y: 90 });
  const star = model.fish.get('mine');
  const before = star.y; model.step(50);
  assert.ok(star.y > before && star.y < ground);
  for (let i = 0; i < 500; i++) model.step(50);
  assert.equal(star.y, ground);
  assert.ok(Math.abs(star.vx) * model.view.width < 15);
  model.pellets = [{ id: 1, x: star.x, y: .3, start: .3, born: model.time }];
  for (let i = 0; i < 60; i++) { model.step(50); assert.equal(star.y, ground); }
  assert.deepEqual(eaten, []); assert.equal(star.jumpStartedAt, null);
  model.pellets = [{ id: 2, x: star.x, y: ground, start: ground, born: model.time - 6001, grounded: true }];
  model.step(50);
  assert.deepEqual(eaten, ['mine']);
});

test('교체 전 종류로 저장된 물고기도 이름·경험치를 유지하며 새 종류로 불러온다', async () => {
  const values = new Map([['aquabit-game-v1', JSON.stringify({ fish: [{ id: 'subin', name: '오래된 친구', species: 'bream', xp: 60, hue: 240 }] })]]);
  const repository = createLocalAquariumRepository({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  const own = (await repository.load()).fish.find(f => f.id === 'subin');
  assert.equal(own.name, '오래된 친구'); assert.equal(own.xp, 60); assert.equal(own.species, 'gold');
  assert.equal(own.hue, originalHue.gold);
});

test('겹친 물고기 사이에서도 내 물고기만 네 번 먹어 레벨업하고 타인 경험치는 그대로임', async () => {
  const values = new Map();
  const repository = createLocalAquariumRepository({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) });
  const initial = await repository.load(), writes = [];
  const model = new AquariumSimulation({ viewerId: 'subin', onEat: id => writes.push(repository.feedFish(id)) });
  model.setFish(['sea', 'subin']);
  for (const fish of model.fish.values()) { fish.x = .5; fish.y = .5; fish.baseY = .5; fish.until = Infinity; }
  for (let round = 0; round < 4; round++) {
    model.pellets = [{ id: round, x: .5, y: .5, start: .5, born: model.time }];
    model.step(50);
    for (let tick = 0; tick < 5; tick++) model.step(50);
  }
  const results = await Promise.all(writes);
  assert.equal(results.at(-1).reward.leveledUp, true);
  assert.equal(results.at(-1).reward.after.level, 2);
  const restored = await repository.load();
  assert.equal(restored.fish.find(fish => fish.id === 'subin').xp, 20);
  assert.equal(restored.fish.find(fish => fish.id === 'subin').accessory, 'none');
  for (const fish of initial.fish.filter(fish => fish.id !== 'subin')) {
    assert.equal(restored.fish.find(other => other.id === fish.id).xp, fish.xp);
  }
  await assert.rejects(repository.feedFish('sea'), /내 물고기/);
});
