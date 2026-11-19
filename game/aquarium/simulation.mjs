// DOM, Vue, PixiJS, 네트워크와 독립적인 사각 어항 동작입니다.
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
import { initialFoodCount, normalizeFoodCount } from '../domain/food.mjs';

export function pelletGroundY(view) {
  return .89 - (view.width < 600 ? 8 : 10) / 2 / view.height;
}

export function layout(width, height) {
  width = Math.max(1, width); height = Math.max(1, height);
  const mobile = width < 700;
  const fishWidth = Math.min(mobile ? 120 : 180, width * .38, height * .32);
  const canWidth = Math.round(fishWidth * .7), canHeight = canWidth * 1.5;
  const canRadius = Math.hypot(canWidth, canHeight) / 2;
  return { width, height, fishWidth, canWidth, canHeight, canRadius, surfaceY: .025,
    minX: (fishWidth / 2 + 4) / width, maxX: 1 - (fishWidth / 2 + 4) / width,
    minY: (fishWidth / 3 + 4) / height, maxY: 1 - (fishWidth / 3 + 36) / height,
    canX: width - canRadius - 12, canY: height - canRadius - 62 };
}

export function foodMouth(view, can) {
  // 32×48 PNG의 윗쪽 입구를 실제 기울기와 확대 크기로 변환합니다.
  const angle = -115 * Math.PI / 180, capY = -view.canHeight * .42;
  return { x: can.x - capY * Math.sin(angle), y: can.y + capY * Math.cos(angle) };
}

export const fishDisplayWidth = (view, species) => view.fishWidth * (species === 'shrimp' ? .85 : 1);

export function shrimpGroundY(view, species = 'shrimp') {
  // 첨부 그림의 96×64 새우와 64×40 불가사리의 아래쪽 끝을 모래에 맞춥니다.
  const foot = species === 'starfish' ? 16 / 64 : 24 / 96;
  return Math.min(view.maxY, .89 - fishDisplayWidth(view, species) * foot / view.height);
}
export const isBottomSpecies = species => species === 'shrimp' || species === 'starfish';

export function constrainFish(point, view, species = point.species) {
  point.x = clamp(point.x, view.minX, view.maxX);
  point.y = clamp(point.y, view.minY, isBottomSpecies(species) ? shrimpGroundY(view, species) : view.maxY);
  return point;
}

export class AquariumSimulation {
  constructor({ onEat = () => {}, onDispense = null, canDispense = () => '', onFeedBlocked = () => {}, random = Math.random, viewerId = null } = {}) {
    this.onEat = onEat;
    this.random = random;
    this.viewerId = viewerId;
    this.onDispense = onDispense;
    this.canDispense = canDispense; this.onFeedBlocked = onFeedBlocked;
    this.foodCount = initialFoodCount;
    this.dispensing = false;
    this.fish = new Map(); this.pellets = [];
    this.time = 0; this.motionTime = 0; this.nextPelletId = 0;
    this.paused = false; this.drag = null;
    this.resize(1100, 680);
  }

  setViewer(viewerId) {
    if (this.viewerId !== viewerId) this.pellets = [];
    this.viewerId = viewerId;
  }

  setFoodCount(value) { this.foodCount = normalizeFoodCount(value); }

  resize(width, height) {
    const previousWidth = this.view?.width;
    this.view = layout(width, height);
    if (this.drag) this.release();
    this.can = { x: this.view.canX, y: this.view.canY, ready: false };
    for (const fish of this.fish.values()) {
      if (previousWidth) fish.vx *= previousWidth / this.view.width;
      constrainFish(fish, this.view);
      fish.baseY = fish.y;
    }
  }

  setFish(entries) {
    const list = entries.map(entry => typeof entry === 'string' ? { id: entry, species: 'gold' } : entry);
    const ids = list.map(entry => entry.id);
    for (const id of this.fish.keys()) if (!ids.includes(id)) this.fish.delete(id);
    list.forEach(({ id, species = 'gold' }, i) => {
      const existing = this.fish.get(id);
      if (existing) {
        if (existing.species !== species) {
          const direction = existing.vx >= 0 ? 1 : -1;
          existing.species = species;
          existing.vx = direction * existing.speed * (species === 'starfish' ? .12 : species === 'shrimp' ? .38 : 1) / this.view.width;
          existing.amplitude = isBottomSpecies(species) ? 2 : existing.swimAmplitude;
          existing.fallSpeed = 16;
          existing.jumpStartedAt = null;
          constrainFish(existing, this.view);
          existing.baseY = existing.y;
          existing.phase = -this.motionTime / 1000 * existing.frequency;
        }
        return;
      }
      const speed = 42 + this.random() * 28;
      const swimAmplitude = 6 + this.random() * 7;
      const fish = { id, species, speed, swimAmplitude, x: .16 + ((i * .27) % .72), y: [.28, .52, .35, .69][i % 4],
        vx: (i % 2 ? -1 : 1) * speed * (species === 'starfish' ? .12 : species === 'shrimp' ? .38 : 1) / this.view.width,
        baseY: 0, amplitude: isBottomSpecies(species) ? 2 : swimAmplitude, frequency: .8 + this.random() * .6,
        phase: this.random() * Math.PI * 2, held: false, until: 0, lastBite: -Infinity, fallSpeed: 16,
        jumpStartedAt: null, lastJumpPellet: 0, nextJumpAt: 0 };
      if (isBottomSpecies(species)) fish.y = shrimpGroundY(this.view, species);
      constrainFish(fish, this.view); fish.baseY = fish.y;
      this.fish.set(id, fish);
    });
  }

