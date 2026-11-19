<script setup>
import { nextTick, onBeforeUnmount, ref } from 'vue';
import { communicationRequest as request } from '../services/communications-api.js';
import { gameAssetUrl } from '../asset-url.js';
const props = defineProps({ nickname: { type: String, default: '내 물고기' }, chatRequest: Function });
const dialog = ref(), chatTab = ref(), mailTab = ref(), chatList = ref();
const opened = ref(false), tab = ref('chat'), messages = ref([]), chatDraft = ref('');
const docked = ref(false), fishName = ref('');
const chatLoading = ref(false), chatSending = ref(false), chatError = ref('');
const mail = ref({ configured: false, authenticated: false, domain: '', address: '' });
const statusReady = ref(false), address = ref(''), password = ref('');
const mailLoading = ref(false), mailSending = ref(false), mailError = ref(''), notice = ref('');
const folder = ref('inbox'), mailRows = ref([]), selected = ref(null), composing = ref(false);
const recipient = ref(''), subject = ref(''), body = ref(''), page = ref(1), hasMore = ref(false), total = ref(0);
let timer, epoch = 0, cursor = 0, pendingChatId = null, mailTicks = 0;
const time = value => value ? new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

async function loadChat(forceBottom = false) {
  if (chatLoading.value) return;
  const currentEpoch = epoch;
  chatLoading.value = true;
  try {
    const result = await (props.chatRequest || request)('/chat?after=' + cursor);
    if (currentEpoch !== epoch) return;
    const list = chatList.value;
    const atBottom = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    const known = new Set(messages.value.map(message => message.id));
    messages.value = [...messages.value, ...result.messages.filter(message => !known.has(message.id))].sort((a, b) => a.id - b.id).slice(-200);
    cursor = Math.max(cursor, messages.value.at(-1)?.id || 0);
    chatError.value = '';
    if (atBottom || forceBottom) { await nextTick(); if (chatList.value) chatList.value.scrollTop = chatList.value.scrollHeight; }
  } catch (error) { if (currentEpoch === epoch) chatError.value = error.message; }
  finally { chatLoading.value = false; }
}
async function sendChat() {
  if (chatSending.value || !chatDraft.value.trim()) return;
  chatSending.value = true;
  const text = chatDraft.value.trim();
  pendingChatId ||= Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  try {
    const result = await (props.chatRequest || request)('/chat', { name: props.nickname, text, requestId: pendingChatId });
    if (!messages.value.some(item => item.id === result.message.id)) messages.value.push(result.message);
    await nextTick(); if (chatList.value) chatList.value.scrollTop = chatList.value.scrollHeight;
    chatDraft.value = ''; pendingChatId = null;
    await loadChat(true);
  } catch (error) { chatError.value = error.message; }
  finally { chatSending.value = false; }
}
async function loadMail() {
  if (!mail.value.authenticated || mailLoading.value) return;
  const currentEpoch = epoch, currentFolder = folder.value, currentAddress = mail.value.address;
  mailLoading.value = true; mailError.value = '';
  try {
    const result = await request(currentFolder === 'inbox' ? '/mail/inbox?page=' + page.value : '/mail/sent');
    if (currentEpoch !== epoch || currentFolder !== folder.value || !mail.value.authenticated || currentAddress !== mail.value.address) return;
    mailRows.value = result.messages;
    hasMore.value = Boolean(result.hasMore); total.value = result.total ?? result.messages.length;
    if (selected.value) selected.value = result.messages.find(row => row.id === selected.value.id) || null;
  } catch (error) {
    if (currentEpoch !== epoch || currentAddress !== mail.value.address) return;
    mailError.value = error.message;
    if (error.status === 401) { mail.value.authenticated = false; mailRows.value = []; selected.value = null; }
  } finally { mailLoading.value = false; }
}
async function switchTab(value) {
  tab.value = value;
  if (value === 'chat') await loadChat();
  else if (mail.value.authenticated) await loadMail();
}
function tabKey(event) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const next = event.key === 'Home' ? 'chat' : event.key === 'End' ? 'mail' : tab.value === 'chat' ? 'mail' : 'chat';
  switchTab(next); (next === 'chat' ? chatTab.value : mailTab.value)?.focus();
}
async function login() {
  if (mailSending.value) return;
  mailSending.value = true; mailError.value = '';
  try {
    const result = await request('/mail/login', { address: address.value.trim(), password: password.value });
    mailRows.value = []; selected.value = null;
    mail.value = { ...mail.value, authenticated: true, address: result.address };
    folder.value = 'inbox'; page.value = 1;
    await loadMail();
  } catch (error) { mailError.value = error.message; }
  finally { password.value = ''; mailSending.value = false; }
}
async function logout() {
  try { await request('/mail/logout', {}); }
  catch (error) { mailError.value = error.message; return; }
  mail.value.authenticated = false; mailRows.value = []; selected.value = null; composing.value = false; body.value = ''; password.value = '';
}
async function chooseFolder(value) {
  if (mailLoading.value) return;
  folder.value = value; page.value = 1; selected.value = null; composing.value = false;
  await loadMail();
}
function compose(reply = false) {
  if (reply && selected.value) {
    recipient.value = folder.value === 'sent' ? selected.value.to : selected.value.replyTo;
    subject.value = (/^re:/i.test(selected.value.subject) ? selected.value.subject : 'Re: ' + selected.value.subject).slice(0, 120);
    body.value = '';
  }
  composing.value = true; mailError.value = ''; notice.value = '';
}
async function sendMail() {
  if (mailSending.value) return;
  mailSending.value = true; mailError.value = ''; notice.value = '';
  try {
    const result = await request('/mail/send', { to: recipient.value.trim(), subject: subject.value, text: body.value });
    recipient.value = ''; subject.value = ''; body.value = ''; composing.value = false;
    notice.value = result.warning || '메일을 보냈어요.';
    folder.value = 'sent'; page.value = 1; selected.value = result.message;
    await loadMail();
  } catch (error) { mailError.value = error.message; }
  finally { mailSending.value = false; }
}
async function paginate(direction) { if (!mailLoading.value) { page.value += direction; selected.value = null; await loadMail(); } }
function closed() { opened.value = false; epoch++; clearInterval(timer); password.value = ''; }
async function open(options = {}) {
  const side = options.docked === true;
  fishName.value = side ? options.fishName || '' : '';
  if (side) tab.value = 'chat';
  else if (options.tab === 'mail') tab.value = 'mail';
  if (opened.value) {
    if (docked.value !== side) {
      await new Promise(resolve => {
        dialog.value.addEventListener('close', resolve, { once: true });
        dialog.value.close();
      });
      return open(options);
    }
    await switchTab(tab.value);
    return;
  }
  docked.value = side;
  opened.value = true;
  if (side) {
    const scrollX = window.scrollX, scrollY = window.scrollY;
    dialog.value.show();
    window.scrollTo(scrollX, scrollY);
  } else dialog.value.showModal();
  statusReady.value = false;
  const currentEpoch = ++epoch;
  try {
    const status = await request('/status');
    if (currentEpoch !== epoch) return;
    mail.value = status.mail; address.value = status.mail.address || address.value;
    if (!status.mail.authenticated) { mailRows.value = []; selected.value = null; }
  } catch (error) { chatError.value = error.message; mailError.value = error.message; }
  finally { if (currentEpoch === epoch) statusReady.value = true; }
  if (currentEpoch !== epoch) return;
  await switchTab(tab.value);
  timer = setInterval(() => {
    if (document.hidden) return;
    if (tab.value === 'chat') loadChat();
    else if (++mailTicks % 10 === 0 && !composing.value) loadMail();
  }, 3000);
}
onBeforeUnmount(closed);
defineExpose({ open });
</script>

