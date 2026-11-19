// GitHub의 팀 UI와 현재 Vue/PixiJS 어항 사이의 연결 계층.
// 서버의 숫자 ID·색 이름·아이템을 렌더러의 PNG 종·색조·장식으로 변환합니다.
import { createApp, h, ref } from 'vue';
import AquariumMaterials from './components/AquariumMaterials.vue';
import CommunicationPanel from './components/CommunicationPanel.vue';
import { createAquarium } from './aquarium/createAquarium.js';
import { normalizeEnvironment } from './domain/environment.mjs';
import { species, originalHue, spriteFrames, resolveSpecies } from './domain/fish.mjs';
import { gameAssetUrl } from './asset-url.js';
import './community.css';
import { feedingBlockReason, dispenseFeedBatch } from './domain/feeding.mjs';

const imageFiles = [...new Set([...Object.keys(species).flatMap(key => spriteFrames(key).map(file => file.slice(7, -4))),
  'accessory-bow', 'accessory-flower', 'accessory-crown', 'food-can', 'food-pellet',
  'icon-fish', 'icon-tank', 'icon-info', 'icon-mail', 'icon-mailbox', 'icon-chat', 'icon-close', 'icon-pause', 'icon-play'])];
const images = {};
await Promise.all(imageFiles.map(async name => {
  const image = new Image(); image.src = gameAssetUrl(`assets/${name}.png`); await image.decode(); images[name] = image;
}));
function script(src) {
  return new Promise((resolve, reject) => {
    const node = document.createElement('script'); node.src = src + '?v=' + __COMMUNITY_BUILD_VERSION__; node.onload = resolve;
    node.onerror = () => reject(new Error('게임 파일을 불러오지 못했어요.')); document.head.append(node);
  });
}
await script('/community/js/api.js');
window.Aqua.feedingBlockReason = feedingBlockReason;
await script('/community/js/preview.js');
await script('/community/js/pixel-art.js');
const PA = window.PixelArt;
const hues = { orange: 24, coral: 340, lemon: 55, mint: 155, sky: 200, grape: 266 };
const accessories = { ribbon: 'bow', hat: 'flower', crown: 'crown' };
function kind(f) { return resolveSpecies(f.species); }
function appearance(f) {
  const key = kind(f);
  return { id: String(f.id), name: f.ownerNickname === '나' ? '내 물고기' : f.ownerNickname || f.name || '', species: key,
    hue: f.hue ?? (f.color === 'original' ? originalHue[key] : hues[f.color] ?? originalHue[key]),
    xp: (f.foodTotal || 0) * 5, displayLevel: f.stage || 1, accessory: accessories[f.accessory] || 'none', effect: 'none' };
}
const spriteCache = new Map();
PA.SPECIES = Object.fromEntries(Object.entries(species).map(([key, label]) => [key, { label }]));
PA.resolveSpecies = resolveSpecies;
PA.COLORS = { original: { label: '원본', b: '#eaf6ff' }, ...PA.COLORS };
PA.ACCESSORIES.hat.label = '꽃';
PA.STAGE_SCALE = [1, 1, 1, 1, 1];
PA.STAGE_NAMES = ['', 'Lv.1', 'Lv.2', 'Lv.3', 'Lv.4'];
PA.fishSprite = (f = {}) => {
  const key = [kind(f), f.frame % 2 || 0, f.color || 'original', f.hue ?? '', f.accessory || ''].join(':');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const canvas = document.createElement('canvas'); canvas.width = 80; canvas.height = 50;
  const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
  if (f.hue !== null && f.hue !== undefined || f.color && f.color !== 'original') ctx.filter = `hue-rotate(${(f.hue ?? hues[f.color] ?? originalHue[kind(f)]) - originalHue[kind(f)]}deg)`;
  const bodyImage = images[spriteFrames(kind(f))[f.frame % 2 || 0].slice(7, -4)];
  const bodyScale = Math.min(80 / bodyImage.width, 50 / bodyImage.height);
  const bodyWidth = bodyImage.width * bodyScale, bodyHeight = bodyImage.height * bodyScale;
  ctx.drawImage(bodyImage, (80 - bodyWidth) / 2, (50 - bodyHeight) / 2, bodyWidth, bodyHeight);
  ctx.filter = 'none';
  if (accessories[f.accessory]) ctx.drawImage(images['accessory-' + accessories[f.accessory]], 0, kind(f) === 'shrimp' ? 9 : 0, 80, 50);
  const sprite = { canvas, bodyTop: 0, bodyH: 50, w: 80, h: 50 };
  spriteCache.set(key, sprite); return sprite;
};
PA.previewCanvas = (f, scale = 2, frame = 0) => {
  const sprite = PA.fishSprite({ ...f, frame });
  const canvas = document.createElement('canvas');
  canvas.width = 80 * Math.min(scale, 2); canvas.height = 50 * Math.min(scale, 2);
  canvas.getContext('2d').imageSmoothingEnabled = false;
  canvas.getContext('2d').drawImage(sprite.canvas, 0, 0, canvas.width, canvas.height);
  canvas.className = 'pixel-canvas'; return canvas;
};
const originalIcon = PA.iconCanvas;
PA.iconCanvas = (name, scale) => {
  const key = { ribbon: 'accessory-bow', hat: 'accessory-flower', crown: 'accessory-crown',
    food: 'food-pellet', brush: 'icon-fish', gear: 'icon-tank', chat: 'icon-chat' }[name];
  if (!key) return originalIcon(name, scale);
  const canvas = document.createElement('canvas'), image = images[key];
  const accessory = name in accessories;
  canvas.width = accessory ? 48 : Math.min(48, image.width * scale); canvas.height = accessory ? 32 : Math.min(48, image.height * scale);
  canvas.getContext('2d').imageSmoothingEnabled = false;
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  canvas.className = 'pixel-canvas'; canvas.setAttribute('aria-hidden', 'true'); return canvas;
};

