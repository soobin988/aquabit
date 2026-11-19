(async function () {
  'use strict';
  const PA = window.PixelArt;
  const user = await Aqua.requireLogin();
  document.getElementById('nick').textContent = `${user.nickname}님`;
  document.getElementById('logoutBtn').addEventListener('click', Aqua.logout);
  if (user.isAdmin) {
    document.getElementById('logoutBtn').insertAdjacentHTML('beforebegin', '<a class="btn btn--small" href="/community/admin.html">관리자</a>');
  }
  document.getElementById('pearlIcon').appendChild(PA.iconCanvas('pearl', 2));
  document.getElementById('pearlCount').textContent = user.pearls;

  // 하루 첫 접속 출석 보상
  Aqua.api('/me/attendance', { method: 'POST' }).then(async (r) => {
    if (!r.awarded) return;
    const from = await Fx.attendancePopup(r);
    Fx.flyPearls(from, document.getElementById('pearlChip'), r.reward + r.bonus,
      () => Fx.bumpNumber(document.getElementById('pearlCount'), r.pearls));
  }).catch(() => {});

  // 어항을 나가거나 삭제하고 돌아왔을 때 안내
  try {
    const notice = sessionStorage.getItem('aquabit.notice');
    if (notice) {
      sessionStorage.removeItem('aquabit.notice');
      const n = document.getElementById('notice');
      n.textContent = notice;
      n.hidden = false;
    }
  } catch (e) { /* 무시 */ }

  const grid = document.getElementById('tankGrid');
  const empty = document.getElementById('emptyMsg');

  async function load() {
    const { tanks } = await Aqua.api('/tanks');
    grid.innerHTML = '';
    empty.hidden = tanks.length > 0;
    for (const t of tanks) {
      const li = document.createElement('li');
      li.className = 'tank-tile';
      li.innerHTML = `
        <a class="tank-link panel" href="/community/tank.html?id=${t.id}">
          <span class="tile-water"></span>
          <span class="tile-body">
            <span class="tile-name">${Aqua.escapeHtml(t.name)}</span>
            <span class="tile-meta">
              ${t.isOwner ? '<span class="tag tag--sand">대표</span>' : `<span class="tile-owner">대표 ${Aqua.escapeHtml(t.ownerNickname)}</span>`}
              <span class="tile-count pixel">${t.memberCount}/${t.maxMembers}명</span>
            </span>
            ${t.isOwner ? `<span class="tile-code">초대 코드 <b class="pixel">${t.inviteCode}</b></span>` : ''}
          </span>
        </a>`;
      if (t.myFish) {
        const c = PA.previewCanvas(t.myFish, 4, 0);
        li.querySelector('.tile-water').appendChild(c);
        // 꼬리 흔들기
        let frame = 0;
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        setInterval(() => {
          frame ^= 1;
          const spr = PA.fishSprite(Object.assign({ frame }, t.myFish)); // 캐시된 프레임을 다시 그리기만 한다
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.drawImage(spr.canvas, 0, 0, c.width, c.height);
        }, 420);
      }
      grid.appendChild(li);
    }
  }

  // 만들기
  const createForm = document.getElementById('createForm');
  const dialog = document.getElementById('createdDialog');
  createForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = createForm.querySelector('[data-error]');
    const btn = createForm.querySelector('button');
    err.textContent = '';
    btn.disabled = true;
    try {
      const { tank } = await Aqua.api('/tanks', { method: 'POST', body: { name: createForm.name.value } });
      createForm.reset();
      document.getElementById('createdCode').textContent = tank.inviteCode;
      document.getElementById('goTank').href = `/community/tank.html?id=${tank.id}`;
      dialog.showModal();
      load();
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });
  document.getElementById('copyCode').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(document.getElementById('createdCode').textContent);
      e.target.textContent = '복사했어요';
    } catch (ex) {
      e.target.textContent = '직접 적어 주세요';
    }
  });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  // 참여
  const joinForm = document.getElementById('joinForm');
  const codeInput = document.getElementById('joinCode');
  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  });
  joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = joinForm.querySelector('[data-error]');
    err.textContent = '';
    try {
      const { tank } = await Aqua.api('/tanks/join', { method: 'POST', body: { code: codeInput.value } });
      location.href = `/community/tank.html?id=${tank.id}`;
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  if (location.hash === '#join') codeInput.focus();

  load().catch((e) => { empty.hidden = false; empty.textContent = e.message; });
})();
