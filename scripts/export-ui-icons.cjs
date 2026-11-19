// 게임용 16×16 픽셀 아이콘 원본. 실행 시 아이콘 PNG만 다시 저장합니다.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const directory = path.resolve(__dirname, '../game/public/assets');
const palette = { K: '#0b1d3a', B: '#4fd1e8', W: '#e3f6ff', R: '#f07668' };
const grids = {
  mailbox: [
    '................', '....KKKKKK......', '...KBBBBBBK..RR.', '..KBBBBBBBBK.RR.',
    '..KBKKKKKBBK.R..', '..KBKWWWKBBKKR..', '..KBKKKKKBBK.K..', '..KBBBBBBBBK.K..',
    '..KBBBBBBBBK.K..', '..KBBBBBBBBKKK..', '..KKKKKKKKKK....', '......KBBK......',
    '......KBBK......', '......KBBK......', '....KKKKKKKK....', '................',
  ],
  chat: [
    '................', '..KKKKKKKKKKKK..', '.KWWWWWWWWWWWWK.', '.KWWWWWWWWWWWWK.',
    '.KWWWWWWWWWWWWK.', '.KWWKWWKWWKWWWK.', '.KWWKWWKWWKWWWK.', '.KWWWWWWWWWWWWK.',
    '.KWWWWWWWWWWWWK.', '.KWWWWWWWWWWWWK.', '..KKKKKWWKKKKK..', '.....KWWK.......',
    '....KWWK........', '....KKK.........', '................', '................',
  ],
  mail: [
    '................', '................', '.KKKKKKKKKKKKKK.', '.KWWWWWWWWWWWWK.',
    '.KKWWWWWWWWWWKK.', '.KWKWWWWWWWWKWK.', '.KWWKWWWWWWKWWK.', '.KWWWKWWWWKWWWK.',
    '.KWWWWKBBKWWWWK.', '.KWWWKWWWWKWWWK.', '.KWWKWWWWWWKWWK.', '.KWKWWWWWWWWKWK.',
    '.KKWWWWWWWWWWKK.', '.KKKKKKKKKKKKKK.', '................', '................',
  ],
  fish: [
    '................', '................', '................', '................',
    'K.....KKKK......', 'KK..KK....KK....', 'K.KK........K...', 'K..K.........K..',
    'K..K.........K..', 'K.KK........K...', 'KK..KK....KK....', 'K.....KKKK......',
    '................', '................', '................', '................',
  ],
  tank: [
    '................', '....KKKKKKKK....', '.....K....K.....', '.....K....K.....',
    '....K......K....', '...K........K...', '..K..........K..', '..K..........K..',
    '.K............K.', '.K............K.', '.K............K.', '..K..........K..',
    '..K..........K..', '...KK......KK...', '.....KKKKKK.....', '................',
  ],
  info: [
    '.....KKKKKK.....', '...KKWWWWWWKK...', '..KWWKKKKKKWWK..', '.KWKK......KKWK.',
    '.KWK...WW...KWK.', 'KWK....WW....KWK', 'KWK..........KWK', 'KWK...WWW....KWK',
    'KWK....WW....KWK', 'KWK....WW....KWK', 'KWK....WW....KWK', '.KWK..WWWW..KWK.',
    '.KWKK......KKWK.', '..KWWKKKKKKWWK..', '...KKWWWWWWKK...', '.....KKKKKK.....',
  ],
  pause: [
    '................', '................', '..KKKK....KKKK..', '..KBBK....KBBK..',
    '..KBBK....KBBK..', '..KBBK....KBBK..', '..KBBK....KBBK..', '..KBBK....KBBK..',
    '..KBBK....KBBK..', '..KBBK....KBBK..', '..KBBK....KBBK..', '..KBBK....KBBK..',
    '..KBBK....KBBK..', '..KKKK....KKKK..', '................', '................',
  ],
  play: [
    '................', '...KK...........', '...KBKK.........', '...KBBBKK.......',
    '...KBBBBBKK.....', '...KBBBBBBBKK...', '...KBBBBBBBBBK..', '...KBBBBBBBBBBK.',
    '...KBBBBBBBBBBK.', '...KBBBBBBBBBK..', '...KBBBBBBBKK...', '...KBBBBBKK.....',
    '...KBBBKK.......', '...KBKK.........', '...KK...........', '................',
  ],
  close: [
    '................', '................', '..KK........KK..', '..KKK......KKK..',
    '...KKK....KKK...', '....KKK..KKK....', '.....KKKKKK.....', '......KKKK......',
    '......KKKK......', '.....KKKKKK.....', '....KKK..KKK....', '...KKK....KKK...',
    '..KKK......KKK..', '..KK........KK..', '................', '................',
  ],
};
function chunk(type, data) {
  const name = Buffer.from(type), length = Buffer.alloc(4), check = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  check.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, check]);
}
fs.mkdirSync(directory, { recursive: true });
for (const [name, rows] of Object.entries(grids)) {
  const only = process.argv.find(value => value.startsWith('--only='))?.slice(7).split(',');
  if (only && !only.includes(name)) continue;
  if (rows.length !== 16 || rows.some(row => row.length !== 16)) throw new Error(name + ': 16×16 원본 크기를 확인하세요.');
  const pixels = Buffer.alloc(16 * (1 + 16 * 4));
  rows.forEach((row, y) => [...row].forEach((pixel, x) => {
    if (!palette[pixel]) return;
    const color = palette[pixel];
    pixels.set([1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16)).concat(255), y * 65 + 1 + x * 4);
  }));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 6;
  fs.writeFileSync(path.join(directory, 'icon-' + name + '.png'), Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]));
}
console.log('16×16 투명 PNG 아이콘 저장 완료');
