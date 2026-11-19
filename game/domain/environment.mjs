export const plants = { aquatic: '기본 수초', coral: '산호', tree: '수목' };
export const defaultEnvironment = { plant: 'aquatic', sway: true, bubbles: true, lighting: true, lightStrength: 35, lightColor: '#ffffff' };

export function normalizeEnvironment(value) {
  const input = value && typeof value === 'object' ? value : {};
  const strength = Number(input.lightStrength);
  return {
    plant: Object.hasOwn(plants, input.plant) ? input.plant : 'aquatic',
    sway: typeof input.sway === 'boolean' ? input.sway : true,
    bubbles: typeof input.bubbles === 'boolean' ? input.bubbles : true,
    lighting: typeof input.lighting === 'boolean' ? input.lighting : true,
    lightColor: typeof input.lightColor === 'string' && /^#[0-9a-f]{6}$/i.test(input.lightColor) ? input.lightColor.toLowerCase() : defaultEnvironment.lightColor,
    lightStrength: Number.isFinite(strength) ? Math.max(0, Math.min(100, strength)) : 35,
  };
}

// 128×128 원본에서 밑동 y=116은 고정하고 위쪽으로 갈수록 휘어집니다.
export function plantOffset(y, milliseconds, plant = 'aquatic') {
  const influence = Math.max(0, Math.min(1, (116 - y) / 68)) ** 2;
  if (influence === 0) return 0;
  const amplitude = { aquatic: 1.3, coral: .7, tree: .55 }[plant] || 0;
  return Math.sin(milliseconds / 1400 + y / 70) * amplitude * influence;
}
