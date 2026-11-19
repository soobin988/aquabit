'use strict';

const config = require('./config');
const app = require('./app');

const server = app.listen(config.port, config.host, () => {
  console.log(`[AQUABIT] http://${config.host}:${config.port} 에서 실행 중`);
});
require('./server/game/router').attach(server);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[AQUABIT] ${config.port}번 포트가 이미 사용 중입니다. .env의 PORT를 바꿔 주세요.`);
  } else {
    console.error('[AQUABIT] 서버 시작 실패:', err);
  }
  process.exit(1);
});

// systemd stop 등으로 종료 신호가 오면 연결을 정리하고 끝낸다.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
