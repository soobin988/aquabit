// 과제 보드: 대표가 등록 → 담당자가 증빙 제출 → 대표가 승인(진주 지급) 또는 반려(재제출 가능)
const express = require('express');
const { pool, tx } = require('../db');
const { wrap, bad, forbidden, notFound } = require('../lib/http');
const { requireAuth, requireMember } = require('../lib/auth');
const { changePearls } = require('../lib/pearls');
const { kstDate } = require('../lib/game');
const realtime = require('../lib/realtime');

const router = express.Router({ mergeParams: true });
router.use(requireAuth, requireMember);

const view = (t) => ({
  id: t.id,
  title: t.title,
  reward: t.reward,
  dueDate: t.due_date,
  status: t.status,
  assigneeId: t.assignee_id,
  assigneeNickname: t.assignee_nickname,
  creatorId: t.creator_id,
  proofUrl: t.proof_url,
  memo: t.memo,
  rejectReason: t.reject_reason,
  submittedAt: t.submitted_at,
  reviewedAt: t.reviewed_at,
  createdAt: t.created_at,
});

const SELECT = `SELECT t.*, u.nickname AS assignee_nickname FROM tasks t JOIN users u ON u.id = t.assignee_id`;

async function loadTask(conn, tankId, taskId, lock) {
  const [[t]] = await conn.query(`${SELECT} WHERE t.id = ? AND t.tank_id = ?${lock ? ' FOR UPDATE' : ''}`, [taskId, tankId]);
  if (!t) throw notFound('과제를 찾을 수 없어요.');
  return t;
}

/** 이 사람이 처리해야 할 과제 수: 대표는 검토 대기, 팀원은 할 일 + 반려됨 */
async function pendingCount(conn, tankId, userId, isOwner) {
  const [[{ n }]] = isOwner
    ? await conn.query("SELECT COUNT(*) AS n FROM tasks WHERE tank_id = ? AND status = 'submitted'", [tankId])
    : await conn.query("SELECT COUNT(*) AS n FROM tasks WHERE tank_id = ? AND assignee_id = ? AND status IN ('todo','rejected')", [tankId, userId]);
  return Number(n);
}

// 목록 (어항 참여자 모두 볼 수 있음)
router.get('/', wrap(async (req, res) => {
  const [rows] = await pool.query(
    `${SELECT} WHERE t.tank_id = ?
     ORDER BY FIELD(t.status, 'submitted', 'rejected', 'todo', 'approved'), t.due_date, t.id`,
    [req.tank.id]
  );
  res.json({
    tasks: rows.map(view),
    pending: await pendingCount(pool, req.tank.id, req.session.userId, req.isOwner),
    today: kstDate(),
  });
}));

