import { applyAppearance, defaultFish, normalizeSnapshot } from '../domain/fish.mjs';
import growth from '../domain/growth.mjs';
import { normalizeEnvironment } from '../domain/environment.mjs';

const storageKey = 'aquabit-game-v1';

// 저장 위치만 이 파일에서 교체합니다. Vue/PixiJS는 localStorage나 DB를 직접 다루지 않습니다.
// 추후 서버 저장으로 전환해도 외형 수정과 먹이 명령을 분리한 인터페이스를 유지하세요.
export function createLocalAquariumRepository(storage) {
  let snapshot = normalizeSnapshot(null);
  function result(extra = {}) {
    let persisted = true;
    try { storage.setItem(storageKey, JSON.stringify(snapshot)); } catch { persisted = false; }
    return { ...normalizeSnapshot(snapshot), ...extra, persisted };
  }
  return {
    async load() {
      let value;
      try { value = JSON.parse(storage.getItem(storageKey)); } catch { value = null; }
      snapshot = normalizeSnapshot(value);
      return normalizeSnapshot(snapshot);
    },
    async updateAppearance(id, appearance) {
      snapshot.fish = snapshot.fish.map(f => f.id === id ? applyAppearance(f, appearance) : f);
      return result();
    },
    async dispenseFood(requested) {
      const amount = Math.min(snapshot.foodCount, Math.max(0, Math.min(3, Math.floor(Number(requested) || 0))));
      snapshot.foodCount -= amount;
      return result({ dispensed: amount });
    },
    async feedFish(id) {
      if (id !== defaultFish[0].id) throw new Error('내 물고기에게만 먹이를 줄 수 있어요.');
      const fish = snapshot.fish.find(f => f.id === id);
      if (!fish) throw new Error('물고기를 찾을 수 없어요.');
      const reward = growth.award(fish);
      return result({ reward });
    },
    async updateEnvironment(environment) {
      snapshot.environment = normalizeEnvironment(environment);
      return result();
    },
  };
}
