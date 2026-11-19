<script setup>
import { computed } from 'vue';
import { gameAssetUrl } from '../asset-url.js';
import growth from '../domain/growth.mjs';
const props = defineProps({ fish: { type: Object, required: true } });
defineEmits(['choose']);
const level = computed(() => growth.describe(props.fish.xp));
// 원본 PNG의 투명 여백만 화면에서 제외합니다. 물고기와 겹칠 때 쓰는 원본 좌표는 유지합니다.
function icon(reward) {
  const icons = {
    bow: { file: 'accessory-bow', viewBox: '16 4 14 9' },
    flower: { file: 'accessory-flower', viewBox: '16 0 13 13' },
    crown: { file: 'accessory-crown', viewBox: '15 -2 16 13' },
    sparkle: { file: 'effect-sparkle', viewBox: '0 0 48 32' },
    aurora: { file: 'effect-sparkle', viewBox: '0 0 48 32' },
  };
  const result = icons[reward.item];
  return result ? { ...result, src: gameAssetUrl('assets/' + result.file + '.png') } : null;
}
</script>

<template>
  <section class="growth-panel" aria-label="레벨과 꾸미기 보상">
    <div>
      <p class="eyebrow">LITTLE TREASURES</p>
      <h2>{{ fish.name }}의 작은 수집 · {{ level.name }}</h2>
      <progress class="growth-progress" aria-label="다음 장식 해금까지 경험치" :max="level.next ? level.next - level.min : 1" :value="level.next ? level.xp - level.min : 1"></progress>
      <span class="growth-summary">{{ level.xp }} XP · {{ level.next ? level.nextReward + '까지 ' + level.remaining + ' XP' : '모든 장식과 효과를 모았어요' }}</span>
      <p>밥알을 먹으면 +5 XP · 레벨마다 작은 꾸미기 선물<br>모습과 크기는 그대로, 장식과 반짝이를 모아요.</p>
    </div>
    <div class="growth-steps">
      <button v-for="reward in growth.stages" :key="reward.min" class="growth-step" :class="fish.xp >= reward.min ? 'unlocked' : 'locked'" :disabled="fish.xp < reward.min" @click="$emit('choose', reward)">
        <svg v-if="icon(reward)" class="reward-icon" :class="{ 'reward-aurora': reward.item === 'aurora' }" :viewBox="icon(reward).viewBox" role="img" :aria-label="reward.reward + ' 장식 미리보기'">
          <image :href="icon(reward).src" width="48" height="32" />
        </svg>
        <span v-else class="reward-icon reward-empty" aria-hidden="true">—</span>
        <b>{{ reward.slot ? reward.reward : '장식 없음' }}</b>
        <small>{{ reward.name }} · {{ fish.xp >= reward.min ? '해금 ✓' : reward.min + ' XP' }}</small>
      </button>
    </div>
  </section>
</template>

<style scoped>
.reward-icon { display: block; width: 64px; height: 48px; margin: 4px 0 8px; flex-shrink: 0; }
.reward-icon image { image-rendering: pixelated; }
.reward-aurora { filter: hue-rotate(130deg); }
.reward-empty { display: grid; place-items: center; font-size: 22px; color: #93a184; }
.locked .reward-icon { opacity: .5; }
</style>