<template>
  <dialog ref="dialog" class="communication-window" :class="{ 'is-docked': docked }" aria-labelledby="communication-title" @close="closed" @keydown.esc="docked && dialog.close()">
    <div class="dialog-head"><h2 id="communication-title">{{ docked && fishName ? fishName + ' · 채팅' : '메시지' }}</h2><button class="close" type="button" aria-label="메시지 창 닫기" @click="dialog.close()"><img :src="gameAssetUrl('assets/icon-close.png')" width="16" height="16" alt=""></button></div>
    <nav class="message-tabs" role="tablist" aria-label="채팅과 메일" @keydown="tabKey">
      <button id="comms-chat-tab" ref="chatTab" type="button" role="tab" :aria-selected="tab === 'chat'" :tabindex="tab === 'chat' ? 0 : -1" aria-controls="comms-chat" @click="switchTab('chat')">채팅</button>
      <button id="comms-mail-tab" ref="mailTab" type="button" role="tab" :aria-selected="tab === 'mail'" :tabindex="tab === 'mail' ? 0 : -1" aria-controls="comms-mail" @click="switchTab('mail')">메일</button>
    </nav>
    <section id="comms-chat" v-show="tab === 'chat'" class="chat-pane" role="tabpanel" aria-labelledby="comms-chat-tab">
      <div class="pane-top"><span>우리 어항 공용 채팅</span><button class="text-button" :disabled="chatLoading" @click="loadChat()">새로고침</button></div>
      <p v-if="chatError" class="message-error" role="alert">{{ chatError }}</p>
      <ol ref="chatList" class="chat-messages" aria-label="대화 목록">
        <li v-if="!messages.length" class="empty-state">{{ chatLoading ? '대화를 불러오고 있어요…' : '첫 이야기를 남겨보세요.' }}</li>
        <li v-for="item in messages" :key="item.id" class="chat-message" :class="{ own: item.own }"><div><b>{{ item.name }}{{ item.own ? ' · 나' : '' }}</b><time>{{ time(item.createdAt) }}</time></div><p>{{ item.text }}</p></li>
      </ol>
      <form class="chat-compose" @submit.prevent="sendChat"><label class="visually-hidden" for="chat-message">채팅 내용</label><textarea id="chat-message" v-model="chatDraft" rows="2" maxlength="1000" required placeholder="메시지를 입력하세요" :disabled="chatSending" @input="pendingChatId = null"></textarea><button class="primary" :disabled="chatSending || !chatDraft.trim()">{{ chatSending ? '보내는 중' : '보내기' }}</button></form>
    </section>
    <section id="comms-mail" v-show="tab === 'mail'" class="mail-pane" role="tabpanel" aria-labelledby="comms-mail-tab">
      <p v-if="mailError" class="message-error" role="alert">{{ mailError }}</p>
      <p v-if="notice" class="message-notice" role="status">{{ notice }}</p>
      <p v-if="!statusReady" class="empty-state">메일 설정을 불러오고 있어요…</p>
      <div v-else-if="!mail.configured" class="empty-state">사내 메일 서버 연결 설정이 필요해요.</div>
      <form v-else-if="!mail.authenticated" class="mail-login" @submit.prevent="login">
        <h3>사내 메일 로그인</h3><p>{{ mail.domain }}</p>
        <label>메일 주소<input v-model="address" type="email" autocomplete="username" required :disabled="mailSending"></label>
        <label>비밀번호<input v-model="password" type="password" autocomplete="current-password" required maxlength="256" :disabled="mailSending"></label>
        <button class="primary" :disabled="mailSending">{{ mailSending ? '연결 중…' : '로그인' }}</button>
      </form>
      <template v-else>
        <div class="mail-account"><span>{{ mail.address }}</span><button class="text-button" :disabled="mailSending || mailLoading" @click="logout">로그아웃</button></div>
        <nav class="mail-tools" aria-label="메일함"><button :aria-pressed="folder === 'inbox' && !composing" :disabled="mailLoading || mailSending" @click="chooseFolder('inbox')">받은메일</button><button :aria-pressed="folder === 'sent' && !composing" :disabled="mailLoading || mailSending" @click="chooseFolder('sent')">보낸메일</button><button :disabled="mailSending || mailLoading" @click="compose()">새 메일</button><button class="text-button" :disabled="mailLoading || mailSending || composing" @click="loadMail">새로고침</button></nav>
        <form v-if="composing" class="mail-compose" @submit.prevent="sendMail">
          <label>받는 사람<input v-model="recipient" type="email" required :disabled="mailSending"></label>
          <label>제목<input v-model="subject" maxlength="120" required :disabled="mailSending"></label>
          <label class="body-label">내용<textarea v-model="body" rows="7" maxlength="10000" required :disabled="mailSending"></textarea></label>
          <div class="compose-actions"><button class="secondary" type="button" :disabled="mailSending" @click="composing = false">취소</button><button class="primary" :disabled="mailSending">{{ mailSending ? '보내는 중…' : '메일 보내기' }}</button></div>
        </form>
        <template v-else>
          <div class="mail-reading">
            <div class="mail-list"><p v-if="!mailRows.length" class="empty-state">{{ mailLoading ? '불러오는 중…' : '메일이 없어요.' }}</p><button v-for="item in mailRows" :key="item.id" :class="{ selected: selected?.id === item.id }" @click="selected = item"><b>{{ item.subject }}</b><span>{{ folder === 'sent' ? item.to : item.from }}</span><time>{{ time(item.date || item.createdAt) }}</time></button></div>
            <article v-if="selected" class="mail-detail"><h3>{{ selected.subject }}</h3><p class="mail-meta">보낸 사람 {{ selected.from }}<br>받는 사람 {{ selected.to }}<br>{{ time(selected.date || selected.createdAt) }}</p><button class="text-button" @click="compose(true)">{{ folder === 'sent' ? '다시 쓰기' : '답장' }}</button><p class="mail-text">{{ selected.text }}</p><p v-if="selected.attachments?.length" class="mail-meta">첨부파일: {{ selected.attachments.join(', ') }}<br>첨부파일은 Thunderbird에서 확인해 주세요.</p></article>
            <p v-else class="empty-state mail-detail">메일을 선택하세요.</p>
          </div>
          <div class="mail-pages"><small>{{ folder === 'sent' ? '웹에서 보낸 메일' : '받은메일' }} · {{ total }}통</small><template v-if="folder === 'inbox'"><button class="text-button" :disabled="page <= 1 || mailLoading" @click="paginate(-1)">이전</button><span>{{ page }}</span><button class="text-button" :disabled="!hasMore || mailLoading" @click="paginate(1)">다음</button></template></div>
        </template>
      </template>
    </section>
  </dialog>