  toNormalized(point) { return { x: point.x / this.view.width, y: point.y / this.view.height }; }
  toScene(point) { return { x: point.x * this.view.width, y: point.y * this.view.height }; }

  pick(kind, id, point, pointerId) {
    if (this.drag) return false;
    const target = kind === 'food' ? this.can : this.fish.get(id);
    if (!target) return false;
    const origin = kind === 'food' ? target : this.toScene(target);
    this.drag = { kind, id, pointerId, start: { ...point }, dx: point.x - origin.x,
      dy: point.y - origin.y, moved: false, nextDrop: this.time };
    if (kind === 'fish') { target.held = true; target.jumpStartedAt = null; }
    return true;
  }

  move(point, pointerId) {
    const drag = this.drag;
    if (!drag || drag.pointerId !== pointerId) return;
    if (Math.hypot(point.x - drag.start.x, point.y - drag.start.y) > 5) drag.moved = true;
    if (drag.kind === 'fish') {
      const fish = this.fish.get(drag.id);
      if (drag.moved) Object.assign(fish, constrainFish(this.toNormalized({ x: point.x - drag.dx, y: point.y - drag.dy }), this.view, fish.species));
    } else {
      const margin = this.view.canRadius + 4;
      this.can.x = clamp(point.x - drag.dx, margin, this.view.width - margin);
      this.can.y = clamp(point.y - drag.dy, margin, this.view.height - margin);
      const p = this.toNormalized(this.can);
      this.can.ready = p.y < .22;
    }
  }

  release(pointerId) {
    const drag = this.drag;
    if (!drag || (pointerId !== undefined && drag.pointerId !== pointerId)) return null;
    let clicked = null;
    if (drag.kind === 'fish') {
      const fish = this.fish.get(drag.id);
      if (fish) {
        fish.held = false; fish.until = this.time + (isBottomSpecies(fish.species) ? 0 : 850);
        fish.fallSpeed = 16;
        fish.baseY = fish.y; fish.phase = -this.motionTime / 1000 * fish.frequency;
        if (!drag.moved) clicked = drag.id;
      }
    }
    this.drag = null;
    this.can = { x: this.view.canX, y: this.view.canY, ready: false };
    return clicked;
  }

  sprinkle() {
    if (this.dispensing || !this.viewerId) return;
    const blocked = this.canDispense() || (this.foodCount <= 0 ? '먹이가 부족해요' : '');
    if (blocked) { this.onFeedBlocked(blocked); return; }
    const mouth = this.toNormalized(foodMouth(this.view, this.can));
    const count = Math.min(3, this.foodCount, 45 - this.pellets.length);
    if (count <= 0) return;
    const spawn = amount => {
      for (let i = 0; i < Math.min(count, amount); i++) {
        const start = clamp(mouth.y, this.view.surfaceY, .35);
        this.pellets.push({ id: ++this.nextPelletId,
          x: clamp(mouth.x + (this.random() - .5) * 18 / this.view.width, 8 / this.view.width, 1 - 8 / this.view.width),
          y: start, start, born: this.time + i * 120, grounded: false });
      }
    };
    if (!this.onDispense) {
      this.foodCount -= count; spawn(count);
      return;
    }
    const owner = this.viewerId;
    this.dispensing = true;
    return Promise.resolve().then(() => this.onDispense(count)).then(result => {
      if (!result || owner !== this.viewerId) return;
      this.setFoodCount(result.foodCount);
      spawn(Math.max(0, Math.floor(Number(result.dispensed) || 0)));
    }).catch(() => {}).finally(() => { this.dispensing = false; });
  }

