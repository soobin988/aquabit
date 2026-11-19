'use strict';
const net = require('node:net');
const tls = require('node:tls');
const { simpleParser } = require('mailparser');
const MAX_MESSAGE = 2 * 1024 * 1024;

// 수업 외 내용: POP3 수신. DELE 명령을 쓰지 않으므로 서버의 원본 메일은 지우지 않습니다.
class PopMailbox {
  constructor(options) {
    this.lines = []; this.waiting = []; this.buffer = ''; this.failure = null;
    this.socket = options.secure
      ? tls.connect({ host: options.host, port: options.port, servername: options.serverName || (net.isIP(options.host) ? undefined : options.host) })
      : net.createConnection({ host: options.host, port: options.port });
    this.socket.setEncoding('latin1');
    this.socket.setTimeout(10000, () => this.fail(new Error('POP_TIMEOUT')));
    this.socket.on('error', error => this.fail(error));
    this.socket.on('close', () => this.fail(new Error('POP_CLOSED')));
    this.socket.on('data', chunk => {
      this.buffer += chunk;
      if (this.buffer.length > MAX_MESSAGE) return this.fail(new Error('POP_TOO_LARGE'));
      let end;
      while ((end = this.buffer.indexOf('\r\n')) >= 0) {
        const line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 2);
        const waiter = this.waiting.shift();
        if (waiter) waiter.resolve(line); else this.lines.push(line);
      }
    });
  }
  fail(error) {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of this.waiting.splice(0)) waiter.reject(error);
    this.socket.destroy();
  }
  line() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => this.waiting.push({ resolve, reject }));
  }
  async command(text) {
    if (this.failure) throw this.failure;
    this.socket.write(text + '\r\n');
    const response = await this.line();
    if (!response.startsWith('+OK')) throw Object.assign(new Error('POP_REJECTED'), { code: 'POP_REJECTED' });
    return response;
  }
  async multiline(text) {
    await this.command(text);
    let size = 0;
    const lines = [];
    for (;;) {
      let line = await this.line();
      if (line === '.') break;
      if (line.startsWith('..')) line = line.slice(1);
      size += line.length + 2;
      if (size > MAX_MESSAGE) { this.fail(new Error('POP_TOO_LARGE')); throw this.failure; }
      lines.push(line);
    }
    return lines;
  }
  async login(address, password) {
    if (!(await this.line()).startsWith('+OK')) throw new Error('POP_GREETING');
    await this.command('USER ' + address);
    await this.command('PASS ' + password);
  }
  async close() {
    if (!this.failure) await this.command('QUIT').catch(() => {});
    this.socket.destroy();
  }
}

async function withMailbox(config, account, operation) {
  const mailbox = new PopMailbox({ host: config.host, port: config.popPort, secure: config.popSecure, serverName: config.serverName });
  try { await mailbox.login(account.address, account.password); return await operation(mailbox); }
  finally { await mailbox.close(); }
}

async function readInbox(config, account, page = 1) {
  return withMailbox(config, account, async mailbox => {
    const stat = await mailbox.command('STAT');
    const total = Number(stat.split(/\s+/)[1]) || 0;
    let uidLines = [];
    try { uidLines = await mailbox.multiline('UIDL'); } catch (error) { if (error.code !== 'POP_REJECTED') throw error; }
    const uids = new Map(uidLines.map(line => { const [number, uid] = line.split(/\s+/); return [Number(number), uid]; }));
    const start = total - (page - 1) * 20, messages = [];
    for (let number = start; number > Math.max(0, start - 20); number--) {
      const info = await mailbox.command('LIST ' + number);
      const size = Number(info.split(/\s+/)[2]) || 0;
      const id = uids.get(number) || 'message-' + number;
      if (size > MAX_MESSAGE) {
        messages.push({ id, subject: '큰 용량의 메일', from: '', to: account.address, text: '이 메일은 2MB를 초과합니다. Thunderbird에서 확인해 주세요.', date: null });
        continue;
      }
      const raw = Buffer.from((await mailbox.multiline('RETR ' + number)).join('\r\n') + '\r\n', 'latin1');
      const mail = await simpleParser(raw, { skipTextToHtml: true, skipImageLinks: true });
      messages.push({ id, subject: mail.subject || '(제목 없음)', from: mail.from?.text || '',
        replyTo: mail.from?.value?.[0]?.address || '', to: mail.to?.text || account.address,
        text: String(mail.text || '텍스트 본문이 없는 메일입니다.').slice(0, 30000), date: mail.date?.toISOString() || null,
        attachments: mail.attachments.map(file => file.filename || '첨부파일') });
    }
    return { messages, total, page, hasMore: start > 20 };
  });
}
module.exports = { PopMailbox, withMailbox, readInbox };
