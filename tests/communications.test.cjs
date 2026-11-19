'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const http = require('node:http');
const { createCommunicationStore } = require('../lib/communicationStore');
const { createInternalMail } = require('../lib/internalMail');
const { createCommunicationsRouter } = require('../routes/communications');

async function storeForTest(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'aquabit-comms-'));
  t.after(async () => {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('aquabit-comms-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return createCommunicationStore(directory);
}
async function listen(t, server) {
  const sockets = new Set();
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  return server.address().port;
}

test('공용 채팅은 동시 저장·순서·중복 요청을 처리하고 계정별 보낸메일을 분리함', async t => {
  const store = await storeForTest(t);
  const rows = await Promise.all(Array.from({ length: 15 }, (_, i) => store.addChat({ senderId: 'a', name: '테스트', text: '메시지 ' + i, requestId: 'request-' + i })));
  const duplicate = await store.addChat({ senderId: 'a', name: '테스트', text: '중복 전송', requestId: 'request-0' });
  assert.equal(duplicate.id, rows[0].id);
  assert.equal((await store.chat()).length, 15);
  assert.ok(rows.every((row, i) => i === 0 || row.id > rows[i - 1].id));
  assert.equal((await store.chat(rows[9].id)).length, 5);
  await store.addSent({ from: 'one@aquabit.lab', to: 'two@aquabit.lab', subject: '테스트', text: '본문' });
  assert.equal((await store.sent('one@aquabit.lab')).length, 1);
  assert.equal((await store.sent('two@aquabit.lab')).length, 0);
});

test('통신 API의 세션·권한·중복 방지·실패 시 보낸메일 기록 방지를 검증함', async t => {
  const store = await storeForTest(t), credential = crypto.randomBytes(16).toString('hex');
  let failSend = false;
  const mail = {
    configured: true, domain: 'aquabit.lab',
    async login(address, password) {
      if (password !== credential) throw Object.assign(new Error('로그인하지 못했어요.'), { status: 401 });
      return { address, password };
    },
    async inbox(account) { return { messages: [{ id: 'sample', from: 'team@aquabit.lab', to: account.address, subject: '수신 테스트', text: '메일 본문' }], total: 1, hasMore: false }; },
    async send(account, message) {
      if (failSend) throw new Error('SMTP failed');
      return { from: account.address, ...message, messageId: 'mock-id' };
    },
  };
  const app = express(); app.use('/api/communications', createCommunicationsRouter({ store, mail }));
  const port = await listen(t, http.createServer(app));
  const root = 'http://127.0.0.1:' + port + '/api/communications';
  async function call(route, cookie, data, extra = {}) {
    const result = await fetch(root + route, { method: data === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    return { status: result.status, headers: result.headers, body: await result.json() };
  }
  const first = await call('/status'), second = await call('/status');
  const a = first.headers.get('set-cookie').split(';')[0], b = second.headers.get('set-cookie').split(';')[0];
  assert.match(first.headers.get('set-cookie'), /HttpOnly/);
  assert.match(first.headers.get('set-cookie'), /SameSite=Strict/);
  assert.equal((await call('/mail/inbox', a)).status, 401);
  assert.equal((await call('/mail/sent', a)).status, 401);
  const record = { name: '테스터', text: '<img src=x onerror=alert(1)>', requestId: 'same-request-123' };
  const posted = await call('/chat', a, record);
  assert.equal(posted.status, 201);
  assert.equal(posted.body.message.text, record.text);
  assert.equal((await call('/chat', a, record)).body.message.id, posted.body.message.id);
  assert.equal((await call('/chat', b)).body.messages[0].own, false);
  assert.equal((await call('/chat', a)).body.messages[0].own, true);
  assert.equal((await call('/chat', a, record, { Origin: 'https://other.invalid' })).status, 403);
  await call('/mail/login', a, { address: 'one@aquabit.lab', password: credential });
  await call('/mail/login', b, { address: 'two@aquabit.lab', password: credential });
  const status = await call('/status', a);
  assert.equal(status.body.mail.address, 'one@aquabit.lab');
  assert.ok(!JSON.stringify(status.body).includes(credential));
  assert.equal((await call('/mail/inbox', a)).body.messages[0].subject, '수신 테스트');
  assert.equal((await call('/mail/send', a, { to: 'two@aquabit.lab', subject: '발신 테스트', text: '내용' })).status, 201);
  assert.equal((await call('/mail/sent', a)).body.messages.length, 1);
  assert.equal((await call('/mail/sent', b)).body.messages.length, 0);
  failSend = true;
  assert.equal((await call('/mail/send', a, { to: 'two@aquabit.lab', subject: '실패 테스트', text: '내용' })).status, 502);
  assert.equal((await call('/mail/sent', a)).body.messages.length, 1);
  await call('/mail/logout', a, {});
  assert.equal((await call('/mail/inbox', a)).status, 401);
});

test('POP3 수신의 한글 MIME·점 이스케이프와 SMTP 발신을 테스트 서버로 검증함', async t => {
  const commands = [], deliveries = [], credential = crypto.randomBytes(16).toString('hex');
  const subject = Buffer.from('한글 받은메일').toString('base64');
  const raw = 'From: team@aquabit.lab\r\nTo: one@aquabit.lab\r\nSubject: =?UTF-8?B?' + subject + '?=\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n안녕하세요\r\n.점으로 시작하는 줄\r\n';
  const popPort = await listen(t, net.createServer(socket => {
    socket.setEncoding('utf8'); socket.write('+OK POP fixture\r\n');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk; let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        const verb = line.split(' ')[0]; commands.push(verb);
        if (verb === 'USER' || verb === 'PASS') socket.write('+OK\r\n');
        else if (verb === 'STAT') socket.write('+OK 1 ' + Buffer.byteLength(raw) + '\r\n');
        else if (verb === 'UIDL') socket.write('+OK\r\n1 fixture-uid\r\n.\r\n');
        else if (verb === 'LIST') socket.write('+OK 1 ' + Buffer.byteLength(raw) + '\r\n');
        else if (verb === 'RETR') socket.write('+OK\r\n' + raw.split('\r\n').map(row => row.startsWith('.') ? '.' + row : row).join('\r\n') + '.\r\n');
        else if (verb === 'QUIT') socket.end('+OK bye\r\n');
        else socket.write('-ERR unsupported\r\n');
      }
    });
  }));
  const smtpPort = await listen(t, net.createServer(socket => {
    socket.setEncoding('utf8'); socket.write('220 smtp.fixture ESMTP\r\n');
    let buffer = '', auth = 0, reading = false, data = [];
    socket.on('data', chunk => {
      buffer += chunk; let end;
      while ((end = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (reading) {
          if (line === '.') { reading = false; deliveries.push(data.join('\r\n')); data = []; socket.write('250 queued\r\n'); }
          else data.push(line);
        } else if (auth === 1) { auth = 2; socket.write('334 UGFzc3dvcmQ6\r\n'); }
        else if (auth === 2) { auth = 0; socket.write('235 authenticated\r\n'); }
        else if (line.startsWith('EHLO')) socket.write('250-smtp.fixture\r\n250 AUTH LOGIN\r\n');
        else if (line.startsWith('AUTH LOGIN')) { auth = 1; socket.write('334 VXNlcm5hbWU6\r\n'); }
        else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) socket.write('250 OK\r\n');
        else if (line === 'DATA') { reading = true; socket.write('354 send\r\n'); }
        else if (line === 'QUIT') socket.end('221 bye\r\n');
        else socket.write('250 OK\r\n');
      }
    });
  }));
  const service = createInternalMail({ host: '127.0.0.1', domain: 'aquabit.lab', popPort, smtpPort, popSecure: false, smtpSecure: false, starttls: false });
  const account = await service.login('one@aquabit.lab', credential);
  const inbox = await service.inbox(account, 1);
  assert.equal(inbox.messages[0].subject, '한글 받은메일');
  assert.ok(inbox.messages[0].text.includes('안녕하세요'));
  assert.ok(inbox.messages[0].text.includes('.점으로 시작하는 줄'));
  assert.equal(inbox.messages[0].id, 'fixture-uid');
  assert.ok(!commands.includes('DELE'));
  await service.send(account, { to: 'two@aquabit.lab', subject: '한글 발신', text: '테스트 본문' });
  assert.equal(deliveries.length, 1);
  await assert.rejects(service.send(account, { to: 'other@example.invalid', subject: '외부 주소', text: '전송 금지' }), /같은 회사/);
  assert.equal(deliveries.length, 1);
});
