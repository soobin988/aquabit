const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http = require('node:http');
const root = path.resolve(__dirname, '..');

function preview(options = {}) {
  const data = new Map(), session = new Map();
  if (options.foodCount !== undefined) data.set('aquabit-community-preview-v1', JSON.stringify({
    pearls: 150, inventory: { food: options.foodCount, ribbon: 0, hat: 0, crown: 0 }, attendance: '',
    tanks: [{ id: 1, name: '우리 어항', inviteCode: 'DEMO01' }], messages: [], tasks: [], transactions: [],
    appearance: { fedToday: options.fedToday || 0, foodTotal: options.fedToday || 0 }, feedDate: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' }),
  }));
  const storage = map => ({ getItem: key => map.get(key) || null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  const context = vm.createContext({ URL, URLSearchParams, Date, Math, Error, Number, String, Object, JSON, structuredClone,
    location: { search: '?preview=1', origin: 'http://localhost', href: '' },
    localStorage: storage(data), sessionStorage: storage(session), Aqua: {},
    PixelArt: { SPECIES: require('../game/domain/creatures.json'), COLORS: { original: {}, sky: {} } },
    document: { createElement: () => ({}), body: { append() {} } },
  });
  vm.runInContext(fs.readFileSync(path.join(root, 'public/community/js/preview.js'), 'utf8'), context);
  return context.Aqua;
}

test('체험 API는 계정·메일 접속 없이 팀 화면, 내 물고기 급식, 잔액·재고를 유지한다', async () => {
  const aqua = preview();
  assert.equal(aqua.preview, true);
  assert.equal((await aqua.requireLogin()).id, 1);
  const tank = await aqua.api('/tanks/1');
  assert.equal(tank.fish.length, 4);
  assert.equal(tank.fish[3].species, 'shrimp');
  assert.equal((await aqua.api('/me/wallet')).inventory.food, 10);
  await assert.rejects(aqua.api('/tanks/1/fish/2/feed', { method: 'POST' }), /내 물고기/);
  let result;
  for (let i = 0; i < 5; i++) result = await aqua.api('/tanks/1/fish/1/feed', { method: 'POST' });
  assert.equal(result.food, 5);
  assert.equal(result.fish.stage, 2);
  await assert.rejects(aqua.api('/tanks/1/fish/1/feed', { method: 'POST' }), error => error.message === '배불러요' && error.code === 'FEED_LIMIT');
  assert.equal((await aqua.api('/me/wallet')).inventory.food, 5);
  const bought = await aqua.api('/shop/buy', { method: 'POST', body: { item: 'ribbon' } });
  assert.equal(bought.pearls, 120);
  const customized = await aqua.api('/tanks/1/fish/me', { method: 'PATCH', body: { name: '금붕이', species: 'shrimp', color: 'original', hue: 230, accessory: 'ribbon' } });
  assert.equal(customized.fish.species, 'shrimp');
  assert.equal(customized.fish.foodTotal, 5);
  assert.equal((await aqua.api('/tanks/1')).fish[0].hue, 230);
  await aqua.api('/shop/buy', { method: 'POST', body: { item: 'hat' } });
  await assert.rejects(aqua.api('/tanks/1/fish/me', { method: 'PATCH', body: { species: 'gold', color: 'original', accessory: 'hat' } }), /해금/);
});

test('체험 채팅·과제·초대 코드는 어항별로 분리되고 다른 PC와 공유되는 척하지 않는다', async () => {
  const aqua = preview();
  const { tank } = await aqua.api('/tanks', { method: 'POST', body: { name: '새 어항' } });
  await aqua.api('/tanks/1/messages', { method: 'POST', body: { body: '<안녕>' } });
  assert.equal((await aqua.api('/tanks/1/messages')).messages[0].body, '<안녕>');
  assert.equal((await aqua.api(`/tanks/${tank.id}/messages`)).messages.length, 0);
  await aqua.api('/tanks/1/tasks', { method: 'POST', body: { title: 'DNS 설정', assigneeId: 2, reward: 50, dueDate: '2026-12-02' } });
  assert.equal((await aqua.api('/tanks/1/tasks')).tasks[0].assigneeNickname, '바다');
  assert.equal((await aqua.api(`/tanks/${tank.id}/tasks`)).tasks.length, 0);
  assert.equal((await aqua.api('/tanks/join', { method: 'POST', body: { code: tank.inviteCode } })).tank.id, tank.id);
  await assert.rejects(aqua.api('/tanks/join', { method: 'POST', body: { code: 'OTHER1' } }), /이 브라우저/);
});

test('마지막 먹이 이후 급식과 배부른 상태의 재시도는 체험 저장소의 재고·급식 수를 바꾸지 않는다', async () => {
  const aqua = preview({ foodCount: 1 });
  await aqua.api('/tanks/1/fish/1/feed', { method: 'POST' });
  for (let i = 0; i < 3; i++) await assert.rejects(aqua.api('/tanks/1/fish/1/feed', { method: 'POST' }), error => error.message === '먹이가 부족해요' && error.code === 'NO_FOOD');
  assert.equal((await aqua.api('/me/wallet')).inventory.food, 0);
  assert.equal((await aqua.api('/tanks/1')).fish[0].fedToday, 1);
  const full = preview({ foodCount: 8, fedToday: 5 });
  for (let i = 0; i < 3; i++) await assert.rejects(full.api('/tanks/1/fish/1/feed', { method: 'POST' }), /배불러요/);
  assert.equal((await full.api('/me/wallet')).inventory.food, 8);
  assert.equal((await full.api('/tanks/1')).fish[0].fedToday, 5);
});

test('DB를 끈 서버는 외부 DB 접속 없이 회사와 통합 게임을 함께 서비스한다', async () => {
  process.env.GAME_DATABASE_ENABLED = 'false';
  const app = require('../app');
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const home = await (await fetch(base)).text();
    assert.match(home, /href="\/community\/login.html"/);
    const page = await fetch(base + '/community/tank.html?id=1');
    assert.equal(page.status, 200);
    assert.match(await page.text(), /community-entry.js/);
    assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
    const health = await (await fetch(base + '/api/game/health')).json();
    assert.equal(health.databaseEnabled, false);
    const unavailable = await fetch(base + '/api/game/auth/me');
    assert.equal(unavailable.status, 503);
    assert.equal((await unavailable.json()).code, 'DATABASE_NOT_CONFIGURED');
    const crossSite = await fetch(base + '/api/game/auth/login', { method: 'POST', headers: { Origin: 'http://other.invalid', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(crossSite.status, 403);
    for (const file of ['community-entry.js', 'community-entry.css', 'community-shared.css', 'assets/creatures/angel.png', 'assets/creatures/shrimp.png', 'assets/creatures/starfish.png']) {
      assert.equal((await fetch(base + '/play/' + file)).status, 200, file);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('스키마는 기존 자료를 삭제하지 않고 사용자 PNG의 모든 종을 지원한다', () => {
  const sql = fs.readFileSync(path.join(root, 'sql/community-schema.sql'), 'utf8');
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS users/);
  for (const species of ['gold', 'angel', 'betta', 'guppy', 'neon', 'shrimp']) assert.ok(sql.includes("'" + species + "'"));
});

test('본문이 없는 출석·급식 POST도 보안 미들웨어와 맞는 JSON 요청을 보낸다', async () => {
  let sent;
  const context = vm.createContext({ window: {}, URLSearchParams, location: { pathname: '/community/tank.html', search: '' },
    document: {}, fetch: async (url, options) => { sent = { url, ...options }; return { ok: true, status: 200, json: async () => ({ ok: true }) }; } });
  vm.runInContext(fs.readFileSync(path.join(root, 'public/community/js/api.js'), 'utf8'), context);
  await context.window.Aqua.api('/me/attendance', { method: 'POST' });
  assert.equal(sent.url, '/api/game/me/attendance');
  assert.equal(sent.headers['Content-Type'], 'application/json');
  assert.equal(sent.body, '{}');
});
