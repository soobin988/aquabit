export const bubbleInterval = 3000;
export const surfaceWait = 4000;
export const burstDuration = 280;
export const surfaceY = .025;

// 시간·상태만 관리합니다. PixiJS나 백엔드 저장과는 독립적입니다.
export class BubbleField {
  constructor(random = Math.random) {
    this.random = random;
    this.time = 0;
    this.nextId = 0;
    this.nextEmissions = new Map();
    this.items = [];
  }

  syncFish(ids) {
    for (const id of this.nextEmissions.keys()) if (!ids.includes(id)) this.nextEmissions.delete(id);
    for (const id of ids) if (!this.nextEmissions.has(id)) this.nextEmissions.set(id, this.time + bubbleInterval);
    this.items = this.items.filter(bubble => ids.includes(bubble.fishId));
  }

  step(milliseconds, fish, view, { paused = false, enabled = true } = {}) {
    if (paused) return;
    this.time += Math.max(0, milliseconds);
    if (!enabled) {
      this.items = [];
      for (const id of this.nextEmissions.keys()) this.nextEmissions.set(id, this.time + bubbleInterval);
      return;
    }
    const waterline = view.surfaceY ?? surfaceY;
    for (const f of fish.values()) {
      if (!this.nextEmissions.has(f.id) || this.time < this.nextEmissions.get(f.id)) continue;
      // 백그라운드에서 복귀해도 놓친 개수만큼 한꺼번에 생성하지 않습니다.
      this.nextEmissions.set(f.id, this.time + bubbleInterval);
      const speed = .075 + this.random() * .015;
      const mouth = (f.vx > 0 ? 1 : -1) * view.fishWidth * .28 / view.width;
      const startY = Math.max(waterline, f.y - view.fishWidth * .07 / view.height);
      this.items.push({ id: ++this.nextId, fishId: f.id, x: f.x + mouth, startY,
        waterline, born: this.time, arrival: this.time + (startY - waterline) / speed * 1000,
        speed, phase: this.random() * Math.PI * 2 });
    }
    this.items = this.items.filter(b => this.time < b.arrival + surfaceWait + burstDuration).slice(-64);
  }

  frame(bubble) {
    const waiting = this.time >= bubble.arrival;
    const popping = waiting && this.time >= bubble.arrival + surfaceWait;
    const progress = popping ? Math.min(1, (this.time - bubble.arrival - surfaceWait) / burstDuration) : 0;
    return {
      x: bubble.x + Math.sin((this.time - bubble.born) / 700 + bubble.phase) * .004,
      y: waiting ? bubble.waterline : bubble.startY - (this.time - bubble.born) / 1000 * bubble.speed,
      state: popping ? 'popping' : waiting ? 'waiting' : 'rising',
      scale: 1 + progress * .9,
      alpha: .6 * (1 - progress),
    };
  }
}
