'use strict';

// .env 값을 한곳에서 읽어 기본값과 함께 내보낸다.
// 비밀번호 같은 민감한 값은 코드에 넣지 않고 .env에서만 읽는다.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

function toInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const env = process.env;

module.exports = {
  port: toInt(env.PORT, 3001),
  host: env.HOST || '127.0.0.1',
  gameUrl: env.GAME_URL || '/community/login.html',
  siteName: 'AQUABIT',
  webmail: {
    host: env.WEBMAIL_HOST || '',
    serverName: env.WEBMAIL_SERVER_NAME || '',
    domain: (env.WEBMAIL_DOMAIN || '').toLowerCase(),
    smtpPort: toInt(env.WEBMAIL_SMTP_PORT, 25),
    popPort: toInt(env.WEBMAIL_POP_PORT, 110),
    smtpSecure: env.WEBMAIL_SMTP_SECURE === 'true',
    popSecure: env.WEBMAIL_POP_SECURE === 'true',
    starttls: env.WEBMAIL_STARTTLS === 'true',
  },

  smtp: {
    host: env.SMTP_HOST || 'mail.aquabit.lab',
    port: toInt(env.SMTP_PORT, 25),
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || env.SMTP_USER || 'noreply@aquabit.lab',
    to: env.MAIL_TO || 'support@aquabit.lab',
  },

  rateLimit: {
    windowMs: 10 * 60 * 1000, // 10분
    max: 5, // 같은 IP 최대 5건
  },

  paths: {
    data: path.join(__dirname, '..', 'data'),
  },
};