class IntegratedTankScene {
  constructor(host, opts = {}) {
    this.host = host; this.opts = opts; this.list = []; this.disposed = false;
    let savedEnvironment;
    try { savedEnvironment = JSON.parse(localStorage.getItem('aquabit-community-environment')) || JSON.parse(localStorage.getItem('aquabit-game-v1'))?.environment; } catch {}
    this.environment = ref(normalizeEnvironment(savedEnvironment));
    this.paused = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.mailPanel = ref();
    this.vue = createApp({ render: () => h('div', { class: 'integrated-scene' }, [
      h(AquariumMaterials, { environment: this.environment.value, paused: this.paused.value }, { default: () => h('div', { class: 'integrated-fish', ref: node => { this.fishHost = node; } }) }),
      ...(opts.interactive === false ? [] : [h(CommunicationPanel, { ref: this.mailPanel, nickname: window.AquaTank?.user.nickname || '내 물고기', chatRequest: async (path, payload) => {
        const T = window.AquaTank;
        if (!T) return { messages: [] };
        const view = message => ({ id: message.id, name: message.nickname, text: message.body, createdAt: message.createdAt, own: message.userId === T.user.id });
        if (payload) {
          const result = await window.Aqua.api(`/tanks/${T.tankId}/messages`, { method: 'POST', body: { body: payload.text } });
          T.appendMessages([result.message]); return { message: view(result.message) };
        }
        const result = await window.Aqua.api(`/tanks/${T.tankId}/messages` + (path.includes('?') ? '?' + path.split('?')[1] : ''));
        return { messages: result.messages.map(view) };
      } })]),
    ]) });
    this.vue.mount(host);
    this.ready = createAquarium(this.fishHost, {
      showcase: opts.interactive === false,
      canInsetRight: () => host.clientWidth > 760 ? 340 : 0,
      onSelect: id => {
        const selected = this.list.find(f => String(f.id) === id);
        if (!selected) return;
        clearTimeout(this.selectionTimer);
        // 정보 카드가 두 번째 클릭을 가리지 않도록 더블클릭 판정 후 표시합니다.
        if (selected.userId !== window.AquaTank?.user.id) this.selectionTimer = setTimeout(() => opts.onFishClick?.(selected), 460);
        else opts.onFishClick?.(selected);
      },
      onDoubleSelect: id => {
        clearTimeout(this.selectionTimer);
        const T = window.AquaTank, selected = this.list.find(f => String(f.id) === id);
        if (selected && selected.userId !== T?.user.id) {
          document.getElementById('fishCard').hidden = true;
          document.getElementById('chatTab').click();
          document.getElementById('chatInput').focus({ preventScroll: true });
        }
      },
      onFeeding() {}, onEat() {},
      canDispense: () => {
        const T = window.AquaTank, fish = T?.state.fish.find(f => f.userId === T.user.id);
        return T && fish ? feedingBlockReason({ foodCount: T.state.wallet.inventory.food, fedToday: fish.fedToday, dailyFeedLimit: fish.dailyFeedLimit }) : '';
      },
      onFeedBlocked: reason => window.AquaTank?.showFeedNotice(reason),
      onDispense: async count => {
        const T = window.AquaTank, fish = this.list.find(f => f.userId === T?.user.id);
        if (!fish) return { dispensed: 0, foodCount: 0 };
        return dispenseFeedBatch({ count,
          getState: () => ({ foodCount: T.state.wallet.inventory.food, ...T.state.fish.find(f => f.id === fish.id) }),
          feed: () => window.Aqua.api(`/tanks/${T.tankId}/fish/${fish.id}/feed`, { method: 'POST', body: {} }),
          onResult: result => { T.setFood(result.food); T.upsertFish(result.fish); },
          onBlocked: reason => T.showFeedNotice(reason),
        });
      },
    }).then(engine => { if (this.disposed) { engine.destroy(); return; } this.engine = engine; this.sync(); });
    this.pointerDown = event => { clearTimeout(this.selectionTimer); this.down = { x: event.clientX, y: event.clientY }; };
    this.pointerUp = event => {
      const T = window.AquaTank;
      if (!T?.state.feedMode || !this.down || Math.hypot(event.clientX - this.down.x, event.clientY - this.down.y) > 6) return;
      const bounds = host.getBoundingClientRect(); opts.onWaterClick?.(event.clientX - bounds.left, event.clientY - bounds.top);
    };
    host.addEventListener('pointerdown', this.pointerDown); host.addEventListener('pointerup', this.pointerUp);
  }
  sync() {
    const T = window.AquaTank;
    this.engine?.setEnvironment(this.environment.value);
    this.engine?.setPaused(this.paused.value);
    this.engine?.update(this.list.map(appearance), String(this.list.find(f => f.userId === T?.user.id)?.id || ''), []);
    this.engine?.setFoodCount(T?.state.wallet.inventory.food || 0);
  }
  setFish(fish) { this.list = fish; this.sync(); }
  start() {}
  fishScreenPos(id) { return this.engine?.fishScreenPos(String(id)) || { x: innerWidth / 2, y: innerHeight / 2 }; }
  dropFood(x, y, id, callback) { this.ready.then(() => this.engine?.dropFood(x, y, callback)); }
  say(id, text) { window.AquaTank?.toast(window.Aqua.escapeHtml(this.list.find(f => f.id === id)?.ownerNickname || '') + ': ' + window.Aqua.escapeHtml(text)); }
  sparkleBurst() {}
  flash() {}
  destroy() { this.disposed = true; clearTimeout(this.selectionTimer); this.engine?.destroy(); this.vue.unmount(); this.host.removeEventListener('pointerdown', this.pointerDown); this.host.removeEventListener('pointerup', this.pointerUp); }
}
window.TankScene = IntegratedTankScene;
await script('/community/js/fx.js');
const page = document.body.dataset.communityPage;
await script(`/community/js/pages/${page}.js`);
if (page === 'tank') {
  await script('/community/js/pages/tasks-board.js');
  const settings = document.querySelector('#settingsDialog .sheet-inner');
  const options = document.createElement('div'); options.className = 'community-plant-options';
  for (const [key, label] of Object.entries({ aquatic: '수초', coral: '산호', tree: '수목' })) {
    const button = document.createElement('button'); button.type = 'button';
    const image = document.createElement('img'); image.src = gameAssetUrl(`assets/plant-${key}.png`); image.alt = '';
    button.append(image, document.createTextNode(label));
    button.setAttribute('aria-pressed', String(window.aquaScene.environment.value.plant === key));
    button.addEventListener('click', () => {
      window.aquaScene.environment.value = normalizeEnvironment({ ...window.aquaScene.environment.value, plant: key });
      localStorage.setItem('aquabit-community-environment', JSON.stringify(window.aquaScene.environment.value));
      options.querySelectorAll('button').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
    }); options.append(button);
  }
  settings.insertBefore(options, settings.querySelector('.settings-links'));
  for (const [key, label] of [['sway', '수초 흔들림'], ['bubbles', '기포'], ['lighting', '수중 햇살'], ['paused', '움직임 멈추기']]) {
    const field = document.createElement('label'); field.className = 'toggle';
    const input = document.createElement('input'); input.type = 'checkbox';
    input.checked = key === 'paused' ? window.aquaScene.paused.value : window.aquaScene.environment.value[key];
    input.addEventListener('change', () => {
      const scene = window.aquaScene;
      if (key === 'paused') { scene.paused.value = input.checked; scene.engine?.setPaused(input.checked); }
      else { scene.environment.value = normalizeEnvironment({ ...scene.environment.value, [key]: input.checked }); scene.engine?.setEnvironment(scene.environment.value); localStorage.setItem('aquabit-community-environment', JSON.stringify(scene.environment.value)); }
    });
    field.append(input, document.createTextNode(label)); settings.insertBefore(field, settings.querySelector('.settings-links'));
  }
  for (const [key, label, type] of [['lightColor', '빛 색상', 'color'], ['lightStrength', '빛 세기', 'range']]) {
    const field = document.createElement('label'); field.className = 'field'; field.textContent = label;
    const input = document.createElement('input'); input.type = type; input.value = window.aquaScene.environment.value[key];
    if (type === 'range') { input.min = 0; input.max = 100; }
    input.addEventListener('input', () => {
      window.aquaScene.environment.value = normalizeEnvironment({ ...window.aquaScene.environment.value, [key]: type === 'range' ? Number(input.value) : input.value });
      window.aquaScene.engine?.setEnvironment(window.aquaScene.environment.value);
      localStorage.setItem('aquabit-community-environment', JSON.stringify(window.aquaScene.environment.value));
    }); field.append(input); settings.insertBefore(field, settings.querySelector('.settings-links'));
  }
  const mailButton = document.createElement('button'); mailButton.className = 'community-mail btn'; mailButton.type = 'button';
  const image = document.createElement('img'); image.src = gameAssetUrl('assets/icon-mailbox.png'); image.alt = ''; image.width = image.height = 32;
  mailButton.append(image); mailButton.setAttribute('aria-label', '사내 메일');
  mailButton.addEventListener('click', () => window.aquaScene?.mailPanel.value?.open({ tab: 'mail' })); document.body.append(mailButton);
  if (!window.Aqua.preview) {
    const health = await fetch('/api/game/health').then(response => response.json());
    if (health.databaseEnabled) { await script('/game-socket.io/socket.io.js'); await script('/community/js/realtime.js'); }
  }
}
