<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createAquarium } from '../aquarium/createAquarium.js';
import { gameAssetUrl } from '../asset-url.js';

const props = defineProps({ fish: { type: Array, required: true }, viewerId: String,
  unreadIds: { type: Array, default: () => [] }, environment: Object, paused: Boolean, foodCount: Number, onDispense: Function, onEat: Function, showcase: Boolean });
const emit = defineEmits(['select', 'double-select']);
const host = ref(), loading = ref(true), error = ref(''), feeding = ref({ active: false, ready: false });
let engine, disposed = false;
const update = () => engine?.update(props.fish, props.viewerId, props.unreadIds);
watch(() => [props.fish, props.viewerId, props.unreadIds], update, { deep: true });
watch(() => props.paused, value => engine?.setPaused(value));
watch(() => props.environment, value => engine?.setEnvironment(value), { deep: true });
watch(() => props.foodCount, value => engine?.setFoodCount(value));
onMounted(async () => {
  try {
    engine = await createAquarium(host.value, {
      showcase: props.showcase,
      onSelect: id => emit('select', id), onEat: id => props.onEat?.(id),
      onDoubleSelect: id => emit('double-select', id),
      onDispense: count => props.onDispense?.(count),
      onFeeding: value => { if (!disposed) feeding.value = value; },
    });
    if (disposed) { engine.destroy(); return; }
    update(); engine.setEnvironment(props.environment); engine.setFoodCount(props.foodCount); engine.setPaused(props.paused); loading.value = false;
  } catch {
    if (!disposed) { loading.value = false; error.value = '어항을 열지 못했어요. WebGL을 지원하는 브라우저와 이미지 파일을 확인한 뒤 새로고침해 주세요.'; }
  }
});
onBeforeUnmount(() => { disposed = true; engine?.destroy(); });
</script>

<template>
  <div ref="host" class="pixi-scene"></div>
  <div v-if="loading || error" class="scene-message" role="status">{{ error || '작은 바다를 준비하고 있어요…' }}</div>
  <div v-if="feeding.active" class="feeding-zone" :class="{ ready: feeding.ready }">{{ foodCount === 0 ? '먹이가 부족해요' : feeding.ready ? '냠냠, 먹이가 떨어져요' : '밥통을 어항 입구 위로 가져오세요' }}</div>
  <div v-if="!showcase" class="food-stock" role="status" aria-live="polite"><img :src="gameAssetUrl('assets/food-pellet.png')" width="12" height="12" alt="">먹이 {{ foodCount }}개</div>
</template>
