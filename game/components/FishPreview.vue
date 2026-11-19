<script setup>
import { computed } from 'vue';
import { gameAssetUrl } from '../asset-url.js';
import { species, spriteFrames, spriteLayers } from '../domain/fish.mjs';
const props = defineProps({ fish: { type: Object, required: true } });
const layers = computed(() => spriteLayers(props.fish).flatMap(layer => layer.kind === 'fish'
  ? spriteFrames(props.fish.species).map((src, frame) => ({ ...layer, src, frame })) : [layer]));
const url = gameAssetUrl;
</script>

<template>
  <span class="sprite-body" role="img" :aria-label="species[fish.species] + ' 꾸미기 미리보기'" :style="{ '--sprite-cycle': fish.species === 'shrimp' ? '.36s' : '.52s' }">
    <img v-for="layer in layers" :key="layer.kind + (layer.frame ?? '')" :src="url(layer.src)" alt="" draggable="false"
      :class="[layer.kind + '-image', layer.effect, { 'sprite-first': layer.frame === 0, 'sprite-second': layer.frame === 1 }]"
      :style="layer.kind === 'fish' ? { filter: `hue-rotate(${layer.hue}deg)` } : layer.offsetY ? { transform: `translateY(${layer.offsetY / 32 * 100}%)` } : undefined">
  </span>
</template>
