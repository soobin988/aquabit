'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

function createCommunicationStore(directory) {
  let queue = Promise.resolve();
  async function read(name) {
    try {
      const rows = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
      if (!Array.isArray(rows)) throw new Error('Invalid communication store');
      return rows;
    } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  function change(name, mutate) {
    const task = queue.then(async () => {
      const rows = await read(name), value = mutate(rows);
      await fs.mkdir(directory, { recursive: true });
      const file = path.join(directory, name), temporary = file + '.tmp';
      await fs.writeFile(temporary, JSON.stringify(rows, null, 2) + '\n', 'utf8');
      await fs.rename(temporary, file);
      return value;
    });
    queue = task.catch(() => {});
    return task;
  }
  return {
    async chat(after = 0) {
      await queue;
      return (await read('aquarium-chat.json')).filter(row => row.id > after).slice(-100);
    },
    addChat({ senderId, name, text, requestId }) {
      return change('aquarium-chat.json', rows => {
        const existing = rows.find(row => row.senderId === senderId && row.requestId === requestId);
        if (existing) return existing;
        const row = { id: Math.max(Date.now(), (rows.at(-1)?.id || 0) + 1), senderId, name, text, requestId, createdAt: new Date().toISOString() };
        rows.push(row);
        if (rows.length > 500) rows.splice(0, rows.length - 500);
        return row;
      });
    },
    async sent(address) { await queue; return (await read('aquarium-sent-mail.json')).filter(row => row.from === address).slice(-100).reverse(); },
    addSent(row) {
      return change('aquarium-sent-mail.json', rows => {
        const saved = { ...row, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
        rows.push(saved);
        if (rows.length > 2000) rows.splice(0, rows.length - 2000);
        return saved;
      });
    },
  };
}
module.exports = { createCommunicationStore };
