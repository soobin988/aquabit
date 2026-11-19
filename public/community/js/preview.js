// DB가 없는 개인 PC에서 화면·메뉴를 확인하는 명시적인 체험 모드.
// 실제 계정·팀 데이터와 분리하며 네트워크 API나 메일 서버에 접속하지 않습니다.
(function () {
  const params = new URLSearchParams(location.search);
  if (params.get('preview') === '1') sessionStorage.setItem('aquabit.community.preview', '1');
  if (sessionStorage.getItem('aquabit.community.preview') !== '1') return;
  Aqua.preview = true;
  const key = 'aquabit-community-preview-v1', today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const now = () => new Date().toISOString();
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch {}
  const state = saved || { pearls: 150, inventory: { food: 10, ribbon: 0, hat: 0, crown: 0 }, attendance: '', tanks: [{ id: 1, name: '우리 어항', inviteCode: 'DEMO01' }], messages: [], tasks: [], transactions: [], appearance: {} };
  if (state.feedDate !== today()) { state.appearance.fedToday = 0; state.feedDate = today(); }
  const user = { id: 1, nickname: '나', pearls: state.pearls, isAdmin: false };
  function fish(tankId) {
    return ['gold', 'angel', 'neon', 'shrimp'].map((species, i) => {
      const own = i === 0, foodTotal = own ? state.appearance.foodTotal || 0 : i * 5;
      const stage = foodTotal >= 40 ? 4 : foodTotal >= 15 ? 3 : foodTotal >= 5 ? 2 : 1;
      return { id: i + 1, tankId, userId: i + 1, ownerNickname: ['나', '바다', '네모', '새우'][i], name: ['내 물고기', '바다', '네모', '새우'][i],
        species, color: 'original', accessory: null, foodTotal, stage, stageName: 'Lv.' + stage,
        nextStageAt: [0, 5, 15, 40, null][stage], foodToNext: Math.max(0, ([0, 5, 15, 40, 40][stage]) - foodTotal),
        status: 'healthy', fedToday: own ? state.appearance.fedToday || 0 : 0, dailyFeedLimit: 5,
        ...(own ? state.appearance : {}) };
    });
  }
  function commit(value) { localStorage.setItem(key, JSON.stringify(state)); return structuredClone(value); }
  function fail(message, code) { const error = new Error(message); error.status = 400; error.code = code; throw error; }
  Aqua.currentUser = async () => ({ ...user, pearls: state.pearls });
  Aqua.requireLogin = Aqua.currentUser;
  Aqua.logout = async () => { sessionStorage.removeItem('aquabit.community.preview'); location.href = '/'; };
  Aqua.api = async (url, { method = 'GET', body = {} } = {}) => {
    const parsed = new URL(url, location.origin), path = parsed.pathname;
    if (path === '/auth/me') return { user: await Aqua.currentUser() };
    if (path === '/me/wallet') return commit({ pearls: state.pearls, inventory: state.inventory, attendance: { checkedToday: state.attendance === today(), streak: 1 } });
    if (path === '/me/attendance') {
      const awarded = state.attendance !== today(); if (awarded) { state.pearls += 10; state.attendance = today(); }
      return commit({ awarded, reward: 10, bonus: 0, streak: 1, pearls: state.pearls });
    }
    if (path === '/me/transactions') return { transactions: state.transactions };
    if (path === '/shop') return { items: [{ item: 'food', label: '먹이', price: 5, stackable: true }, ...[['ribbon', '리본', 30], ['hat', '꽃', 60], ['crown', '왕관', 120]].map(([item, label, price]) => ({ item, label, price, stackable: false }))] };
    if (path === '/shop/buy') {
      const prices = { food: 5, ribbon: 30, hat: 60, crown: 120 }, qty = body.item === 'food' ? Number(body.quantity || 1) : 1;
      if (!prices[body.item] || !Number.isInteger(qty) || qty < 1 || qty > 100) fail('구매 수량을 확인해 주세요.');
      const cost = prices[body.item] * qty;
      if (cost > state.pearls) fail('진주가 부족해요.');
      if (body.item !== 'food' && state.inventory[body.item]) fail('이미 가지고 있어요.');
      state.pearls -= cost; state.inventory[body.item] += qty;
      state.transactions.unshift({ id: Date.now(), amount: -cost, balanceAfter: state.pearls, type: 'buy', description: '체험 상점 구매', createdAt: now() });
      return commit({ pearls: state.pearls, inventory: state.inventory });
    }
    if (path === '/tanks/join') {
      const tank = state.tanks.find(t => t.inviteCode === body.code);
      if (!tank) fail('체험에서는 이 브라우저에서 만든 어항 코드만 사용할 수 있어요.');
      return { tank, joined: false };
    }
    if (path === '/tanks') {
      if (method === 'POST') {
        const name = String(body.name || '').trim().slice(0, 20); if (!name) fail('어항 이름을 입력해 주세요.');
        const tank = { id: Date.now(), name, inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X') };
        state.tanks.push(tank); return commit({ tank });
      }
      return { tanks: state.tanks.map(t => ({ ...t, isOwner: true, memberCount: 4, maxMembers: 10, myFish: fish(t.id)[0] })) };
    }
    const match = path.match(/^\/tanks\/(\d+)(.*)$/);
    if (!match) fail('체험에서 지원하지 않는 기능이에요.');
    const id = Number(match[1]), tail = match[2], tank = state.tanks.find(t => t.id === id);
    if (!tank) fail('어항을 찾을 수 없어요.');
    if (!tail) {
      if (method === 'DELETE') { state.tanks = state.tanks.filter(t => t.id !== id); return commit({ ok: true }); }
      return { tank: { ...tank, ownerId: 1, maxMembers: 10 }, me: { userId: 1, isOwner: true }, members: fish(id).map(f => ({ userId: f.userId, nickname: f.ownerNickname, isOwner: f.userId === 1 })), fish: fish(id), pendingTasks: state.tasks.filter(t => t.tankId === id && t.status === 'submitted').length };
    }
    if (tail === '/fish/me') {
      if (!(body.species in PixelArt.SPECIES) || !(body.color in PixelArt.COLORS)) fail('물고기 종류와 색상을 확인해 주세요.');
      if (body.accessory && !state.inventory[body.accessory]) fail('상점에서 먼저 구매해 주세요.');
      const requiredLevel = { ribbon: 2, hat: 3, crown: 4 }[body.accessory] || 1;
      if (fish(id)[0].stage < requiredLevel) fail('레벨이 오르면 해금돼요.');
      if (body.hue !== null && body.hue !== undefined && (!Number.isInteger(body.hue) || body.hue < 0 || body.hue > 359)) fail('색상 값을 확인해 주세요.');
      Object.assign(state.appearance, { name: String(body.name || '내 물고기').slice(0, 12), species: body.species, color: body.color, hue: body.hue ?? null, accessory: body.accessory });
      return commit({ fish: fish(id)[0] });
    }
    if (/^\/fish\/\d+\/feed$/.test(tail)) {
      if (tail !== '/fish/1/feed') fail('내 물고기에게만 먹이를 줄 수 있어요.');
      const own = fish(id)[0];
      if (own.fedToday >= 5) fail('배불러요', 'FEED_LIMIT');
      if (!state.inventory.food) fail('먹이가 부족해요', 'NO_FOOD');
      state.inventory.food--; state.appearance.foodTotal = own.foodTotal + 1; state.appearance.fedToday = own.fedToday + 1;
      const updated = fish(id)[0]; return commit({ fish: updated, food: state.inventory.food, leveledUp: updated.stage > own.stage });
    }
    if (tail === '/messages') {
      if (method === 'POST') {
        const text = String(body.body || '').trim().slice(0, 300); if (!text) fail('메시지를 입력해 주세요.');
        const message = { id: Date.now(), tankId: id, userId: 1, nickname: '나', body: text, createdAt: now() }; state.messages.push(message); return commit({ message });
      }
      return { messages: state.messages.filter(m => m.tankId === id && m.id > Number(parsed.searchParams.get('after') || 0)).slice(-100) };
    }
    if (tail === '/tasks') {
      if (method === 'POST') {
        const task = { id: Date.now(), tankId: id, title: String(body.title || '').slice(0, 60), assigneeId: Number(body.assigneeId), assigneeNickname: fish(id).find(f => f.userId === Number(body.assigneeId))?.ownerNickname || '', reward: Number(body.reward), dueDate: body.dueDate, status: 'todo', creatorId: 1, createdAt: now() };
        state.tasks.push(task); return commit({ task });
      }
      return { tasks: state.tasks.filter(t => t.tankId === id), today: today(), pending: state.tasks.filter(t => t.tankId === id && t.status === 'submitted').length };
    }
    if (tail === '/transfer') fail('체험에서는 대표를 변경할 수 없어요. 실제 계정으로 사용할 수 있어요.');
    fail('이 동작은 MySQL을 연결한 실제 팀 어항에서 사용할 수 있어요.');
  };
  const banner = document.createElement('div'); banner.className = 'preview-badge';
  banner.textContent = '체험 모드 · 이 브라우저에만 저장'; document.body.append(banner);
})();
