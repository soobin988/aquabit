import { computed, onScopeDispose, ref, shallowRef } from 'vue';
import { normalizeSnapshot } from '../domain/fish.mjs';
import { normalizeEnvironment } from '../domain/environment.mjs';
import { initialFoodCount, normalizeFoodCount } from '../domain/food.mjs';

export function useAquarium(repository, notify) {
  const fish = shallowRef(repository.remote ? [] : normalizeSnapshot(null).fish);
  const environment = shallowRef(normalizeEnvironment());
  const foodCount = ref(initialFoodCount);
  const viewerId = ref('subin');
  const ready = ref(false);
  const loadError = ref('');
  const current = computed(() => fish.value.find(f => f.id === viewerId.value) || fish.value[0]);
  let disposed = false;
  let writes = Promise.resolve();
  onScopeDispose(() => { disposed = true; });

  async function load() {
    loadError.value = '';
    try {
      const snapshot = await repository.load();
      if (!disposed) {
        fish.value = snapshot.fish;
        environment.value = normalizeEnvironment(snapshot.environment);
        foodCount.value = normalizeFoodCount(snapshot.foodCount);
        if (snapshot.viewerId) viewerId.value = snapshot.viewerId;
        if (!fish.value.some(f => f.id === viewerId.value)) viewerId.value = fish.value[0]?.id;
      }
    } catch (error) {
      if (!disposed) {
        if (repository.remote) loadError.value = error.message || '물고기를 불러오지 못했어요.';
        else notify('저장한 물고기를 불러오지 못해 기본 모습으로 시작해요.');
      }
    }
    finally { if (!disposed) ready.value = true; }
  }

  function command(action) {
    // 네트워크 응답 순서 때문에 먹이와 꾸미기가 서로 덮이지 않도록 직렬화합니다.
    writes = writes.then(() => disposed ? null : action()).then(result => {
      if (disposed || !result) return null;
      fish.value = result.fish;
      if (result.environment) environment.value = normalizeEnvironment(result.environment);
      if (result.foodCount !== undefined) foodCount.value = normalizeFoodCount(result.foodCount);
      if (result.persisted === false) notify('저장 공간을 사용할 수 없어 지금 화면에서만 유지돼요.');
      return result;
    }).catch(error => {
      if (!disposed) notify(error.message || '변경을 저장하지 못했어요. 다시 시도해 주세요.');
      return null;
    });
    return writes;
  }

  function customize(draft) {
    if (!current.value) return Promise.resolve(null);
    const id = current.value.id;
    const appearance = { name: draft.name, species: draft.species, hue: draft.hue,
      accessory: draft.accessory, effect: draft.effect };
    return command(() => repository.updateAppearance(id, appearance));
  }

  async function eat(id) {
    if (!ready.value || id !== viewerId.value) return;
    const result = await command(() => repository.feedFish(id));
    const reward = result?.reward;
    if (!reward) return;
    const updated = fish.value.find(f => f.id === id);
    if (reward.leveledUp) notify(`${updated.name}: ${reward.after.name} · ${reward.after.reward} 해금!`);
    return reward;
  }

  function updateEnvironment(value) {
    const settings = normalizeEnvironment(value);
    return command(() => repository.updateEnvironment(settings));
  }
  function refresh() { return command(() => repository.load()); }
  function dispense(amount) { return command(() => repository.dispenseFood(amount)); }
  return { fish, environment, foodCount, viewerId, ready, loadError, current, load, refresh, customize, eat, dispense, updateEnvironment };
}
