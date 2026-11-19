'use strict';
const nodemailer = require('nodemailer');
const { withMailbox, readInbox } = require('./popMailbox');

function validAddress(value, domain) {
  return typeof value === 'string' && value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+$/i.test(value)
    && value.toLowerCase().endsWith('@' + domain.toLowerCase());
}
function createInternalMail(config) {
  return {
    configured: Boolean(config.host && config.domain), domain: config.domain,
    async login(address, password) {
      if (!validAddress(address, config.domain) || typeof password !== 'string' || !password || password.length > 256 || /[\r\n\0]/.test(password)) {
        throw Object.assign(new Error('사내 메일 주소와 로그인 정보를 확인해 주세요.'), { status: 400 });
      }
      try { await withMailbox(config, { address, password }, async () => {}); }
      catch (error) {
        throw Object.assign(new Error(error.code === 'POP_REJECTED' ? '메일 계정으로 로그인하지 못했어요.' : '메일 서버에 연결하지 못했어요. 서버와 방화벽 상태를 확인해 주세요.'), { status: error.code === 'POP_REJECTED' ? 401 : 502 });
      }
      return { address: address.toLowerCase(), password };
    },
    inbox: (account, page) => readInbox(config, account, page),
    async send(account, message) {
      if (!validAddress(message.to, config.domain)) throw Object.assign(new Error('같은 회사 도메인의 받는 주소를 입력해 주세요.'), { status: 400 });
      const subject = typeof message.subject === 'string' ? message.subject.trim() : '';
      const text = typeof message.text === 'string' ? message.text.trim() : '';
      if (!subject || subject.length > 120 || /[\r\n]/.test(subject) || !text || text.length > 10000) {
        throw Object.assign(new Error('제목은 120자, 내용은 10,000자 이내로 입력해 주세요.'), { status: 400 });
      }
      const transport = nodemailer.createTransport({ host: config.host, port: config.smtpPort, secure: config.smtpSecure,
        ignoreTLS: !config.smtpSecure && !config.starttls, auth: { user: account.address, pass: account.password }, authMethod: 'LOGIN',
        ...(config.serverName ? { tls: { servername: config.serverName } } : {}),
        connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 15000 });
      try {
        const result = await transport.sendMail({ from: account.address, to: message.to, subject, text });
        if (!result.accepted?.length || result.rejected?.length) throw new Error('SMTP_REJECTED');
        return { from: account.address, to: message.to.toLowerCase(), subject, text, messageId: result.messageId };
      } finally { transport.close(); }
    },
  };
}
module.exports = { createInternalMail, validAddress };
