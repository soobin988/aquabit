<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import AquariumScene from './components/AquariumScene.vue';
import AquariumMaterials from './components/AquariumMaterials.vue';
import FishEditor from './components/FishEditor.vue';
import RewardShelf from './components/RewardShelf.vue';
import CommunicationPanel from './components/CommunicationPanel.vue';
import { createLocalAquariumRepository } from './services/aquarium-repository.mjs';
import { useAquarium } from './composables/useAquarium.js';
import { normalizeEnvironment, plants } from './domain/environment.mjs';
import { gameAssetUrl } from './asset-url.js';

const editor = ref(null);
const settings = ref(null);
const guide = ref(null);
const communications = ref(null);
const message = ref('');
const paused = ref(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
const settingsOpen = ref(false);
const saving = ref(false);
const selectedFish = ref(null);
const environmentDraft = reactive(normalizeEnvironment());
let messageTimer;

function notify(text) {
  message.value = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { message.value = ''; }, 4500);
}

const repository = createLocalAquariumRepository({
  getItem(key) { return localStorage.getItem(key); },
  setItem(key, value) { localStorage.setItem(key, value); },
});
const aquarium = useAquarium(repository, notify);
const { fish, environment, foodCount, ready, viewerId, current } = aquarium;
const shownEnvironment = computed(() => settingsOpen.value ? environmentDraft : environment.value);
const visitor = computed(() => fish.value.find(item => item.id === selectedFish.value));

function openEditor(reward) {
  if (current.value) editor.value.open(reward);
}

async function applyAppearance(draft) {
  const result = await aquarium.customize(draft);
  if (result) notify('물고기 모습을 적용했어요.');
}

function selectFish(id) {
  if (id === viewerId.value) {
    openEditor();
    return;
  }
  selectedFish.value = id;
}

function openSettings() {
  Object.assign(environmentDraft, environment.value);
  settingsOpen.value = true;
  settings.value.showModal();
}

function openFishChat(id) {
  if (id === viewerId.value) return;
  const target = fish.value.find(item => item.id === id);
  if (!target) return;
  selectedFish.value = null;
  communications.value.open({ docked: true, fishName: target.name });
}

