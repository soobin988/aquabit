(async function () {
  'use strict';
  const PA = window.PixelArt;
  const $ = (id) => document.getElementById(id);
  const esc = Aqua.escapeHtml;
  const tankId = Number(Aqua.qs('id'));
  if (!tankId) { location.replace('/community/tanks.html'); return; }

  const user = await Aqua.requireLogin();
  await Aqua.fontsReady();

  const STATUS_LABEL = { healthy: '건강함', hungry: '배고픔', sad: '시무룩' };
  const ITEM_LABEL = { food: '먹이', ribbon: '리본', hat: '꽃', crown: '왕관' };
  const state = {
    tank: null, me: null, members: [], fish: [], user,
    wallet: { pearls: user.pearls, inventory: { food: 0, ribbon: 0, hat: 0, crown: 0 }, attendance: null },
    lastMsgId: 0, chatOpen: true, chatLoaded: false, unread: 0,
    cardFishId: null, feedMode: false, feedTargetId: null, feeding: false,
    pendingTasks: 0,
  };

  // ── 아이콘 채우기 ──
  function fillIcons(root = document) {
    root.querySelectorAll('[data-icon]:empty').forEach((el) => {
      const scale = el.closest('.action') || el.closest('.hud-icon-btn') ? 3 : 2;
      el.appendChild(PA.iconCanvas(el.dataset.icon, scale));
    });
  }
  fillIcons();

  // ── 토스트 (최대 3개) ──
  function toast(html, ms = 3200) {
    const box = $('toasts');
    while (box.children.length >= 3) box.firstChild.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = html;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // ── 어항 장면 ──
  const scene = new TankScene($('tank'), {
    labels: true,
    swimRight: () => (!state.chatOpen || window.innerWidth <= 760 ? 0 : ($('chat').offsetWidth + 24) / window.innerWidth),
    onFishClick: (f) => {
      if (state.feedMode) { setFeedTarget(f.id); return; }
      openCard(f.id);
    },
    onWaterClick: (x, y) => {
      if (state.feedMode) feedAt(x, y);
      else closeCard();
    },
  });
  scene.start();
  window.aquaScene = scene; // 개발자 도구에서 확인용

  // ── 데이터 ──
  function myFish() { return state.fish.find((f) => f.userId === user.id); }
  function fishById(id) { return state.fish.find((f) => f.id === id); }
  function nickOf(userId) { const m = state.members.find((x) => x.userId === userId); return m ? m.nickname : ''; }
  function feedReason(f = myFish()) {
    return Aqua.feedingBlockReason({ foodCount: state.wallet.inventory.food, fedToday: f?.fedToday, dailyFeedLimit: f?.dailyFeedLimit });
  }
  let lastFeedNotice = '', lastFeedNoticeAt = 0;
  function showFeedNotice(reason) {
    if (state.feedMode) setFeedMode(false);
    const now = Date.now();
    if (reason === lastFeedNotice && now - lastFeedNoticeAt < 1800) return;
    lastFeedNotice = reason; lastFeedNoticeAt = now;
    toast(esc(reason));
  }

  /** 물고기 한 마리 정보만 바꾸기 (먹이, 꾸미기 후) */
  function upsertFish(f) {
    const i = state.fish.findIndex((x) => x.id === f.id);
    if (i >= 0) state.fish[i] = Object.assign({}, state.fish[i], f);
    else state.fish.push(f);
    scene.setFish(state.fish);
    if (f.userId === user.id) renderAvatar();
    if (state.cardFishId === f.id) openCard(f.id, true);
    if (state.feedMode) renderFeedTargets();
  }

  async function loadTank(first) {
    let data;
    try {
      data = await Aqua.api(`/tanks/${tankId}`);
    } catch (e) {
      if (e.status === 404) goToList('이 어항은 삭제됐거나 더 이상 참여하고 있지 않아요.');
      return;
    }
    if (!first && !realtimeOn()) {
      const known = new Set(state.members.map((m) => m.userId));
      for (const m of data.members) if (!known.has(m.userId)) toast(`<b>${esc(m.nickname)}</b>님이 어항에 들어왔어요!`);
    }
    state.tank = data.tank;
    state.me = data.me;
    state.members = data.members;
    state.fish = data.fish;
    state.pendingTasks = data.pendingTasks || 0;
    scene.setFish(data.fish);
    renderHud();
    if (state.cardFishId) openCard(state.cardFishId, true);
    if ($('teamDialog').open) renderTeam();
    if (state.feedMode) renderFeedTargets();
  }

  async function loadWallet() {
    try {
      state.wallet = await Aqua.api('/me/wallet');
      renderCounters();
    } catch (e) { /* 다음에 다시 */ }
  }

  // ── HUD ──
  function renderAvatar() {
    const mf = myFish();
    const av = $('avatar');
    av.innerHTML = '';
    if (mf) av.appendChild(PA.previewCanvas(mf, 2, 0));
  }
  function renderHud() {
    document.title = `${state.tank.name} | AQUABIT`;
    $('myNick').textContent = user.nickname;
    $('tankName').textContent = state.tank.name + (state.me.isOwner ? ' (대표)' : '');
    renderAvatar();
    renderTaskBadge();
  }
  function renderCounters() {
    scene.sync?.();
    $('pearlCount').textContent = state.wallet.pearls;
    $('foodCount').textContent = state.wallet.inventory.food;
  }
  function renderTaskBadge() {
    const b = $('taskBadge');
    b.hidden = !state.pendingTasks;
    b.textContent = state.pendingTasks > 9 ? '9+' : state.pendingTasks;
    $('actTasks').setAttribute('aria-label', state.pendingTasks ? `과제, 처리할 것 ${state.pendingTasks}개` : '과제');
  }
  function setPearls(n, pop = true) {
    state.wallet.pearls = n;
    if (pop) Fx.bumpNumber($('pearlCount'), n); else $('pearlCount').textContent = n;
  }
  function setFood(n, pop = true) {
    state.wallet.inventory.food = n;
    if (pop) Fx.bumpNumber($('foodCount'), n); else $('foodCount').textContent = n;
    scene.sync?.();
  }
  /** 진주를 얻었을 때: from 위치에서 진주가 날아와 HUD에 쌓인다 */
  function rewardPearls(from, amount, newTotal) {
    Fx.flyPearls(from, $('pearlBtn'), amount, () => setPearls(newTotal));
  }

  // ── 물고기 카드 ──
  function openCard(fishId, refresh) {
    const f = fishById(fishId);
    if (!f) return closeCard();
    const card = $('fishCard');
    if (refresh && card.hidden) return;
    state.cardFishId = fishId;
    scene.selectedId = fishId;
    const portrait = $('cardPortrait');
    portrait.innerHTML = '';
    portrait.appendChild(PA.previewCanvas(f, f.stage >= 3 ? 4 : 5, 0));
    $('cardName').textContent = f.name;
    $('cardOwner').textContent = `주인 ${f.ownerNickname}${f.userId === user.id ? ' (나)' : ''}`;
    $('cardStage').textContent = `Lv.${f.stage}`;
    const chip = $('cardStatus');
    chip.textContent = STATUS_LABEL[f.status];
    chip.dataset.s = f.status;

    const cur = PA.STAGE_NEED[f.stage];
    const pct = f.nextStageAt ? Math.round(((f.foodTotal - cur) / (f.nextStageAt - cur)) * 100) : 100;
    const gauge = $('cardGauge');
    gauge.querySelector('i').style.width = `calc(${pct}% - ${pct >= 100 ? 6 : 3}px)`;
    gauge.setAttribute('aria-valuenow', String(pct));
    gauge.setAttribute('aria-label', '다음 단계까지 진행도');
    $('cardNext').textContent = f.nextStageAt
      ? `받은 먹이 ${f.foodTotal}개, 다음 단계까지 ${f.foodToNext}개`
      : `받은 먹이 ${f.foodTotal}개, 가장 높은 단계예요`;
    $('cardToday').textContent = `오늘 받은 먹이 ${f.fedToday ?? 0}/${f.dailyFeedLimit || 5}`;

    const actions = $('cardActions');
    actions.innerHTML = '';
    const feedBtn = document.createElement('button');
    feedBtn.className = 'btn btn--small btn--sea';
    feedBtn.type = 'button';
    feedBtn.textContent = f.userId === user.id ? '먹이 주기' : `${f.ownerNickname}님 물고기에게 먹이 주기`;
    feedBtn.disabled = f.userId !== user.id;
    feedBtn.addEventListener('click', () => { closeCard(); setFeedMode(true, f.id); });
    actions.appendChild(feedBtn);
    if (f.userId === user.id) {
      const b = document.createElement('button');
      b.className = 'btn btn--small';
      b.type = 'button';
      b.textContent = '꾸미기';
      b.addEventListener('click', () => { closeCard(); openDecorate(); });
      actions.appendChild(b);
    }
    card.hidden = false;
  }
  function closeCard() {
    $('fishCard').hidden = true;
    state.cardFishId = null;
    scene.selectedId = state.feedMode ? state.feedTargetId : null;
  }
  $('fishCard').querySelector('[data-close]').addEventListener('click', closeCard);

  // ── 먹이 주기 ──
  function setFeedMode(on, targetId) {
    if (on) {
      const reason = feedReason();
      if (reason) { showFeedNotice(reason); return; }
    }
    state.feedMode = on;
    $('actFeed').setAttribute('aria-pressed', String(on));
    $('feedBar').hidden = !on;
    scene.opts.waterCursor = on ? 'crosshair' : 'default';
    if (on) {
      closeCard();
      const mf = myFish();
      state.feedTargetId = targetId || state.feedTargetId || (mf && mf.id);
      if (!fishById(state.feedTargetId)) state.feedTargetId = mf && mf.id;
      scene.selectedId = state.feedTargetId;
      renderFeedTargets();
    } else {
      scene.selectedId = null;
    }
  }
  function setFeedTarget(id) {
    state.feedTargetId = id;
    scene.selectedId = id;
    renderFeedTargets();
  }
  function renderFeedTargets() {
    const box = $('feedTargets');
    box.innerHTML = '';
    for (const f of state.fish.filter(item => item.userId === user.id)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'feed-target';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(f.id === state.feedTargetId));
      const full = (f.fedToday ?? 0) >= (f.dailyFeedLimit || 5);
      b.disabled = full;
      b.appendChild(PA.previewCanvas(f, 2, 0));
      b.insertAdjacentHTML('beforeend', `<span class="ft-name">${esc(f.ownerNickname)}${f.userId === user.id ? ' (나)' : ''}</span><span class="ft-count pixel">${full ? '배불러요' : `${f.fedToday ?? 0}/${f.dailyFeedLimit || 5}`}</span>`);
      b.title = `${f.name} (${STATUS_LABEL[f.status]})`;
      b.addEventListener('click', () => setFeedTarget(f.id));
      box.appendChild(b);
    }
  }
  async function feedAt(x, y) {
    const target = fishById(state.feedTargetId);
    if (target && target.userId !== user.id) { toast('내 물고기에게만 먹이를 줄 수 있어요.'); return; }
    if (!target) { toast('먹이를 줄 물고기를 먼저 골라 주세요.'); return; }
    const reason = feedReason(target);
    if (reason) { showFeedNotice(reason); return; }
    if (state.feeding) return; // 한 번에 하나씩
    state.feeding = true;
    try {
      const r = await Aqua.api(`/tanks/${tankId}/fish/${target.id}/feed`, { method: 'POST' });
      setFood(r.food);
      const blocked = feedReason(r.fish);
      if (blocked) showFeedNotice(blocked);
      Fx.beep('food');
      // 먹이를 먹고 나서 상태와 크기를 바꾼다
      target.fedToday = r.fish.fedToday; // 버튼 숫자는 바로
      renderFeedTargets();
      scene.dropFood(x, y, target.id, () => {
        upsertFish(r.fish);
        if (r.leveledUp) {
          scene.sparkleBurst(r.fish.id, 30);
          scene.flash(r.fish.id);
          Fx.levelUp(r.fish, `Lv.${r.fish.stage} · 새 장식이 해금됐어요!`);
        }
      });
    } catch (e) {
      showFeedNotice(e.message);
      if (e.code === 'FEED_LIMIT') loadTank();
    } finally {
      state.feeding = false;
    }
  }
  $('actFeed').addEventListener('click', () => setFeedMode(!state.feedMode));
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
    if (!$('fishCard').hidden) closeCard();
    else if (state.feedMode) setFeedMode(false);
  });

  // ── 꾸미기 ──
  const deco = { species: null, color: null, hue: null, accessory: null, anim: null };
  const hueLabel = document.createElement('label'); hueLabel.className = 'field'; hueLabel.textContent = '컬러 슬라이더';
  const hueSlider = document.createElement('input'); hueSlider.type = 'range'; hueSlider.min = 0; hueSlider.max = 359; hueSlider.setAttribute('aria-label', '물고기 색상');
  hueSlider.addEventListener('input', () => { deco.hue = Number(hueSlider.value); renderDecoPreview(); });
  hueLabel.append(hueSlider); $('colorChoices').after(hueLabel);
  function renderDecoPreview(frame = 0) {
    const mf = myFish();
    const box = $('decoPreview');
    box.innerHTML = '';
    box.appendChild(PA.previewCanvas({ species: deco.species, color: deco.color, hue: deco.hue, accessory: deco.accessory, stage: mf.stage }, 4, frame));
  }
  function choiceButtons(container, items, current, onPick) {
    container.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice-btn' + (it.swatch ? ' swatch' : '');
      b.setAttribute('aria-pressed', String(it.value === current));
      b.setAttribute('aria-label', it.label + (it.disabled ? ' (상점에서 구매 필요)' : ''));
      b.title = it.label + (it.disabled ? ' (상점에서 구매 필요)' : '');
      if (it.disabled) b.disabled = true;
      if (it.swatch) b.innerHTML = `<i style="background:${it.swatch}"></i>`;
      else {
        if (it.canvas) b.appendChild(it.canvas);
        b.appendChild(Object.assign(document.createElement('span'), { textContent: it.label }));
      }
      b.addEventListener('click', () => {
        container.querySelectorAll('.choice-btn').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onPick(it.value);
        renderDecoPreview();
      });
      container.appendChild(b);
    }
  }
  function openDecorate() {
    const mf = myFish();
    deco.hue = mf?.hue ?? null; hueSlider.value = deco.hue ?? 24;
    if (!mf) return;
    setFeedMode(false);
    deco.species = PA.resolveSpecies(mf.species); deco.color = mf.color; deco.accessory = mf.accessory;
    $('decoName').value = mf.name;
    $('decoError').textContent = '';
    choiceButtons($('speciesChoices'), Object.entries(PA.SPECIES).map(([k, v]) => ({
      value: k, label: v.label, canvas: PA.previewCanvas({ species: k, color: deco.color, stage: 1 }, 2, 0),
    })), deco.species, (v) => { deco.species = v; });
    choiceButtons($('colorChoices'), Object.entries(PA.COLORS).map(([k, v]) => ({ value: k, label: v.label, swatch: v.b })), deco.color, (v) => { deco.color = v; deco.hue = null; });
    const inv = state.wallet.inventory;
    choiceButtons($('accChoices'), [
      { value: null, label: '없음' },
      ...Object.entries(PA.ACCESSORIES).map(([k, v]) => ({ value: k, label: v.label, canvas: PA.iconCanvas(k, 3), disabled: !inv[k] || mf.stage < ({ ribbon: 2, hat: 3, crown: 4 }[k] || 1) })),
    ], deco.accessory, (v) => { deco.accessory = v; });
    const owned = Object.keys(PA.ACCESSORIES).filter((k) => inv[k]).length;
    $('accHelp').textContent = '리본 Lv.2 · 꽃 Lv.3 · 왕관 Lv.4에 해금돼요. 상점에서 구매한 뒤 착용하세요.';
    renderDecoPreview();
    let frame = 0;
    clearInterval(deco.anim);
    deco.anim = setInterval(() => renderDecoPreview((frame ^= 1)), 400);
    $('decorateDialog').showModal();
  }
  $('decorateDialog').addEventListener('close', () => clearInterval(deco.anim));
  $('decorateForm').addEventListener('submit', async (e) => {
    if (e.submitter && e.submitter.value === 'cancel') return;
    e.preventDefault();
    try {
      const { fish } = await Aqua.api(`/tanks/${tankId}/fish/me`, {
        method: 'PATCH',
        body: { name: $('decoName').value, species: deco.species, color: deco.color, hue: deco.hue, accessory: deco.accessory },
      });
      $('decorateDialog').close();
      upsertFish(fish);
      toast('물고기를 새로 꾸몄어요.');
    } catch (ex) {
      $('decoError').textContent = ex.message;
    }
  });
  $('actDecorate').addEventListener('click', openDecorate);

  // ── 상점 ──
  let shopItems = null;
  async function openShop() {
    setFeedMode(false);
    $('shopError').textContent = '';
    if (!shopItems) {
      try { shopItems = (await Aqua.api('/shop')).items; } catch (e) { toast(esc(e.message)); return; }
    }
    renderShop();
    $('shopDialog').showModal();
  }
  function renderShop() {
    const inv = state.wallet.inventory;
    $('shopWallet').innerHTML = '';
    $('shopWallet').append(PA.iconCanvas('pearl', 2), document.createTextNode(` ${state.wallet.pearls}`));
    const list = $('shopList');
    list.innerHTML = '';
    for (const it of shopItems) {
      const li = document.createElement('li');
      li.className = 'shop-item';
      const owned = !it.stackable && inv[it.item] > 0;
      const icon = document.createElement('span');
      icon.className = 'shop-icon';
      icon.appendChild(PA.iconCanvas(it.item, it.item === 'food' ? 5 : 6));
      li.appendChild(icon);
      li.insertAdjacentHTML('beforeend', `
        <span class="shop-info">
          <b class="pixel">${it.label}</b>
          <span>${it.stackable ? `내 물고기에게 줄 먹이예요. 지금 ${inv.food}개` : owned ? '가지고 있어요. 해금 레벨에 꾸미기에서 착용할 수 있어요.' : '구매 후 해금 레벨부터 착용할 수 있어요.'}</span>
        </span>
        <span class="shop-price pixel">${it.price}${it.stackable ? '/개' : ''}</span>
        <span class="shop-buy"></span>`);
      li.querySelector('.shop-price').prepend(PA.iconCanvas('pearl', 2));
      const buy = li.querySelector('.shop-buy');
      if (it.stackable) {
        for (const q of [1, 5, 10]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn--small' + (q === 1 ? ' btn--sea' : '');
          b.textContent = `${q}개`;
          b.title = `${it.price * q}진주`;
          b.disabled = state.wallet.pearls < it.price * q;
          b.addEventListener('click', () => buyItem(it, q));
          buy.appendChild(b);
        }
      } else if (owned) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--small btn--foam';
        b.textContent = '착용하러 가기';
        b.addEventListener('click', () => { $('shopDialog').close(); openDecorate(); });
        buy.appendChild(b);
      } else {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--small btn--sea';
        b.textContent = '사기';
        b.disabled = state.wallet.pearls < it.price;
        if (b.disabled) b.title = `진주가 ${it.price - state.wallet.pearls}개 더 필요해요`;
        b.addEventListener('click', () => buyItem(it, 1));
        buy.appendChild(b);
      }
      list.appendChild(li);
    }
  }
  async function buyItem(it, qty) {
    $('shopError').textContent = '';
    try {
      const r = await Aqua.api('/shop/buy', { method: 'POST', body: { item: it.item, quantity: qty } });
      state.wallet.inventory = r.inventory;
      setPearls(r.pearls);
      setFood(r.inventory.food);
      renderShop();
      toast(it.stackable ? `먹이 ${qty}개를 샀어요.` : `${Aqua.josa(it.label, '을', '를')} 샀어요. 꾸미기에서 착용해 보세요.`);
    } catch (e) {
      $('shopError').textContent = e.message;
    }
  }
  $('actShop').addEventListener('click', openShop);
  $('foodBtn').addEventListener('click', openShop);

  // ── 진주 내역 ──
  const TYPE_LABEL = { attendance: '출석', streak_bonus: '연속 출석', task_reward: '과제 보상', buy_food: '먹이 구매', buy_accessory: '장신구 구매', seed: '시작 진주' };
  async function openHistory() {
    let data;
    try { data = await Aqua.api('/me/transactions?limit=100'); } catch (e) { toast(esc(e.message)); return; }
    $('histWallet').innerHTML = '';
    $('histWallet').append(PA.iconCanvas('pearl', 2), document.createTextNode(` ${state.wallet.pearls}`));
    const att = state.wallet.attendance;
    $('histStreak').textContent = att ? `연속 출석 ${att.streak}일. 7일을 채울 때마다 보너스 30진주를 받아요.` : '';
    const list = $('histList');
    list.innerHTML = data.transactions.length ? '' : '<li class="hist-empty">아직 진주 내역이 없어요.</li>';
    for (const t of data.transactions) {
      const d = new Date(t.createdAt);
      const when = d.toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
      const li = document.createElement('li');
      li.className = 'hist-row';
      li.innerHTML = `
        <span class="hist-type tag ${t.amount > 0 ? 'tag--sand' : ''}">${TYPE_LABEL[t.type] || t.type}</span>
        <span class="hist-desc">${esc(t.description)}${t.tankName ? `<small>${esc(t.tankName)}</small>` : ''}</span>
        <span class="hist-when">${when}</span>
        <b class="hist-amount pixel ${t.amount > 0 ? 'plus' : 'minus'}">${t.amount > 0 ? '+' : ''}${t.amount}</b>
        <span class="hist-bal pixel">${t.balanceAfter}</span>`;
      list.appendChild(li);
    }
    $('historyDialog').showModal();
  }
  $('pearlBtn').addEventListener('click', openHistory);
  $('openHistory').addEventListener('click', () => { $('settingsDialog').close(); openHistory(); });

  // ── 팀 ──
  function renderTeam() {
    $('inviteCode').textContent = state.tank.inviteCode;
    $('teamCount').textContent = `팀원 ${state.members.length}/${state.tank.maxMembers}명`;
    const list = $('memberList');
    list.innerHTML = '';
    for (const m of state.members) {
      const f = state.fish.find((x) => x.userId === m.userId);
      const li = document.createElement('li');
      li.className = 'member';
      li.innerHTML = `<span class="mfish"></span>
        <span class="mname"><b>${esc(m.nickname)}${m.userId === user.id ? ' (나)' : ''}</b>
        <span>${f ? `${esc(f.name)}, ${f.stage}단계 ${f.stageName}, ${STATUS_LABEL[f.status]}` : ''}</span></span>
        ${m.isOwner ? '<span class="tag tag--sand">대표</span>' : ''}`;
      if (f) li.querySelector('.mfish').appendChild(PA.previewCanvas(f, 2, 0));
      // 대표: 다른 팀원에게 대표 넘기기
      if (state.me.isOwner && m.userId !== user.id) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn--small btn--foam member-transfer';
        b.textContent = '대표 넘기기';
        b.addEventListener('click', () => confirmTransfer(m));
        li.appendChild(b);
      }
      list.appendChild(li);
    }

    // 맨 아래: 대표는 어항 삭제, 팀원은 어항 나가기
    const danger = $('teamDanger');
    danger.innerHTML = '';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn--small btn--coral';
    if (state.me.isOwner) {
      danger.insertAdjacentHTML('beforeend', '<p>대표는 어항을 나갈 수 없어요. 나가려면 먼저 다른 팀원에게 대표를 넘겨 주세요.</p>');
      b.textContent = '어항 삭제';
      b.addEventListener('click', confirmDelete);
    } else {
      danger.insertAdjacentHTML('beforeend', '<p>어항을 나가면 이 어항의 내 물고기가 사라져요.</p>');
      b.textContent = '어항 나가기';
      b.addEventListener('click', confirmLeave);
    }
    danger.appendChild(b);
  }

  // ── 확인 대화상자 ──
  /** opts: { title, body(html), ok, requireText, requireLabel, onOk: async () => {} } */
  function confirmAction(opts) {
    const d = $('confirmDialog');
    $('confirmTitle').textContent = opts.title;
    $('confirmBody').innerHTML = opts.body;
    $('confirmOk').textContent = opts.ok;
    $('confirmError').textContent = '';
    const field = $('confirmField');
    const input = $('confirmInput');
    field.hidden = !opts.requireText;
    input.value = '';
    if (opts.requireText) {
      $('confirmLabel').textContent = opts.requireLabel;
      input.placeholder = opts.requireText;
    }
    const okBtn = $('confirmOk');
    okBtn.disabled = !!opts.requireText;
    input.oninput = () => { okBtn.disabled = input.value.trim() !== opts.requireText; };
    $('confirmForm').onsubmit = async (e) => {
      if (!e.submitter || e.submitter.value !== 'ok') return; // 취소는 그냥 닫힘
      e.preventDefault();
      okBtn.disabled = true;
      try {
        await opts.onOk(input.value.trim());
        d.close();
      } catch (ex) {
        $('confirmError').textContent = ex.message;
        okBtn.disabled = !!opts.requireText && input.value.trim() !== opts.requireText;
      }
    };
    d.showModal();
    (opts.requireText ? input : $('confirmForm').querySelector('[value=cancel]')).focus();
  }

  function goToList(message) {
    try { sessionStorage.setItem('aquabit.notice', message); } catch (e) { /* 무시 */ }
    location.replace('/community/tanks.html');
  }

  function confirmTransfer(m) {
    confirmAction({
      title: '대표 넘기기',
      body: `<p><b>${esc(m.nickname)}</b>님에게 대표를 넘길까요?</p>
        <ul><li>과제 등록, 승인, 반려는 이제 ${esc(m.nickname)}님이 해요.</li>
        <li>${esc(m.nickname)}님이 맡고 있던 끝나지 않은 과제는 지워져요.</li>
        <li>넘긴 뒤에는 나도 일반 팀원이 되어 어항을 나갈 수 있어요.</li></ul>`,
      ok: '대표 넘기기',
      onOk: async () => {
        await Aqua.api(`/tanks/${tankId}/transfer`, { method: 'POST', body: { userId: m.userId } });
        $('teamDialog').close();
        toast(`<b>${esc(m.nickname)}</b>님에게 대표를 넘겼어요.`);
        await loadTank(false);
        if (window.AquaTasks) window.AquaTasks.refresh();
      },
    });
  }

  function confirmLeave() {
    const mf = myFish();
    confirmAction({
      title: '어항 나가기',
      body: `<p><b>${esc(state.tank.name)}</b> 어항을 나갈까요?</p>
        <ul><li>이 어항의 내 물고기${mf ? ` <b>${esc(mf.name)}</b>${Aqua.josa(mf.name, '이', '가').slice(mf.name.length)}` : '가'} 사라져요. 다시 들어오면 아기 물고기부터 시작해요.</li>
        <li>내가 맡은 과제 중 끝나지 않은 것은 지워져요.</li>
        <li>진주, 먹이, 장신구, 진주 내역은 그대로 남아요.</li></ul>`,
      ok: '나가기',
      onOk: async () => {
        await Aqua.api(`/tanks/${tankId}/leave`, { method: 'POST' });
        goToList(`${state.tank.name} 어항에서 나왔어요.`);
      },
    });
  }

  function confirmDelete() {
    confirmAction({
      title: '어항 삭제',
      body: `<p><b>${esc(state.tank.name)}</b> 어항을 삭제할까요? <b>되돌릴 수 없어요.</b></p>
        <ul><li>팀원 ${state.members.length}명의 물고기, 채팅, 과제가 모두 지워져요.</li>
        <li>각자의 진주, 먹이, 장신구와 진주 내역은 남아요.</li></ul>`,
      ok: '삭제하기',
      requireText: state.tank.name,
      requireLabel: '확인을 위해 어항 이름을 입력해 주세요',
      onOk: async (typed) => {
        await Aqua.api(`/tanks/${tankId}`, { method: 'DELETE', body: { confirmName: typed } });
        goToList(`${state.tank.name} 어항을 삭제했어요.`);
      },
    });
  }
  $('actTeam').addEventListener('click', () => { setFeedMode(false); renderTeam(); $('teamDialog').showModal(); });
  $('copyInvite').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(state.tank.inviteCode); e.target.textContent = '복사됨'; }
    catch (ex) { e.target.textContent = '직접 복사'; }
    setTimeout(() => { e.target.textContent = '복사'; }, 1500);
  });

  // ── 설정 ──
    $('settingsBtn').addEventListener('click', () => { setFeedMode(false); $('soundToggle').checked = Fx.soundOn(); $('settingsDialog').showModal(); });
  $('soundToggle').addEventListener('change', (e) => Fx.setSound(e.target.checked));
  $('logoutBtn').addEventListener('click', Aqua.logout);

  // 시트 공통: 닫기 버튼, 바깥 클릭
  document.querySelectorAll('dialog.sheet').forEach((d) => {
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
    d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  });

  // ── 채팅 ──
  const chatList = $('chatList');
  function appendMessages(msgs) {
    if (!msgs.length) return;
    const atBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight < 40;
    chatList.querySelector('.chat-empty')?.remove();
    for (const m of msgs) {
      if (m.id <= state.lastMsgId) continue;
      state.lastMsgId = m.id;
      const li = document.createElement('li');
      li.className = 'chat-msg' + (m.isAdmin ? ' notice' : m.userId === user.id ? ' me' : '');
      li.innerHTML = `<span class="who">${m.isAdmin ? '공지' : esc(m.nickname)}</span>${esc(m.body)}<time datetime="${m.createdAt}">${Aqua.fmtTime(m.createdAt)}</time>`;
      chatList.appendChild(li);
      if (!state.chatOpen && m.userId !== user.id && state.chatLoaded) state.unread++;
      // 새로 온 채팅은 보낸 사람 물고기 위에 말풍선으로 (처음 불러온 기록은 제외)
      if (state.chatLoaded) {
        const f = state.fish.find((x) => x.userId === m.userId);
        if (f) scene.say(f.id, m.body);
      }
    }
    while (chatList.children.length > 200) chatList.firstChild.remove();
    if (atBottom || msgs.some((m) => m.userId === user.id)) chatList.scrollTop = chatList.scrollHeight;
    renderUnread();
  }
  async function pollChat() {
    try {
      const { messages } = await Aqua.api(`/tanks/${tankId}/messages${state.lastMsgId ? `?after=${state.lastMsgId}` : ''}`);
      if (!state.lastMsgId && !messages.length) chatList.innerHTML = '<li class="chat-empty">아직 대화가 없어요. 먼저 인사해 보세요.</li>';
      appendMessages(messages);
      state.chatLoaded = true; // 처음 불러온 기록은 '안 읽음'으로 세지 않는다
    } catch (e) { /* 다음에 다시 */ }
  }
  $('chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('chatInput');
    const body = input.value.trim();
    if (!body) return;
    input.value = '';
    try {
      const { message } = await Aqua.api(`/tanks/${tankId}/messages`, { method: 'POST', body: { body } });
      appendMessages([message]);
    } catch (ex) {
      input.value = body;
      toast(esc(ex.message));
    }
  });
  function setChatOpen(open) {
    state.chatOpen = open;
    $('chat').dataset.open = String(open);
    $('chatToggle').setAttribute('aria-expanded', String(open));
    $('chatTab').hidden = open;
    if (open) { state.unread = 0; chatList.scrollTop = chatList.scrollHeight; }
    renderUnread();
    try { localStorage.setItem('aquabit.chatOpen', open ? '1' : '0'); } catch (e) { /* 무시 */ }
  }
  function renderUnread() {
    const b = $('chatUnread');
    b.hidden = state.unread === 0;
    b.textContent = state.unread > 99 ? '99+' : state.unread;
  }
  $('chatToggle').addEventListener('click', () => setChatOpen(false));
  $('chatTab').addEventListener('click', () => { setChatOpen(true); $('chatInput').focus(); });
  let savedOpen = null;
  try { savedOpen = localStorage.getItem('aquabit.chatOpen'); } catch (e) { /* 무시 */ }
  setChatOpen(window.innerWidth > 760 && savedOpen !== '0');

  // ── 출석 ──
  async function checkAttendance() {
    try {
      const r = await Aqua.api('/me/attendance', { method: 'POST' });
      if (!r.awarded) return;
      state.wallet.attendance = { checkedToday: true, streak: r.streak };
      const from = await Fx.attendancePopup(r);
      rewardPearls(from, r.reward + r.bonus, r.pearls);
    } catch (e) { /* 출석 실패는 조용히 */ }
  }

  // ── 실시간 (4단계에서 Socket.IO를 붙이면 폴링 간격이 늘어난다) ──
  function realtimeOn() { return !!(window.AquaRealtime && window.AquaRealtime.connected()); }

  // 다른 파일(과제 보드, 실시간)에서 쓰는 도구
  window.AquaTank = {
    showFeedNotice,
    state, scene, toast, esc, loadTank, loadWallet, upsertFish, appendMessages, rewardPearls,
    setPearls, setFood, renderTaskBadge, nickOf, fishById, tankId, user, goToList,
  };

  // ── 시작 ──
  await Promise.all([loadTank(true), loadWallet()]);
  await pollChat();
  checkAttendance();
  setInterval(() => { if (!realtimeOn()) pollChat(); }, 2000);
  setInterval(() => { if (!realtimeOn()) { loadTank(false); loadWallet(); } }, 5000);
  // 실시간이어도 배고픔/시무룩은 시간이 지나 바뀌므로 가끔 새로 고친다
  setInterval(() => { if (realtimeOn()) loadTank(false); }, 30000);
  window.AquaTank.ready = true;
  document.dispatchEvent(new CustomEvent('aquatank:ready'));
})();
