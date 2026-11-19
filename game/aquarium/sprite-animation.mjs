// PNG 두 장의 전환 시계입니다. 물리·DB·렌더러와 독립적으로 관리합니다.
export class SpriteAnimation {
  constructor(species) {
    this.interval = species === 'starfish' ? 450 : species === 'shrimp' ? 180 : 260;
    this.elapsed = 0;
    this.frame = 0;
  }
  step(milliseconds, { paused = false, held = false, moving = true } = {}) {
    if (paused) return this.frame;
    if (held || !moving) { this.elapsed = 0; this.frame = 0; return 0; }
    this.elapsed = (this.elapsed + Math.max(0, Math.min(50, milliseconds))) % (this.interval * 2);
    this.frame = Math.floor(this.elapsed / this.interval);
    return this.frame;
  }
}
