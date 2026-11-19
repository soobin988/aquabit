/* AQUABIT 공통: API 호출, 로그인 확인, 작은 도우미 */
(function () {
  'use strict';

  async function api(path, { method = 'GET', body } = {}) {
    let res;
    try {
      res = await fetch('/api/game' + path, {
        method,
        credentials: 'same-origin',
        headers: method !== 'GET' ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : method !== 'GET' ? '{}' : undefined,
      });
    } catch (e) {
      const err = new Error('서버에 연결할 수 없어요. 인터넷 연결을 확인해 주세요.');
      err.status = 0;
      throw err;
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* 빈 응답 */ }
    // 로그인이 풀렸으면 (세션 만료 등) 로그인 화면으로
    if (res.status === 401 && !path.startsWith('/auth/') && !/\/login\.html$/.test(location.pathname)) {
      location.replace('/community/login.html?next=' + encodeURIComponent(location.pathname + location.search));
      return new Promise(() => {});
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `요청이 실패했어요 (${res.status})`);
      err.status = res.status;
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  /** 로그인 안 되어 있으면 로그인 화면으로 보낸다 */
  async function requireLogin() {
    try {
      const { user } = await api('/auth/me');
      return user;
    } catch (e) {
      if (e.status === 401) {
        location.replace('/community/login.html?next=' + encodeURIComponent(location.pathname + location.search));
        return new Promise(() => {});
      }
      throw e;
    }
  }

  async function currentUser() {
    try { return (await api('/auth/me')).user; } catch (e) { return null; }
  }

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    location.href = '/';
  }

  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 'YYYY-MM-DD HH:mm' 형식 (한국 시간) */
  function fmtTime(iso) {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  }

  function qs(name) { return new URLSearchParams(location.search).get(name); }

  /** 웹폰트가 준비될 때까지 (캔버스 글자용) */
  function fontsReady() {
    if (!document.fonts) return Promise.resolve();
    return Promise.race([
      Promise.all([document.fonts.load('12px Galmuri9'), document.fonts.load('12px Galmuri11')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }

  /** 받침에 따라 조사 고르기: josa('빵빵이', '이', '가') → '빵빵이가' */
  function josa(word, withBatchim, withoutBatchim) {
    const ch = String(word).charCodeAt(String(word).length - 1);
    const has = ch >= 0xac00 && ch <= 0xd7a3 && (ch - 0xac00) % 28 !== 0;
    return word + (has ? withBatchim : withoutBatchim);
  }

  window.Aqua = { josa, api, requireLogin, currentUser, logout, escapeHtml, fmtTime, qs, fontsReady };
})();
