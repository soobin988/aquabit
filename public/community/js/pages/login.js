(function () {
  'use strict';
  const next = Aqua.qs('next');
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/community/tanks.html';

  // 이미 로그인 상태면 바로 이동
  const dest = (u) => (u && u.isAdmin && !next ? '/community/admin.html' : safeNext);
  Aqua.currentUser().then((u) => { if (u) location.replace(dest(u)); });

  // 배경 어항
  const scene = new TankScene(document.getElementById('bgTank'), { labels: false, interactive: false, maxBubbles: 10 });
  scene.setFish([
    { id: 1, species: 'goldfish', color: 'orange', stage: 2, status: 'healthy' },
    { id: 2, species: 'tropical', color: 'mint', stage: 3, status: 'healthy' },
    { id: 3, species: 'puffer', color: 'grape', stage: 1, status: 'healthy' },
  ]);
  scene.start();

  const tabs = { login: document.getElementById('tabLogin'), register: document.getElementById('tabRegister') };
  const forms = { login: document.getElementById('loginForm'), register: document.getElementById('registerForm') };

  function show(mode) {
    for (const k of ['login', 'register']) {
      tabs[k].setAttribute('aria-selected', String(k === mode));
      forms[k].hidden = k !== mode;
    }
    document.title = (mode === 'login' ? '로그인' : '회원가입') + ' | AQUABIT';
    forms[mode].querySelector('input').focus();
  }
  tabs.login.addEventListener('click', () => show('login'));
  tabs.register.addEventListener('click', () => show('register'));
  show(Aqua.qs('mode') === 'register' ? 'register' : 'login');

  async function submit(form, path) {
    const err = form.querySelector('[data-error]');
    const btn = form.querySelector('button[type=submit]');
    err.textContent = '';
    const body = Object.fromEntries(new FormData(form));
    btn.disabled = true;
    try {
      const { user } = await Aqua.api(path, { method: 'POST', body });
      location.href = dest(user);
    } catch (e) {
      err.textContent = e.message;
      btn.disabled = false;
    }
  }

  forms.login.addEventListener('submit', (e) => { e.preventDefault(); submit(forms.login, '/auth/login'); });
  forms.register.addEventListener('submit', (e) => { e.preventDefault(); submit(forms.register, '/auth/register'); });
})();