</template>

<style scoped>
.communication-window { width: 860px; height: 650px; max-height: 90dvh; padding: 24px; }
.communication-window[open] { display: flex; flex-direction: column; }
.communication-window.is-docked { position: fixed; inset: auto 20px 20px auto; margin: 0; width: 390px; max-width: calc(100vw - 24px); height: 570px; max-height: calc(100dvh - 40px); padding: 20px; z-index: 50; box-shadow: 6px 6px 0 #0b1d3a; }
.is-docked .dialog-head h2 { font-size: 17px; overflow-wrap: anywhere; }
.is-docked .mail-reading { display: block; overflow-y: auto; }
.is-docked .mail-list { max-height: 150px; border-right: 0; }
.is-docked .mail-detail { overflow: visible; padding: 14px 4px; }
.dialog-head { margin-bottom: 18px; }
.message-tabs { display: flex; border-bottom: 2px solid var(--ink); gap: 6px; flex-shrink: 0; }
.message-tabs button { padding: 12px 28px; border: 0; background: #eef5fb; color: #54758a; }
.message-tabs [aria-selected=true] { background: var(--ink); color: #fff; }
.chat-pane, .mail-pane { display: flex; flex-direction: column; flex: 1; min-height: 0; padding-top: 14px; }
.pane-top, .mail-account, .mail-pages { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; flex-shrink: 0; }
.chat-messages { list-style: none; padding: 14px 8px; margin: 0; overflow: auto; flex: 1; min-height: 0; }
.chat-message { max-width: 83%; margin-bottom: 17px; width: fit-content; }
.chat-message.own { margin-left: auto; }
.chat-message > div { display: flex; flex-wrap: wrap; align-items: baseline; gap: 9px; margin-bottom: 5px; }
.chat-message b { font-size: 11px; }.chat-message time { font-size: 9px; color: var(--muted); }
.chat-message p { background: #f0f5fa; border: 1px solid #dceaf2; padding: 10px 13px; margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; font-size: 12px; }
.chat-message.own p { background: #e3f4ff; border-color: #a4d5f0; }
.chat-compose { display: flex; gap: 12px; padding-top: 14px; border-top: 1px solid var(--line); flex-shrink: 0; }
textarea { font: inherit; padding: 10px; border: 1px solid #c7dce9; border-radius: 0; color: var(--ink); background: #fff; }
.chat-compose textarea { flex: 1; min-width: 0; resize: none; font-size: 12px; }
.chat-compose .primary { align-self: center; white-space: nowrap; padding: 11px 16px; }
.empty-state { text-align: center; color: var(--muted); font-size: 12px; padding: 32px 12px; line-height: 1.8; }
.message-error, .message-notice { padding: 9px 12px; font-size: 11px; line-height: 1.7; margin: 0 0 10px; flex-shrink: 0; }
.message-error { background: #fff0ed; color: #9b4232; }.message-notice { background: #e9f8f1; color: #256d50; }
.mail-login { width: 330px; max-width: 100%; margin: auto; padding: 16px 0; overflow-y: auto; }
.mail-login h3 { font-size: 18px; margin: 0 0 8px; }.mail-login > p { color: var(--muted); font-size: 11px; margin-bottom: 25px; }
.mail-login label { margin-bottom: 18px; }.mail-login .primary { width: 100%; }
.mail-account span { overflow-wrap: anywhere; }.mail-account { margin-bottom: 10px; }
.mail-tools { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--line); padding-bottom: 12px; }
.mail-tools > button:not(.text-button) { border: 1px solid #dceaf2; background: #f6f9fc; color: var(--ink); padding: 8px 12px; font-size: 11px; }
.mail-tools [aria-pressed=true] { background: #d9f2ff !important; border-color: #86ccea !important; }
.mail-reading { display: grid; grid-template-columns: 240px 1fr; flex: 1; min-height: 0; }
.mail-list { overflow-y: auto; border-right: 1px solid var(--line); padding: 10px 10px 10px 0; }
.mail-list > button { display: block; text-align: left; width: 100%; border: 0; border-bottom: 1px solid var(--line); background: #fff; padding: 12px 8px; overflow-wrap: anywhere; }
.mail-list > button:hover, .mail-list > button.selected { background: #e8f6ff; }
.mail-list b, .mail-list span, .mail-list time { display: block; }.mail-list b { font-size: 12px; line-height: 1.6; margin-bottom: 5px; }
.mail-list span, .mail-list time { font-size: 10px; color: var(--muted); margin-top: 4px; }
.mail-detail { overflow-y: auto; padding: 20px; margin: 0; min-width: 0; }.mail-detail h3 { font-size: 17px; overflow-wrap: anywhere; }
.mail-meta { font-size: 10px; color: var(--muted); line-height: 1.9; overflow-wrap: anywhere; }
.mail-text { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.9; margin-top: 18px; }
.mail-pages { padding-top: 10px; border-top: 1px solid var(--line); }.mail-pages small { margin-right: auto; font-size: 10px; }
.mail-compose { overflow-y: auto; padding-top: 16px; flex: 1; min-height: 0; }.mail-compose label { margin-bottom: 12px; }
.mail-compose textarea { display: block; width: 100%; margin-top: 8px; resize: vertical; }.compose-actions { display: flex; justify-content: space-between; padding: 4px 3px 8px 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 700px) {
  .communication-window.is-docked { right: 12px; bottom: 12px; max-height: calc(100dvh - 24px); }
  .communication-window { padding: 18px; height: 76dvh; }
  .message-tabs button { flex: 1; }.mail-reading { grid-template-columns: 1fr; overflow-y: auto; display: block; }
  .mail-list { max-height: 170px; border-right: 0; border-bottom: 1px solid var(--line); padding-right: 0; }
  .mail-detail { overflow: visible; padding: 16px 4px; }.mail-tools > button:not(.text-button) { padding: 8px; }
}
</style>