async function applySettings() {
  if (saving.value) return;
  saving.value = true;
  try {
    const result = await aquarium.updateEnvironment(environmentDraft);
    if (result) {
      settings.value.close();
      notify('어항 설정을 저장했어요.');
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => aquarium.load());
onBeforeUnmount(() => clearTimeout(messageTimer));
</script>

<template>
  <header class="game-header">
    <a class="brand" href="/" aria-label="AQUABIT 회사 홈페이지"><img :src="'/img/logo.svg'" width="155" height="24" alt="AQUABIT"></a>
    <nav aria-label="게임 메뉴">
      <span class="session-label">체험 어항</span>
      <a href="/">회사 홈페이지 <span aria-hidden="true">↗</span></a>
    </nav>
  </header>
  <main class="game-main">
    <div class="page-heading">
      <div><p class="eyebrow">PIXEL AQUARIUM</p><h1>우리 어항</h1></div>
      <button class="primary" :disabled="!current" @click="openEditor()">내 물고기 꾸미기 <span aria-hidden="true">↗</span></button>
    </div>
    <section class="aquarium" aria-label="픽셀 어항">
      <AquariumMaterials :environment="shownEnvironment" :paused="paused">
        <AquariumScene v-if="ready" :fish="fish" :viewer-id="viewerId"
          :environment="shownEnvironment" :paused="paused" :food-count="foodCount" :on-dispense="aquarium.dispense" :on-eat="aquarium.eat" @select="selectFish" @double-select="openFishChat" />
      </AquariumMaterials>
      <p v-if="!ready" class="scene-message" role="status">어항을 준비하고 있어요…</p>
      <button class="guide-button" title="어항 사용 가이드" aria-label="어항 사용 가이드" @click="guide.showModal()">
        <img :src="gameAssetUrl('assets/icon-info.png')" width="32" height="32" alt="">
      </button>
      <nav class="rail" aria-label="어항 도구">
        <button title="물고기 꾸미기" aria-label="물고기 꾸미기" :disabled="!current" @click="openEditor()">
          <img :src="gameAssetUrl('assets/icon-fish.png')" width="32" height="32" alt="">
        </button>
        <button title="어항 설정" aria-label="어항 설정" :disabled="!ready" @click="openSettings()">
          <img :src="gameAssetUrl('assets/icon-tank.png')" width="32" height="32" alt="">
        </button>
        <button :title="paused ? '움직임 시작' : '움직임 멈추기'" :aria-label="paused ? '움직임 시작' : '움직임 멈추기'" :aria-pressed="paused" @click="paused = !paused">
          <img :src="gameAssetUrl('assets/icon-' + (paused ? 'play' : 'pause') + '.png')" width="32" height="32" alt="">
        </button>
        <button title="채팅과 사내 메일" aria-label="채팅과 사내 메일" @click="communications.open()">
          <img :src="gameAssetUrl('assets/icon-mail.png')" width="32" height="32" alt="">
        </button>
      </nav>
    </section>
    <div class="game-caption"><p>꾸미기와 경험치는 이 브라우저에 저장돼요. 함께 보이는 세 마리는 시연 물고기예요.</p></div>
    <aside v-if="visitor" class="visitor-note" role="status">
      <span>{{ visitor.name }}는 시연 물고기예요. '나'가 붙은 물고기를 꾸밀 수 있어요.</span>
      <button class="text-button" @click="selectedFish = null">닫기</button>
    </aside>
    <RewardShelf v-if="current" :fish="current" @choose="openEditor" />
    <footer><span>AQUABIT · Pixel Aquarium</span><span>직접 준비한 도트 물고기</span></footer>
  </main>
  <FishEditor v-if="current" ref="editor" :fish="current" @apply="applyAppearance" @notify="notify" />
  <CommunicationPanel ref="communications" :nickname="current?.name || '내 물고기'" />
  <dialog ref="settings" class="preferences" aria-labelledby="settings-title" @close="settingsOpen = false">
    <form @submit.prevent="applySettings">
      <div class="dialog-head"><h2 id="settings-title">어항 설정</h2><button class="close" type="button" aria-label="닫기" @click="settings.close()"><img :src="gameAssetUrl('assets/icon-close.png')" width="16" height="16" alt=""></button></div>
      <fieldset class="plant-picker">
        <legend>수초 종류</legend>
        <div class="plant-options">
          <label v-for="(name, key) in plants" :key="key" class="plant-option" :class="{ selected: environmentDraft.plant === key }">
            <input v-model="environmentDraft.plant" type="radio" name="plant" :value="key">
            <span class="plant-thumbnail"><img :src="gameAssetUrl('assets/plant-' + key + '.png')" alt=""></span>
            <span>{{ name }}</span>
          </label>
        </div>
      </fieldset>
      <label class="check"><input v-model="environmentDraft.sway" type="checkbox">수초 흔들림</label>
      <label class="check"><input v-model="environmentDraft.bubbles" type="checkbox">기포 · 3초마다</label>
      <label class="check"><input v-model="environmentDraft.lighting" type="checkbox">수중 햇살</label>
      <label>빛 색상<input v-model="environmentDraft.lightColor" type="color" :disabled="!environmentDraft.lighting"></label>
      <label>빛 세기 · {{ environmentDraft.lightStrength }}%<input v-model.number="environmentDraft.lightStrength" type="range" min="0" max="100" :disabled="!environmentDraft.lighting"></label>
      <div class="dialog-foot"><button class="secondary" type="button" @click="settings.close()">취소</button><button class="primary" :disabled="saving">저장하기</button></div>
    </form>
  </dialog>
  <dialog ref="guide" class="aquarium-guide" aria-labelledby="guide-title">
    <div class="dialog-head"><h2 id="guide-title">어항 가이드</h2><button class="close" type="button" aria-label="가이드 닫기" @click="guide.close()"><img :src="gameAssetUrl('assets/icon-close.png')" width="16" height="16" alt=""></button></div>
    <dl class="guide-topics">
      <div><dt>물고기 움직이기</dt><dd>물고기를 잡아 어항 어디로든 끌어보세요. 놓으면 잠시 쉬었다가 다시 헤엄쳐요. 새우는 놓으면 천천히 모래 위로 내려와 기어다녀요.</dd></div>
      <div><dt>밥 주기</dt><dd>노란 밥통을 어항 위쪽으로 끌어가세요. 처음에는 먹이 10개를 가지고 있고, 떨어뜨린 만큼 줄어들어요. 내 물고기만 먹고 경험치를 얻어요. 새우는 먹이를 보면 작게 점프한 뒤 모래에 떨어진 알갱이를 주워 먹어요.</dd></div>
      <div><dt>내 물고기 꾸미기</dt><dd>‘나’가 붙은 물고기나 왼쪽 물고기 아이콘을 누르세요. 종류·컬러·장식을 고르고 ‘적용하기’를 누르면 바뀌어요.</dd></div>
      <div><dt>장식 모으기</dt><dd>밥알을 먹으면 경험치가 5씩 올라요. 레벨이 오르면 리본·꽃·왕관과 반짝이가 열려요. 꾸민 물고기와 장식은 PNG로 저장할 수 있어요.</dd></div>
      <div><dt>어항 꾸미기</dt><dd>왼쪽 어항 아이콘에서 수초 이미지를 고르고, 흔들림·기포·빛을 바꾸세요. 물고기 기포는 3초마다 나오고 수면에서 4초 머문 뒤 터져요.</dd></div>
      <div><dt>쉬어가기와 저장</dt><dd>왼쪽 일시정지 아이콘으로 움직임을 멈출 수 있어요. 현재는 체험 어항으로, 세 마리는 시연 물고기예요. 꾸미기와 경험치는 지금 쓰는 브라우저에 저장돼요.</dd></div>
    </dl>
  </dialog>
  <div v-if="message" class="toast" role="status">{{ message }}</div>
</template>
