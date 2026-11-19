import growth from './growth.mjs';
import { normalizeEnvironment } from './environment.mjs';
import { normalizeFoodCount } from './food.mjs';
import creatures from './creatures.json' with { type: 'json' };
import legacySpecies from './creature-aliases.json' with { type: 'json' };

export const species = Object.fromEntries(Object.entries(creatures).map(([key, item]) => [key, item.label]));
export const originalHue = Object.fromEntries(Object.entries(creatures).map(([key, item]) => [key, item.hue]));
export function resolveSpecies(key) { return Object.hasOwn(species, key) ? key : legacySpecies[key] || 'gold'; }
export function spriteFrames(key) {
  const item = creatures[resolveSpecies(key)];
  return item.frames || [item.file, item.file];
}
export const defaultFish = [
  { id: 'subin', name: '내 물고기', species: 'gold', hue: originalHue.gold },
  { id: 'sea', name: '바다', species: 'angel', hue: originalHue.angel },
  { id: 'nemo', name: '네모', species: 'neon', hue: originalHue.neon },
  { id: 'bubble', name: '버블', species: 'shrimp', hue: originalHue.shrimp },
];

export function normalizeFish(value, fallback) {
  const input = value && typeof value === 'object' ? value : {};
  const kind = resolveSpecies(input.species || fallback.species);
  return growth.normalize({
    id: fallback.id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name.trim().slice(0, 12) : fallback.name,
    species: kind,
    hue: input.species && input.species !== kind ? originalHue[kind] : Number.isFinite(Number(input.hue)) ? Math.max(0, Math.min(359, Number(input.hue))) : originalHue[kind],
    xp: input.xp,
    accessory: input.accessory,
    effect: input.effect,
  });
}

export function normalizeSnapshot(value) {
  const source = Array.isArray(value?.fish) ? value.fish : [];
  return { fish: defaultFish.map(fallback => normalizeFish(source.find(f => f?.id === fallback.id), fallback)),
    environment: normalizeEnvironment(value?.environment), foodCount: normalizeFoodCount(value?.foodCount) };
}

// 설정 화면은 외형만 변경하며 경험치와 직원 ID를 덮어쓰지 않습니다.
export function applyAppearance(current, draft) {
  return normalizeFish({ ...current, name: draft.name, species: draft.species, hue: draft.hue,
    accessory: draft.accessory, effect: draft.effect }, current);
}

export function spriteLayers(fish) {
  const key = resolveSpecies(fish.species);
  const layers = [{ kind: 'fish', src: spriteFrames(key)[0], hue: Number(fish.hue) - originalHue[key] }];
  if (fish.accessory !== 'none' && growth.unlocked(fish.xp, 'accessory', fish.accessory)) {
    layers.push({ kind: 'accessory', src: `assets/accessory-${fish.accessory}.png`, offsetY: key === 'shrimp' ? 6 : 0 });
  }
  if (fish.effect !== 'none' && growth.unlocked(fish.xp, 'effect', fish.effect)) {
    layers.push({ kind: 'effect', src: 'assets/effect-sparkle.png', effect: fish.effect });
  }
  return layers;
}