// 등록 (대표만, 자기 자신에게는 불가)
router.post('/', wrap(async (req, res) => {
  if (!req.isOwner) throw forbidden('과제는 어항 대표만 등록할 수 있어요.');
  const title = String(req.body.title || '').trim();
  const assigneeId = Number(req.body.assigneeId);
  const reward = Number(req.body.reward);
  const dueDate = String(req.body.dueDate || '');
  if (title.length < 1 || title.length > 60) throw bad('과제 제목은 1~60자로 적어 주세요.');
  if (!Number.isInteger(reward) || reward < 20 || reward > 100) throw bad('보상은 20~100진주 사이로 정해 주세요.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || isNaN(new Date(dueDate + 'T00:00:00Z'))) throw bad('마감일을 골라 주세요.');
  if (dueDate < kstDate()) throw bad('마감일은 오늘이나 그 뒤로 정해 주세요.');
  if (assigneeId === req.session.userId) throw bad('대표는 자기 자신에게 과제를 줄 수 없어요.', 'SELF_ASSIGN');
  const [[member]] = await pool.query('SELECT 1 AS x FROM tank_members WHERE tank_id = ? AND user_id = ?', [req.tank.id, assigneeId]);
  if (!member) throw bad('담당자는 이 어항의 팀원이어야 해요.');

  const [r] = await pool.query(
    'INSERT INTO tasks (tank_id, creator_id, assignee_id, title, reward, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.tank.id, req.session.userId, assigneeId, title, reward, dueDate, new Date()]
  );
  const task = view(await loadTask(pool, req.tank.id, r.insertId));
  realtime.toTank(req.tank.id, 'task:created', { task });
  res.status(201).json({ task });
}));

// 완료 제출 (담당자만, 할 일 또는 반려 상태에서)
router.post('/:taskId/submit', wrap(async (req, res) => {
  const proofUrl = String(req.body.proofUrl || '').trim();
  const memo = String(req.body.memo || '').trim();
  let url;
  try { url = new URL(proofUrl); } catch (e) { /* 아래에서 처리 */ }
  if (!url || !['http:', 'https:'].includes(url.protocol)) throw bad('증빙 링크는 http:// 또는 https:// 로 시작하는 주소여야 해요.');
  if (proofUrl.length > 300) throw bad('증빙 링크가 너무 길어요 (300자까지).');
  if (memo.length > 500) throw bad('메모는 500자까지 적을 수 있어요.');

  const task = await tx(async (conn) => {
    const t = await loadTask(conn, req.tank.id, Number(req.params.taskId), true);
    if (t.assignee_id !== req.session.userId) throw forbidden('담당자만 완료를 제출할 수 있어요.');
    if (!['todo', 'rejected'].includes(t.status)) throw bad('이미 제출했거나 승인된 과제예요.');
    await conn.query(
      "UPDATE tasks SET status = 'submitted', proof_url = ?, memo = ?, submitted_at = ? WHERE id = ?",
      [proofUrl, memo || null, new Date(), t.id]
    );
    return view(await loadTask(conn, req.tank.id, t.id));
  });
  realtime.toTank(req.tank.id, 'task:submitted', { task });
  res.json({ task });
}));

// 승인 (대표만, 제출된 과제) → 담당자에게 진주 지급
router.post('/:taskId/approve', wrap(async (req, res) => {
  if (!req.isOwner) throw forbidden('승인은 어항 대표만 할 수 있어요.');
  const result = await tx(async (conn) => {
    const t = await loadTask(conn, req.tank.id, Number(req.params.taskId), true);
    if (t.status !== 'submitted') throw bad('제출된 과제만 승인할 수 있어요.');
    await conn.query("UPDATE tasks SET status = 'approved', reviewed_at = ?, reject_reason = NULL WHERE id = ?", [new Date(), t.id]);
    const pearls = await changePearls(conn, {
      userId: t.assignee_id, amount: t.reward, type: 'task_reward',
      description: `과제 보상: ${t.title}`.slice(0, 100), tankId: req.tank.id, refId: t.id,
    });
    return { task: view(await loadTask(conn, req.tank.id, t.id)), assigneePearls: pearls };
  });
  realtime.toTank(req.tank.id, 'task:approved', { task: result.task });
  realtime.toUser(result.task.assigneeId, 'wallet:pearls', {
    pearls: result.assigneePearls, amount: result.task.reward, reason: 'task_reward', taskTitle: result.task.title,
  });
  res.json({ task: result.task });
}));

// 반려 (대표만, 제출된 과제) → 담당자가 다시 제출할 수 있음
router.post('/:taskId/reject', wrap(async (req, res) => {
  if (!req.isOwner) throw forbidden('반려는 어항 대표만 할 수 있어요.');
  const reason = String(req.body.reason || '').trim();
  if (reason.length > 200) throw bad('반려 이유는 200자까지 적을 수 있어요.');
  const task = await tx(async (conn) => {
    const t = await loadTask(conn, req.tank.id, Number(req.params.taskId), true);
    if (t.status !== 'submitted') throw bad('제출된 과제만 반려할 수 있어요.');
    await conn.query("UPDATE tasks SET status = 'rejected', reject_reason = ?, reviewed_at = ? WHERE id = ?", [reason || null, new Date(), t.id]);
    return view(await loadTask(conn, req.tank.id, t.id));
  });
  realtime.toTank(req.tank.id, 'task:rejected', { task });
  res.json({ task });
}));

router.pendingCount = pendingCount;
module.exports = router;