  step(milliseconds) {
    const dt = clamp(milliseconds, 0, 50);
    if (this.paused) return;
    this.time += dt;
    if (!this.paused) this.motionTime += dt;
    if (this.drag?.kind === 'food' && this.can.ready && this.time >= this.drag.nextDrop) {
      this.sprinkle(); this.drag.nextDrop = this.time + 550;
    }
    for (const f of this.fish.values()) {
      if (f.held || this.paused || this.time < f.until) continue;
      const availablePellets = f.id === this.viewerId ? this.pellets : [];
      if (isBottomSpecies(f.species)) {
        const ground = shrimpGroundY(this.view, f.species);
        if (f.jumpStartedAt !== null) {
          const progress = Math.min(1, (this.time - f.jumpStartedAt) / 900);
          f.y = ground - Math.sin(progress * Math.PI) * Math.min(36, this.view.height * .07) / this.view.height;
          if (progress >= 1) { f.y = ground; f.jumpStartedAt = null; }
          continue;
        }
        if (f.y < ground) {
          // 손에서 놓은 뒤 수직으로 천천히 가라앉고, 모래에 닿으면 멈춥니다.
          f.fallSpeed = Math.min(42, f.fallSpeed + 10 * dt / 1000);
          f.y = Math.min(ground, f.y + f.fallSpeed * dt / 1000 / this.view.height);
          f.baseY = f.y;
          continue;
        }
        f.y = ground; f.baseY = ground;
        if (f.species === 'shrimp' && this.time >= f.nextJumpAt && availablePellets.some(p => p.born <= this.time && !p.grounded && p.id > f.lastJumpPellet)) {
          f.lastJumpPellet = Math.max(...availablePellets.map(p => p.id));
          f.nextJumpAt = this.time + 2200;
          f.jumpStartedAt = this.time;
          continue;
        }
        let meal, distance = Infinity;
        for (const p of availablePellets) {
          if (p.born > this.time || !p.grounded) continue;
          if (Math.abs(p.x - f.x) < distance) { meal = p; distance = Math.abs(p.x - f.x); }
        }
        if (meal && distance * this.view.width > 2) f.vx = Math.sign(meal.x - f.x) * Math.abs(f.vx);
        const x = f.x + (meal && distance * this.view.width <= 2 ? 0 : f.vx * dt / 1000);
        f.x = x; constrainFish(f, this.view);
        if (f.x !== x) f.vx *= -1;
        continue;
      }
      let target, nearest = Infinity;
      for (const p of availablePellets) {
        if (p.born > this.time) continue;
        const distance = Math.hypot((p.x - f.x) * this.view.width, (p.y - f.y) * this.view.height);
        if (distance < nearest) { nearest = distance; target = p; }
      }
      if (target && this.time - f.lastBite > 180) {
        const dx = (target.x - f.x) * this.view.width, dy = (target.y - f.y) * this.view.height;
        if (nearest > .1) {
          const step = Math.min(nearest, 155 * dt / 1000);
          f.x += dx / nearest * step / this.view.width;
          f.y += dy / nearest * step / this.view.height;
          if (Math.abs(dx) > 2) f.vx = (dx >= 0 ? 1 : -1) * Math.abs(f.vx);
        }
        constrainFish(f, this.view);
        f.baseY = f.y; f.phase = -this.motionTime / 1000 * f.frequency;
      } else {
        const x = f.x + f.vx * dt / 1000;
        f.x = x;
        f.y = f.baseY + Math.sin(this.motionTime / 1000 * f.frequency + f.phase) * f.amplitude / this.view.height;
        constrainFish(f, this.view);
        if (f.x !== x) f.vx *= -1;
      }
    }
    this.pellets = this.pellets.filter(p => {
      const age = this.time - p.born;
      if (age < 0) return true;
      const ground = pelletGroundY(this.view);
      p.grounded = age >= 6000 || p.grounded;
      p.y = p.grounded ? ground : p.start + (ground - p.start) * Math.min(1, age / 6000);
      const rx = this.view.fishWidth * .31 / this.view.width;
      const ry = this.view.fishWidth * 2 / 3 * .32 / this.view.height;
      let winner, best = Infinity;
      for (const fish of this.fish.values()) {
        if (fish.id !== this.viewerId || fish.held || this.time - fish.lastBite < 220) continue;
        if (isBottomSpecies(fish.species) && (!p.grounded || fish.jumpStartedAt !== null || Math.abs(fish.y - shrimpGroundY(this.view, fish.species)) > .00001)) continue;
        const distance = ((p.x - fish.x) / rx) ** 2 + (isBottomSpecies(fish.species) ? 0 : ((p.y - fish.y) / ry) ** 2);
        if (distance <= 1 && distance < best) { winner = fish; best = distance; }
      }
      if (!winner) return true;
      winner.lastBite = this.time;
      this.onEat(winner.id, this.toScene(p), p.id);
      return false;
    });
  }
}
