/* 과제 보드: 할 일 / 검토 중 / 완료 세 칸.
   대표: 과제 등록, 승인, 반려  /  담당자: 증빙 링크와 메모로 완료 제출 (반려되면 다시 제출) */
(function () {
  'use strict';
  const PA = window.PixelArt;
  const $ = (id) => document.getElementById(id);

  function start() {
    const T = window.AquaTank;
    const esc = T.esc;
    const body = $('tasksBody');
    const dialog = $('tasksDialog');
    let data = { tasks: [], today: '' };
    const openForms = new Set(); // 열려 있는 제출/반려 입력칸 (다시 그려도 유지)

    async function load() {
      data = await Aqua.api(`/tanks/${T.tankId}/tasks`);
      T.state.pendingTasks = data.pending;
      T.renderTaskBadge();
      render();
    }

    function dday(due) {
      const diff = Math.round((new Date(due + 'T00:00:00Z') - new Date(data.today + 'T00:00:00Z')) / 86400000);
      if (diff > 0) return { text: `D-${diff}`, cls: diff <= 1 ? 'soon' : '' };
      if (diff === 0) return { text: 'D-day', cls: 'soon' };
      return { text: `${-diff}일 지남`, cls: 'late' };
    }

    function pearlTag(n) {
      const s = document.createElement('span');
      s.className = 'task-reward pixel';
      s.append(PA.iconCanvas('pearl', 2), document.createTextNode(String(n)));
      return s;
    }

    function render() {
      const me = T.user.id;
      const isOwner = T.state.me.isOwner;
      body.innerHTML = '';

      // 대표: 과제 등록
      if (isOwner) {
        const candidates = T.state.members.filter((m) => m.userId !== me);
        const box = document.createElement('section');
        box.className = 'task-create';
        if (!candidates.length) {
          box.innerHTML = '<p class="task-empty-note">팀원이 들어오면 과제를 줄 수 있어요. 팀 메뉴에서 초대 코드를 보내 보세요.</p>';
        } else {
          box.innerHTML = `
            <form class="task-form" id="taskForm" novalidate>
              <div class="field tf-title"><label for="tfTitle">과제 제목</label><input class="input" id="tfTitle" maxlength="60" required placeholder="예: Apache 프록시 설정하기"></div>
              <div class="field"><label for="tfWho">담당자</label>
                <select class="input" id="tfWho">${candidates.map((m) => `<option value="${m.userId}">${esc(m.nickname)}</option>`).join('')}</select></div>
              <div class="field"><label for="tfReward">보상 <output id="tfRewardOut" class="pixel">50</output>진주</label>
                <input type="range" id="tfReward" min="20" max="100" step="10" value="50"></div>
              <div class="field"><label for="tfDue">마감일</label><input class="input" type="date" id="tfDue" min="${data.today}" value="${addDays(data.today, 3)}" required></div>
              <button class="btn btn--sea" type="submit">과제 등록</button>
            </form>
            <p class="form-error" role="alert" id="tfError"></p>`;
        }
        body.appendChild(box);
      }

      // 세 칸
      const cols = [
        { key: 'todo', title: '할 일', match: (t) => t.status === 'todo' || t.status === 'rejected' },
        { key: 'submitted', title: '검토 중', match: (t) => t.status === 'submitted' },
        { key: 'approved', title: '완료', match: (t) => t.status === 'approved' },
      ];
      const board = document.createElement('div');
      board.className = 'task-board';
      for (const col of cols) {
        const list = data.tasks.filter(col.match);
        const c = document.createElement('section');
        c.className = `task-col task-col--${col.key}`;
        c.innerHTML = `<h3 class="task-col-title pixel">${col.title} <span>${list.length}</span></h3>`;
        const ul = document.createElement('ul');
        ul.className = 'task-list';
        if (!list.length) ul.innerHTML = `<li class="task-none">${col.key === 'todo' ? (isOwner ? '위에서 과제를 등록해 보세요.' : '맡은 과제가 아직 없어요.') : col.key === 'submitted' ? '검토할 과제가 없어요.' : '아직 끝난 과제가 없어요.'}</li>`;
        for (const t of list) ul.appendChild(card(t, isOwner, me));
        c.appendChild(ul);
        board.appendChild(c);
      }
      body.appendChild(board);

      const form = $('taskForm');
      if (form) {
        const out = $('tfRewardOut');
        $('tfReward').addEventListener('input', (e) => { out.textContent = e.target.value; });
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          $('tfError').textContent = '';
          try {
            await Aqua.api(`/tanks/${T.tankId}/tasks`, {
              method: 'POST',
              body: { title: $('tfTitle').value, assigneeId: Number($('tfWho').value), reward: Number($('tfReward').value), dueDate: $('tfDue').value },
            });
            T.toast(`<b>${esc(T.nickOf(Number($('tfWho').value)))}</b>님에게 과제를 줬어요.`);
            await load();
          } catch (ex) { $('tfError').textContent = ex.message; }
        });
      }
    }

    function card(t, isOwner, me) {
      const li = document.createElement('li');
      li.className = `task-card task-card--${t.status}`;
      const mine = t.assigneeId === me;
      const d = dday(t.dueDate);
      li.innerHTML = `
        <div class="task-top">
          <h4 class="task-title">${esc(t.title)}</h4>
        </div>
        <div class="task-meta">
          <span class="task-who">${esc(t.assigneeNickname)}${mine ? ' (나)' : ''}</span>
          ${t.status === 'approved' ? '<span class="task-done pixel">완료</span>' : `<span class="task-due pixel ${d.cls}" title="마감 ${t.dueDate}">${d.text}</span>`}
        </div>
        ${t.status === 'rejected' ? `<p class="task-reject"><b>반려됨</b>${t.rejectReason ? ` ${esc(t.rejectReason)}` : ' 다시 제출해 주세요.'}</p>` : ''}
        ${t.proofUrl && t.status !== 'todo' ? `<p class="task-proof"><a href="${esc(t.proofUrl)}" target="_blank" rel="noopener noreferrer">${esc(shortUrl(t.proofUrl))}</a>${t.memo ? `<span>${esc(t.memo)}</span>` : ''}</p>` : ''}
        <div class="task-actions"></div>`;
      li.querySelector('.task-top').appendChild(pearlTag(t.reward));
      const actions = li.querySelector('.task-actions');

      if (mine && (t.status === 'todo' || t.status === 'rejected')) {
        const key = 'submit' + t.id;
        if (openForms.has(key)) {
          actions.innerHTML = `
            <form class="task-inline" novalidate>
              <label class="sr-only" for="pf${t.id}">증빙 링크</label>
              <input class="input" id="pf${t.id}" type="url" placeholder="https://github.com/..." required value="${t.proofUrl ? esc(t.proofUrl) : ''}">
              <label class="sr-only" for="pm${t.id}">메모</label>
              <textarea class="input" id="pm${t.id}" rows="2" maxlength="500" placeholder="한 일을 짧게 적어 주세요 (선택)">${t.memo ? esc(t.memo) : ''}</textarea>
              <p class="form-error" role="alert"></p>
              <div class="task-btns"><button class="btn btn--small btn--foam" type="button" data-cancel>취소</button><button class="btn btn--small btn--sea" type="submit">${t.status === 'rejected' ? '다시 제출' : '완료 제출'}</button></div>
            </form>`;
          const f = actions.querySelector('form');
          f.querySelector('[data-cancel]').addEventListener('click', () => { openForms.delete(key); render(); });
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
              await Aqua.api(`/tanks/${T.tankId}/tasks/${t.id}/submit`, { method: 'POST', body: { proofUrl: $(`pf${t.id}`).value, memo: $(`pm${t.id}`).value } });
              openForms.delete(key);
              T.toast('완료를 제출했어요. 대표가 승인하면 진주가 들어와요.');
              await load();
            } catch (ex) { f.querySelector('.form-error').textContent = ex.message; }
          });
        } else {
          actions.appendChild(button(t.status === 'rejected' ? '다시 제출하기' : '완료 제출하기', 'btn--sea', () => { openForms.add(key); render(); $(`pf${t.id}`)?.focus(); }));
        }
      }

      if (isOwner && t.status === 'submitted') {
        const key = 'reject' + t.id;
        if (openForms.has(key)) {
          actions.innerHTML = `
            <form class="task-inline" novalidate>
              <label class="sr-only" for="rr${t.id}">반려 이유</label>
              <input class="input" id="rr${t.id}" maxlength="200" placeholder="무엇을 고치면 될지 적어 주세요 (선택)">
              <p class="form-error" role="alert"></p>
              <div class="task-btns"><button class="btn btn--small btn--foam" type="button" data-cancel>취소</button><button class="btn btn--small btn--coral" type="submit">반려하기</button></div>
            </form>`;
          const f = actions.querySelector('form');
          f.querySelector('[data-cancel]').addEventListener('click', () => { openForms.delete(key); render(); });
          f.addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
              await Aqua.api(`/tanks/${T.tankId}/tasks/${t.id}/reject`, { method: 'POST', body: { reason: $(`rr${t.id}`).value } });
              openForms.delete(key);
              T.toast(`과제를 반려했어요. <b>${esc(t.assigneeNickname)}</b>님이 다시 제출할 수 있어요.`);
              await load();
            } catch (ex) { f.querySelector('.form-error').textContent = ex.message; }
          });
        } else {
          actions.appendChild(button('반려', 'btn--foam', () => { openForms.add(key); render(); $(`rr${t.id}`)?.focus(); }));
          actions.appendChild(button(`승인하고 ${t.reward}진주 주기`, 'btn--sea', async (ev) => {
            ev.target.disabled = true;
            try {
              await Aqua.api(`/tanks/${T.tankId}/tasks/${t.id}/approve`, { method: 'POST' });
              T.toast(`승인했어요. <b>${esc(t.assigneeNickname)}</b>님에게 ${t.reward}진주를 보냈어요.`);
              await load();
            } catch (ex) { T.toast(esc(ex.message)); ev.target.disabled = false; }
          }));
        }
      }
      if (!actions.children.length) actions.remove();
      return li;
    }

    function button(text, cls, onClick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn--small ${cls}`;
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    }

    function shortUrl(u) {
      try { const x = new URL(u); return (x.host + x.pathname).replace(/\/$/, '').slice(0, 48); } catch (e) { return u; }
    }
    function addDays(ymd, n) {
      const d = new Date(ymd + 'T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    }

    $('actTasks').addEventListener('click', async () => {
      try {
        await load();
        dialog.showModal();
      } catch (e) { T.toast(esc(e.message)); }
    });

    // 실시간 이벤트가 오면 열려 있는 보드를 새로 그린다
    window.AquaTasks = {
      refresh: () => (dialog.open ? load() : Aqua.api(`/tanks/${T.tankId}/tasks`).then((d) => { data = d; T.state.pendingTasks = d.pending; T.renderTaskBadge(); })).catch(() => {}),
    };
  }

  if (window.AquaTank && window.AquaTank.ready) start();
  else document.addEventListener('aquatank:ready', start, { once: true });
})();
