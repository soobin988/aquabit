'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const config = require('./config');

const app = express();

// Apache가 같은 서버(127.0.0.1)에서 프록시하므로, 그 경우에만 X-Forwarded-For를 믿는다.
// 덕분에 문의 횟수 제한이 Apache의 IP가 아니라 실제 접속자 IP 기준으로 동작한다.
app.set('trust proxy', 'loopback');
app.disable('x-powered-by');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': ["'self'"],
        'form-action': ["'self'"],
        'frame-ancestors': ["'none'"],
        'object-src': ["'none'"],
        // HTTP 사이트라서 켜 두면 CSS/JS 요청이 https로 바뀌어 깨진다.
        'upgrade-insecure-requests': null,
      },
    },
    // HTTPS가 아니므로 HSTS도 보내지 않는다.
    strictTransportSecurity: false,
  })
);

app.use(express.urlencoded({ extended: false, limit: '20kb' }));
app.use('/api/game', require('./server/game/router').router);
app.use('/community', helmet.contentSecurityPolicy({ directives: {
  'default-src': ["'self'"], 'script-src': ["'self'"], 'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'], 'worker-src': ["'self'", 'blob:'],
  'upgrade-insecure-requests': null,
} }));
app.use('/community', express.static(path.join(__dirname, 'public/community'), {
  maxAge: 0, setHeaders(res) { res.setHeader('Cache-Control', 'no-store'); },
}));
// 수업 외 내용: 게임의 Vue 스타일과 WebGL 텍스처에 필요한 정책을 이 경로에 적용합니다.
app.use('/play', helmet.contentSecurityPolicy({
  directives: {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'worker-src': ["'self'", 'blob:'],
    'upgrade-insecure-requests': null,
  },
}));
app.use('/play', express.static(path.join(__dirname, 'public', 'play'), {
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-store');
  },
}));
app.use(
  express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',
  })
);

// 모든 화면에서 쓰는 값
app.use((req, res, next) => {
  res.locals.siteName = config.siteName;
  res.locals.gameUrl = config.gameUrl;
  res.locals.currentPath = req.path;
  res.locals.year = new Date().getFullYear();
  next();
});

app.use('/', require('./routes/pages'));
app.use('/notices', require('./routes/notices'));
app.use('/support', require('./routes/support'));
app.use('/api/communications', require('./routes/communications').createCommunicationsRouter());

// 404
app.use((req, res) => {
  res.status(404).render('404', { pageTitle: '페이지를 찾을 수 없음' });
});

// 500
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[AQUABIT] 오류:', err);
  const status = err.status === 400 || err.status === 413 ? err.status : 500;
  res.status(status).render('error', { pageTitle: '오류', status });
});

module.exports = app;
