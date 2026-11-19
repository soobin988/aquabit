// 미리보기의 CSS hue-rotate와 PixiJS 어항에 같은 색상 계산을 적용합니다.
// https://www.w3.org/TR/filter-effects/#feColorMatrixElement
import { originalHue, resolveSpecies } from './fish.mjs';
import creatures from './creatures.json' with { type: 'json' };

export function hueMatrix(degrees) {
  const angle = degrees * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [
    .213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s, 0, 0,
    .213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s, 0, 0,
    .213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s, 0, 0,
    0, 0, 0, 1, 0,
  ];
}

// 실제 PNG의 대표 몸 색상입니다. 이미지 교체 시 후광도 같은 색을 사용합니다.
const bodyColors = Object.fromEntries(Object.entries(creatures).map(([key, item]) => [key, item.glow]));
export function fishGlowColor(fish) {
  const species = resolveSpecies(fish.species);
  const matrix = hueMatrix(fish.hue - originalHue[species]);
  const rgb = bodyColors[species];
  const transformed = [0, 1, 2].map(row => Math.round(Math.max(0, Math.min(255,
    rgb.reduce((sum, channel, col) => sum + channel * matrix[row * 5 + col], 0)))));
  return (transformed[0] << 16) | (transformed[1] << 8) | transformed[2];
}
