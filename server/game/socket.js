// Socket.IO: 로그인 세션을 그대로 쓰고, 같은 어항 사람끼리만 방(tank:<id>)으로 묶는다.
const { Server } = require('socket.io');
const { pool } = require('./db');
const realtime = require('./lib/realtime');

function attachSocket(server, sessionMiddleware) {
  const io = new Server(server, {
    path: '/game-socket.io',
    serveClient: true,       // /socket.io/socket.io.js 로 클라이언트 스크립트 제공
    cors: { origin: false }, // 같은 출처에서만
  });

  // express-session 쿠키로 사용자 확인
  io.engine.use(sessionMiddleware);

  io.on('connection', (socket) => {
    const userId = socket.request.session && socket.request.session.userId;
    if (!userId) {
      socket.emit('auth:required');
      socket.disconnect(true);
      return;
    }
    socket.join(`user:${userId}`);

    // 어항 화면에 들어오면 그 어항 방에 들어간다 (참여자인지 확인)
    socket.on('tank:join', async (tankId, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const id = Number(tankId);
        const [[m]] = await pool.query('SELECT 1 AS x FROM tank_members WHERE tank_id = ? AND user_id = ?', [id, userId]);
        if (!m) return reply({ ok: false, error: '참여하지 않은 어항이에요.' });
        for (const room of socket.rooms) if (room.startsWith('tank:')) socket.leave(room);
        socket.join(`tank:${id}`);
        reply({ ok: true });
      } catch (e) {
        reply({ ok: false, error: '방에 들어가지 못했어요.' });
      }
    });

    socket.on('tank:leave', () => {
      for (const room of socket.rooms) if (room.startsWith('tank:')) socket.leave(room);
    });
  });

  realtime.init(io);
  return io;
}

module.exports = { attachSocket };
