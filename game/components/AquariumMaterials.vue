<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { gameAssetUrl } from '../asset-url.js';
import { createScenery } from '../aquarium/scenery.js';
const props = defineProps({ environment: { type: Object, required: true }, paused: Boolean });
const background = ref();
const foreground = ref();
const floor = ref();
let scenery, disposed = false;
watch(() => props.environment, value => scenery?.setEnvironment(value), { deep: true });
watch(() => props.paused, value => scenery?.setPaused(value));
onMounted(async () => {
  const files = { water: 'water-interior', sand: 'sand', rock: 'rock', aquatic: 'plant-aquatic', coral: 'plant-coral', tree: 'plant-tree', distant0: 'creatures/neon', distant1: 'creatures/neon-2' };
  const loaded = await Promise.allSettled(Object.entries(files).map(async ([key, name]) => {
    const image = new Image(); image.src = gameAssetUrl('assets/' + name + '.png'); await image.decode();
    return [key, image];
  }));
  if (disposed || loaded.some(result => result.status === 'rejected')) return;
  scenery = createScenery(background.value, foreground.value, floor.value, Object.fromEntries(loaded.map(result => result.value)), props.environment, props.paused);
});
onBeforeUnmount(() => { disposed = true; scenery?.destroy(); });
</script>
<template>
  <div class="tank-stage">
    <canvas ref="background" class="tank-background" aria-hidden="true"></canvas>
    <canvas ref="floor" class="tank-floor" aria-hidden="true"></canvas>
    <div class="tank-fish"><slot /></div>
    <canvas ref="foreground" class="tank-light" aria-hidden="true"></canvas>
  </div>
</template>
<style scoped>
.tank-stage, .tank-background, .tank-fish, .tank-light, .tank-floor { position: absolute; inset: 0; }
.tank-stage { isolation: isolate; overflow: hidden; background: #1565c0; }
.tank-background, .tank-light, .tank-floor { width: 100%; height: 100%; image-rendering: pixelated; pointer-events: none; }
.tank-floor { filter: none; }
/* 배경 캔버스에만 적용합니다. 물고기·새우가 있는 레이어에는 블러를 상속하지 않습니다. */
.tank-background { filter: blur(1.6px); }
.tank-light { filter: blur(.65px); }
.tank-fish { isolation: isolate; }
@media (max-width: 700px) {
  .tank-background { filter: blur(1.1px); }
}
</style>
