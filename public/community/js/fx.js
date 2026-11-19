/* AQUABIT 화면 연출: 팝업(출석, LEVEL UP), 날아가는 진주, 효과음
   동시에 움직이는 효과 수를 묶어 둔다 (MAX_FLYING). */
(function () {
  'use strict';
  const PA = window.PixelArt;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 효과음: 파일 없이 WebAudio로 만든 짧은 소리. 기본 꺼짐 ──
  const SOUND_KEY = 'aquabit.sound';
  let audioCtx = null;
  function soundOn() {
    try { return localStorage.getItem(SOUND_KEY) === '1'; } catch (e) { return false; }
  }
  function setSound(on) {
    try { localStorage.setItem(SOUND_KEY, on ? '1' : '0'); } catch (e) { /* 무시 */ }
    if (on) beep('pearl');
  }
  const TUNES = {
    food: [[520, 0.05, 'square'], [390, 0.07, 'square']],
    pearl: [[880, 0.05, 'triangle'], [1320, 0.08, 'triangle']],
    levelup: [[523, 0.09, 'square'], [659, 0.09, 'square'], [784, 0.09, 'square'], [1047, 0.18, 'square']],
  };
  function beep(name) {
    if (!soundOn()) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      let t = audioCtx.currentTime;
      for (const [freq, dur, type] of TUNES[name] || []) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.06, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(audioCtx.destination);
        o.start(t); o.stop(t + dur + 0.02);
        t += dur * 0.9;
      }
    } catch (e) { /* 소리를 못 내도 화면은 계속 */ }
  }

  // ── 팝업 ──
  function overlay(className) {
    const wrap = document.createElement('div');
    wrap.className = 'fx-overlay ' + (className || '');
    document.body.appendChild(wrap);
    return wrap;
  }

  /** 출석 보상 팝업. result: { reward, bonus, streak } */
  function attendancePopup(result) {
    return new Promise((resolve) => {
      const wrap = overlay('fx-overlay--dim');
      const inCycle = ((result.streak - 1) % 7) + 1; // 이번 7일 묶음에서 몇 번째 날
      const total = result.reward + (result.bonus || 0);
      wrap.innerHTML = `
        <div class="fx-card panel" role="dialog" aria-modal="true" aria-labelledby="attTitle">
          <h2 class="fx-title pixel" id="attTitle">출석 보상</h2>
          <p class="fx-sub">${result.streak}일 연속으로 왔어요</p>
          <ol class="att-days" aria-label="이번 주 출석">
            ${Array.from({ length: 7 }, (_, i) => `<li class="${i < inCycle ? 'on' : ''}${i === 6 ? ' gift' : ''}"><span class="pixel">${i + 1}</span></li>`).join('')}
          </ol>
          <p class="fx-reward pixel"><span data-pearl></span>+${total}</p>
          ${result.bonus ? `<p class="fx-bonus">7일 연속 보너스 +${result.bonus} 포함</p>` : '<p class="fx-bonus">7일을 채우면 보너스 30진주를 더 받아요</p>'}
          <button class="btn btn--sea btn--big" type="button">진주 받기</button>
        </div>`;
      wrap.querySelector('[data-pearl]').appendChild(PA.iconCanvas('pearl', 4));
      const btn = wrap.querySelector('button');
      btn.focus();
      const close = () => {
        const from = btn.getBoundingClientRect();
        wrap.remove();
        resolve({ x: from.left + from.width / 2, y: from.top + from.height / 2 });
      };
      btn.addEventListener('click', close);
      wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    });
  }

  /** LEVEL UP! 팝업 (자동으로 사라짐) */
  function levelUp(fish, text) {
    const wrap = overlay('fx-overlay--pass');
    wrap.innerHTML = `
      <div class="levelup" role="status">
        <p class="levelup-word pixel" aria-hidden="true">LEVEL UP!</p>
        <div class="levelup-fish"></div>
        <p class="levelup-text pixel">${window.Aqua.escapeHtml(text)}</p>
      </div>`;
    wrap.querySelector('.levelup-fish').appendChild(PA.previewCanvas(fish, fish.stage >= 3 ? 5 : 6, 0));
    beep('levelup');
    const done = () => { wrap.classList.add('out'); setTimeout(() => wrap.remove(), 300); };
    wrap.addEventListener('click', done);
    setTimeout(done, 2800);
  }

  // ── 진주가 날아와 HUD에 쌓이는 효과 ──
  const MAX_FLYING = 12;
  let flying = 0;
  /**
   * @param {{x:number,y:number}} from  시작 화면 좌표
   * @param {HTMLElement} target  도착할 요소 (HUD 진주 카운터)
   * @param {number} amount  지급량 (보이는 진주 개수는 최대 8개)
   * @param {Function} onArrive  첫 진주가 닿을 때 (숫자 갱신용)
   */
  function flyPearls(from, target, amount, onArrive) {
    const to = target.getBoundingClientRect();
    const tx = to.left + 20, ty = to.top + to.height / 2;
    const count = reduceMotion ? 1 : Math.min(8, Math.max(1, Math.ceil(amount / 10)));
    let arrived = false;
    const arrive = () => {
      if (!arrived) { arrived = true; if (onArrive) onArrive(); }
      target.classList.remove('stack');
      void target.offsetWidth;
      target.classList.add('stack');
      beep('pearl');
    };
    for (let i = 0; i < count; i++) {
      if (flying >= MAX_FLYING) { arrive(); continue; }
      flying++;
      const el = PA.iconCanvas('pearl', 3);
      el.classList.add('fly-pearl');
      const sx = from.x + (Math.random() - 0.5) * 60, sy = from.y + (Math.random() - 0.5) * 40;
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
      document.body.appendChild(el);
      const dx = tx - sx, dy = ty - sy;
      const anim = el.animate([
        { transform: 'translate(-50%,-50%) scale(0.4)', opacity: 0 },
        { transform: `translate(calc(-50% + ${dx * 0.15}px), calc(-50% + ${dy * 0.15 - 50}px)) scale(1.2)`, opacity: 1, offset: 0.25 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8)`, opacity: 1 },
      ], { duration: reduceMotion ? 10 : 700 + i * 90, easing: 'cubic-bezier(.5,0,.75,.3)', fill: 'forwards' });
      anim.onfinish = () => { el.remove(); flying--; arrive(); };
    }
  }

  /** 숫자가 톡 튀며 바뀐다 */
  function bumpNumber(el, value) {
    el.textContent = value;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  window.Fx = { beep, soundOn, setSound, attendancePopup, levelUp, flyPearls, bumpNumber };
})();
