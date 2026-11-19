export const initialFoodCount = 10;
export function normalizeFoodCount(value) {
  if (value === undefined || !Number.isFinite(Number(value))) return initialFoodCount;
  return Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(value))));
}
