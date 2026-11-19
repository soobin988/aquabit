<script setup>
import { computed, reactive, ref } from 'vue';
import FishPreview from './FishPreview.vue';
import { species, originalHue, spriteLayers, spriteFrames } from '../domain/fish.mjs';
import growth from '../domain/growth.mjs';
import { gameAssetUrl } from '../asset-url.js';

const props = defineProps({ fish: { type: Object, required: true } });
const emit = defineEmits(['apply', 'notify']);
const dialog = ref();
const exportedImage = ref(null);
const draft = reactive({});
const preview = computed(() => ({ ...draft, xp: props.fish.xp }));
const level = computed(() => growth.describe(props.fish.xp));
const accessories = growth.stages.filter(s => s.slot === 'accessory');
const effects = growth.stages.filter(s => s.slot === 'effect');
const asset = file => gameAssetUrl('assets/' + file);
const canSaveDecoration = computed(() => draft.accessory && draft.accessory !== 'none' ||
  draft.effect && draft.effect !== 'none');

function open(reward) {
  exportedImage.value = null;
  Object.assign(draft, props.fish);
  if (reward) {
    if (reward.slot) draft[reward.slot] = reward.item;
    else { draft.accessory = 'none'; draft.effect = 'none'; }
  }
  dialog.value.showModal();
}
function apply() {
  if (!draft.name.trim()) return;
  emit('apply', { ...draft });
  dialog.value.close();
}
function chooseSpecies(key) {
  if (draft.species === key) return;
  draft.species = key;
  draft.hue = originalHue[key];
}
async function exportPng(layers, filename) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 80; canvas.height = 50;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (const layer of layers) {
      const image = new Image(); image.src = gameAssetUrl(layer.src);
      await image.decode();
      ctx.filter = layer.kind === 'fish' ? `hue-rotate(${layer.hue}deg)` : layer.effect === 'aurora' ? 'hue-rotate(130deg)' : 'none';
      ctx.drawImage(image, 0, layer.offsetY || 0, 80, 50);
    }
    const url = canvas.toDataURL('image/png');
    exportedImage.value = { url, filename };
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
  } catch { emit('notify', 'PNG를 저장하지 못했어요. 다시 시도해 주세요.'); }
}
function download() {
  return exportPng(spriteLayers(preview.value), `aquabit-${draft.species}-80x50.png`);
}
function downloadDecoration() {
  const layers = spriteLayers(preview.value).filter(layer => layer.kind !== 'fish');
  if (!layers.length) return;
  return exportPng(layers, `aquabit-decoration-${draft.accessory}-${draft.effect}-80x50.png`);
}
defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" id="editor" aria-labelledby="editor-title">
    <form @submit.prevent="apply">
      <div class="dialog-head">
        <div><h2 id="editor-title">내 물고기 꾸미기</h2></div>
        <button type="button" class="close" aria-label="닫기" @click="dialog.close()"><img :src="gameAssetUrl('assets/icon-close.png')" width="16" height="16" alt=""></button>
      </div>
      <div class="edit-grid">
        <div class="preview-box">
          <span>미리보기</span><FishPreview :fish="preview" />
          <b>{{ draft.name }}</b>
          <span>{{ level.name }} · {{ level.xp }} XP</span>
          <small>적용하면 어항에 반영돼요</small>
        </div>
        <div class="controls">
          <label>닉네임<input v-model="draft.name" maxlength="12" required></label>
          <fieldset><legend>물고기 종류</legend><div class="choices">
            <button v-for="(name, key) in species" :key="key" type="button" :class="{ selected: draft.species === key }" :aria-pressed="draft.species === key" @click="chooseSpecies(key)">
              <img :src="gameAssetUrl(spriteFrames(key)[0])" width="80" height="50" alt=""><span>{{ name }}</span>
            </button>
          </div></fieldset>
          <label>컬러 <span class="color-label">{{ draft.hue }}°</span><input v-model.number="draft.hue" class="hue" type="range" min="0" max="359"></label>
          <label>장식<select v-model="draft.accessory" aria-label="장식">
            <option value="none">장식 없음</option>
            <option v-for="reward in accessories" :key="reward.item" :value="reward.item" :disabled="!growth.unlocked(fish.xp, 'accessory', reward.item)">{{ reward.reward }} · {{ reward.name }} {{ growth.unlocked(fish.xp, 'accessory', reward.item) ? '해금' : '잠김' }}</option>
          </select></label>
          <a v-if="draft.accessory && draft.accessory !== 'none'" class="asset-download"
            :href="asset('accessory-' + draft.accessory + '.png')"
            :download="'accessory-' + draft.accessory + '.png'">장식 원본 PNG 저장 ↓</a>
          <label>반짝이 효과<select v-model="draft.effect" aria-label="반짝이 효과">
            <option value="none">효과 없음</option>
            <option v-for="reward in effects" :key="reward.item" :value="reward.item" :disabled="!growth.unlocked(fish.xp, 'effect', reward.item)">{{ reward.reward }} · {{ reward.name }} {{ growth.unlocked(fish.xp, 'effect', reward.item) ? '해금' : '잠김' }}</option>
          </select></label>
          <p class="hint">장식과 반짝이는 함께 착용할 수 있어요.</p>
        </div>
      </div>
      <div class="dialog-foot">
        <div class="download-actions">
          <button type="button" class="secondary" @click="download">물고기 PNG 저장</button>
          <button type="button" class="secondary" :disabled="!canSaveDecoration" @click="downloadDecoration">장식 PNG 저장</button>
        </div>
        <button class="primary">적용하기</button>
      </div>
      <a v-if="exportedImage" class="exported-image" :href="exportedImage.url" :download="exportedImage.filename">
        <img :src="exportedImage.url" alt="저장할 PNG 이미지" width="96" height="64">
        PNG 파일 다운로드 ↓
      </a>
    </form>
  </dialog>
</template>
