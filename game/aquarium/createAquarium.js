import 'pixi.js/unsafe-eval'; // CSP를 완화하지 않고 정적 셰이더 동기화 코드를 사용합니다.
import { Application, Assets, BlurFilter, ColorMatrixFilter, Container, Rectangle, Sprite, Text } from 'pixi.js';
import { GlowFilter } from 'pixi-filters/glow';
import { AquariumSimulation, shrimpGroundY, isBottomSpecies, fishDisplayWidth } from './simulation.mjs';
import { SpriteAnimation } from './sprite-animation.mjs';
import { species, spriteFrames, spriteLayers } from '../domain/fish.mjs';
import growth from '../domain/growth.mjs';
import { fishGlowColor, hueMatrix } from '../domain/color.mjs';
import { normalizeEnvironment } from '../domain/environment.mjs';
import { BubbleField } from './bubbles.mjs';
import { gameAssetUrl } from '../asset-url.js';

const assetUrl = gameAssetUrl;
const textStyle = { fontFamily: 'Malgun Gothic, sans-serif', fontSize: 10, fill: '#e3f6ff',
  stroke: { color: '#0b1d3a', width: 3 } };

// 입력: 직렬화 가능한 물고기 목록 / 출력: 선택·먹이 이벤트만 전달합니다.
// API 호출, 로그인, localStorage, 경험치 계산은 이 렌더러의 책임이 아닙니다.
export async function createAquarium(host, { onSelect, onDoubleSelect, onEat, onDispense, onFeeding, canDispense, onFeedBlocked, canInsetRight = () => 0, showcase = false }) {
  const app = new Application();
  await app.init({ width: host.clientWidth, height: host.clientHeight, backgroundAlpha: 0,
    antialias: false, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl', roundPixels: true });

  const files = [...new Set(['bubble', 'bubble-dot', 'food-can', 'food-pellet', 'effect-sparkle',
    ...Object.keys(species).flatMap(key => spriteFrames(key).map(file => file.slice(7, -4))), 'accessory-bow', 'accessory-crown', 'accessory-flower'])];
  let textures;
  try {
    const loaded = await Assets.load(files.map(name => assetUrl(`assets/${name}.png`)));
    textures = Object.fromEntries(files.map(name => {
      const texture = loaded[assetUrl(`assets/${name}.png`)];
      texture.source.scaleMode = 'nearest';
      return [name, texture];
    }));
  } catch (error) {
    app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false, textureSource: false });
    throw error;
  }

  host.append(app.canvas);
  host.dataset.renderer = 'pixi';
  if (showcase) {
    app.canvas.setAttribute('role', 'img');
    app.canvas.setAttribute('aria-label', '우리 어항에서 불러온 물고기');
    app.stage.eventMode = 'none';
  } else {
    app.canvas.setAttribute('aria-label', '물고기와 밥통을 끌어 움직이는 픽셀 어항. 내 물고기를 누르면 꾸미기, 다른 물고기를 더블클릭하면 오른쪽 채팅창을 열어요.');
    app.canvas.style.touchAction = 'none';
  }
  const fishNodes = new Map(), pelletNodes = new Map(), popups = [];
  const foodCallbacks = new Map();
  const bubbleNodes = new Map(), bubbleField = new BubbleField();
  let environment = normalizeEnvironment();
  const inhabitants = new Container({ label: 'inhabitants' });
  const controls = new Container({ label: 'feeding controls', visible: !showcase });
  const bubbles = new Container();
  const ambient = new Container({ eventMode: 'none' });
  const ambientBubbles = Array.from({ length: 22 }, (_, index) => {
    const image = new Sprite(textures['bubble-dot']);
    image.anchor.set(.5);
    image.width = image.height = 5;
    image.alpha = index % 3 === 0 ? .65 : .35;
    ambient.addChild(image);
    return { image, x: ((index * .61803398875) % 1), phase: (index * .137) % 1,
      speed: 15 + index % 6 * 3 };
  });
  let sceneryTime = 0;
  const fishHalos = new Container(), fishes = new Container(), foods = new Container(), feedback = new Container();
  const can = new Sprite(textures['food-can']);
  can.anchor.set(.5);
  can.eventMode = 'static'; can.cursor = 'grab';
  inhabitants.addChild(ambient, fishHalos, fishes, foods, bubbles);
  controls.addChild(can, feedback);
  app.stage.addChild(inhabitants, controls);
  const model = new AquariumSimulation({ onDispense, canDispense, onFeedBlocked, onEat(id, position, pelletId) {
    const callback = foodCallbacks.get(pelletId);
    foodCallbacks.delete(pelletId);
    callback?.();
    Promise.resolve(onEat(id)).then(reward => {
      if (disposed || !reward?.gained) return;
      const text = new Text({ text: reward.leveledUp ? reward.after.name + '!' : '+' + reward.gained + ' XP', style: textStyle });
      text.anchor.set(.5);
      text.position.set(position.x, position.y);
      feedback.addChild(text);
      popups.push({ text, born: model.time, y: position.y });
    }).catch(() => {}); // 실패 안내는 Vue의 저장 계층에서 처리합니다.
  } });
  let disposed = false, feedingState = '', pointerId;

  function startDrag(kind, id, event) {
    if (showcase) return;
    if (event.button !== 0 || !model.pick(kind, id, event.global, event.pointerId)) return;
    pointerId = event.pointerId;
    app.canvas.setPointerCapture?.(pointerId);
  }
  can.on('pointerdown', event => startDrag('food', null, event));
  function pointerPosition(event) {
    const rect = app.canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * app.screen.width / rect.width,
      y: (event.clientY - rect.top) * app.screen.height / rect.height };
  }
  function move(event) { model.move(pointerPosition(event), event.pointerId); }
  let lastClick = null;
  function finish(event) {
    if (event && pointerId !== event.pointerId) return;
    const selected = model.release(pointerId);
    if (pointerId !== undefined && app.canvas.hasPointerCapture?.(pointerId)) app.canvas.releasePointerCapture(pointerId);
    pointerId = undefined;
    if (selected && event?.type !== 'pointercancel' && event?.type !== 'lostpointercapture') {
      const now = performance.now();
      if (lastClick?.id === selected && now - lastClick.time <= 450) {
        lastClick = null;
        onDoubleSelect?.(selected);
      } else {
        lastClick = { id: selected, time: now };
        onSelect(selected);
      }
    } else lastClick = null;
  }
  const cancel = () => { model.release(); pointerId = undefined; lastClick = null; };
  const hidden = () => { if (document.hidden) cancel(); };
  app.canvas.addEventListener('pointermove', move);
  app.canvas.addEventListener('pointerup', finish);
  app.canvas.addEventListener('pointercancel', finish);
  app.canvas.addEventListener('lostpointercapture', finish);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', hidden);

  function resize() {
    if (disposed) return;
    app.renderer.resize(host.clientWidth, host.clientHeight);
    model.resize(app.screen.width, app.screen.height, showcase);
    model.can.x = Math.max(model.view.canRadius + 12, Math.min(model.can.x, app.screen.width - canInsetRight() - model.view.canRadius - 12));
    can.width = model.view.canWidth; can.height = model.view.canHeight;
    for (const node of fishNodes.values()) sizeFish(node);
  }
  function sizeFish(node) {
    const width = fishDisplayWidth(model.view, node.species);
    if (node.halo) { node.halo.width = width; node.halo.height = width * node.halo.texture.orig.height / node.halo.texture.orig.width; }
    for (const image of node.images) { image.width = width; image.height = width * (image.isCreature ? image.texture.orig.height / image.texture.orig.width : 2 / 3); image.y = image.height * (image.assetOffsetY || 0) / 32; }
    node.root.hitArea = new Rectangle(-width / 2, -width / 3, width, width * 2 / 3 + 33);
    node.name.y = width / 3 + 5;
    node.level.y = width / 3 + 20;
    node.alert.position.set(width / 2 - 3, -width / 3 - 2);
  }
  function makeFish(id) {
    const root = new Container(), body = new Container();
    const name = new Text({ text: '', style: textStyle });
    const level = new Text({ text: '', style: { ...textStyle, fontSize: 8 } });
    const alert = new Text({ text: '!', style: { ...textStyle, fontSize: 25, fontWeight: 'bold', fill: '#ce6256' } });
    name.anchor.set(.5, 0); level.anchor.set(.5, 0); alert.anchor.set(.5);
    root.addChild(body, name, level, alert);
    root.eventMode = 'static'; root.cursor = 'grab';
    root.on('pointerdown', event => startDrag('fish', id, event));
    fishes.addChild(root);
    const node = { root, body, name, level, alert, images: [], filters: [], key: '', effect: null, halo: null, animation: null, previousX: null };
    fishNodes.set(id, node);
    return node;
  }
  function clearImages(node) {
    node.halo?.destroy(); node.halo = null;
    for (const image of node.images) image.destroy();
    for (const filter of node.filters) filter.destroy();
    node.images = []; node.filters = []; node.effect = null; node.animation = null;
  }
  function update(list, viewerId, unreadIds) {
    if (disposed) return;
    model.setViewer(viewerId);
    model.setFish(list);
    bubbleField.syncFish(list.map(f => f.id));
    for (const [id, node] of fishNodes) if (!model.fish.has(id)) {
      clearImages(node); node.root.destroy({ children: true }); fishNodes.delete(id);
    }
    for (const fish of list) {
      const node = fishNodes.get(fish.id) || makeFish(fish.id);
      node.species = fish.species;
      const layers = spriteLayers(fish), key = JSON.stringify(layers);
      if (node.key !== key) {
        clearImages(node);
        for (const layer of layers) {
          const textureName = layer.src.slice(7, -4);
          const image = new Sprite(textures[textureName]);
          image.assetOffsetY = layer.offsetY || 0;
          image.anchor.set(.5);
          if (layer.kind === 'fish') {
            image.isCreature = true;
            node.animation = { image, frames: spriteFrames(fish.species).map(src => textures[src.slice(7, -4)]), clock: new SpriteAnimation(fish.species) };
            const color = new ColorMatrixFilter(); color.matrix = hueMatrix(layer.hue);
            image.filters = [color]; node.filters.push(color);
            // 원본 몸 PNG로 빛만 별도 생성하므로 도트·장식·닉네임은 흐려지지 않습니다.
            const halo = new Sprite(textures[textureName]);
            halo.anchor.set(.5); halo.eventMode = 'none';
            const glow = new GlowFilter({ distance: 8, outerStrength: .8, innerStrength: 0,
              color: fishGlowColor(fish), alpha: .12, quality: .15, knockout: true });
            const soft = new BlurFilter({ strength: 1, quality: 1 });
            halo.filters = [glow, soft];
            node.filters.push(glow, soft); node.halo = halo;
            fishHalos.addChild(halo);
          }
          if (layer.kind === 'effect') {
            const color = new ColorMatrixFilter();
            image.filters = [color]; node.filters.push(color);
            node.effect = { image, color, aurora: layer.effect === 'aurora' };
          }
          node.body.addChild(image); node.images.push(image);
        }
        node.key = key;
      }
      node.name.text = fish.name + (fish.id === viewerId ? ' · 나' : '');
      node.level.text = Number.isInteger(fish.displayLevel) ? 'Lv.' + fish.displayLevel : growth.describe(fish.xp).name;
      node.alert.visible = unreadIds.includes(fish.id);
      sizeFish(node);
    }
  }
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function tick(ticker) {
    model.step(ticker.deltaMS);
    if (!model.paused) sceneryTime += Math.min(ticker.deltaMS, 50) / 1000;
    ambient.visible = environment.bubbles;
    const pixel = app.screen.width < 600 ? 4 : 5;
    for (const particle of ambientBubbles) {
      const travel = app.screen.height * .89 + pixel;
      particle.image.width = particle.image.height = pixel;
      particle.image.position.set(
        Math.round(particle.x * app.screen.width / pixel) * pixel,
        Math.floor((app.screen.height * .89 - ((particle.phase * travel + sceneryTime * particle.speed) % travel)) / pixel) * pixel);
    }
    bubbleField.step(ticker.deltaMS, model.fish, model.view, { paused: model.paused, enabled: environment.bubbles });
    const visibleBubbles = new Set();
    let surfaceBubbles = 0;
    for (const bubble of bubbleField.items) {
      const state = bubbleField.frame(bubble), point = model.toScene(state);
      visibleBubbles.add(bubble.id);
      if (state.state !== 'rising') surfaceBubbles++;
      let sprite = bubbleNodes.get(bubble.id);
      if (!sprite) { sprite = new Sprite(textures.bubble); sprite.anchor.set(.5); bubbles.addChild(sprite); bubbleNodes.set(bubble.id, sprite); }
      sprite.position.set(point.x, point.y);
      sprite.width = sprite.height = 16 * state.scale;
      sprite.alpha = state.alpha;
    }
    for (const [id, sprite] of bubbleNodes) if (!visibleBubbles.has(id)) { sprite.destroy(); bubbleNodes.delete(id); }
    const count = String(visibleBubbles.size), waiting = String(surfaceBubbles);
    if (host.dataset.bubbles !== count) host.dataset.bubbles = count;
    if (host.dataset.surfaceBubbles !== waiting) host.dataset.surfaceBubbles = waiting;
    for (const [id, node] of fishNodes) {
      const fish = model.fish.get(id), point = model.toScene(fish);
      const crawling = !isBottomSpecies(fish.species) || (Math.abs(fish.y - shrimpGroundY(model.view, fish.species)) < .00001 &&
        node.previousX !== null && Math.abs(fish.x - node.previousX) > .000001);
      if (node.animation) {
        const { image, frames, clock } = node.animation;
        const frame = clock.step(ticker.deltaMS, { paused: model.paused || reducedMotion, held: fish.held, moving: crawling });
        if (image.texture !== frames[frame]) {
          image.texture = frames[frame];
          if (node.halo) node.halo.texture = frames[frame];
        }
      }
      node.previousX = fish.x;
      node.root.position.set(point.x, point.y);
      node.body.scale.x = fish.vx > 0 ? -1 : 1;
      if (node.halo) { node.halo.position.copyFrom(node.root.position); node.halo.scale.x = Math.abs(node.halo.scale.x) * (fish.vx > 0 ? -1 : 1); }
      if (node.effect) {
        node.effect.image.alpha = reducedMotion ? .8 : .25 + .65 * (1 + Math.sin(model.time / 700)) / 2;
        if (node.effect.aurora) node.effect.color.matrix = hueMatrix(reducedMotion ? 130 : (model.time / 35) % 360);
      }
    }
    const active = new Set();
    for (const pellet of model.pellets) {
      active.add(pellet.id);
      let image = pelletNodes.get(pellet.id);
      if (!image) { image = new Sprite(textures['food-pellet']); foods.addChild(image); pelletNodes.set(pellet.id, image); }
      image.width = image.height = app.screen.width < 600 ? 8 : 10;
      const point = model.toScene(pellet);
      image.position.set(point.x, point.y);
      image.visible = model.time >= pellet.born;
    }
    for (const [id, image] of pelletNodes) if (!active.has(id)) { image.destroy(); pelletNodes.delete(id); }
    can.position.set(model.can.x, model.can.y);
    can.rotation = model.can.ready ? -115 * Math.PI / 180 : (model.drag?.kind === 'food' ? 0 : 12 * Math.PI / 180);
    const feeding = model.drag?.kind === 'food', key = `${feeding}:${model.can.ready}`;
    if (key !== feedingState) { feedingState = key; onFeeding({ active: feeding, ready: model.can.ready }); }
    for (let i = popups.length - 1; i >= 0; i--) {
      const popup = popups[i], progress = (model.time - popup.born) / 1100;
      if (progress >= 1) { popup.text.destroy(); popups.splice(i, 1); }
      else { popup.text.y = popup.y - 28 * progress; popup.text.alpha = 1 - progress; }
    }
  }
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  app.ticker.add(tick);

  return {
    update,
    fishScreenPos(id) {
      const point = model.fish.get(id);
      return point ? model.toScene(point) : { x: app.screen.width / 2, y: app.screen.height / 2 };
    },
    dropFood(x, y, callback) {
      const id = ++model.nextPelletId, start = Math.max(.03, Math.min(.8, y / app.screen.height));
      if (callback) foodCallbacks.set(id, callback);
      model.pellets.push({ id, x: Math.max(.03, Math.min(.97, x / app.screen.width)), y: start, start, born: model.time });
    },
    setFoodCount(value) { model.setFoodCount(value); },
    setPaused(value) { model.paused = value; },
    setEnvironment(value) {
      environment = normalizeEnvironment(value);
      host.dataset.plant = environment.plant;
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      app.ticker.remove(tick);
      cancel();
      app.canvas.removeEventListener('pointermove', move);
      app.canvas.removeEventListener('pointerup', finish);
      app.canvas.removeEventListener('pointercancel', finish);
      app.canvas.removeEventListener('lostpointercapture', finish);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', hidden);
      // 텍스트·필터의 텍스처를 지우기 전에 렌더러의 바인딩부터 해제합니다.
      // 개발 중 Vue가 다시 마운트될 때도 공유 PNG 텍스처는 캐시에 유지합니다.
      const children = app.stage.removeChildren();
      app.destroy({ removeView: true, releaseGlobalResources: false }, { children: true, texture: false, textureSource: false });
      for (const node of fishNodes.values()) clearImages(node);
      for (const child of children) child.destroy({ children: true, texture: false, textureSource: false });
    },
  };
}
