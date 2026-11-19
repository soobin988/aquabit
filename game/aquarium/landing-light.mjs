// public/js/aquarium.js의 drawWater에서 광선 반복문을 그대로 가져옵니다.
// 기울기 .35, 초당 2칸, 광선 4개는 유지하고 길이와 굵기만 조정할 수 있습니다.
export function drawLandingLight(ctx, W, sandTop, t, color = '#ffffff', strength = 1, { beamWidth = 6, length = .8 } = {}) {
  const rgb = color.slice(1).match(/../g).map(channel => parseInt(channel, 16));
  ctx.fillStyle = `rgba(${rgb.join(',')},${Math.min(1, .06 * strength)})`;
  for (var k = 0; k < 4; k++) {
    var base = ((k * W) / 4 + t * 2) % (W + 40) - 20;
    for (var y = 0; y < sandTop * length; y += 2) {
      ctx.fillRect(Math.round(base + y * 0.35), y, beamWidth, 2);
    }
  }
}
